import { useLayoutEffect, useRef } from 'react';
import { devicePlatform } from '../lib/install';
import { useBackToClose } from './backToClose';

/**
 * On the iPhone and iPad the dialog opens in the page (show) instead of the top layer: there a
 * sheet first appeared too high and then jumped down, as long as the installed app's view was
 * short at the bottom (--launch-gap, index.html). The page's own layer handles that gap.
 */
const TOP_LAYER = devicePlatform() !== 'ios';

/**
 * Opens the returned <dialog> as a native modal (showModal): it lies in the top layer above
 * everything, keeps the keyboard focus inside and makes the page behind inert. Escape and the
 * Android back gesture arrive as the dialog's "cancel" and close it through `onClose`; the swipe
 * back in Safari and the browser's back button go through useBackToClose as before.
 *
 * The element marked data-autofocus gets the focus (the sheet itself, so no keyboard pops up);
 * the element focused before gets it back when the dialog goes away.
 */
export function useModalDialog(onClose: () => void, historyEntry = true) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useBackToClose(onClose, historyEntry);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    let mounted = true;
    const open = () => {
      if (dialog.open) return;
      try {
        if (TOP_LAYER) dialog.showModal();
        else dialog.show();
      } catch {
        dialog.setAttribute('open', '');
      }
      const target = dialog.matches('[data-autofocus]') ? dialog : dialog.querySelector<HTMLElement>('[data-autofocus]');
      target?.focus({ preventScroll: true });
    };
    if (!TOP_LAYER) dialog.setAttribute('aria-modal', 'true');
    open();
    // Not modal (iPhone/iPad): Escape on an attached keyboard closes the dialog all the same.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialog === [...document.querySelectorAll('dialog[open]')].at(-1)) close.current();
    };
    if (!TOP_LAYER) document.addEventListener('keydown', onKey);
    const onCancel = (e: Event) => {
      // Without a recent tap the browser may not let the closing be stopped: it then closes the
      // dialog itself and "close" below reports it.
      if (!e.cancelable) return;
      e.preventDefault();
      close.current();
    };
    const onNativeClose = () => {
      close.current();
      // The owner kept the dialog (e.g. it asks first): show it again.
      window.setTimeout(() => mounted && open(), 0);
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onNativeClose);
    return () => {
      mounted = false;
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onNativeClose);
      document.removeEventListener('keydown', onKey);
      // Once the dialog is gone: until then the page behind is inert and cannot take the focus.
      queueMicrotask(() => {
        if (before?.isConnected && !document.querySelector('dialog:modal')?.contains(document.activeElement)) before.focus({ preventScroll: true });
      });
    };
  }, []);
  return ref;
}

/** Shows a popover="manual" element in the top layer, i.e. above an open modal dialog. */
export function showInTopLayer(el: HTMLElement | null) {
  if (!el || typeof el.showPopover !== 'function') return;
  try {
    if (!el.matches(':popover-open')) el.showPopover();
  } catch {
    // Not supported or already shown: it stays where CSS puts it.
  }
}

/** Spread onto an element shown with showInTopLayer (React 18 does not know the attribute yet). */
export const MANUAL_POPOVER = { popover: 'manual' } as Record<string, string>;
