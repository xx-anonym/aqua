// Photo identification: image + region -> top-5 catalog species with confidence.
// Secrets: ANTHROPIC_API_KEY (required), PHOTO_ID_MODEL (default claude-sonnet-5-5,
// e.g. claude-haiku-5-5 for lower cost), PHOTO_ID_MONTHLY_LIMIT (per user, default 50),
// PHOTO_ID_GLOBAL_MONTHLY_LIMIT (all users together, default 500: cost ceiling),
// PHOTO_ID_INDEX_URL (candidate list per region, default: the one published with the app).
import Anthropic from 'npm:@anthropic-ai/sdk@1.2.0';
import { createClient } from 'npm:@supabase/supabase-js@2.47.10';
import {
  candidateBlock,
  cleanSuggestions,
  MAX_IMAGE_BYTES,
  OUTPUT_SCHEMA,
  parseIndex,
  regionCandidates,
  regionIdByName,
  SYSTEM_PROMPT,
  type CandidateIndex,
  usageSummary,
} from './logic.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('PHOTO_ID_MODEL') || 'claude-sonnet-5-5';
const LIMIT = Number(Deno.env.get('PHOTO_ID_MONTHLY_LIMIT') || 50);
const GLOBAL_LIMIT = Number(Deno.env.get('PHOTO_ID_GLOBAL_MONTHLY_LIMIT') || 500);
const INDEX_URL = Deno.env.get('PHOTO_ID_INDEX_URL') || 'https://aqua-tauchlog.vercel.app/catalog/photo-id.json';
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// The candidate index changes only with a catalog update: keep it for an hour per instance.
let cachedIndex: { index: CandidateIndex; at: number } | null = null;
async function loadIndex(): Promise<CandidateIndex | null> {
  if (cachedIndex && Date.now() - cachedIndex.at < 60 * 60 * 1000) return cachedIndex.index;
  try {
    const res = await fetch(INDEX_URL);
    const index = res.ok ? parseIndex(await res.json()) : null;
    if (index) cachedIndex = { index, at: Date.now() };
  } catch {
    // Keep serving the last good index.
  }
  return cachedIndex?.index ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // Status check without side effects: is a model key configured?
  if (req.method === 'GET') return json({ configured: !!anthropic, model: MODEL, monthly_limit: LIMIT });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!anthropic) return json({ error: 'not_configured' }, 503);

  let body: { image?: string; media_type?: string; region_id?: unknown; region?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const image = typeof body.image === 'string' ? body.image : '';
  const mediaType = body.media_type === 'image/png' || body.media_type === 'image/webp' ? body.media_type : 'image/jpeg';
  if (!image || image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: 'image_too_large' }, 413);
  const index = await loadIndex();
  if (!index) return json({ error: 'busy' }, 503);
  // Only the region comes from the app; any candidate list it sends is ignored.
  const regionId = typeof body.region_id === 'string' ? body.region_id : regionIdByName(index, body.region);
  const candidates = regionCandidates(index, regionId);
  if (!candidates?.length) return json({ error: 'unknown_region' }, 400);
  const regionName = regionId ? index.regions[regionId].name : 'unknown';

  const { data: used, error: quotaError } = await admin.rpc('consume_photo_id_quota', {
    p_user: user.id,
    p_limit: LIMIT,
    p_global_limit: GLOBAL_LIMIT,
  });
  if (quotaError) return json({ error: 'quota_error' }, 500);
  if (used === -1) return json({ error: 'quota_exceeded', limit: LIMIT }, 429);
  if (used === -2) return json({ error: 'budget_exhausted' }, 429);

  try {
    // Fallbacks: if a safety classifier declines, the API retries on its recommended model.
    // Claude Haiku has no server-side fallback, so the parameter is only sent for larger models.
    const fallback = MODEL.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        // The candidate list is identical for every photo from the same region: cache it.
        { type: 'text', text: `Candidates:\n${candidateBlock(candidates)}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: `Region: ${regionName}. Which candidate species is shown? Answer the reasons in German.` },
          ],
        },
      ],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      ...fallback,
    });
    if (response.stop_reason === 'refusal') {
      await admin.rpc('release_photo_id_quota', { p_user: user.id });
      return json({ error: 'refused', suggestions: [] }, 422);
    }
    const text = response.content.find((b) => b.type === 'text');
    const parsed = text && text.type === 'text' ? JSON.parse(text.text) : { suggestions: [] };
    const usage = usageSummary(response.usage);
    console.log(JSON.stringify({ photo_id: { model: response.model, candidates: candidates.length, ...usage } }));
    return json({
      suggestions: cleanSuggestions(parsed, candidates),
      used,
      limit: LIMIT,
      model: response.model,
      usage,
    });
  } catch (e) {
    await admin.rpc('release_photo_id_quota', { p_user: user.id });
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
      return json({ error: 'busy' }, 503);
    }
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'not_configured' }, 503);
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: 'model_error', message: message.slice(0, 300) }, 502);
  }
});
