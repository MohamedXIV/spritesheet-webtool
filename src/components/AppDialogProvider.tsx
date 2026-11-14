'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import styles from './AppDialogProvider.module.css';

type DialogKind = 'confirm' | 'alert' | 'prompt';
type DialogAnswer = boolean | string | null;
interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  initialValue?: string;
}
interface Request extends DialogOptions {
  kind: DialogKind;
  resolve: (result: DialogAnswer) => void;
}
export interface AppDialogService {
  confirm: (options: DialogOptions) => Promise<boolean>;
  alert: (options: DialogOptions) => Promise<void>;
  prompt: (options: DialogOptions) => Promise<string | null>;
}
const DialogContext = createContext<AppDialogService | null>(null);

export function useAppDialog(): AppDialogService {
  const value = useContext(DialogContext);
  if (!value) throw new Error('AppDialogProvider is required');
  return value;
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeRef = useRef<Request | null>(null);
  const queuedRef = useRef<Request[]>([]);
  const [active, setActive] = useState<Request | null>(null);
  const [draft, setDraft] = useState('');

  const enqueue = useCallback((kind: DialogKind, options: DialogOptions): Promise<DialogAnswer> =>
    new Promise(resolve => {
      const request = { kind, ...options, resolve };
      if (activeRef.current) queuedRef.current.push(request);
      else {
        activeRef.current = request;
        setDraft(request.initialValue || '');
        setActive(request);
      }
    }), []);

  const finish = useCallback((answer: DialogAnswer) => {
    const current = activeRef.current;
    if (!current) return;
    activeRef.current = null;
    dialogRef.current?.close();
    current.resolve(answer);

    const next = queuedRef.current.shift() || null;
    activeRef.current = next;
    setDraft(next?.initialValue || '');
    setActive(next);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (active && dialog && !dialog.open) dialog.showModal();
  }, [active]);

  const service: AppDialogService = {
    confirm: options => enqueue('confirm', options).then(answer => answer === true),
    alert: options => enqueue('alert', options).then(() => undefined),
    prompt: options => enqueue('prompt', options).then(answer =>
      typeof answer === 'string' ? answer : null),
  };

  return (
    <DialogContext.Provider value={service}>
      {children}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="spritecraft-dialog-title"
        aria-describedby="spritecraft-dialog-message"
        onCancel={event => {
          event.preventDefault();
          finish(active?.kind === 'alert' ? true : null);
        }}
        onClose={() => {
          // Also handle external/platform close events.
          if (activeRef.current) finish(activeRef.current.kind === 'alert' ? true : null);
        }}
      >
        {active && (
          <form className={styles.body} onSubmit={event => {
            event.preventDefault();
            finish(active.kind === 'prompt' ? draft.trim() : true);
          }}>
            <h2 id="spritecraft-dialog-title" className={styles.heading}>{active.title}</h2>
            <p id="spritecraft-dialog-message" className={styles.message}>{active.message}</p>
            {active.kind === 'prompt' && (
              <input
                autoFocus
                className={styles.input}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                aria-label={active.title}
                maxLength={256}
              />
            )}
            <div className={styles.actions}>
              {active.kind !== 'alert' && (
                <button type="button" className={styles.cancel} onClick={() => finish(null)}>
                  Cancel
                </button>
              )}
              <button type="submit" autoFocus={active.kind !== 'prompt'}
                className={active.danger ? styles.danger : styles.confirm}>
                {active.confirmLabel || (active.kind === 'alert' ? 'OK' : active.kind === 'prompt' ? 'Apply' : 'Confirm')}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </DialogContext.Provider>
  );
}
