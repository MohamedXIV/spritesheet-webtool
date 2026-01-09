'use client';

/**
 * BackgroundRemovalPanel - Tools for removing backgrounds from frames
 * With post-processing and outline features
 */

import React, { useState, useCallback } from 'react';
import { FrameData } from '@/types';
import { removeBackgroundByColor, autoDetectBackgroundColor } from '@/lib/chromaKey';
import { postProcessMask, PostProcessOptions, DEFAULT_POST_PROCESS_OPTIONS } from '@/lib/maskPostProcess';
import { addOutline, OutlineOptions, DEFAULT_OUTLINE_OPTIONS } from '@/lib/outlineGenerator';
import styles from './BackgroundRemovalPanel.module.css';

type RemovalMethod = 'chromakey' | 'bodypix' | 'u2net';

interface BackgroundRemovalPanelProps {
  frames: FrameData[];
  selectedIds: Set<string>;
  onFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
  onProcessingChange?: (processingIds: Set<string>) => void;
}

// Yield to UI thread to prevent freezing
const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function BackgroundRemovalPanel({
  frames,
  selectedIds,
  onFramesProcessed,
  onProcessingChange,
}: BackgroundRemovalPanelProps) {
  const [method, setMethod] = useState<RemovalMethod>('chromakey');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState('');
  
  // Chroma key settings
  const [targetColor, setTargetColor] = useState({ r: 0, g: 255, b: 0 });
  const [tolerance, setTolerance] = useState(30);
  const [edgeSoftness, setEdgeSoftness] = useState(5);
  
  // ML settings
  const [mlThreshold, setMlThreshold] = useState(0.7);
  
  // Post-processing settings (for AI methods)
  const [postProcessEnabled, setPostProcessEnabled] = useState(true);
  const [erosion, setErosion] = useState(1);
  const [decontaminate, setDecontaminate] = useState(true);
  
  // Outline settings
  const [outlineEnabled, setOutlineEnabled] = useState(false);
  const [outlineThickness, setOutlineThickness] = useState(2);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlinePosition, setOutlinePosition] = useState<'outside' | 'inside' | 'both'>('outside');
  
  // Collapsible sections
  const [showPostProcess, setShowPostProcess] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  
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
    const currentlyProcessing = new Set<string>();
    
    const postProcessOpts: Partial<PostProcessOptions> = {
      erosion: postProcessEnabled ? erosion : 0,
      decontaminate: postProcessEnabled && decontaminate,
    };
    
    const outlineOpts: Partial<OutlineOptions> = {
      enabled: outlineEnabled,
      thickness: outlineThickness,
      color: outlineColor,
      position: outlinePosition,
    };
    
    try {
      for (let i = 0; i < framesToProcess.length; i++) {
        const frame = framesToProcess[i];
        
        // Mark frame as processing
        currentlyProcessing.add(frame.id);
        onProcessingChange?.(new Set(currentlyProcessing));
        
        setProgress({ current: i + 1, total: framesToProcess.length });
        
        // Yield to UI to prevent freezing
        await yieldToUI();
        
        let processed: ImageBitmap;
        
        if (method === 'chromakey') {
          setStatusMessage(`Processing frame ${i + 1}/${framesToProcess.length}...`);
          processed = await removeBackgroundByColor(frame.bitmap, {
            targetColor,
            tolerance,
            edgeSoftness
          });
        } else if (method === 'bodypix') {
          if (i === 0) {
            setStatusMessage('Loading BodyPix model...');
          }
          const { loadBodyPix, segmentPerson } = await import('@/lib/bodyPixRemoval');
          if (i === 0) {
            await loadBodyPix(setStatusMessage);
          }
          setStatusMessage(`Processing frame ${i + 1}/${framesToProcess.length}...`);
          
          // Yield before heavy processing
          await yieldToUI();
          processed = await segmentPerson(frame.bitmap, { threshold: mlThreshold });
          
          // Apply post-processing for AI methods
          if (postProcessEnabled) {
            await yieldToUI();
            processed = await postProcessMask(processed, postProcessOpts);
          }
        } else {
          // U-2-Net
          if (i === 0) {
            setStatusMessage('Loading U-2-Net model...');
          }
          const { loadU2Net, removeBackgroundU2Net } = await import('@/lib/u2netRemoval');
          if (i === 0) {
            await loadU2Net(setStatusMessage);
          }
          setStatusMessage(`Processing frame ${i + 1}/${framesToProcess.length}...`);
          
          // Yield before heavy processing
          await yieldToUI();
          processed = await removeBackgroundU2Net(frame.bitmap);
          
          // Apply post-processing for AI methods
          if (postProcessEnabled) {
            await yieldToUI();
            processed = await postProcessMask(processed, postProcessOpts);
          }
        }
        
        // Apply outline if enabled (works for all methods)
        if (outlineEnabled) {
          await yieldToUI();
          processed = await addOutline(processed, outlineOpts);
        }
        
        processedFrames.set(frame.id, processed);
        
        // Mark frame as done
        currentlyProcessing.delete(frame.id);
      }
      
      onFramesProcessed(processedFrames);
      setStatusMessage('Done!');
    } catch (error) {
      console.error('Processing failed:', error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      onProcessingChange?.(new Set());
    }
  }, [
    framesToProcess, method, targetColor, tolerance, edgeSoftness, mlThreshold,
    postProcessEnabled, erosion, decontaminate,
    outlineEnabled, outlineThickness, outlineColor, outlinePosition,
    onFramesProcessed
  ]);

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
              <label className={styles.label}>Tolerance: {tolerance}%</label>
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
              <label className={styles.label}>Edge Softness: {edgeSoftness}</label>
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
                ? '🧑 Best for videos with people as subjects.'
                : '🎯 Best quality for any object. Uses U²-Net.'
              }
            </div>
            
            {method === 'bodypix' && (
              <div className={styles.field}>
                <label className={styles.label}>Threshold: {(mlThreshold * 100).toFixed(0)}%</label>
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

      {/* Edge Refinement Section (AI methods only) */}
      {(method === 'bodypix' || method === 'u2net') && (
        <div className={styles.collapsibleSection}>
          <button 
            className={styles.sectionHeader}
            onClick={() => setShowPostProcess(!showPostProcess)}
          >
            <span>Edge Refinement</span>
            <span className={styles.sectionToggle}>{showPostProcess ? '▼' : '▶'}</span>
          </button>
          
          {showPostProcess && (
            <div className={styles.sectionContent}>
              <div className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  id="postprocess-enable"
                  checked={postProcessEnabled}
                  onChange={(e) => setPostProcessEnabled(e.target.checked)}
                  disabled={isProcessing}
                />
                <label htmlFor="postprocess-enable">Enable edge cleanup</label>
              </div>
              
              {postProcessEnabled && (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Erosion: {erosion}px</label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      value={erosion}
                      onChange={(e) => setErosion(Number(e.target.value))}
                      className={styles.slider}
                      disabled={isProcessing}
                    />
                  </div>
                  
                  <div className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      id="decontaminate"
                      checked={decontaminate}
                      onChange={(e) => setDecontaminate(e.target.checked)}
                      disabled={isProcessing}
                    />
                    <label htmlFor="decontaminate">Color decontamination</label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Outline Section */}
      <div className={styles.collapsibleSection}>
        <button 
          className={styles.sectionHeader}
          onClick={() => setShowOutline(!showOutline)}
        >
          <span>Sprite Outline</span>
          <span className={styles.sectionToggle}>{showOutline ? '▼' : '▶'}</span>
        </button>
        
        {showOutline && (
          <div className={styles.sectionContent}>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                id="outline-enable"
                checked={outlineEnabled}
                onChange={(e) => setOutlineEnabled(e.target.checked)}
                disabled={isProcessing}
              />
              <label htmlFor="outline-enable">Add outline/stroke</label>
            </div>
            
            {outlineEnabled && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>Thickness: {outlineThickness}px</label>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={outlineThickness}
                    onChange={(e) => setOutlineThickness(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isProcessing}
                  />
                </div>
                
                <div className={styles.field}>
                  <label className={styles.label}>Color</label>
                  <input
                    type="color"
                    value={outlineColor}
                    onChange={(e) => setOutlineColor(e.target.value)}
                    className={styles.colorPicker}
                    disabled={isProcessing}
                  />
                </div>
                
                <div className={styles.field}>
                  <label className={styles.label}>Position</label>
                  <select
                    value={outlinePosition}
                    onChange={(e) => setOutlinePosition(e.target.value as 'outside' | 'inside' | 'both')}
                    className={styles.select}
                    disabled={isProcessing}
                  >
                    <option value="outside">Outside</option>
                    <option value="inside">Inside</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </>
            )}
          </div>
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
