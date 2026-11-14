/**
 * Shared shortcut matching rules. A workspace registers actions, while native
 * text editing, modal dialogs and drag/drop interactions retain their keys.
 */
export interface ShortcutKeys {
  key: string;
  /** Physical key: stable when keyboard layout is Arabic or another language. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}
export interface ShortcutBinding {
  id: string;
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowWhenEditing?: boolean;
  run: () => void;
}

export function findWorkspaceShortcut(
  event: ShortcutKeys,
  bindings: readonly ShortcutBinding[],
  isEditingText: boolean
): ShortcutBinding | null {
  const key = event.key.toLowerCase();
  const physicalKey = event.code?.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  return bindings.find(binding =>
    (binding.key.toLowerCase() === key || physicalKey === `key${binding.key.toLowerCase()}`) &&
    Boolean(binding.mod) === modifier &&
    Boolean(binding.shift) === event.shiftKey &&
    Boolean(binding.alt) === event.altKey &&
    (!isEditingText || binding.allowWhenEditing)
  ) || null;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}
