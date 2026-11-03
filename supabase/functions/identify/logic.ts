// Pure helpers of the identify function (no Deno or network APIs), unit-tested from the app's test suite.

export interface Candidate {
  id: string;
  sci: string;
  de?: string | null;
  en?: string | null;
}

export interface Suggestion {
  species_id: string;
  confidence: number;
  reason: string;
}

export const MAX_IMAGE_BYTES = 1_500_000;

/**
 * Species the model may suggest, per region: public/catalog/photo-id.json, built from the catalog
 * by scripts/photo-id-index.mjs. The function loads it itself; a request only names the region,
 * so nobody can enlarge the prompt (and the cost) with a long list of their own.
 */
export interface CandidateIndex {
  version: string;
  species: [string, string][];
  regions: Record<string, { name: string; species: number[] }>;
}

export function parseIndex(raw: unknown): CandidateIndex | null {
  const r = raw as CandidateIndex;
  if (!r || typeof r.version !== 'string' || !Array.isArray(r.species) || typeof r.regions !== 'object' || !r.regions) return null;
  if (!r.species.every((s) => Array.isArray(s) && typeof s[0] === 'string' && typeof s[1] === 'string')) return null;
  return r;
}

/** Candidates of a region (all species without one); null for a region the index does not know. */
export function regionCandidates(index: CandidateIndex, regionId: string | null): Candidate[] | null {
  const toCandidate = ([id, sci]: [string, string]) => ({ id, sci });
  if (!regionId) return index.species.map(toCandidate);
  const region = Object.hasOwn(index.regions, regionId) ? index.regions[regionId] : undefined;
  if (!region) return null;
  return region.species.filter((i) => index.species[i]).map((i) => toCandidate(index.species[i]));
}

/** App versions before 0.7.1 send the English region name instead of its id. */
export function regionIdByName(index: CandidateIndex, name: unknown): string | null {
  if (typeof name !== 'string') return null;
  return Object.entries(index.regions).find(([, r]) => r.name === name)?.[0] ?? null;
}

/** Comparison key for scientific names; ignores case, extra spaces and a subgenus in brackets. */
const sciKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Stable text block (cacheable per region and catalog version): one scientific name per line.
 * Only the scientific name: the model knows species best by it, and common names and ids would
 * triple the tokens of this, the largest part of every request.
 */
export function candidateBlock(candidates: Candidate[]): string {
  const seen = new Set<string>();
  return candidates
    .filter((c) => !seen.has(sciKey(c.sci)) && !!seen.add(sciKey(c.sci)))
    .map((c) => c.sci)
    .join('\n');
}

export const SYSTEM_PROMPT = `You identify marine animals, corals and plants in underwater or snorkelling photos for a dive logbook app.
You are given a fixed list of candidate species (scientific names, one per line) for the region where the photo was taken.
Rules:
- Only suggest species from the candidate list, with the scientific name exactly as listed. Never invent names.
- Return up to 5 suggestions, most likely first. Fewer is fine when the photo clearly shows one species.
- confidence is your probability (0 to 1) that the suggestion is correct; the values of all suggestions together must not exceed 1.
- Use low confidence when the subject is small, blurry, partly hidden, or when similar species differ in details that are not visible.
- reason: one short sentence in German naming the visible features that support the suggestion.
- If no candidate fits (e.g. no animal visible, or a species outside the list), return an empty list.`;

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scientific_name: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['scientific_name', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

/** Maps the model's scientific names back to catalog ids, clamps confidences, sorts and caps at five. */
export function cleanSuggestions(raw: unknown, candidates: Candidate[]): Suggestion[] {
  const idOf = new Map<string, string>();
  for (const c of candidates) if (!idOf.has(sciKey(c.sci))) idOf.set(sciKey(c.sci), c.id);
  const list = (raw as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .map((s: { scientific_name?: unknown; confidence?: unknown; reason?: unknown }) => ({
      id: typeof s?.scientific_name === 'string' ? idOf.get(sciKey(s.scientific_name)) : undefined,
      s,
    }))
    .filter((x): x is { id: string; s: { confidence?: unknown; reason?: unknown } } => !!x.id)
    .filter((x) => !seen.has(x.id) && !!seen.add(x.id))
    .map(({ id, s }) => ({
      species_id: id,
      confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
      reason: String(s.reason ?? '').slice(0, 300),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

/** Token counts of one request, for cost checks (returned to the app and written to the function log). */
export function usageSummary(usage: unknown) {
  const u = (usage ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  return {
    input: n('input_tokens'),
    cache_write: n('cache_creation_input_tokens'),
    cache_read: n('cache_read_input_tokens'),
    output: n('output_tokens'),
  };
}
