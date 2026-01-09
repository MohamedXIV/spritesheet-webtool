'use client';

/**
 * BackgroundRemovalPanel - Tools for removing backgrounds from frames
 */

import React, { useState, useCallback } from 'react';
import { FrameData } from '@/types';
import { removeBackgroundByColor, autoDetectBackgroundColor } from '@/lib/chromaKey';
import styles from './BackgroundRemovalPanel.module.css';

type RemovalMethod = 'chromakey' | 'bodypix' | 'u2net';

interface BackgroundRemovalPanelProps {
  frames: FrameData[];
  selectedIds: Set<string>;
  onFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
}

export function BackgroundRemovalPanel({
  frames,
  selectedIds,
  onFramesProcessed,
}: BackgroundRemovalPanelProps) {
  const [method, setMethod] = useState<RemovalMethod>('chromakey');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState('');
  
  // Chroma key settings
  const [targetColor, setTargetColor] = useState({ r: 0, g: 255, b: 0 }); // Green
  const [tolerance, setTolerance] = useState(30);
  const [edgeSoftness, setEdgeSoftness] = useState(5);
  
  // ML settings
  const [mlThreshold, setMlThreshold] = useState(0.7);
  
  const framesToProcess = frames.filter(f => 
    selectedIds.size === 0 || selectedIds.has(f.id)
  );

  const handleAutoDetect = useCallback(async () => {
    if (framesToProcess.length === 0) return;
    
    const detected = await autoDetectBackgroundColor(framesToProcess[0].bitmap);
    setTargetColor(detected);
  }, [framesToProcess]);

  const handleProcess = useCallback(async () => {
    if (framesToProcess.length === 0) return;
    
    setIsProcessing(true);
    setProgress({ current: 0, total: framesToProcess.length });
    
    const processedFrames = new Map<string, ImageBitmap>();
    
    try {
      if (method === 'chromakey') {
        // Chroma key processing
        for (let i = 0; i < framesToProcess.length; i++) {
          const frame = framesToProcess[i];
          setProgress({ current: i + 1, total: framesToProcess.length });
          setStatusMessage(`Processing frame ${i + 1}/${framesToProcess.length}...`);
          
          const processed = await removeBackgroundByColor(frame.bitmap, {
            targetColor,
            tolerance,
            edgeSoftness
          });
          
          processedFrames.set(frame.id, processed);
        }
      } else if (method === 'bodypix') {
        // BodyPix processing
        setStatusMessage('Loading BodyPix model...');
        const { loadBodyPix, segmentPerson } = await import('@/lib/bodyPixRemoval');
        await loadBodyPix(setStatusMessage);
        
        for (let i = 0; i < framesToProcess.length; i++) {
          const frame = framesToProcess[i];
          setProgress({ current: i + 1, total: framesToProcess.length });
          setStatusMessage(`Processing frame ${i + 1}/${framesToProcess.length}...`);
          
          const processed = await segmentPerson(frame.bitmap, {
            threshold: mlThreshold
          });
          
          processedFrames.set(frame.id, processed);
        }
      } else if (method === 'u2net') {
        // U-2-Net processing
        setStatusMessage('Loading U-2-Net model...');
        const { loadU2Net, removeBackgroundU2Net } = await import('@/lib/u2netRemoval');
        await loadU2Net(setStatusMessage);
        
        for (let i = 0; i < framesToProcess.length; i++) {
          const frame = framesToProcess[i];
          setProgress({ current: i + 1, total: framesToProcess.length });
          setStatusMessage(`Processing frame ${i + 1}/${framesToProcess.length}...`);
          
          const processed = await removeBackgroundU2Net(frame.bitmap);
          processedFrames.set(frame.id, processed);
        }
      }
      
      onFramesProcessed(processedFrames);
      setStatusMessage('Done!');
    } catch (error) {
      console.error('Processing failed:', error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [framesToProcess, method, targetColor, tolerance, edgeSoftness, mlThreshold, onFramesProcessed]);

  const colorHex = `#${targetColor.r.toString(16).padStart(2, '0')}${targetColor.g.toString(16).padStart(2, '0')}${targetColor.b.toString(16).padStart(2, '0')}`;

  const handleColorChange = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    setTargetColor({ r, g, b });
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Background Removal</h3>
      
      <div className={styles.methodTabs}>
        <button
          className={`${styles.tab} ${method === 'chromakey' ? styles.active : ''}`}
          onClick={() => setMethod('chromakey')}
          disabled={isProcessing}
        >
          Color Key
        </button>
        <button
          className={`${styles.tab} ${method === 'bodypix' ? styles.active : ''}`}
          onClick={() => setMethod('bodypix')}
          disabled={isProcessing}
        >
          AI (People)
        </button>
        <button
          className={`${styles.tab} ${method === 'u2net' ? styles.active : ''}`}
          onClick={() => setMethod('u2net')}
          disabled={isProcessing}
        >
          AI (Universal)
        </button>
      </div>

      <div className={styles.settings}>
        {method === 'chromakey' && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Background Color</label>
              <div className={styles.colorRow}>
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className={styles.colorPicker}
                  disabled={isProcessing}
                />
                <button
                  onClick={handleAutoDetect}
                  className={styles.smallButton}
                  disabled={isProcessing || framesToProcess.length === 0}
                >
                  Auto-detect
                </button>
              </div>
            </div>
            
            <div className={styles.field}>
              <label className={styles.label}>
                Tolerance: {tolerance}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className={styles.slider}
                disabled={isProcessing}
              />
            </div>
            
            <div className={styles.field}>
              <label className={styles.label}>
                Edge Softness: {edgeSoftness}
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={edgeSoftness}
                onChange={(e) => setEdgeSoftness(Number(e.target.value))}
                className={styles.slider}
                disabled={isProcessing}
              />
            </div>
          </>
        )}

        {(method === 'bodypix' || method === 'u2net') && (
          <>
            <div className={styles.infoBox}>
              {method === 'bodypix' 
                ? '🧑 Best for videos with people as subjects. Uses TensorFlow.js.'
                : '🎯 Best quality for any object. Uses U-2-Net ONNX model.'
              }
            </div>
            
            {method === 'bodypix' && (
              <div className={styles.field}>
                <label className={styles.label}>
                  Threshold: {(mlThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="0.99"
                  step="0.05"
                  value={mlThreshold}
                  onChange={(e) => setMlThreshold(Number(e.target.value))}
                  className={styles.slider}
                  disabled={isProcessing}
                />
              </div>
            )}
          </>
        )}
      </div>

      {isProcessing && (
        <div className={styles.progressSection}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className={styles.progressText}>{statusMessage}</div>
        </div>
      )}

      <div className={styles.actions}>
        <button
          onClick={handleProcess}
          className={styles.processButton}
          disabled={isProcessing || framesToProcess.length === 0}
        >
          {isProcessing 
            ? `Processing ${progress.current}/${progress.total}...`
            : `Process ${selectedIds.size > 0 ? selectedIds.size : 'All'} Frames`
          }
        </button>
      </div>

      <div className={styles.hint}>
        {selectedIds.size > 0 
          ? `${selectedIds.size} frames selected`
          : 'All frames will be processed'
        }
      </div>
    </div>
  );
}
