'use client';

/**
 * Editor Page - VS Code-style dock layout with draggable panels
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { LoopMode } from '@/components/Timeline';
import { BackgroundMode } from '@/components/PreviewPlayer';
import { DockLayout, DockLayoutRef } from '@/components/DockLayout';
import { EditorProvider } from '@/contexts/EditorContext';
import { EditorMenuBar } from '@/components/EditorMenuBar';
import { OutlineOptions } from '@/lib/outlineGenerator';
import { extractFrames, getVideoInfo } from '@/lib/videoDecoder';
import { loadImagesAsFrames, isVideoFile, isImageFile } from '@/lib/imageLoader';
import { 
  FrameState, 
  createFrameState, 
  getOrderedFrames, 
  getSelectedFrames,
  disposeFrames,
  createFolder,
  deleteFolder,
  renameFolder,
  toggleFolderVisibility,
  toggleFolderCollapse,
  moveFrameToFolder,
  moveFramesToFolder,
  addFramesToFolder,
  reorderFolders,
  reorderFramesInFolder,
  deleteSelectedFrames
} from '@/lib/frameStore';
import { FrameData, ExtractionProgress, SourceInfo, SOURCE_COLORS, Folder } from '@/types';
import styles from './page.module.css';
import { useFrameHistory } from '@/hooks/useFrameHistory';
import { useProjectSave } from '@/hooks/useProjectSave';

type EditorState = 'idle' | 'extracting' | 'ready';

const FRAME_WARNING_THRESHOLD = 240;

export default function EditorPage() {
  const [editorState, setEditorState] = useState<EditorState>('idle');
  // 2. Heavyweight Bounded History Frame State (Memory-safe VRAM Garbage Collector)
  const {
    state: frameState,
    setState: setFrameState,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    resetHistory,
    clearHistory
  } = useFrameHistory(8); // strict depth of 8 steps of history
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [fps, setFps] = useState(12);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [decoderType, setDecoderType] = useState<string>('');
  const [loopMode, setLoopMode] = useState<LoopMode>('normal');
  const [showFrameWarning, setShowFrameWarning] = useState(false);
  const [processingFrameIds, setProcessingFrameIds] = useState<Set<string>>(new Set());
  
  // Preview background and outline settings
  const [previewBgMode, setPreviewBgMode] = useState<BackgroundMode>('none');
  const [previewBgColor, setPreviewBgColor] = useState('#1a1a2e');
  const [previewOutline, setPreviewOutline] = useState<Partial<OutlineOptions>>({ enabled: false });
  
  // Save Subsystem states
  const [projectId, setProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('Untitled Spritesheet Project');

  useEffect(() => {
    if (!projectId) {
      setProjectId(`spritesheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [projectId]);

  const {
    triggerSave,
    isSaving,
    autosaveNotification
  } = useProjectSave({
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    type: 'spritesheet',
    frameState,
    fps,
    loopMode,
    previewBgMode,
    previewBgColor,
    isDirty,
    markSaved
  });

  // URL project deep-linking restore effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;

    setEditorState('extracting');
    setProgress({ current: 0, total: 100, percentage: 0 });

    import('@/lib/projectDatabase').then(async ({ getProject }) => {
      try {
        const project = await getProject(id);
        if (!project) {
          alert('Project not found locally.');
          setEditorState('idle');
          return;
        }

        // Restore project info
        setProjectId(project.id);
        setProjectName(project.name);
        setFps(project.metadata.fps || 12);
        setLoopMode((project.metadata.loopMode as any) || 'normal');
        setPreviewBgMode((project.metadata.previewBgMode as any) || 'none');
        setPreviewBgColor(project.metadata.previewBgColor || '#1a1a2e');
        
        // Re-construct FrameState from Blob frames
        const restoredFrames: FrameData[] = [];
        for (const f of project.frames) {
          const bitmap = await createImageBitmap(f.blob);
          restoredFrames.push({
            id: f.id,
            index: f.index,
            timestamp: f.timestamp,
            bitmap,
            sourceId: f.sourceId,
            sourceColor: f.sourceColor
          });
        }

        const restoredState = {
          frames: restoredFrames,
          folders: project.metadata.folders || [],
          selectedIds: new Set(project.metadata.selectedIds || [])
        };

        // Populate frames backup for Reverts
        originalFramesRef.current.clear();
        for (const frame of restoredFrames) {
          const canvas = document.createElement('canvas');
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(frame.bitmap, 0, 0);
          const clone = await createImageBitmap(canvas);
          originalFramesRef.current.set(frame.id, clone);
        }

        resetHistory(restoredState);
        setEditorState('ready');
      } catch (err) {
        console.error('Failed to restore project:', err);
        alert('Failed to load project.');
        setEditorState('idle');
      }
    });
  }, [resetHistory]);

  // Active Real-Time Pixelator State Hooks
  const [pixelatorEnabled, setPixelatorEnabled] = useState(true);
  const [pixelSize, setPixelSize] = useState(8);
  const [pixelatorPalette, setPixelatorPalette] = useState<any>('none');
  const [pixelatorDitherType, setPixelatorDitherType] = useState<any>('none');
  const [pixelatorDitherAmount, setPixelatorDitherAmount] = useState(50);
  const [pixelatorPixelShape, setPixelatorPixelShape] = useState<any>('square');
  const [pixelatorOutlineEnabled, setPixelatorOutlineEnabled] = useState(false);
  const [pixelatorOutlineColor, setPixelatorOutlineColor] = useState('#000000');
  const [pixelatorOutlineThickness, setPixelatorOutlineThickness] = useState(1);
  const [pixelatorContrast, setPixelatorContrast] = useState(0);
  const [pixelatorSaturation, setPixelatorSaturation] = useState(0);
  const [pixelatorBrightness, setPixelatorBrightness] = useState(0);
  
  // Panel visibility tracking
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set([
    'media-loader', 'frame-grid', 'preview', 'timeline',
    'bg-removal', 'outline', 'watermark', 'export'
  ]));
  const dockLayoutRef = useRef<DockLayoutRef>(null);
  
  // Loaded media sources
  const [loadedSources, setLoadedSources] = useState<SourceInfo[]>([]);
  const sourceColorIndexRef = useRef(0);
  
  // Keep a ref to frameState for cleanup on unmount only
  const frameStateRef = useRef<FrameState | null>(null);
  frameStateRef.current = frameState;
  
  // Store original bitmaps for revert functionality
  const originalFramesRef = useRef<Map<string, ImageBitmap>>(new Map());

  // Folder helper actions
  const folders = frameState ? frameState.folders : [];

  const handleCreateFolder = useCallback((name: string, color?: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      const folderColor = color || SOURCE_COLORS[prev.folders.length % SOURCE_COLORS.length];
      return createFolder(prev, name, folderColor);
    });
  }, []);

  const handleDeleteFolder = useCallback((folderId: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return deleteFolder(prev, folderId);
    });
  }, []);

  const handleRenameFolder = useCallback((folderId: string, name: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return renameFolder(prev, folderId, name);
    });
  }, []);

  const handleToggleFolderVisibility = useCallback((folderId: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return toggleFolderVisibility(prev, folderId);
    });
  }, []);

  const handleToggleFolderCollapse = useCallback((folderId: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return toggleFolderCollapse(prev, folderId);
    });
  }, []);

  const handleMoveFrameToFolder = useCallback((frameId: string, folderId: string, targetIndex?: number) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return moveFrameToFolder(prev, frameId, folderId, targetIndex);
    });
  }, []);

  const handleMoveFramesToFolder = useCallback((frameIds: string[], folderId: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return moveFramesToFolder(prev, frameIds, folderId);
    });
  }, []);

  const handleCopyFramesToFolder = useCallback(async (frameIds: string[], folderId: string) => {
    if (frameIds.length === 0) return;
    
    let framesToCopy: FrameData[] = [];
    setFrameState(prev => {
      if (prev) {
        framesToCopy = prev.frames.filter(f => frameIds.includes(f.id));
      }
      return prev;
    });

    if (framesToCopy.length === 0) return;

    try {
      const copiedFrames: FrameData[] = [];
      for (const frame of framesToCopy) {
        const clonedBitmap = await createImageBitmap(frame.bitmap);
        const newId = `frame-copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        copiedFrames.push({
          ...frame,
          id: newId,
          bitmap: clonedBitmap,
        });
      }

      setFrameState(prev => {
        if (!prev) return prev;
        return addFramesToFolder(prev, copiedFrames, folderId);
      });
    } catch (e) {
      console.error('Failed to copy frames:', e);
      alert('Failed to copy frames due to an image cloning error.');
    }
  }, []);

  const handleReorderFolders = useCallback((fromIndex: number, toIndex: number) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return reorderFolders(prev, fromIndex, toIndex);
    });
  }, []);

  const handleReorderFramesInFolder = useCallback((folderId: string, fromIndex: number, toIndex: number) => {
    setFrameState(prev => {
      if (!prev) return prev;
      return reorderFramesInFolder(prev, folderId, fromIndex, toIndex);
    });
  }, []);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      originalFramesRef.current.forEach(b => {
        try { b.close(); } catch {}
      });
      originalFramesRef.current.clear();
      if (frameStateRef.current) {
        try { disposeFrames(frameStateRef.current); } catch {}
      }
    };
  }, []);

  const handleMediaLoad = useCallback(async (files: File[]) => {
    setEditorState('extracting');
    setProgress({ current: 0, total: 0, percentage: 0 });
    setShowFrameWarning(false);

    try {
      // First, get metadata/frame count for all files
      let totalExpectedFrames = 0;
      const fileFramesCount: number[] = [];
      
      for (const file of files) {
        if (isVideoFile(file)) {
          try {
            const info = await getVideoInfo(file);
            const count = Math.floor(info.duration * fps);
            totalExpectedFrames += count;
            fileFramesCount.push(count);
          } catch (e) {
            console.error('Failed to get video info for', file.name, e);
            fileFramesCount.push(0);
          }
        } else if (isImageFile(file)) {
          totalExpectedFrames += 1;
          fileFramesCount.push(1);
        } else {
          fileFramesCount.push(0);
        }
      }

      const newFrames: FrameData[] = [];
      const newSources: SourceInfo[] = [...loadedSources];
      let framesExtractedSoFar = 0;
      let fileIndex = 0;
      const incomingFolders: Folder[] = [];

      for (const file of files) {
        // Assign color for this source
        const sourceId = `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sourceColor = SOURCE_COLORS[sourceColorIndexRef.current % SOURCE_COLORS.length];
        sourceColorIndexRef.current++;

        if (isVideoFile(file)) {
          // Extract frames from video
          const result = await extractFrames(file, fps, sourceId, sourceColor, (p: ExtractionProgress) => {
            const current = framesExtractedSoFar + p.current;
            const total = totalExpectedFrames;
            setProgress({
              current,
              total,
              percentage: total > 0 ? Math.round((current / total) * 100) : 0,
            });
          });

          setDecoderType(result.decoderType);
          newFrames.push(...result.frames);

          newSources.push({
            id: sourceId,
            name: file.name,
            type: 'video',
            frameCount: result.frames.length,
            color: sourceColor,
          });

          incomingFolders.push({
            id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
            frameIds: result.frames.map(f => f.id),
            visible: true,
            collapsed: false,
            color: sourceColor
          });

          framesExtractedSoFar += result.frames.length;
        } else if (isImageFile(file)) {
          // For images, we can update progress immediately
          const current = framesExtractedSoFar + 1;
          const total = totalExpectedFrames;
          setProgress({
            current,
            total,
            percentage: total > 0 ? Math.round((current / total) * 100) : 0,
          });

          // Load image as single frame
          const imageFrames = await loadImagesAsFrames(
            [file],
            sourceId,
            sourceColor,
            newFrames.length,
          );
          newFrames.push(...imageFrames);

          newSources.push({
            id: sourceId,
            name: file.name,
            type: 'image',
            frameCount: 1,
            color: sourceColor,
          });

          incomingFolders.push({
            id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            frameIds: imageFrames.map(f => f.id),
            visible: true,
            collapsed: false,
            color: sourceColor
          });

          framesExtractedSoFar += 1;
        }

        fileIndex++;
      }

      // Combine with existing frames and folders if any
      const existingFrames = frameState?.frames || [];
      const allFrames = [...existingFrames, ...newFrames];
      
      const existingFolders = frameState?.folders || [];
      const allFolders = [...existingFolders, ...incomingFolders];

      setLoadedSources(newSources);
      resetHistory({
        frames: allFrames,
        folders: allFolders.length > 0 ? allFolders : [
          {
            id: 'folder-main',
            name: 'Main Frames',
            frameIds: allFrames.map(f => f.id),
            visible: true,
            collapsed: false,
            color: '#3b82f6'
          }
        ],
        selectedIds: new Set(allFrames.map(f => f.id))
      });
      setCurrentFrame(0);
      setEditorState('ready');

      if (allFrames.length > FRAME_WARNING_THRESHOLD) {
        setShowFrameWarning(true);
      }
    } catch (error) {
      console.error('Extraction failed:', error);
      alert('Failed to load media. Please try different files.');
      setEditorState(loadedSources.length > 0 ? 'ready' : 'idle');
    }

    setProgress(null);
  }, [frameState, fps, loadedSources]);

  const handleRemoveSource = useCallback((sourceId: string) => {
    if (!frameState) return;

    // Get removed frame IDs
    const removedFrameIds = new Set(
      frameState.frames
        .filter(f => f.sourceId === sourceId)
        .map(f => f.id)
    );

    // Frame bitmaps are kept alive in the 'past' stack for Undo, closed automatically when evicted!

    const remainingFrames = frameState.frames.filter(f => f.sourceId !== sourceId);

    // Remove frameIds from folders, and filter out any empty folders
    const newFolders = frameState.folders
      .map(folder => ({
        ...folder,
        frameIds: folder.frameIds.filter(id => !removedFrameIds.has(id))
      }))
      .filter(folder => folder.frameIds.length > 0);

    const newSources = loadedSources.filter(s => s.id !== sourceId);
    setLoadedSources(newSources);

    if (remainingFrames.length > 0) {
      if (newFolders.length === 0) {
        newFolders.push({
          id: 'folder-main',
          name: 'Main Frames',
          frameIds: remainingFrames.map(f => f.id),
          visible: true,
          collapsed: false,
          color: '#3b82f6'
        });
      }

      const remainingFrameIds = new Set(remainingFrames.map(f => f.id));
      setFrameState({
        frames: remainingFrames,
        folders: newFolders,
        selectedIds: new Set(
          Array.from(frameState.selectedIds).filter(id => remainingFrameIds.has(id))
        ),
      });
    } else {
      resetHistory(null);
      setEditorState('idle');
    }

    // Update warning
    setShowFrameWarning(remainingFrames.length > FRAME_WARNING_THRESHOLD);
  }, [frameState, loadedSources]);

  const handleSelectionChange = useCallback((selectedIds: Set<string>) => {
    if (!frameState) return;
    setFrameState({ ...frameState, selectedIds });
  }, [frameState]);

  const handleOrderChange = useCallback((newOrder: string[]) => {
    if (!frameState) return;
    const newFolders = frameState.folders.map(folder => {
      const sortedFolderFrames = [...newOrder].filter(id => folder.frameIds.includes(id));
      return { ...folder, frameIds: sortedFolderFrames };
    });
    setFrameState({ ...frameState, folders: newFolders });
  }, [frameState]);

  const handleDeleteSelected = useCallback(() => {
    if (!frameState) return;
    
    const nextState = deleteSelectedFrames(frameState);
    setFrameState(nextState);
    
    if (currentFrame >= nextState.frames.length) {
      setCurrentFrame(Math.max(0, nextState.frames.length - 1));
    }
  }, [frameState, currentFrame]);

  const handleFramesProcessed = useCallback((processedFrames: Map<string, ImageBitmap>) => {
    if (!frameState) return;
    
    const updatedFrames = frameState.frames.map(frame => {
      const processed = processedFrames.get(frame.id);
      if (processed) {
        // Save original if not already saved
        if (!originalFramesRef.current.has(frame.id)) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = frame.bitmap.width;
            canvas.height = frame.bitmap.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(frame.bitmap, 0, 0);
            createImageBitmap(canvas).then(clone => {
              originalFramesRef.current.set(frame.id, clone);
            });
          } catch (err) {
            console.warn(`Failed to backup frame ${frame.id} on-the-fly:`, err);
          }
        }
          // Old frame bitmap is kept alive in the 'past' stack for Undo, closed automatically when evicted!
          return { ...frame, bitmap: processed };
      }
      return frame;
    });
    
    setFrameState({
      ...frameState,
      frames: updatedFrames
    });
  }, [frameState]);

  const handleRevertSelected = useCallback(async () => {
    if (!frameState) return;
    
    const framesToRevert = frameState.selectedIds.size > 0
      ? frameState.frames.filter(f => frameState.selectedIds.has(f.id))
      : frameState.frames;
    
    const revertedFrames = new Map<string, ImageBitmap>();
    
    for (const frame of framesToRevert) {
      const original = originalFramesRef.current.get(frame.id);
      if (original) {
        const canvas = document.createElement('canvas');
        canvas.width = original.width;
        canvas.height = original.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(original, 0, 0);
        const restored = await createImageBitmap(canvas);
        revertedFrames.set(frame.id, restored);
      }
    }
    
    if (revertedFrames.size === 0) {
      alert('No original frames to revert to.');
      return;
    }
    
    const updatedFrames = frameState.frames.map(frame => {
      const reverted = revertedFrames.get(frame.id);
      if (reverted) {
        // Old frame bitmap is kept alive in the 'past' stack for Undo, closed automatically when evicted!
        return { ...frame, bitmap: reverted };
      }
      return frame;
    });
    
    setFrameState({
      ...frameState,
      frames: updatedFrames
    });
  }, [frameState]);

  const canRevert = !!(frameState && originalFramesRef.current.size > 0);
  const orderedFrames = frameState ? getOrderedFrames(frameState) : [];
  const selectedFrames = frameState ? getSelectedFrames(frameState) : [];

  // Panel visibility handlers
  const togglePanel = useCallback((panelId: string) => {
    const newVisible = new Set(visiblePanels);
    if (newVisible.has(panelId)) {
      newVisible.delete(panelId);
      dockLayoutRef.current?.removeTab(panelId);
    } else {
      newVisible.add(panelId);
      dockLayoutRef.current?.addTab(panelId);
    }
    setVisiblePanels(newVisible);
  }, [visiblePanels]);

  const resetLayout = useCallback(() => {
    dockLayoutRef.current?.resetLayout();
    setVisiblePanels(new Set([
      'video-loader', 'frame-grid', 'preview', 'timeline',
      'media-loader', 'bg-removal', 'outline', 'watermark', 'export'
    ]));
  }, []);

  // 6. Keyboard Shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          undo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          triggerSave();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        redo(); // Support Ctrl+Shift+Z for redo
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, triggerSave]);

  // 7. Warn before tab close with unsaved modifications
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Context value for all dock panels
  const editorContextValue = useMemo(() => ({
    editorState,
    extractionProgress: progress,
    frameState,
    orderedFrames,
    selectedFrames,
    processingFrameIds,
    folders,
    createFolder: handleCreateFolder,
    deleteFolder: handleDeleteFolder,
    renameFolder: handleRenameFolder,
    toggleFolderVisibility: handleToggleFolderVisibility,
    toggleFolderCollapse: handleToggleFolderCollapse,
    moveFrameToFolder: handleMoveFrameToFolder,
    moveFramesToFolder: handleMoveFramesToFolder,
    copyFramesToFolder: handleCopyFramesToFolder,
    reorderFolders: handleReorderFolders,
    reorderFramesInFolder: handleReorderFramesInFolder,
    fps,
    currentFrame,
    loopMode,
    previewBgMode,
    previewBgColor,
    previewOutline,
    setFps,
    setCurrentFrame,
    setLoopMode,
    setPreviewBgMode,
    setPreviewBgColor,
    setPreviewOutline,
    setProcessingFrameIds,
    handleFramesProcessed,
    handleSelectionChange,
    handleOrderChange,
    handleDeleteSelected,
    handleRevertSelected,
    canRevert,
    handleMediaLoad,
    handleRemoveSource,
    loadedSources,
    visiblePanels,
    togglePanel,
    resetLayout,
    
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    projectId,
    projectName,
    setProjectName,
    triggerSave,
    isSaving,
    autosaveNotification,

    // Inject Active Real-time Pixelator options
    activePixelatorOptions: {
      enabled: pixelatorEnabled,
      pixelSize,
      palette: pixelatorPalette,
      ditherType: pixelatorDitherType,
      ditherAmount: pixelatorDitherAmount,
      pixelShape: pixelatorPixelShape,
      outlineEnabled: pixelatorOutlineEnabled,
      outlineColor: pixelatorOutlineColor,
      outlineThickness: pixelatorOutlineThickness,
      contrast: pixelatorContrast,
      saturation: pixelatorSaturation,
      brightness: pixelatorBrightness,
      setEnabled: setPixelatorEnabled,
      setPixelSize,
      setPalette: setPixelatorPalette,
      setDitherType: setPixelatorDitherType,
      setDitherAmount: setPixelatorDitherAmount,
      setPixelShape: setPixelatorPixelShape,
      setOutlineEnabled: setPixelatorOutlineEnabled,
      setOutlineColor: setPixelatorOutlineColor,
      setOutlineThickness: setPixelatorOutlineThickness,
      setContrast: setPixelatorContrast,
      setSaturation: setPixelatorSaturation,
      setBrightness: setPixelatorBrightness
    }
  }), [
    editorState,
    progress,
    frameState,
    orderedFrames,
    selectedFrames,
    processingFrameIds,
    folders,
    handleCreateFolder,
    handleDeleteFolder,
    handleRenameFolder,
    handleToggleFolderVisibility,
    handleToggleFolderCollapse,
    handleMoveFrameToFolder,
    handleMoveFramesToFolder,
    handleCopyFramesToFolder,
    handleReorderFolders,
    handleReorderFramesInFolder,
    fps,
    currentFrame,
    loopMode,
    previewBgMode,
    previewBgColor,
    previewOutline,
    handleFramesProcessed,
    handleSelectionChange,
    handleOrderChange,
    handleDeleteSelected,
    handleRevertSelected,
    canRevert,
    handleMediaLoad,
    handleRemoveSource,
    loadedSources,
    visiblePanels,
    togglePanel,
    resetLayout,
    pixelatorEnabled,
    pixelSize,
    pixelatorPalette,
    pixelatorDitherType,
    pixelatorDitherAmount,
    pixelatorPixelShape,
    pixelatorOutlineEnabled,
    pixelatorOutlineColor,
    pixelatorOutlineThickness,
    pixelatorContrast,
    pixelatorSaturation,
    pixelatorBrightness,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    projectId,
    projectName,
    triggerSave,
    isSaving,
    autosaveNotification
  ]);

  return (
    <EditorProvider value={editorContextValue}>
      <div className={styles.dockContainer}>
        {/* Header with Menu Bar */}
        <header className={styles.header}>
          <EditorMenuBar />
          <div className={styles.headerInfo}>
            {decoderType && (
              <span className={styles.decoderBadge}>
                {decoderType === 'webcodecs' ? '⚡ WebCodecs' : '🎬 Canvas Fallback'}
              </span>
            )}
            {editorState === 'ready' && (
              <span className={styles.frameCount}>
                {selectedFrames.length} / {orderedFrames.length} frames selected
              </span>
            )}
          </div>
        </header>

        {showFrameWarning && orderedFrames.length > 0 && (
          <div className={styles.warning}>
            ⚠️ {orderedFrames.length} frames extracted. Consider selecting fewer frames for better performance.
            <button 
              onClick={() => setShowFrameWarning(false)} 
              className={styles.warningClose}
            >
              ×
            </button>
          </div>
        )}

        {/* Dock Layout */}
        <DockLayout ref={dockLayoutRef} onVisiblePanelsChange={setVisiblePanels} />
      </div>
    </EditorProvider>
  );
}
