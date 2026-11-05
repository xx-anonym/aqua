import { describe, expect, it } from 'vitest';
import { formatDurationShort } from '../lib/units';
import { niceTicks } from './charts';

describe('chart helpers', () => {
  it('gives whole-number ticks from 0 to at least the maximum', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(12)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(13)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(120)).toEqual([0, 50, 100, 150]);
  });

  it('shortens long dive times for the stat tiles', () => {
    expect(formatDurationShort(49)).toBe('49 min');
    expect(formatDurationShort(1551)).toBe('25:51 h');
    expect(formatDurationShort(60)).toBe('1:00 h');
    expect(formatDurationShort(null)).toBe('–');
  });
});
