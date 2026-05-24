'use client';

/**
 * PreviewPlayer - Canvas-based animation preview with loop modes,
 * outline preview, background options, GPU-accelerated frame caching,
 * and smart auto-sleep power-saving modes.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FrameData } from '@/types';
import { LoopMode } from './Timeline';
import { addOutline, OutlineOptions } from '@/lib/outlineGenerator';
import { pixelateImage } from '@/lib/pixelator';
import styles from './PreviewPlayer.module.css';

export type BackgroundMode = 'none' | 'checkerboard' | 'color';

interface PreviewPlayerProps {
  frames: FrameData[];
  fps: number;
  currentFrame: number;
  onFrameChange: (index: number) => void;
  loopMode: LoopMode;
  outlineOptions?: Partial<OutlineOptions>;
  backgroundMode?: BackgroundMode;
  backgroundColor?: string;
  onBackgroundModeChange?: (mode: BackgroundMode) => void;
  onBackgroundColorChange?: (color: string) => void;
  pixelatorOptions?: any;
}

export function PreviewPlayer({
  frames,
  fps,
  currentFrame,
  onFrameChange,
  loopMode,
  outlineOptions,
  backgroundMode = 'none',
  backgroundColor = '#1a1a2e',
  onBackgroundModeChange,
  onBackgroundColorChange,
  pixelatorOptions,
}: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const directionRef = useRef<1 | -1>(1);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // --- Display & Performance Performance Options ---
  const [livePreviewEnabled, setLivePreviewEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pixelator-live-preview');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  const [autoSleepEnabled, setAutoSleepEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pixelator-live-preview-autosleep');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  const [isAsleep, setIsAsleep] = useState<boolean>(false);
  const lastTweakTimeRef = useRef<number>(Date.now());

  // High performance cache to store pre-rendered ImageBitmaps
  const processedCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const currentOptionsHashRef = useRef<string>('');

  const clearProcessedCache = useCallback(() => {
    processedCacheRef.current.forEach(bitmap => {
      try { bitmap.close(); } catch {}
    });
    processedCacheRef.current.clear();
  }, []);

  // Compute a distinct hash to check when settings change
  const getOptionsHash = (outlineOpts: any, pixelatorOpts: any) => {
    return `${JSON.stringify(outlineOpts || {})}|${JSON.stringify(pixelatorOpts || {})}`;
  };

  // Watch for adjustments to immediately wake and invalidate cache
  useEffect(() => {
    const hash = getOptionsHash(outlineOptions, pixelatorOptions);
    if (currentOptionsHashRef.current !== hash) {
      clearProcessedCache();
      currentOptionsHashRef.current = hash;
    }
    
    lastTweakTimeRef.current = Date.now();
    setIsAsleep(false);
  }, [outlineOptions, pixelatorOptions, clearProcessedCache]);

  // Handle auto-sleep timer when user is idle
  useEffect(() => {
    if (!autoSleepEnabled) {
      setIsAsleep(false);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastTweakTimeRef.current;
      if (elapsed > 4000) { // 4 seconds idle threshold
        setIsAsleep(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [autoSleepEnabled]);

  // Clean cache on unmount or when source frames change
  useEffect(() => {
    return () => {
      clearProcessedCache();
    };
  }, [frames, clearProcessedCache]);

  const handleToggleLivePreview = (val: boolean) => {
    setLivePreviewEnabled(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pixelator-live-preview', val ? 'true' : 'false');
    }
    if (!val) {
      clearProcessedCache();
    }
  };

  const handleToggleAutoSleep = (val: boolean) => {
    setAutoSleepEnabled(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pixelator-live-preview-autosleep', val ? 'true' : 'false');
    }
    if (!val) {
      setIsAsleep(false);
    }
  };

  // Check if bitmap is still valid (not closed)
  const isBitmapValid = (bitmap: ImageBitmap): boolean => {
    try {
      return bitmap.width > 0 && bitmap.height > 0;
    } catch {
      return false;
    }
  };

  // Draw checkerboard pattern
  const drawCheckerboard = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const tileSize = 16;
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        ctx.fillStyle = ((x / tileSize + y / tileSize) % 2) ? '#e0e0e0' : '#ffffff';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  };

  // Draw current frame to canvas with full caching, outline, and pixelation options
  useEffect(() => {
    const drawFrame = async () => {
      const canvas = canvasRef.current;
      if (!canvas || frames.length === 0) return;

      const frame = frames[currentFrame];
      if (!frame?.bitmap || !isBitmapValid(frame.bitmap)) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        if (canvas.width !== frame.bitmap.width || canvas.height !== frame.bitmap.height) {
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background based on mode
        if (backgroundMode === 'checkerboard') {
          drawCheckerboard(ctx, canvas.width, canvas.height);
        } else if (backgroundMode === 'color') {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        let displayBitmap = frame.bitmap;
        let outlineBitmap: ImageBitmap | null = null;
        let pixelatedBitmap: ImageBitmap | null = null;

        // Determine if we should process this tick
        const isRealTime = livePreviewEnabled && (!isAsleep || processedCacheRef.current.has(frame.id));

        if (isRealTime) {
          const cached = processedCacheRef.current.get(frame.id);
          if (cached && isBitmapValid(cached)) {
            displayBitmap = cached;
          } else {
            // Apply outline
            if (outlineOptions?.enabled) {
              displayBitmap = await addOutline(frame.bitmap, outlineOptions);
              outlineBitmap = displayBitmap;
            }

            // Apply real-time pixelation
            if (pixelatorOptions?.enabled) {
              displayBitmap = await pixelateImage(displayBitmap, pixelatorOptions);
              pixelatedBitmap = displayBitmap;
            }

            // Populate high speed loop cache
            if (isBitmapValid(displayBitmap)) {
              try {
                const cacheCanvas = document.createElement('canvas');
                cacheCanvas.width = displayBitmap.width;
                cacheCanvas.height = displayBitmap.height;
                const cacheCtx = cacheCanvas.getContext('2d')!;
                cacheCtx.drawImage(displayBitmap, 0, 0);
                const cacheClone = await createImageBitmap(cacheCanvas);
                processedCacheRef.current.set(frame.id, cacheClone);
              } catch (e) {
                console.warn('Failed to cache pre-rendered frame:', frame.id, e);
              }
            }
          }
        }

        ctx.drawImage(displayBitmap, 0, 0);

        // Clean up temporary bitmaps safely to prevent memory leaks
        if (outlineBitmap) {
          try { outlineBitmap.close(); } catch {}
        }
        if (pixelatedBitmap) {
          try { pixelatedBitmap.close(); } catch {}
        }
      } catch (error) {
        console.debug('Frame bitmap drawing unavailable:', error);
      }
    };

    drawFrame();
  }, [frames, currentFrame, outlineOptions, backgroundMode, backgroundColor, pixelatorOptions, livePreviewEnabled, isAsleep]);

  // Animation loop with loop mode support
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameInterval = 1000 / fps;

    const animate = (timestamp: number) => {
      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= frameInterval) {
        lastFrameTimeRef.current = timestamp - (elapsed % frameInterval);
        
        let nextFrame: number;
        
        switch (loopMode) {
          case 'reverse':
            nextFrame = currentFrame - 1;
            if (nextFrame < 0) nextFrame = frames.length - 1;
            break;
            
          case 'pingpong':
            nextFrame = currentFrame + directionRef.current;
            if (nextFrame >= frames.length) {
              directionRef.current = -1;
              nextFrame = frames.length - 2;
            } else if (nextFrame < 0) {
              directionRef.current = 1;
              nextFrame = 1;
            }
            if (nextFrame < 0) nextFrame = 0;
            if (nextFrame >= frames.length) nextFrame = frames.length - 1;
            break;
            
          case 'normal':
          default:
            nextFrame = (currentFrame + 1) % frames.length;
            break;
        }
        
        onFrameChange(nextFrame);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    lastFrameTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, fps, frames.length, currentFrame, onFrameChange, loopMode]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const stepBack = () => onFrameChange(Math.max(0, currentFrame - 1));
  const stepForward = () => onFrameChange(Math.min(frames.length - 1, currentFrame + 1));
  const goToStart = () => onFrameChange(0);
  const goToEnd = () => onFrameChange(frames.length - 1);

  const hasFrames = frames.length > 0;
  
  const loopModeLabel = {
    normal: '→',
    pingpong: '↔',
    reverse: '←',
  }[loopMode];

  return (
    <div className={styles.container}>
      <div className={styles.canvasContainer}>
        {hasFrames ? (
          <canvas ref={canvasRef} className={styles.canvas} />
        ) : (
          <div className={styles.placeholder}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <p>Load a video or spritesheet to preview</p>
          </div>
        )}
        {hasFrames && (
          <>
            <div className={styles.loopIndicator} title={`Loop: ${loopMode}`}>
              {loopModeLabel}
            </div>

            {/* Glowing Engine Status Bar Indicator */}
            <div className={styles.statusIndicator}>
              <span className={`${styles.statusDot} ${
                !livePreviewEnabled 
                  ? styles.disabled 
                  : isAsleep 
                    ? styles.sleep 
                    : styles.active
              }`} />
              <span>
                {!livePreviewEnabled 
                  ? 'Live Preview: OFF' 
                  : isAsleep 
                    ? 'Live Preview: Sleeping (Idle)' 
                    : 'Live Preview: Active'}
              </span>
            </div>

            {/* Premium Settings dropdown menu */}
            <button 
              className={styles.bgToggle}
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Display & Performance settings"
              aria-label="Display & Performance settings"
            >
              <span aria-hidden="true">⚙️</span>
            </button>
            {showSettingsMenu && (
              <div className={styles.settingsMenu} onClick={(e) => e.stopPropagation()}>
                <div className={styles.settingsSection}>
                  <div className={styles.settingsTitle}>Real-Time Preview</div>
                  
                  {/* Live Preview Toggle Switch */}
                  <div className={styles.toggleRow} onClick={() => handleToggleLivePreview(!livePreviewEnabled)}>
                    <div className={styles.toggleLabel}>
                      <span>Live Preview</span>
                      <span className={styles.toggleDesc}>Process adjustments live</span>
                    </div>
                    <label className={styles.switch}>
                      <input 
                        type="checkbox" 
                        checked={livePreviewEnabled} 
                        onChange={(e) => handleToggleLivePreview(e.target.checked)}
                      />
                      <span className={styles.sliderRound}></span>
                    </label>
                  </div>

                  {/* Auto-Sleep Toggle Switch */}
                  <div className={styles.toggleRow} onClick={() => handleToggleAutoSleep(!autoSleepEnabled)}>
                    <div className={styles.toggleLabel}>
                      <span>Auto-Sleep Mode</span>
                      <span className={styles.toggleDesc}>Save CPU when idle (4s)</span>
                    </div>
                    <label className={styles.switch}>
                      <input 
                        type="checkbox" 
                        checked={autoSleepEnabled} 
                        onChange={(e) => handleToggleAutoSleep(e.target.checked)}
                        disabled={!livePreviewEnabled}
                      />
                      <span className={styles.sliderRound}></span>
                    </label>
                  </div>
                </div>

                <div className={styles.settingsSection}>
                  <div className={styles.settingsTitle}>Background Mode</div>
                  <button
                    className={`${styles.bgOption} ${backgroundMode === 'none' ? styles.active : ''}`}
                    onClick={() => { onBackgroundModeChange?.('none'); }}
                  >
                    None (Dark)
                  </button>
                  <button
                    className={`${styles.bgOption} ${backgroundMode === 'checkerboard' ? styles.active : ''}`}
                    onClick={() => { onBackgroundModeChange?.('checkerboard'); }}
                  >
                    Checkerboard
                  </button>
                  <button
                    className={`${styles.bgOption} ${backgroundMode === 'color' ? styles.active : ''}`}
                    onClick={() => { onBackgroundModeChange?.('color'); }}
                  >
                    Custom Color
                  </button>
                  {backgroundMode === 'color' && (
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => onBackgroundColorChange?.(e.target.value)}
                      className={styles.bgColorPicker}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.controls}>
        <button
          onClick={goToStart}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Go to start"
          aria-label="Go to start"
        >
          <span aria-hidden="true">⏮</span>
        </button>
        <button
          onClick={stepBack}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Previous frame"
          aria-label="Previous frame"
        >
          <span aria-hidden="true">⏪</span>
        </button>
        <button
          onClick={togglePlay}
          className={`${styles.controlButton} ${styles.playButton}`}
          disabled={!hasFrames}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <span aria-hidden="true">{isPlaying ? '⏸' : '▶'}</span>
        </button>
        <button
          onClick={stepForward}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Next frame"
          aria-label="Next frame"
        >
          <span aria-hidden="true">⏩</span>
        </button>
        <button
          onClick={goToEnd}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Go to end"
          aria-label="Go to end"
        >
          <span aria-hidden="true">⏭</span>
        </button>
      </div>
    </div>
  );
}
