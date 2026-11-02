import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSessionState } from './sessionState';

describe('useSessionState', () => {
  it('keeps the value when the component unmounts and mounts again', () => {
    const first = renderHook(() => useSessionState('test.photoResult', () => ({ suggestions: [] as string[] })));
    act(() => first.result.current[1]({ suggestions: ['chaetodon-auriga'] }));
    first.unmount();
    const again = renderHook(() => useSessionState('test.photoResult', () => ({ suggestions: [] as string[] })));
    expect(again.result.current[0]).toEqual({ suggestions: ['chaetodon-auriga'] });
  });

  it('supports functional updates from the initial value', () => {
    const { result } = renderHook(() => useSessionState('test.counter', 1));
    act(() => result.current[1]((n) => n + 1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(3);
  });
});
