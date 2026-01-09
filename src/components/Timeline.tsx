'use client';

/**
 * Timeline - Displays frame order with FPS control and loop modes
 */

import React from 'react';
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
}

export function Timeline({
  frameCount,
  currentFrame,
  fps,
  loopMode,
  onFpsChange,
  onFrameSelect,
  onLoopModeChange,
}: TimelineProps) {
  
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Timeline</h3>
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

      <div className={styles.scrubber}>
        <input
          type="range"
          min="0"
          max={Math.max(0, frameCount - 1)}
          value={currentFrame}
          onChange={(e) => onFrameSelect(Number(e.target.value))}
          className={styles.frameSlider}
          disabled={frameCount === 0}
        />
        <div className={styles.frameInfo}>
          Frame {frameCount > 0 ? currentFrame + 1 : 0} / {frameCount}
        </div>
      </div>

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
          <span className={styles.statValue}>{frameCount}</span>
        </div>
      </div>
    </div>
  );
}
