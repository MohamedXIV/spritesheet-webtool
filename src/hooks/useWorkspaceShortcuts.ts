'use client';

import { useEffect, useRef } from 'react';
import { findWorkspaceShortcut, isTextEntryTarget, type ShortcutBinding } from '@/lib/workspaceShortcuts';

/**
 * Registers document-level workspace shortcuts at the CAPTURE phase.
 * Capture is essential for Ctrl/Cmd+S to override browser Save Page before
 * focused dock descendants or controls stop propagation.
 * The latest callbacks are read from a ref so they never go stale.
 */
export function useWorkspaceShortcuts(bindings: readonly ShortcutBinding[]) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || document.querySelector('dialog[open]')) return;
      const match = findWorkspaceShortcut(
        event, bindingsRef.current, isTextEntryTarget(event.target)
      );
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      match.run();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}
