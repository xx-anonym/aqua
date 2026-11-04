import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Haptic, setupHaptics } from './haptics';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

function asDevice(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => vi.restoreAllMocks());

describe('haptic feedback', () => {
  it('iPhone: the touch flips the hidden switch once and reaches the button once', async () => {
    asDevice(IPHONE);
    const onClick = vi.fn();
    const { container } = render(
      <button data-haptic onClick={onClick}>
        Speichern
        <Haptic />
      </button>,
    );
    const surface = container.querySelector('.haptic-surface') as HTMLLabelElement;
    const toggle = surface.querySelector('input')!;
    expect(toggle.hasAttribute('switch')).toBe(true);
    const flips = vi.fn();
    toggle.addEventListener('change', flips);

    fireEvent.click(surface);
    expect(flips).toHaveBeenCalledTimes(1); // the moment the iPhone clicks
    expect(onClick).not.toHaveBeenCalled(); // passed on only after the switch has flipped
    await new Promise((r) => setTimeout(r, 5));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('iPhone: a disabled button gets no click', async () => {
    asDevice(IPHONE);
    const onClick = vi.fn();
    const { container } = render(
      <button data-haptic disabled onClick={onClick}>
        Speichern
        <Haptic />
      </button>,
    );
    fireEvent.click(container.querySelector('.haptic-surface')!);
    await new Promise((r) => setTimeout(r, 5));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('elsewhere: no surface; Android vibrates on haptic buttons only', () => {
    asDevice(ANDROID);
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    setupHaptics();
    const { container } = render(
      <div>
        <button data-haptic>
          Speichern
          <Haptic />
        </button>
        <button>Weiter</button>
      </div>,
    );
    expect(container.querySelector('.haptic-surface')).toBeNull();
    const [save, next] = container.querySelectorAll('button');
    fireEvent.click(next);
    expect(vibrate).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});
