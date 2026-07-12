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
  markSaved?: () => void;
  globalLayers?: any[];
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
    if (!currentOpts.frameState && !currentOpts.customFrames) return;

    setIsSaving(true);
    try {
      // 1. Serialize frames
      let dbFrames: DbProjectFrame[] = [];
      if (currentOpts.customFrames) {
        dbFrames = await currentOpts.customFrames();
      } else if (currentOpts.frameState) {
        const serialized = await serializeProject(currentOpts.frameState, currentOpts.fps, currentOpts.globalLayers);
        dbFrames = serialized.frames;
      }

      // 2. Build the project metadata structure
      const metadata: ProjectMetadata = {
        folders: currentOpts.frameState ? currentOpts.frameState.folders : [],
        selectedIds: currentOpts.frameState ? Array.from(currentOpts.frameState.selectedIds) : [],
        fps: currentOpts.fps,
        loopMode: currentOpts.loopMode,
        previewBgMode: currentOpts.previewBgMode,
        previewBgColor: currentOpts.previewBgColor,
        pixelatorOptions: currentOpts.pixelatorOptions,
        slicerOptions: currentOpts.slicerOptions,
        threePainterOptions: currentOpts.threePainterOptions,
        trimsheetOptions: currentOpts.trimsheetOptions,
        stylizerOptions: currentOpts.stylizerOptions,
        stylizerMapSlots: currentOpts.stylizerMapSlots,
        previewShape: currentOpts.previewShape,
        customModelName: currentOpts.customModelName,
        globalLayers: currentOpts.globalLayers,
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
        frames: dbFrames,
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

  const triggerSaveAs = useCallback(async (newName: string) => {
    const currentOpts = optionsRef.current;
    if (!currentOpts.frameState && !currentOpts.customFrames) return;

    setIsSaving(true);
    try {
      // 1. Generate a brand new unique project ID
      const newId = `${currentOpts.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 2. Serialize frames
      let dbFrames: DbProjectFrame[] = [];
      if (currentOpts.customFrames) {
        dbFrames = await currentOpts.customFrames();
      } else if (currentOpts.frameState) {
        const serialized = await serializeProject(currentOpts.frameState, currentOpts.fps, currentOpts.globalLayers);
        dbFrames = serialized.frames;
      }

      // 3. Build the project metadata structure
      const metadata: ProjectMetadata = {
        folders: currentOpts.frameState ? currentOpts.frameState.folders : [],
        selectedIds: currentOpts.frameState ? Array.from(currentOpts.frameState.selectedIds) : [],
        fps: currentOpts.fps,
        loopMode: currentOpts.loopMode,
        previewBgMode: currentOpts.previewBgMode,
        previewBgColor: currentOpts.previewBgColor,
        pixelatorOptions: currentOpts.pixelatorOptions,
        slicerOptions: currentOpts.slicerOptions,
        threePainterOptions: currentOpts.threePainterOptions,
        trimsheetOptions: currentOpts.trimsheetOptions,
        stylizerOptions: currentOpts.stylizerOptions,
        stylizerMapSlots: currentOpts.stylizerMapSlots,
        previewShape: currentOpts.previewShape,
        customModelName: currentOpts.customModelName,
        globalLayers: currentOpts.globalLayers,
      };

      // 4. Construct DbProject record
      const dbProject: DbProject = {
        id: newId,
        name: newName,
        type: currentOpts.type,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata,
        frames: dbFrames,
      };

      // 5. Save to IndexedDB
      await saveProject(dbProject);
      
      // 6. Update ID and Name inside parent component state
      currentOpts.setProjectId(newId);
      currentOpts.setProjectName(newName);
      
      // 7. Update browser URL query parameter dynamically without page reload
      const newUrl = `${window.location.pathname}?project=${newId}`;
      window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl);

      // 8. Update UI states
      setLastSavedAt(Date.now());
      currentOpts.markSaved?.();
      
      alert(`Project successfully cloned as "${newName}"! Future changes (Ctrl+S) will save into this new version.`);
    } catch (error) {
      console.error('Project Save As failed:', error);
      alert('Failed to clone project locally');
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Autosave loop (every 30 seconds)
  useEffect(() => {
    if (!autosaveEnabled) return;

    const timer = setInterval(() => {
      const currentOpts = optionsRef.current;
      // Only autosave if there are frames loaded/customFrames exists and the workspace is dirty!
      const hasContent = currentOpts.customFrames || (currentOpts.frameState && currentOpts.frameState.frames.length > 0);
      if (hasContent && currentOpts.isDirty) {
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
    triggerSaveAs,
    isSaving,
    lastSavedAt,
    autosaveEnabled,
    setAutosaveEnabled,
    autosaveNotification,
  };
}
