'use client';

/**
 * Editor Page - Main spritesheet creation workspace
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { VideoLoader } from '@/components/VideoLoader';
import { FrameGrid } from '@/components/FrameGrid';
import { Timeline, LoopMode } from '@/components/Timeline';
import { PreviewPlayer } from '@/components/PreviewPlayer';
import { ExportPanel } from '@/components/ExportPanel';
import { ProgressBar } from '@/components/ProgressBar';
import { BackgroundRemovalPanel } from '@/components/BackgroundRemovalPanel';
import { WatermarkRemovalPanel } from '@/components/WatermarkRemovalPanel';
import { extractFrames } from '@/lib/videoDecoder';
import { 
  FrameState, 
  createFrameState, 
  getOrderedFrames, 
  getSelectedFrames,
  disposeFrames 
} from '@/lib/frameStore';
import { ExtractionProgress, FrameData } from '@/types';
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
  
  // Keep a ref to frameState for cleanup on unmount only
  const frameStateRef = useRef<FrameState | null>(null);
  frameStateRef.current = frameState;
  
  // Store original bitmaps for revert functionality
  const originalFramesRef = useRef<Map<string, ImageBitmap>>(new Map());

  // Cleanup on unmount only (empty dependency array)
  useEffect(() => {
    return () => {
      if (frameStateRef.current) {
        disposeFrames(frameStateRef.current);
      }
    };
  }, []);

  const handleVideoSelect = useCallback(async (file: File) => {
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
      
      // Show warning if too many frames
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

  const handleReorder = useCallback((newOrder: string[]) => {
    if (!frameState) return;
    setFrameState({ ...frameState, orderedIds: newOrder });
  }, [frameState]);

  const handleDeleteSelected = useCallback(() => {
    if (!frameState) return;
    
    // Close bitmaps of deleted frames
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
    
    // Adjust current frame if needed
    if (currentFrame >= remainingFrames.length) {
      setCurrentFrame(Math.max(0, remainingFrames.length - 1));
    }
  }, [frameState, currentFrame]);

  // Generate unique ID for duplicated frames
  let duplicateCounter = useRef(0);
  
  const handleDuplicateSelected = useCallback(async () => {
    if (!frameState) return;
    
    const selectedFrames = frameState.frames.filter(f => frameState.selectedIds.has(f.id));
    if (selectedFrames.length === 0) return;
    
    // Create duplicates with new IDs
    const duplicatedFrames: FrameData[] = [];
    const newOrderedIds = [...frameState.orderedIds];
    
    for (const frame of selectedFrames) {
      try {
        // Create a new bitmap by drawing the old one to a canvas
        const canvas = document.createElement('canvas');
        canvas.width = frame.bitmap.width;
        canvas.height = frame.bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(frame.bitmap, 0, 0);
        const newBitmap = await createImageBitmap(canvas);
        
        const newId = `dup-${Date.now()}-${duplicateCounter.current++}`;
        duplicatedFrames.push({
          ...frame,
          id: newId,
          bitmap: newBitmap
        });
        
        // Insert after original in order
        const originalIndex = newOrderedIds.indexOf(frame.id);
        if (originalIndex !== -1) {
          newOrderedIds.splice(originalIndex + 1, 0, newId);
        } else {
          newOrderedIds.push(newId);
        }
      } catch (error) {
        console.error('Failed to duplicate frame:', error);
      }
    }
    
    setFrameState({
      frames: [...frameState.frames, ...duplicatedFrames],
      selectedIds: new Set(duplicatedFrames.map(f => f.id)), // Select duplicates
      orderedIds: newOrderedIds
    });
  }, [frameState]);

  const handleFramesProcessed = useCallback((processedFrames: Map<string, ImageBitmap>) => {
    if (!frameState) return;
    
    // Store original bitmaps before processing (if not already stored)
    const updatedFrames = frameState.frames.map(frame => {
      const processed = processedFrames.get(frame.id);
      if (processed) {
        // Save original if not already saved
        if (!originalFramesRef.current.has(frame.id)) {
          // Clone the original bitmap before replacing
          const canvas = document.createElement('canvas');
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(frame.bitmap, 0, 0);
          createImageBitmap(canvas).then(clone => {
            originalFramesRef.current.set(frame.id, clone);
          });
        }
        frame.bitmap.close(); // Close old bitmap
        return { ...frame, bitmap: processed };
      }
      return frame;
    });
    
    setFrameState({
      ...frameState,
      frames: updatedFrames
    });
  }, [frameState]);

  // Revert selected frames to original
  const handleRevertFrames = useCallback(async () => {
    if (!frameState) return;
    
    const framesToRevert = frameState.selectedIds.size > 0
      ? frameState.frames.filter(f => frameState.selectedIds.has(f.id))
      : frameState.frames;
    
    const revertedFrames = new Map<string, ImageBitmap>();
    
    for (const frame of framesToRevert) {
      const original = originalFramesRef.current.get(frame.id);
      if (original) {
        // Clone the original to restore
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
    
    // Replace current bitmaps with originals
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

  // Check if any frames can be reverted
  const canRevert = !!(frameState && originalFramesRef.current.size > 0);

  const orderedFrames = frameState ? getOrderedFrames(frameState) : [];
  const selectedFrames = frameState ? getSelectedFrames(frameState) : [];

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>◆</span>
          Spritesheet Creator
        </Link>
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

      {/* Main Content */}
      <main className={styles.main}>
        {/* Left Panel - Video & Frames */}
        <div className={styles.leftPanel}>
          <div className={styles.panelSection}>
            <h2 className={styles.sectionTitle}>Load Video</h2>
            <VideoLoader 
              onVideoSelect={handleVideoSelect} 
              disabled={editorState === 'extracting'}
            />
          </div>

          {editorState === 'extracting' && progress && (
            <div className={styles.panelSection}>
              <ProgressBar 
                progress={progress.percentage} 
                message={`Extracting frame ${progress.current} of ${progress.total}...`}
              />
            </div>
          )}

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

          {editorState === 'ready' && frameState && (
            <div className={styles.panelSection + ' ' + styles.frameSection}>
              <h2 className={styles.sectionTitle}>Frames</h2>
              <FrameGrid
                frames={orderedFrames}
                selectedIds={frameState.selectedIds}
                onSelectionChange={handleSelectionChange}
                onReorder={handleReorder}
                onDeleteSelected={handleDeleteSelected}
                onDuplicateSelected={handleDuplicateSelected}
                onRevertSelected={handleRevertFrames}
                canRevert={canRevert}
              />
            </div>
          )}
        </div>

        {/* Center Panel - Preview */}
        <div className={styles.centerPanel}>
          <h2 className={styles.sectionTitle}>Preview</h2>
          <PreviewPlayer
            frames={selectedFrames}
            fps={fps}
            currentFrame={currentFrame}
            onFrameChange={setCurrentFrame}
            loopMode={loopMode}
          />
        </div>

        {/* Right Panel - Timeline & Export */}
        <div className={styles.rightPanel}>
          <div className={styles.panelSection}>
            <Timeline
              frameCount={selectedFrames.length}
              currentFrame={currentFrame}
              fps={fps}
              loopMode={loopMode}
              onFpsChange={setFps}
              onFrameSelect={setCurrentFrame}
              onLoopModeChange={setLoopMode}
            />
          </div>

          <div className={styles.panelSection}>
            <ExportPanel 
              frames={selectedFrames} 
              fps={fps}
              loopMode={loopMode}
            />
          </div>

          {editorState === 'ready' && frameState && (
            <>
              <div className={styles.panelSection}>
                <BackgroundRemovalPanel
                  frames={orderedFrames}
                  selectedIds={frameState.selectedIds}
                  onFramesProcessed={handleFramesProcessed}
                />
              </div>

              <div className={styles.panelSection}>
                <WatermarkRemovalPanel
                  frames={orderedFrames}
                  selectedIds={frameState.selectedIds}
                  onFramesProcessed={handleFramesProcessed}
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
