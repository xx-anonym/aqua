import { describe, expect, it } from 'vitest';
import { candidateBlock, cleanSuggestions, MAX_CANDIDATES, sanitizeCandidates, usageSummary } from '../../supabase/functions/identify/logic';

describe('photo-ID edge function helpers', () => {
  const candidates = sanitizeCandidates([
    { id: 'pterois-miles', sci: 'Pterois miles', de: 'Indischer Rotfeuerfisch', en: 'Devil firefish' },
    { id: 'pterois-miles', sci: 'duplicate' },
    { id: 'Bad Id!', sci: 'x' },
    { id: 'chromis-chromis', sci: 'Chromis chromis | injected\nline', de: null },
  ]);

  it('drops invalid and duplicate candidates and strips separators', () => {
    expect(candidates.map((c) => c.id)).toEqual(['pterois-miles', 'chromis-chromis']);
    // Only scientific names go to the model (cheapest list that still identifies the species).
    expect(candidateBlock(candidates).split('\n')).toEqual(['Pterois miles', 'Chromis chromis   injected line']);
  });

  it('caps the candidate list', () => {
    const many = Array.from({ length: MAX_CANDIDATES + 50 }, (_, i) => ({ id: `s-${i}`, sci: `S ${i}` }));
    expect(sanitizeCandidates(many)).toHaveLength(MAX_CANDIDATES);
  });

  it('maps scientific names back to ids, drops unknown ones, clamps confidence and sorts', () => {
    const out = cleanSuggestions(
      {
        suggestions: [
          { scientific_name: 'Chromis  chromis injected line', confidence: 0.2, reason: 'braun' },
          { scientific_name: 'Invented species', confidence: 0.9, reason: '' },
          { scientific_name: 'pterois miles', confidence: 1.7, reason: 'Flossen' },
          { scientific_name: 'Pterois miles', confidence: 0.5, reason: 'dup' },
        ],
      },
      candidates,
    );
    expect(out).toEqual([
      { species_id: 'pterois-miles', confidence: 1, reason: 'Flossen' },
      { species_id: 'chromis-chromis', confidence: 0.2, reason: 'braun' },
    ]);
    expect(cleanSuggestions({ nope: 1 }, candidates)).toEqual([]);
    const holo = sanitizeCandidates([{ id: 'holothuria-tubulosa', sci: 'Holothuria (Holothuria) tubulosa' }]);
    expect(cleanSuggestions({ suggestions: [{ scientific_name: 'Holothuria tubulosa', confidence: 0.6, reason: 'x' }] }, holo)).toEqual([
      { species_id: 'holothuria-tubulosa', confidence: 0.6, reason: 'x' },
    ]);
  });

  it('summarises token usage', () => {
    expect(usageSummary({ input_tokens: 1200, cache_creation_input_tokens: 2400, output_tokens: 300 })).toEqual({
      input: 1200,
      cache_write: 2400,
      cache_read: 0,
      output: 300,
    });
    expect(usageSummary(undefined)).toEqual({ input: 0, cache_write: 0, cache_read: 0, output: 0 });
  });
});
