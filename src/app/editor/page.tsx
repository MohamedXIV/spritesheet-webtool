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

type EditorState = 'idle' | 'extracting' | 'ready';

const FRAME_WARNING_THRESHOLD = 240;

export default function EditorPage() {
  const [editorState, setEditorState] = useState<EditorState>('idle');
  const [frameState, setFrameState] = useState<FrameState | null>(null);
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
      if (frameStateRef.current) {
        disposeFrames(frameStateRef.current);
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
      setFrameState({
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

    // Close bitmaps of removed frames
    frameState.frames
      .filter(f => f.sourceId === sourceId)
      .forEach(f => f.bitmap.close());

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
      setFrameState(null);
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
          const canvas = document.createElement('canvas');
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(frame.bitmap, 0, 0);
          createImageBitmap(canvas).then(clone => {
            originalFramesRef.current.set(frame.id, clone);
          });
        }
        frame.bitmap.close();
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
        frame.bitmap.close();
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
  ]);

  return (
    <div className={styles.dockContainer}>
      {/* Header with Menu Bar */}
      <header className={styles.header}>
        <EditorMenuBar
          visiblePanels={visiblePanels}
          onTogglePanel={togglePanel}
          onResetLayout={resetLayout}
          onOpenVideo={() => {}}
          onExport={() => {}}
        />
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
      <EditorProvider value={editorContextValue}>
        <DockLayout ref={dockLayoutRef} onVisiblePanelsChange={setVisiblePanels} />
      </EditorProvider>
    </div>
  );
}
