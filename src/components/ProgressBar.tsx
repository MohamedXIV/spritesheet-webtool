'use client';

/**
 * ProgressBar - Shows extraction progress
 */

import React from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  progress: number; // 0-100
  message?: string;
}

export function ProgressBar({ progress, message }: ProgressBarProps) {
  return (
    <div className={styles.container}>
      <div className={styles.track}>
        <div 
          className={styles.fill} 
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} 
        />
      </div>
      <div className={styles.info}>
        <span className={styles.message}>{message || 'Processing...'}</span>
        <span className={styles.percentage}>{Math.round(progress)}%</span>
      </div>
    </div>
  );
}
