'use client';

/**
 * WatermarkRemovalPanel - Tools for removing AI watermarks from frames
 */

import React, { useState, useCallback, useEffect } from 'react';
import { FrameData } from '@/types';
import { inpaintRegion, fillRegionWithNearbyColor, getWatermarkPreset, InpaintRegion } from '@/lib/inpaint';
import styles from './WatermarkRemovalPanel.module.css';

type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
type RemovalMethod = 'inpaint' | 'fill' | 'remove';

interface WatermarkRemovalPanelProps {
  frames: FrameData[];
  selectedIds: Set<string>;
  onFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
}

const DISCLAIMER_KEY = 'watermark-removal-disclaimer-accepted';

export function WatermarkRemovalPanel({
  frames,
  selectedIds,
  onFramesProcessed,
}: WatermarkRemovalPanelProps) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
  
  const [position, setPosition] = useState<WatermarkPosition>('bottom-right');
  const [method, setMethod] = useState<RemovalMethod>('inpaint');
  const [regionSize, setRegionSize] = useState(50);
  const [customRegion, setCustomRegion] = useState<InpaintRegion>({ x: 0, y: 0, width: 100, height: 50 });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Check localStorage for disclaimer acceptance
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const accepted = localStorage.getItem(DISCLAIMER_KEY) === 'true';
      setDisclaimerAccepted(accepted);
      setHasCheckedStorage(true);
    }
  }, []);

  const framesToProcess = frames.filter(f => 
    selectedIds.size === 0 || selectedIds.has(f.id)
  );

  const handleOpenTool = useCallback(() => {
    if (!disclaimerAccepted) {
      setShowDisclaimer(true);
    }
  }, [disclaimerAccepted]);

  const handleAcceptDisclaimer = useCallback(() => {
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISCLAIMER_KEY, 'true');
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (framesToProcess.length === 0) return;
    
    setIsProcessing(true);
    setProgress({ current: 0, total: framesToProcess.length });
    
    const processedFrames = new Map<string, ImageBitmap>();
    
    try {
      for (let i = 0; i < framesToProcess.length; i++) {
        const frame = framesToProcess[i];
        setProgress({ current: i + 1, total: framesToProcess.length });
        
        // Get region based on position
        let region: InpaintRegion;
        if (position === 'custom') {
          region = customRegion;
        } else {
          region = getWatermarkPreset(
            frame.bitmap.width,
            frame.bitmap.height,
            position,
            regionSize
          );
        }
        
        let processed: ImageBitmap;
        
        if (method === 'inpaint') {
          processed = await inpaintRegion(frame.bitmap, region, 5);
        } else if (method === 'fill') {
          processed = await fillRegionWithNearbyColor(frame.bitmap, region);
        } else {
          // Remove - make region transparent
          const canvas = document.createElement('canvas');
          canvas.width = frame.bitmap.width;
          canvas.height = frame.bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(frame.bitmap, 0, 0);
          ctx.clearRect(region.x, region.y, region.width, region.height);
          processed = await createImageBitmap(canvas);
        }
        
        processedFrames.set(frame.id, processed);
      }
      
      onFramesProcessed(processedFrames);
    } catch (error) {
      console.error('Watermark removal failed:', error);
      alert('Failed to remove watermark');
    } finally {
      setIsProcessing(false);
    }
  }, [framesToProcess, position, method, regionSize, customRegion, onFramesProcessed]);

  // Don't render until we've checked localStorage
  if (!hasCheckedStorage) {
    return null;
  }

  // Show disclaimer modal
  if (showDisclaimer) {
    return (
      <div className={styles.disclaimerOverlay}>
        <div className={styles.disclaimerModal}>
          <div className={styles.disclaimerIcon}>⚠️</div>
          <h3 className={styles.disclaimerTitle}>Important Disclaimer</h3>
          <p className={styles.disclaimerText}>
            This tool is designed for removing AI-generated watermarks 
            (such as Veo, Sora, etc.) from content <strong>you have legal rights to use</strong>.
          </p>
          <p className={styles.disclaimerText}>
            You are <strong>solely responsible</strong> for ensuring your use of this tool 
            complies with applicable laws, terms of service, and content policies.
          </p>
          <div className={styles.disclaimerActions}>
            <button 
              onClick={() => setShowDisclaimer(false)}
              className={styles.cancelButton}
            >
              Cancel
            </button>
            <button 
              onClick={handleAcceptDisclaimer}
              className={styles.acceptButton}
            >
              I Understand & Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show "unlock" button if disclaimer not accepted
  if (!disclaimerAccepted) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Watermark Removal</h3>
        <div className={styles.lockedMessage}>
          <div className={styles.lockIcon}>🔒</div>
          <p>This tool requires accepting the usage disclaimer.</p>
          <button onClick={handleOpenTool} className={styles.unlockButton}>
            View Disclaimer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Watermark Removal</h3>
      
      <div className={styles.settings}>
        <div className={styles.field}>
          <label className={styles.label}>Position</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as WatermarkPosition)}
            className={styles.select}
            disabled={isProcessing}
          >
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Region Size: {regionSize}px</label>
          <input
            type="range"
            min="20"
            max="150"
            value={regionSize}
            onChange={(e) => setRegionSize(Number(e.target.value))}
            className={styles.slider}
            disabled={isProcessing}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Removal Method</label>
          <div className={styles.methodButtons}>
            <button
              className={`${styles.methodButton} ${method === 'inpaint' ? styles.active : ''}`}
              onClick={() => setMethod('inpaint')}
              disabled={isProcessing}
            >
              Inpaint
            </button>
            <button
              className={`${styles.methodButton} ${method === 'fill' ? styles.active : ''}`}
              onClick={() => setMethod('fill')}
              disabled={isProcessing}
            >
              Fill
            </button>
            <button
              className={`${styles.methodButton} ${method === 'remove' ? styles.active : ''}`}
              onClick={() => setMethod('remove')}
              disabled={isProcessing}
            >
              Remove
            </button>
          </div>
        </div>

        <div className={styles.methodInfo}>
          {method === 'inpaint' && 'Blends surrounding pixels into the watermark area'}
          {method === 'fill' && 'Fills with nearby sampled color'}
          {method === 'remove' && 'Makes region fully transparent'}
        </div>
      </div>

      {isProcessing && (
        <div className={styles.progressSection}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className={styles.progressText}>
            Processing {progress.current}/{progress.total}...
          </div>
        </div>
      )}

      <button
        onClick={handleProcess}
        className={styles.processButton}
        disabled={isProcessing || framesToProcess.length === 0}
      >
        {isProcessing 
          ? `Processing...`
          : `Remove from ${selectedIds.size > 0 ? selectedIds.size : 'All'} Frames`
        }
      </button>

      <div className={styles.hint}>
        {selectedIds.size > 0 
          ? `${selectedIds.size} frames selected`
          : 'All frames will be processed'
        }
      </div>
    </div>
  );
}
