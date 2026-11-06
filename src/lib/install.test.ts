import { describe, expect, it } from 'vitest';
import { devicePlatform } from './install';

describe('install hint', () => {
  it('tells iPhone, iPad and Android apart from desktops', () => {
    expect(devicePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15', 5)).toBe('ios');
    // iPadOS asks for the desktop site: a Mac with a touch screen
    expect(devicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('ios');
    expect(devicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('other');
    expect(devicePlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', 5)).toBe('android');
  });
});
