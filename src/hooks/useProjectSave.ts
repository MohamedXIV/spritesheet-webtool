'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { saveProject, DbProject, ProjectMetadata } from '@/lib/projectDatabase';
import { serializeProject } from '@/lib/frameStore';
import { FrameState } from '@/lib/frameStore';

export function useProjectSave(options: {
  projectId: string;
  setProjectId: (id: string) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  type: 'spritesheet' | 'pixelator';
  frameState: FrameState | null;
  fps: number;
  loopMode: string;
  previewBgMode?: string;
  previewBgColor?: string;
  pixelatorOptions?: any;
  slicerOptions?: any;
  isDirty: boolean;
  markSaved?: () => void;
}) {
  const {
    projectId,
    projectName,
    markSaved
  } = options;

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [autosaveNotification, setAutosaveNotification] = useState<string | null>(null);

  // Keep options in a ref to avoid resetting the autosave interval when states change
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const triggerSave = useCallback(async (customName?: string) => {
    const currentOpts = optionsRef.current;
    if (!currentOpts.frameState) return;

    setIsSaving(true);
    try {
      // 1. Serialize active frames using our safe compile PNG Blobs method
      const serialized = await serializeProject(currentOpts.frameState, currentOpts.fps);

      // 2. Build the project metadata structure
      const metadata: ProjectMetadata = {
        folders: currentOpts.frameState.folders,
        selectedIds: Array.from(currentOpts.frameState.selectedIds),
        fps: currentOpts.fps,
        loopMode: currentOpts.loopMode,
        previewBgMode: currentOpts.previewBgMode,
        previewBgColor: currentOpts.previewBgColor,
        pixelatorOptions: currentOpts.pixelatorOptions,
        slicerOptions: currentOpts.slicerOptions,
      };

      // 3. Construct DbProject record
      const finalName = customName || currentOpts.projectName || 'Untitled Project';
      const dbProject: DbProject = {
        id: currentOpts.projectId,
        name: finalName,
        type: currentOpts.type,
        createdAt: Date.now(), // IndexedDB will overwrite the record if the ID matches
        updatedAt: Date.now(),
        metadata,
        frames: serialized.frames,
      };

      // 4. Save to IndexedDB
      await saveProject(dbProject);
      
      // 5. Update UI states
      setLastSavedAt(Date.now());
      currentOpts.markSaved?.();
    } catch (error) {
      console.error('Project save failed:', error);
      alert('Failed to save project locally');
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Autosave loop (every 30 seconds)
  useEffect(() => {
    if (!autosaveEnabled) return;

    const timer = setInterval(() => {
      const currentOpts = optionsRef.current;
      // Only autosave if there are frames loaded and the workspace is dirty!
      if (currentOpts.frameState && currentOpts.frameState.frames.length > 0 && currentOpts.isDirty) {
        triggerSave().then(() => {
          setAutosaveNotification('Autosaved');
          setTimeout(() => setAutosaveNotification(null), 3000);
        });
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [autosaveEnabled, triggerSave]);

  return {
    triggerSave,
    isSaving,
    lastSavedAt,
    autosaveEnabled,
    setAutosaveEnabled,
    autosaveNotification,
  };
}
