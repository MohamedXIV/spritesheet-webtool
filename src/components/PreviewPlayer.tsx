'use client';

/**
 * PreviewPlayer - Canvas-based animation preview with loop modes,
 * outline preview, and background options
 */

import React, { useRef, useEffect, useState } from 'react';
import { FrameData } from '@/types';
import { LoopMode } from './Timeline';
import { addOutline, OutlineOptions } from '@/lib/outlineGenerator';
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
}: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const directionRef = useRef<1 | -1>(1);
  const [showBgMenu, setShowBgMenu] = useState(false);

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

  // Draw current frame to canvas with outline and background options
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

        // Apply outline if options provided and enabled
        let displayBitmap = frame.bitmap;
        if (outlineOptions?.enabled) {
          displayBitmap = await addOutline(frame.bitmap, outlineOptions);
        }

        ctx.drawImage(displayBitmap, 0, 0);

        // Close the processed bitmap if different from original
        if (displayBitmap !== frame.bitmap) {
          displayBitmap.close();
        }
      } catch (error) {
        console.debug('Frame bitmap unavailable:', error);
      }
    };

    drawFrame();
  }, [frames, currentFrame, outlineOptions, backgroundMode, backgroundColor]);

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
            <p>Load a video to preview</p>
          </div>
        )}
        {hasFrames && (
          <>
            <div className={styles.loopIndicator} title={`Loop: ${loopMode}`}>
              {loopModeLabel}
            </div>
            <button 
              className={styles.bgToggle}
              onClick={() => setShowBgMenu(!showBgMenu)}
              title="Background options"
              aria-label="Background options"
              aria-haspopup="true"
              aria-expanded={showBgMenu}
            >
              🎨
            </button>
            {showBgMenu && (
              <div className={styles.bgMenu}>
                <button
                  className={`${styles.bgOption} ${backgroundMode === 'none' ? styles.active : ''}`}
                  onClick={() => { onBackgroundModeChange?.('none'); setShowBgMenu(false); }}
                >
                  None (Dark)
                </button>
                <button
                  className={`${styles.bgOption} ${backgroundMode === 'checkerboard' ? styles.active : ''}`}
                  onClick={() => { onBackgroundModeChange?.('checkerboard'); setShowBgMenu(false); }}
                >
                  Checkerboard
                </button>
                <button
                  className={`${styles.bgOption} ${backgroundMode === 'color' ? styles.active : ''}`}
                  onClick={() => { onBackgroundModeChange?.('color'); setShowBgMenu(false); }}
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
          ⏮
        </button>
        <button
          onClick={stepBack}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Previous frame"
          aria-label="Previous frame"
        >
          ⏪
        </button>
        <button
          onClick={togglePlay}
          className={`${styles.controlButton} ${styles.playButton}`}
          disabled={!hasFrames}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={stepForward}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Next frame"
          aria-label="Next frame"
        >
          ⏩
        </button>
        <button
          onClick={goToEnd}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Go to end"
          aria-label="Go to end"
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
