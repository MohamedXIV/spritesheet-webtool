'use client';

/**
 * PreviewPlayer - Canvas-based animation preview with loop modes
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FrameData } from '@/types';
import { LoopMode } from './Timeline';
import styles from './PreviewPlayer.module.css';

interface PreviewPlayerProps {
  frames: FrameData[];
  fps: number;
  currentFrame: number;
  onFrameChange: (index: number) => void;
  loopMode: LoopMode;
}

export function PreviewPlayer({
  frames,
  fps,
  currentFrame,
  onFrameChange,
  loopMode,
}: PreviewPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const directionRef = useRef<1 | -1>(1); // 1 = forward, -1 = backward

  // Check if bitmap is still valid (not closed)
  const isBitmapValid = (bitmap: ImageBitmap): boolean => {
    try {
      return bitmap.width > 0 && bitmap.height > 0;
    } catch {
      return false;
    }
  };

  // Draw current frame to canvas
  useEffect(() => {
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
      ctx.drawImage(frame.bitmap, 0, 0);
    } catch (error) {
      console.debug('Frame bitmap unavailable:', error);
    }
  }, [frames, currentFrame]);

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
            // Play backwards, loop
            nextFrame = currentFrame - 1;
            if (nextFrame < 0) nextFrame = frames.length - 1;
            break;
            
          case 'pingpong':
            // Ping-pong: go forward then backward
            nextFrame = currentFrame + directionRef.current;
            if (nextFrame >= frames.length) {
              directionRef.current = -1;
              nextFrame = frames.length - 2;
            } else if (nextFrame < 0) {
              directionRef.current = 1;
              nextFrame = 1;
            }
            // Handle edge case for very short animations
            if (nextFrame < 0) nextFrame = 0;
            if (nextFrame >= frames.length) nextFrame = frames.length - 1;
            break;
            
          case 'normal':
          default:
            // Normal forward loop
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

  // Reset direction when loop mode changes
  useEffect(() => {
    directionRef.current = 1;
  }, [loopMode]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const goToStart = useCallback(() => {
    setIsPlaying(false);
    directionRef.current = 1;
    onFrameChange(0);
  }, [onFrameChange]);

  const goToEnd = useCallback(() => {
    setIsPlaying(false);
    directionRef.current = -1;
    onFrameChange(Math.max(0, frames.length - 1));
  }, [frames.length, onFrameChange]);

  const stepBack = useCallback(() => {
    setIsPlaying(false);
    onFrameChange(Math.max(0, currentFrame - 1));
  }, [currentFrame, onFrameChange]);

  const stepForward = useCallback(() => {
    setIsPlaying(false);
    onFrameChange(Math.min(frames.length - 1, currentFrame + 1));
  }, [currentFrame, frames.length, onFrameChange]);

  const hasFrames = frames.length > 0;

  // Loop mode indicator
  const loopModeLabel = {
    normal: '→',
    pingpong: '↔',
    reverse: '←'
  }[loopMode];

  return (
    <div className={styles.container}>
      <div className={styles.canvasWrapper}>
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
          <div className={styles.loopIndicator} title={`Loop: ${loopMode}`}>
            {loopModeLabel}
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button
          onClick={goToStart}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Go to start"
        >
          ⏮
        </button>
        <button
          onClick={stepBack}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Previous frame"
        >
          ⏪
        </button>
        <button
          onClick={togglePlay}
          className={`${styles.controlButton} ${styles.playButton}`}
          disabled={!hasFrames}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={stepForward}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Next frame"
        >
          ⏩
        </button>
        <button
          onClick={goToEnd}
          className={styles.controlButton}
          disabled={!hasFrames}
          title="Go to end"
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
