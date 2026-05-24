'use client';

/**
 * Timeline - Displays folder-grouped sequential timeline with hover thumbnails,
 * ticks, playhead rendering, and playback controls.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useOptionalEditorContext } from '@/contexts/EditorContext';
import { FrameData, Folder } from '@/types';
import styles from './Timeline.module.css';

export type LoopMode = 'normal' | 'pingpong' | 'reverse';

interface TimelineProps {
  frameCount: number;
  currentFrame: number;
  fps: number;
  loopMode: LoopMode;
  onFpsChange: (fps: number) => void;
  onFrameSelect: (index: number) => void;
  onLoopModeChange: (mode: LoopMode) => void;
  frames?: FrameData[];
}

// Tooltip Thumbnail Component
function TooltipThumbnail({ frame }: { frame: FrameData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame.bitmap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      if (frame.bitmap.width === 0 || frame.bitmap.height === 0) return;
      const maxSize = 80;
      const scale = Math.min(maxSize / frame.bitmap.width, maxSize / frame.bitmap.height);
      canvas.width = frame.bitmap.width * scale;
      canvas.height = frame.bitmap.height * scale;
      ctx.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
    } catch {
      // closed
    }
  }, [frame]);

  return <canvas ref={canvasRef} className={styles.tooltipCanvas} />;
}

export function Timeline({
  frameCount,
  currentFrame,
  fps,
  loopMode,
  onFpsChange,
  onFrameSelect,
  onLoopModeChange,
  frames = [],
}: TimelineProps) {
  const ctx = useOptionalEditorContext();
  const folders = ctx?.folders || [];
  const orderedFrames = ctx?.orderedFrames || frames;
  const frameState = ctx?.frameState || null;

  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Hover Tooltip States
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoveredFrame, setHoveredFrame] = useState<FrameData | null>(null);
  const [hoveredFolder, setHoveredFolder] = useState<Folder | null>(null);

  const totalFrames = useMemo(() => {
    if (!ctx) return orderedFrames.length;
    return folders.reduce((sum, f) => sum + f.frameIds.length, 0);
  }, [ctx, folders, orderedFrames.length]);

  // Flat array of ALL frames in their sequence, visible or hidden
  const allFoldersOrderedFrames = useMemo(() => {
    if (!ctx) return orderedFrames;
    if (!frameState) return [];
    const allFrameIds: string[] = [];
    folders.forEach(folder => {
      allFrameIds.push(...folder.frameIds);
    });
    return allFrameIds
      .map(id => frameState.frames.find(f => f.id === id))
      .filter((f): f is FrameData => f !== undefined);
  }, [ctx, frameState, folders, orderedFrames]);

  // Current active frame ID and its global index
  const activeFrame = orderedFrames[currentFrame];
  const activeGlobalIndex = useMemo(() => {
    if (!ctx) return currentFrame;
    if (!activeFrame) return -1;
    return allFoldersOrderedFrames.findIndex(f => f.id === activeFrame.id);
  }, [ctx, currentFrame, activeFrame, allFoldersOrderedFrames]);

  // Playhead left percentage
  const playheadPercentage = useMemo(() => {
    if (allFoldersOrderedFrames.length === 0 || activeGlobalIndex === -1) return 0;
    // Align playhead exactly in the center of the frame tick segment
    return ((activeGlobalIndex + 0.5) / allFoldersOrderedFrames.length) * 100;
  }, [allFoldersOrderedFrames, activeGlobalIndex]);

  // Scrub execution
  const performScrub = useCallback((clientX: number) => {
    if (!trackRef.current || orderedFrames.length === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));

    if (!ctx) {
      const targetIdx = Math.min(
        orderedFrames.length - 1,
        Math.max(0, Math.floor(percentage * orderedFrames.length))
      );
      onFrameSelect(targetIdx);
      return;
    }

    if (allFoldersOrderedFrames.length === 0) return;

    const targetGlobalIdx = Math.min(
      allFoldersOrderedFrames.length - 1,
      Math.max(0, Math.floor(percentage * allFoldersOrderedFrames.length))
    );
    const targetFrame = allFoldersOrderedFrames[targetGlobalIdx];

    // Find this frame's index in active orderedFrames
    let activeIdx = orderedFrames.findIndex(f => f.id === targetFrame.id);

    // If target frame is hidden, find closest active frame
    if (activeIdx === -1) {
      let minDistance = Infinity;
      let nearestActiveIndex = 0;
      orderedFrames.forEach((activeF, index) => {
        const globalIdx = allFoldersOrderedFrames.findIndex(f => f.id === activeF.id);
        if (globalIdx !== -1) {
          const dist = Math.abs(globalIdx - targetGlobalIdx);
          if (dist < minDistance) {
            minDistance = dist;
            nearestActiveIndex = index;
          }
        }
      });
      activeIdx = nearestActiveIndex;
    }

    onFrameSelect(activeIdx);
  }, [ctx, allFoldersOrderedFrames, orderedFrames, onFrameSelect]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    performScrub(e.clientX);
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      performScrub(e.clientX);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, performScrub]);

  // Hover Tooltip Position & Details
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || orderedFrames.length === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const p = Math.max(0, Math.min(1, clickX / rect.width));
    setHoverPercent(p * 100);

    if (!ctx) {
      const idx = Math.min(
        orderedFrames.length - 1,
        Math.max(0, Math.floor(p * orderedFrames.length))
      );
      setHoveredFrame(orderedFrames[idx]);
      setHoveredFolder(null);
      return;
    }

    if (allFoldersOrderedFrames.length === 0) return;

    const idx = Math.min(
      allFoldersOrderedFrames.length - 1,
      Math.max(0, Math.floor(p * allFoldersOrderedFrames.length))
    );
    const frame = allFoldersOrderedFrames[idx];
    setHoveredFrame(frame);

    if (frame) {
      const folder = folders.find(fold => fold.frameIds.includes(frame.id));
      setHoveredFolder(folder || null);
    }
  };

  const handleMouseLeave = () => {
    setHoverPercent(null);
    setHoveredFrame(null);
    setHoveredFolder(null);
  };

  const handleFpsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      onFpsChange(Math.max(1, Math.min(60, value)));
    }
  };

  const handleFpsInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 1) {
      onFpsChange(1);
    } else if (value > 60) {
      onFpsChange(60);
    }
  };

  const activeFoldersCount = ctx ? folders.filter(f => f.visible).length : 0;
  const hiddenFoldersCount = ctx ? folders.length - activeFoldersCount : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Timeline</h3>
        
        {/* Folder Stats mini display */}
        {ctx && (
          <div className={styles.folderBadges}>
            <span className={styles.badge} title="Active Folders">
              📂 {activeFoldersCount} active
            </span>
            {hiddenFoldersCount > 0 && (
              <span className={`${styles.badge} ${styles.mutedBadge}`} title="Hidden Folders">
                👁️ {hiddenFoldersCount} muted
              </span>
            )}
          </div>
        )}

        <div className={styles.fpsControl}>
          <label htmlFor="fps-input" className={styles.fpsLabel}>
            FPS:
          </label>
          <input
            id="fps-input"
            type="number"
            min="1"
            max="60"
            value={fps}
            onChange={handleFpsInputChange}
            onBlur={handleFpsInputBlur}
            className={styles.fpsInput}
          />
          <input
            id="fps-slider"
            type="range"
            min="1"
            max="60"
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value))}
            className={styles.slider}
          />
        </div>
      </div>

      {/* Visual Composite Track Scrubber */}
      <div className={styles.scrubberContainer}>
        <div
          ref={trackRef}
          className={styles.track}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Render Colored Tracks for Folders (Editor Mode) */}
          {ctx && folders.map(folder => {
            const widthPercentage = totalFrames > 0
              ? (folder.frameIds.length / totalFrames) * 100
              : 0;

            if (widthPercentage === 0) return null;

            return (
              <div
                key={folder.id}
                className={`${styles.trackSegment} ${!folder.visible ? styles.segmentMuted : ''}`}
                style={{
                  width: `${widthPercentage}%`,
                  '--folder-theme-color': folder.color,
                } as React.CSSProperties}
              >
                {/* Ticks for each frame in folder */}
                <div className={styles.ticksWrapper}>
                  {folder.frameIds.map((fid) => {
                    const isTickActive = activeFrame && activeFrame.id === fid;
                    return (
                      <div
                        key={fid}
                        className={`${styles.tick} ${isTickActive ? styles.tickActive : ''}`}
                        style={{ '--tick-theme-color': folder.color } as React.CSSProperties}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Render Single Flat Track for Standalone Mode */}
          {!ctx && orderedFrames.length > 0 && (
            <div
              className={styles.trackSegment}
              style={{
                width: '100%',
                '--folder-theme-color': 'var(--primary-color, #8b5cf6)',
              } as React.CSSProperties}
            >
              {/* Ticks for each frame */}
              <div className={styles.ticksWrapper}>
                {orderedFrames.map((frame, index) => {
                  const isTickActive = currentFrame === index;
                  return (
                    <div
                      key={frame.id}
                      className={`${styles.tick} ${isTickActive ? styles.tickActive : ''}`}
                      style={{ '--tick-theme-color': 'var(--primary-color, #8b5cf6)' } as React.CSSProperties}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {totalFrames === 0 && (
            <div className={styles.emptyTrack}>
              Load media assets to populate timeline track
            </div>
          )}

          {/* Floating Hover Tooltip */}
          {hoverPercent !== null && hoveredFrame && (
            <div
              className={styles.tooltip}
              style={{ left: `${hoverPercent}%` }}
            >
              <TooltipThumbnail frame={hoveredFrame} />
              <div className={styles.tooltipMeta}>
                <div className={styles.tooltipFolder}>
                  {hoveredFolder && (
                    <span
                      className={styles.tooltipColorDot}
                      style={{ backgroundColor: hoveredFolder.color }}
                    />
                  )}
                  {ctx ? (hoveredFolder ? hoveredFolder.name : 'Unassigned') : 'Pixelator Sequence'}
                </div>
                <div className={styles.tooltipFrameIndex}>
                  Frame {hoveredFrame.index + 1}
                </div>
                <div className={styles.tooltipTimestamp}>
                  {(hoveredFrame.timestamp).toFixed(3)}s
                </div>
                {ctx && !hoveredFolder?.visible && (
                  <div className={styles.tooltipMutedBadge}>
                    Hidden (will be skipped)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Glowing Playhead indicator */}
          {allFoldersOrderedFrames.length > 0 && activeGlobalIndex !== -1 && (
            <div
              className={styles.playhead}
              style={{ left: `${playheadPercentage}%` }}
            >
              <div className={styles.playheadHandle} />
              <div className={styles.playheadLine} />
            </div>
          )}
        </div>

        {/* Frame index text indicator */}
        <div className={styles.frameInfo}>
          Frame {frameCount > 0 ? currentFrame + 1 : 0} of {frameCount} {ctx ? '(Visible)' : ''}
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.loopControl}>
          <label htmlFor="loop-mode" className={styles.loopLabel}>
            Loop Mode:
          </label>
          <select
            id="loop-mode"
            value={loopMode}
            onChange={(e) => onLoopModeChange(e.target.value as LoopMode)}
            className={styles.loopSelect}
          >
            <option value="normal">Normal</option>
            <option value="pingpong">Ping-Pong</option>
            <option value="reverse">Reverse</option>
          </select>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Duration</span>
            <span className={styles.statValue}>
              {frameCount > 0 ? (frameCount / fps).toFixed(2) : '0.00'}s
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total Frames</span>
            <span className={styles.statValue}>
              {ctx ? `${totalFrames} (${frameCount} playing)` : totalFrames}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
