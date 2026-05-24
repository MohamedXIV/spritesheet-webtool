'use client';

/**
 * Standalone Sprite Pixelator Workspace Page - Premium VS Code-Style Dockable Panels
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FrameData, ExtractionProgress, SourceInfo, SOURCE_COLORS } from '@/types';
import { FrameState } from '@/lib/frameStore';
import { sliceSpritesheetByGrid, sliceSpritesheetByDimensions } from '@/lib/spritesheetSlicer';
import { PixelatorDockLayout, PixelatorDockLayoutRef } from '@/components/PixelatorDockLayout';
import { PixelatorMenuBar } from '@/components/PixelatorMenuBar';
import { EditorProvider } from '@/contexts/EditorContext';
import { LoopMode } from '@/components/Timeline';
import { BackgroundMode } from '@/components/PreviewPlayer';
import styles from './page.module.css';
import { useFrameHistory } from '@/hooks/useFrameHistory';

export default function StandalonePixelatorPage() {
  // 1. Slicing state variables
  const [file, setFile] = useState<File | null>(null);
  const [originalImgSrc, setOriginalImgSrc] = useState<string | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const [sliceType, setSliceType] = useState<'grid' | 'dimensions'>('grid');
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [cellWidth, setCellWidth] = useState(64);
  const [cellHeight, setCellHeight] = useState(64);
  const [isSlicing, setIsSlicing] = useState(false);

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
  const [processingFrameIds, setProcessingFrameIds] = useState<Set<string>>(new Set());

  // 3. Playback State
  const [fps, setFps] = useState(12);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [loopMode, setLoopMode] = useState<LoopMode>('normal');

  // 4. Preview Player Background and Outline settings
  const [previewBgMode, setPreviewBgMode] = useState<BackgroundMode>('none');
  const [previewBgColor, setPreviewBgColor] = useState('#1a1a2e');
  const [previewOutline, setPreviewOutline] = useState<any>({ enabled: false });

  // 4.5 Active Real-Time Pixelator State Hooks
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

  // 5. Panel Visibility States
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set([
    'spritesheet-slicer', 'frame-grid', 'preview', 'timeline', 'pixelate', 'bg-removal', 'watermark', 'export'
  ]));
  const dockLayoutRef = useRef<PixelatorDockLayoutRef>(null);

  // Original Bitmap storage for Revert actions
  const originalFramesRef = useRef<Map<string, ImageBitmap>>(new Map());

  // Frame selectors
  const orderedFrames = useMemo(() => {
    return frameState ? frameState.frames : [];
  }, [frameState]);

  const selectedFrames = useMemo(() => {
    if (!frameState) return [];
    return frameState.frames.filter(f => frameState.selectedIds.has(f.id));
  }, [frameState]);

  const folders = useMemo(() => {
    return frameState ? frameState.folders : [];
  }, [frameState]);

  const canRevert = useMemo(() => {
    return !!(frameState && originalFramesRef.current.size > 0);
  }, [frameState]);

  // Clean and release bitmaps
  const disposeAllFrames = useCallback(() => {
    // Note: useFrameHistory handles closing active frameState bitmaps automatically!
    originalFramesRef.current.forEach(b => {
      try { b.close(); } catch {}
    });
    originalFramesRef.current.clear();
  }, []);

  // Clean on unmount
  useEffect(() => {
    return () => {
      disposeAllFrames();
      if (originalImgSrc) {
        URL.revokeObjectURL(originalImgSrc);
      }
    };
  }, []);

  const loadNewFile = (newFile: File) => {
    if (originalImgSrc) {
      URL.revokeObjectURL(originalImgSrc);
    }
    disposeAllFrames();
    resetHistory(null);

    const src = URL.createObjectURL(newFile);
    setOriginalImgSrc(src);
    setFile(newFile);

    const img = new Image();
    img.onload = () => {
      setImgDimensions({ width: img.width, height: img.height });
      if (img.width === img.height) {
        setCols(4);
        setRows(4);
        setCellWidth(img.width / 4);
        setCellHeight(img.height / 4);
      } else {
        setCellWidth(64);
        setCellHeight(64);
      }
    };
    img.src = src;
  };

  const handleResetImage = () => {
    disposeAllFrames();
    resetHistory(null);
    setFile(null);
    if (originalImgSrc) {
      URL.revokeObjectURL(originalImgSrc);
      setOriginalImgSrc(null);
    }
    setImgDimensions(null);
  };

  const handleSliceSpritesheet = async () => {
    if (!file) return;
    setIsSlicing(true);

    const sourceId = `slice-${Date.now()}`;
    const sourceColor = '#8b5cf6';

    try {
      let result;
      if (sliceType === 'grid') {
        result = await sliceSpritesheetByGrid(file, cols, rows, sourceId, sourceColor);
      } else {
        result = await sliceSpritesheetByDimensions(file, cellWidth, cellHeight, sourceId, sourceColor);
      }

      // Pre-populate originalFramesRef with clones of all sliced frame bitmaps to ensure safe revert states
      originalFramesRef.current.clear();
      for (const frame of result.frames) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
          const ctx2d = canvas.getContext('2d')!;
          ctx2d.drawImage(frame.bitmap, 0, 0);
          const clone = await createImageBitmap(canvas);
          originalFramesRef.current.set(frame.id, clone);
        } catch (err) {
          console.warn(`Failed to pre-populate original frame backup for frame ${frame.id}:`, err);
        }
      }

      resetHistory({
        frames: result.frames,
        folders: [
          {
            id: 'folder-main',
            name: 'Sprites',
            frameIds: result.frames.map(f => f.id),
            visible: true,
            collapsed: false,
            color: sourceColor
          }
        ],
        selectedIds: new Set(result.frames.map(f => f.id))
      });
      setCurrentFrame(0);
    } catch (e) {
      console.error(e);
      alert('Failed to slice spritesheet image.');
    } finally {
      setIsSlicing(false);
    }
  };

  const handleSelectionChange = useCallback((selectedIds: Set<string>) => {
    setFrameState(prev => {
      if (!prev) return null;
      return { ...prev, selectedIds };
    });
  }, []);

  const handleOrderChange = useCallback((newOrder: string[]) => {
    setFrameState(prev => {
      if (!prev) return null;
      const orderMap = new Map(newOrder.map((id, index) => [id, index]));
      const sorted = [...prev.frames].sort((a, b) => {
        const idxA = orderMap.get(a.id) ?? 9999;
        const idxB = orderMap.get(b.id) ?? 9999;
        return idxA - idxB;
      });

      const updatedFolders = prev.folders.map(folder => ({
        ...folder,
        frameIds: sorted.map(f => f.id)
      }));

      return {
        ...prev,
        frames: sorted,
        folders: updatedFolders
      };
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    setFrameState(prev => {
      if (!prev) return null;
      const remaining = prev.frames.filter(f => !prev.selectedIds.has(f.id));
      // Frame bitmaps are kept alive in the 'past' stack for Undo, closed automatically when evicted!
      const remainingIds = remaining.map(f => f.id);

      const updatedFolders = prev.folders.map(folder => ({
        ...folder,
        frameIds: folder.frameIds.filter(id => remainingIds.includes(id))
      })).filter(folder => folder.frameIds.length > 0);

      return {
        frames: remaining,
        folders: updatedFolders.length > 0 ? updatedFolders : [
          {
            id: 'folder-main',
            name: 'Sprites',
            frameIds: remainingIds,
            visible: true,
            collapsed: false,
            color: '#8b5cf6'
          }
        ],
        selectedIds: new Set()
      };
    });
    setCurrentFrame(0);
  }, []);

  const handleFramesProcessed = useCallback((processedFrames: Map<string, ImageBitmap>) => {
    setFrameState(prev => {
      if (!prev) return null;
      const updatedFrames = prev.frames.map(frame => {
        const processed = processedFrames.get(frame.id);
        if (processed) {
          if (!originalFramesRef.current.has(frame.id)) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = frame.bitmap.width;
              canvas.height = frame.bitmap.height;
              const ctx2d = canvas.getContext('2d')!;
              ctx2d.drawImage(frame.bitmap, 0, 0);
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
      return { ...prev, frames: updatedFrames };
    });
  }, []);

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
        const ctx2d = canvas.getContext('2d')!;
        ctx2d.drawImage(original, 0, 0);
        const restored = await createImageBitmap(canvas);
        revertedFrames.set(frame.id, restored);
      }
    }

    if (revertedFrames.size === 0) {
      alert('No original frames to revert.');
      return;
    }

    setFrameState(prev => {
      if (!prev) return null;
      const updatedFrames = prev.frames.map(frame => {
        const reverted = revertedFrames.get(frame.id);
        if (reverted) {
          // Old frame bitmap is kept alive in the 'past' stack for Undo, closed automatically when evicted!
          return { ...frame, bitmap: reverted };
        }
        return frame;
      });
      return { ...prev, frames: updatedFrames };
    });
  }, [frameState]);

  // Panel visibility toggle callbacks
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
      'spritesheet-slicer', 'frame-grid', 'preview', 'timeline', 'pixelate', 'bg-removal', 'watermark', 'export'
    ]));
  }, []);

  // 6. Keyboard Shortcuts for Undo/Redo (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          undo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        redo(); // Support Ctrl+Shift+Z for redo
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

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

  // Map state to unified Context value
  const editorContextValue = useMemo(() => ({
    editorState: (frameState ? 'ready' : 'idle') as any,
    extractionProgress: null,
    frameState,
    orderedFrames,
    selectedFrames,
    processingFrameIds,
    folders,
    createFolder: () => {},
    deleteFolder: () => {},
    renameFolder: () => {},
    toggleFolderVisibility: () => {},
    toggleFolderCollapse: () => {},
    moveFrameToFolder: () => {},
    moveFramesToFolder: () => {},
    copyFramesToFolder: async () => {},
    reorderFolders: () => {},
    reorderFramesInFolder: () => {},
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
    handleMediaLoad: () => {},
    handleRemoveSource: () => {},
    loadedSources: [] as SourceInfo[],
    visiblePanels,
    togglePanel,
    resetLayout,
    
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    
    // Inject Custom Pixelator Slicing Namespace hook
    pixelatorSlicer: {
      file,
      originalImgSrc,
      imgDimensions,
      sliceType,
      cols,
      rows,
      cellWidth,
      cellHeight,
      isSlicing,
      setSliceType,
      setCols,
      setRows,
      setCellWidth,
      setCellHeight,
      handleSliceSpritesheet,
      loadNewFile,
      handleResetImage
    },

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
    frameState,
    orderedFrames,
    selectedFrames,
    processingFrameIds,
    folders,
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
    visiblePanels,
    togglePanel,
    resetLayout,
    file,
    originalImgSrc,
    imgDimensions,
    sliceType,
    cols,
    rows,
    cellWidth,
    cellHeight,
    isSlicing,
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
    markSaved
  ]);

  return (
    <EditorProvider value={editorContextValue}>
      <div className={styles.dockContainer}>
        {/* 1. Glassmorphic Menubar */}
        <header className={styles.header}>
          <PixelatorMenuBar />
          <div className={styles.headerInfo}>
            {frameState && (
              <span className={styles.frameCount}>
                {selectedFrames.length} / {orderedFrames.length} frames selected
              </span>
            )}
          </div>
        </header>

        {/* 2. Flexlayout Draggable Panel Layouts */}
        <PixelatorDockLayout
          ref={dockLayoutRef}
          onVisiblePanelsChange={setVisiblePanels}
        />
      </div>
    </EditorProvider>
  );
}
