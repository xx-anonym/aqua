import { describe, expect, it } from 'vitest';
import { smoothTransitions } from './transitions';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

describe('page transitions', () => {
  it('run in Chrome, not in Safari or on the iPhone', () => {
    Object.assign(document, { startViewTransition: () => undefined });
    expect(smoothTransitions(ANDROID, 5)).toBe(true);
    expect(smoothTransitions(IPHONE, 5)).toBe(false);
    expect(smoothTransitions(MAC_SAFARI, 0)).toBe(false);
    expect(smoothTransitions(MAC_SAFARI, 5)).toBe(false);
  });
});
