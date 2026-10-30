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

export const MAX_CANDIDATES = 800;
export const MAX_IMAGE_BYTES = 1_500_000;

/** Caps and cleans the candidate list sent by the client, so a request cannot inflate token cost. */
export function sanitizeCandidates(input: unknown): Candidate[] {
  if (!Array.isArray(input)) return [];
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n).replace(/[\n\r|]/g, ' ').trim() : null);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of input.slice(0, MAX_CANDIDATES)) {
    const id = clip((c as Candidate)?.id, 80);
    const sci = clip((c as Candidate)?.sci, 80);
    if (!id || !sci || seen.has(id) || !/^[a-z0-9-]+$/.test(id)) continue;
    seen.add(id);
    out.push({ id, sci, de: clip((c as Candidate).de, 60), en: clip((c as Candidate).en, 60) });
  }
  return out;
}

/** Stable text block (cacheable per region and catalog version): one candidate per line. */
export function candidateBlock(candidates: Candidate[]): string {
  return candidates
    .map((c) => [c.id, c.sci, c.en ?? '', c.de ?? ''].join(' | '))
    .join('\n');
}

export const SYSTEM_PROMPT = `You identify marine animals, corals and plants in underwater or snorkelling photos for a dive logbook app.
You are given a fixed list of candidate species (id | scientific name | English name | German name) for the region where the photo was taken.
Rules:
- Only suggest ids from the candidate list. Never invent ids.
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
          species_id: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['species_id', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

/** Keeps only valid candidate ids, clamps confidences, sorts and caps at five. */
export function cleanSuggestions(raw: unknown, candidates: Candidate[]): Suggestion[] {
  const ids = new Set(candidates.map((c) => c.id));
  const list = (raw as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .filter((s): s is Suggestion => !!s && typeof s.species_id === 'string' && ids.has(s.species_id))
    .filter((s) => !seen.has(s.species_id) && seen.add(s.species_id))
    .map((s) => ({
      species_id: s.species_id,
      confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
      reason: String(s.reason ?? '').slice(0, 300),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}
