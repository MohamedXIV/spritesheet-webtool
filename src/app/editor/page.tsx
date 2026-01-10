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
import { extractFrames } from '@/lib/videoDecoder';
import { 
  FrameState, 
  createFrameState, 
  getOrderedFrames, 
  getSelectedFrames,
  disposeFrames 
} from '@/lib/frameStore';
import { FrameData, ExtractionProgress } from '@/types';
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
    'video-loader', 'frame-grid', 'preview', 'timeline',
    'bg-removal', 'outline', 'watermark', 'export'
  ]));
  const dockLayoutRef = useRef<DockLayoutRef>(null);
  
  // Keep a ref to frameState for cleanup on unmount only
  const frameStateRef = useRef<FrameState | null>(null);
  frameStateRef.current = frameState;
  
  // Store original bitmaps for revert functionality
  const originalFramesRef = useRef<Map<string, ImageBitmap>>(new Map());

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (frameStateRef.current) {
        disposeFrames(frameStateRef.current);
      }
    };
  }, []);

  const handleVideoLoad = useCallback(async (file: File) => {
    // Clean up previous frames
    if (frameState) {
      disposeFrames(frameState);
    }

    setEditorState('extracting');
    setProgress({ current: 0, total: 0, percentage: 0 });
    setShowFrameWarning(false);

    try {
      const result = await extractFrames(file, fps, (p) => {
        setProgress(p);
      });

      setDecoderType(result.decoderType);
      setFrameState(createFrameState(result.frames));
      setCurrentFrame(0);
      setEditorState('ready');
      
      if (result.frames.length > FRAME_WARNING_THRESHOLD) {
        setShowFrameWarning(true);
      }
    } catch (error) {
      console.error('Extraction failed:', error);
      alert('Failed to extract frames from video. Please try a different file.');
      setEditorState('idle');
    }

    setProgress(null);
  }, [frameState, fps]);

  const handleSelectionChange = useCallback((selectedIds: Set<string>) => {
    if (!frameState) return;
    setFrameState({ ...frameState, selectedIds });
  }, [frameState]);

  const handleOrderChange = useCallback((newOrder: string[]) => {
    if (!frameState) return;
    setFrameState({ ...frameState, orderedIds: newOrder });
  }, [frameState]);

  const handleDeleteSelected = useCallback(() => {
    if (!frameState) return;
    
    frameState.frames
      .filter(f => frameState.selectedIds.has(f.id))
      .forEach(f => f.bitmap.close());
    
    const remainingFrames = frameState.frames.filter(f => !frameState.selectedIds.has(f.id));
    const remainingIds = frameState.orderedIds.filter(id => !frameState.selectedIds.has(id));
    
    setFrameState({
      frames: remainingFrames,
      selectedIds: new Set(),
      orderedIds: remainingIds
    });
    
    if (currentFrame >= remainingFrames.length) {
      setCurrentFrame(Math.max(0, remainingFrames.length - 1));
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
      'bg-removal', 'outline', 'watermark', 'export'
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
    handleVideoLoad,
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
    handleVideoLoad,
    visiblePanels,
    togglePanel,
    resetLayout,
  ]);

  return (
    <div className={styles.dockContainer}>
      {/* Header with Menu Bar */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoIcon}>◆</span>
            Spritesheet Creator
          </Link>
          <EditorMenuBar
            visiblePanels={visiblePanels}
            onTogglePanel={togglePanel}
            onResetLayout={resetLayout}
            onOpenVideo={() => {}}
            onExport={() => {}}
          />
        </div>
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
