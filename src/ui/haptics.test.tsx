import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupHaptics } from './haptics';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

const asDevice = (userAgent: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
const nextTick = () => new Promise((r) => setTimeout(r, 5));

afterEach(() => vi.restoreAllMocks());

/** A haptic button whose label React replaces on every click, plus a segmented switch and a plain button. */
function Screen({ onSave }: { onSave: () => void }) {
  const [saved, setSaved] = useState(0);
  const [late, setLate] = useState(false);
  return (
    <div>
      <button
        data-haptic
        onClick={() => {
          setSaved((n) => n + 1);
          onSave();
        }}
      >
        {saved ? `Gespeichert ${saved}` : 'Speichern'}
      </button>
      <div className="segmented">
        <button onClick={() => setLate(true)}>Fische</button>
      </div>
      {late && <button data-haptic>Später</button>}
      <button disabled data-haptic>
        Aus
      </button>
      <button>Weiter</button>
    </div>
  );
}

describe('haptic feedback', () => {
  it('iPhone: the touch flips the hidden switch once and reaches the button once', async () => {
    asDevice(IPHONE);
    const onSave = vi.fn();
    const { container } = render(<Screen onSave={onSave} />);
    setupHaptics(container);
    const save = container.querySelector('[data-haptic]') as HTMLButtonElement;
    const surface = save.querySelector(':scope > .haptic-surface') as HTMLLabelElement;
    const toggle = surface.querySelector('input')!;
    expect(toggle.hasAttribute('switch')).toBe(true);
    const flips = vi.fn();
    toggle.addEventListener('change', flips);

    fireEvent.click(surface);
    expect(flips).toHaveBeenCalledTimes(1); // the moment the iPhone clicks
    expect(onSave).not.toHaveBeenCalled(); // passed on only after the switch has flipped
    await nextTick();
    expect(onSave).toHaveBeenCalledTimes(1);
    // React replaced the button text, which removes the surface: it comes back.
    await nextTick();
    expect(save.textContent).toContain('Gespeichert 1');
    expect(save.querySelectorAll(':scope > .haptic-surface')).toHaveLength(1);
  });

  it('iPhone: switches get a surface, elements rendered later too, plain buttons none', async () => {
    asDevice(IPHONE);
    const { container } = render(<Screen onSave={() => undefined} />);
    setupHaptics(container);
    const tab = container.querySelector('.segmented > button')!;
    expect(tab.querySelector('.haptic-surface')).not.toBeNull();
    expect([...container.querySelectorAll('button')].find((b) => b.textContent === 'Weiter')!.querySelector('.haptic-surface')).toBeNull();
    fireEvent.click(tab.querySelector('.haptic-surface')!);
    await nextTick();
    const late = [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Später'))!;
    expect(late.querySelector('.haptic-surface')).not.toBeNull();
  });

  it('iPhone: a disabled button gets no click', async () => {
    asDevice(IPHONE);
    const onClick = vi.fn();
    const { container } = render(
      <button data-haptic disabled onClick={onClick}>
        Speichern
      </button>,
    );
    setupHaptics(container);
    fireEvent.click(container.querySelector('.haptic-surface')!);
    await nextTick();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Android: no surfaces, a short vibration on haptic elements only', () => {
    asDevice(ANDROID);
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { container } = render(<Screen onSave={() => undefined} />);
    setupHaptics(container);
    expect(container.querySelector('.haptic-surface')).toBeNull();
    const buttons = [...container.querySelectorAll('button')];
    fireEvent.click(buttons.find((b) => b.textContent === 'Weiter')!);
    expect(vibrate).not.toHaveBeenCalled();
    fireEvent.click(buttons.find((b) => b.textContent === 'Speichern')!);
    fireEvent.click(buttons.find((b) => b.textContent === 'Fische')!);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});
