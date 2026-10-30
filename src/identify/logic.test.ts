import { describe, expect, it } from 'vitest';
import { candidateBlock, cleanSuggestions, MAX_CANDIDATES, sanitizeCandidates } from '../../supabase/functions/identify/logic';

describe('photo-ID edge function helpers', () => {
  const candidates = sanitizeCandidates([
    { id: 'pterois-miles', sci: 'Pterois miles', de: 'Indischer Rotfeuerfisch', en: 'Devil firefish' },
    { id: 'pterois-miles', sci: 'duplicate' },
    { id: 'Bad Id!', sci: 'x' },
    { id: 'chromis-chromis', sci: 'Chromis chromis | injected\nline', de: null },
  ]);

  it('drops invalid and duplicate candidates and strips separators', () => {
    expect(candidates.map((c) => c.id)).toEqual(['pterois-miles', 'chromis-chromis']);
    expect(candidateBlock(candidates).split('\n')).toEqual([
      'pterois-miles | Pterois miles | Devil firefish | Indischer Rotfeuerfisch',
      'chromis-chromis | Chromis chromis   injected line |  | ',
    ]);
  });

  it('caps the candidate list', () => {
    const many = Array.from({ length: MAX_CANDIDATES + 50 }, (_, i) => ({ id: `s-${i}`, sci: `S ${i}` }));
    expect(sanitizeCandidates(many)).toHaveLength(MAX_CANDIDATES);
  });

  it('keeps only known ids, clamps confidence and sorts', () => {
    const out = cleanSuggestions(
      {
        suggestions: [
          { species_id: 'chromis-chromis', confidence: 0.2, reason: 'braun' },
          { species_id: 'invented-species', confidence: 0.9, reason: '' },
          { species_id: 'pterois-miles', confidence: 1.7, reason: 'Flossen' },
          { species_id: 'pterois-miles', confidence: 0.5, reason: 'dup' },
        ],
      },
      candidates,
    );
    expect(out).toEqual([
      { species_id: 'pterois-miles', confidence: 1, reason: 'Flossen' },
      { species_id: 'chromis-chromis', confidence: 0.2, reason: 'braun' },
    ]);
    expect(cleanSuggestions({ nope: 1 }, candidates)).toEqual([]);
  });
});
