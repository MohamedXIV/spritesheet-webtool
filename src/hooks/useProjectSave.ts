'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { saveProject, DbProject, ProjectMetadata, DbProjectFrame } from '@/lib/projectDatabase';
import { serializeProject } from '@/lib/frameStore';
import { FrameState } from '@/lib/frameStore';

export function useProjectSave(options: {
  projectId: string;
  setProjectId: (id: string) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer';
  frameState: FrameState | null;
  customFrames?: () => Promise<DbProjectFrame[]>; // Optional custom frames serializer
  threePainterOptions?: any; // Custom settings for 3D painter
  trimsheetOptions?: any; // Custom settings blob for the trimsheet tool
  stylizerOptions?: import('@/lib/stylizer').StylizerOptions;
  stylizerMapSlots?: string[];
  previewShape?: 'sphere' | 'box' | 'plane' | 'custom';
  customModelName?: string | null;
  fps: number;
  loopMode: string;
  previewBgMode?: string;
  previewBgColor?: string;
  pixelatorOptions?: any;
  slicerOptions?: any;
  isDirty: boolean;
  markSaved?: (savedState?: FrameState | null) => void;
  globalLayers?: any[];
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [autosaveNotification, setAutosaveNotification] = useState<string | null>(null);

  // Each request captures its state at invocation time. Queuing prevents an
  // older, slower PNG serialization from overwriting a newer save.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const noticeSequenceRef = useRef(0);

  const notify = useCallback((message: string) => {
    const sequence = ++noticeSequenceRef.current;
    setAutosaveNotification(message);
    setTimeout(() => {
      if (noticeSequenceRef.current === sequence) setAutosaveNotification(null);
    }, 3000);
  }, []);

  const queueSave = useCallback((
    mode: 'save' | 'copy',
    customName?: string,
    automatic = false
  ): Promise<boolean> => {
    const snapshot = optionsRef.current;
    if (!snapshot.frameState && !snapshot.customFrames) return Promise.resolve(false);

    pendingSavesRef.current += 1;
    setIsSaving(true);

    const perform = async (): Promise<boolean> => {
      try {
        const generatedId = () =>
          `${snapshot.type}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const targetId = mode === 'copy' || !snapshot.projectId
          ? generatedId()
          : snapshot.projectId;
        const name = customName?.trim() || snapshot.projectName || 'Untitled Project';

        const frames: DbProjectFrame[] = snapshot.customFrames
          ? await snapshot.customFrames()
          : snapshot.frameState
            ? (await serializeProject(snapshot.frameState, snapshot.fps, snapshot.globalLayers)).frames
            : [];

        const metadata: ProjectMetadata = {
          folders: snapshot.frameState?.folders || [],
          selectedIds: snapshot.frameState
            ? Array.from(snapshot.frameState.selectedIds)
            : [],
          fps: snapshot.fps,
          loopMode: snapshot.loopMode,
          previewBgMode: snapshot.previewBgMode,
          previewBgColor: snapshot.previewBgColor,
          pixelatorOptions: snapshot.pixelatorOptions,
          slicerOptions: snapshot.slicerOptions,
          threePainterOptions: snapshot.threePainterOptions,
          trimsheetOptions: snapshot.trimsheetOptions,
          stylizerOptions: snapshot.stylizerOptions,
          stylizerMapSlots: snapshot.stylizerMapSlots,
          previewShape: snapshot.previewShape,
          customModelName: snapshot.customModelName,
          globalLayers: snapshot.globalLayers,
        };

        const now = Date.now();
        const project: DbProject = {
          id: targetId,
          name,
          type: snapshot.type,
          createdAt: now,
          updatedAt: now,
          metadata,
          frames,
        };

        // saveProject resolves only after IndexedDB transaction.oncomplete.
        await saveProject(project);

        if (mode === 'copy' || !snapshot.projectId) {
          snapshot.setProjectId(targetId);
          const url = new URL(window.location.href);
          url.searchParams.set('project', targetId);
          window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
        if (customName?.trim()) snapshot.setProjectName(name);

        setLastSavedAt(Date.now());
        // Never clear the dirty flag of edits made while this save was running.
        snapshot.markSaved?.(snapshot.frameState);
        if (mode === 'copy' && !automatic) notify('Project copy saved');
        return true;
      } catch (error) {
        console.error('Project save failed:', error);
        if (automatic) notify('Autosave failed');
        else alert('Failed to save project locally. Your current work has not been marked as saved.');
        return false;
      } finally {
        pendingSavesRef.current -= 1;
        setIsSaving(pendingSavesRef.current > 0);
      }
    };

    const result = saveQueueRef.current.then(perform, perform);
    // A failed job must never poison future queued saves.
    saveQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, [notify]);

  const triggerSave = useCallback(
    (customName?: string) => queueSave('save', customName),
    [queueSave]
  );
  const triggerSaveAs = useCallback(
    (newName: string) => queueSave('copy', newName),
    [queueSave]
  );

  useEffect(() => {
    if (!autosaveEnabled) return;
    const timer = setInterval(() => {
      const current = optionsRef.current;
      const hasContent = !!current.customFrames ||
        !!(current.frameState && current.frameState.frames.length > 0);
      if (!current.isDirty || !hasContent || pendingSavesRef.current > 0) return;
      void queueSave('save', undefined, true).then((success) => {
        if (success) notify('Autosaved');
      });
    }, 30000);
    return () => clearInterval(timer);
  }, [autosaveEnabled, queueSave, notify]);

  return {
    triggerSave,
    triggerSaveAs,
    isSaving,
    lastSavedAt,
    autosaveEnabled,
    setAutosaveEnabled,
    autosaveNotification,
  };
}
