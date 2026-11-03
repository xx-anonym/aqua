import { describe, expect, it } from 'vitest';
import {
  candidateBlock,
  cleanSuggestions,
  parseIndex,
  regionCandidates,
  regionIdByName,
  usageSummary,
  type CandidateIndex,
} from '../../supabase/functions/identify/logic';

const index: CandidateIndex = {
  version: 'test',
  species: [
    ['pterois-miles', 'Pterois miles'],
    ['chromis-chromis', 'Chromis chromis'],
    ['holothuria-tubulosa', 'Holothuria (Holothuria) tubulosa'],
  ],
  regions: {
    'red-sea': { name: 'Red Sea', species: [0] },
    mediterranean: { name: 'Mediterranean Sea', species: [1, 2] },
  },
};

describe('photo-ID edge function helpers', () => {
  it('takes the candidates of a region from its own index, not from the request', () => {
    expect(regionCandidates(index, 'red-sea')).toEqual([{ id: 'pterois-miles', sci: 'Pterois miles' }]);
    expect(regionCandidates(index, null)).toHaveLength(3);
    expect(regionCandidates(index, 'atlantis')).toBeNull();
    expect(regionCandidates(index, 'constructor')).toBeNull();
    // Older app versions send the region's English name.
    expect(regionIdByName(index, 'Mediterranean Sea')).toBe('mediterranean');
    expect(regionIdByName(index, ['x'])).toBeNull();
    expect(parseIndex({ version: 'x', species: [[1, 2]], regions: {} })).toBeNull();
    expect(parseIndex(index)).toBe(index);
  });

  it('lists only scientific names for the model', () => {
    expect(candidateBlock(regionCandidates(index, 'mediterranean')!).split('\n')).toEqual(['Chromis chromis', 'Holothuria (Holothuria) tubulosa']);
  });

  it('maps scientific names back to ids, drops unknown ones, clamps confidence and sorts', () => {
    const candidates = regionCandidates(index, null)!;
    const out = cleanSuggestions(
      {
        suggestions: [
          { scientific_name: 'Chromis  chromis', confidence: 0.2, reason: 'braun' },
          { scientific_name: 'Invented species', confidence: 0.9, reason: '' },
          { scientific_name: 'pterois miles', confidence: 1.7, reason: 'Flossen' },
          { scientific_name: 'Pterois miles', confidence: 0.5, reason: 'dup' },
          { scientific_name: 'Holothuria tubulosa', confidence: 0.1, reason: 'x' },
        ],
      },
      candidates,
    );
    expect(out).toEqual([
      { species_id: 'pterois-miles', confidence: 1, reason: 'Flossen' },
      { species_id: 'chromis-chromis', confidence: 0.2, reason: 'braun' },
      { species_id: 'holothuria-tubulosa', confidence: 0.1, reason: 'x' },
    ]);
    expect(cleanSuggestions({ nope: 1 }, candidates)).toEqual([]);
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
