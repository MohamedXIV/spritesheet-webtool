'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOptionalEditorContext } from '@/contexts/EditorContext';
import { FrameData } from '@/types';
import { pixelateImage, PixelatorOptions, DEFAULT_PIXELATOR_OPTIONS } from '@/lib/pixelator';
import styles from './PixelationPanel.module.css';

interface PixelationPanelProps {
  frames: FrameData[];
  selectedIds: Set<string>;
  currentPreviewFrame: FrameData | null;
  onFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
}

export function PixelationPanel({
  frames,
  selectedIds,
  currentPreviewFrame,
  onFramesProcessed,
}: PixelationPanelProps) {
  const ctx = useOptionalEditorContext();
  const [isApplying, setIsApplying] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Local fallback states
  const [localEnabled, setLocalEnabled] = useState(true);
  const [localPixelSize, setLocalPixelSize] = useState(8);
  const [localPalette, setLocalPalette] = useState<PixelatorOptions['palette']>('none');
  const [localDitherType, setLocalDitherType] = useState<PixelatorOptions['ditherType']>('none');
  const [localDitherAmount, setLocalDitherAmount] = useState(50);
  const [localPixelShape, setLocalPixelShape] = useState<PixelatorOptions['pixelShape']>('square');
  const [localOutlineEnabled, setLocalOutlineEnabled] = useState(false);
  const [localOutlineColor, setLocalOutlineColor] = useState('#000000');
  const [localOutlineThickness, setLocalOutlineThickness] = useState(1);
  const [localContrast, setLocalContrast] = useState(0);
  const [localSaturation, setLocalSaturation] = useState(0);
  const [localBrightness, setLocalBrightness] = useState(0);

  // New Advanced Quantization states (Local to Pixelation Panel)
  const [quantizationType, setQuantizationType] = useState<Required<PixelatorOptions>['quantizationType']>('none');
  const [quantizeUsePixelated, setQuantizeUsePixelated] = useState(false);
  const [quantizeQuality, setQuantizeQuality] = useState(2);
  const [quantizeNumColors, setQuantizeNumColors] = useState(32);
  const [quantizeGamma, setQuantizeGamma] = useState(1.0);
  const [quantizeForceColors, setQuantizeForceColors] = useState<Required<PixelatorOptions>['quantizeForceColors']>('none');
  const [quantizeUseRangeAdaptive, setQuantizeUseRangeAdaptive] = useState(false);
  const [quantizeColorsPerChannel, setQuantizeColorsPerChannel] = useState(256);
  const [quantizeLUTPreset, setQuantizeLUTPreset] = useState<Required<PixelatorOptions>['quantizeLUTPreset']>('none');

  // Bind to context if present, otherwise fall back to local
  const enabled = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.enabled : localEnabled;
  const setEnabled = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setEnabled : setLocalEnabled;
  
  const pixelSize = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.pixelSize : localPixelSize;
  const setPixelSize = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setPixelSize : setLocalPixelSize;

  const palette = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.palette : localPalette;
  const setPalette = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setPalette : setLocalPalette;

  const ditherType = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.ditherType : localDitherType;
  const setDitherType = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setDitherType : setLocalDitherType;

  const ditherAmount = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.ditherAmount : localDitherAmount;
  const setDitherAmount = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setDitherAmount : setLocalDitherAmount;

  const pixelShape = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.pixelShape : localPixelShape;
  const setPixelShape = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setPixelShape : setLocalPixelShape;

  const outlineEnabled = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.outlineEnabled : localOutlineEnabled;
  const setOutlineEnabled = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setOutlineEnabled : setLocalOutlineEnabled;

  const outlineColor = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.outlineColor : localOutlineColor;
  const setOutlineColor = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setOutlineColor : setLocalOutlineColor;

  const outlineThickness = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.outlineThickness : localOutlineThickness;
  const setOutlineThickness = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setOutlineThickness : setLocalOutlineThickness;

  const contrast = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.contrast : localContrast;
  const setContrast = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setContrast : setLocalContrast;

  const saturation = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.saturation : localSaturation;
  const setSaturation = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setSaturation : setLocalSaturation;

  const brightness = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.brightness : localBrightness;
  const setBrightness = ctx?.activePixelatorOptions ? ctx.activePixelatorOptions.setBrightness : setLocalBrightness;

  // Active frame selection
  const framesToProcess = frames.filter(f => 
    selectedIds.size === 0 || selectedIds.has(f.id)
  );

  // Dynamic canvas preview update
  useEffect(() => {
    let active = true;
    let processedBitmap: ImageBitmap | null = null;

    const updatePreview = async () => {
      const canvas = previewCanvasRef.current;
      if (!canvas || !currentPreviewFrame?.bitmap) return;

      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;

      try {
        if (currentPreviewFrame.bitmap.width === 0) return;

        let displayBitmap = currentPreviewFrame.bitmap;

        // Apply pixelation effect if enabled
        if (enabled) {
          displayBitmap = await pixelateImage(currentPreviewFrame.bitmap, {
            enabled: true,
            pixelSize,
            palette,
            ditherType,
            ditherAmount,
            pixelShape,
            outlineEnabled,
            outlineColor,
            outlineThickness,
            contrast,
            saturation,
            brightness,
            // Advanced settings injection
            quantizationType,
            quantizeUsePixelated,
            quantizeQuality,
            quantizeNumColors,
            quantizeGamma,
            quantizeForceColors,
            quantizeUseRangeAdaptive,
            quantizeColorsPerChannel,
            quantizeLUTPreset,
          });
          processedBitmap = displayBitmap;
        }

        if (!active) {
          if (processedBitmap && processedBitmap !== currentPreviewFrame.bitmap) {
            processedBitmap.close();
          }
          return;
        }

        // Maintain canvas aspect ratio
        const maxSize = 220;
        const scale = Math.min(maxSize / displayBitmap.width, maxSize / displayBitmap.height);
        canvas.width = displayBitmap.width * scale;
        canvas.height = displayBitmap.height * scale;

        // Checkerboard transparency background
        const tileSize = 8;
        for (let y = 0; y < canvas.height; y += tileSize) {
          for (let x = 0; x < canvas.width; x += tileSize) {
            ctx2d.fillStyle = ((x / tileSize + y / tileSize) % 2) ? '#1f1f38' : '#14142b';
            ctx2d.fillRect(x, y, tileSize, tileSize);
          }
        }

        // Draw the processed preview
        ctx2d.drawImage(displayBitmap, 0, 0, canvas.width, canvas.height);

        // Keep local reference clean
        if (displayBitmap !== currentPreviewFrame.bitmap) {
          displayBitmap.close();
          processedBitmap = null;
        }
      } catch (error) {
        // Safe catch for closed bitmaps on rapid slide updates
      }
    };

    updatePreview();

    return () => {
      active = false;
      if (processedBitmap) {
        processedBitmap.close();
      }
    };
  }, [
    currentPreviewFrame,
    enabled,
    pixelSize,
    palette,
    ditherType,
    ditherAmount,
    pixelShape,
    outlineEnabled,
    outlineColor,
    outlineThickness,
    contrast,
    saturation,
    brightness,
    quantizationType,
    quantizeUsePixelated,
    quantizeQuality,
    quantizeNumColors,
    quantizeGamma,
    quantizeForceColors,
    quantizeUseRangeAdaptive,
    quantizeColorsPerChannel,
    quantizeLUTPreset,
  ]);

  // Bulk process and apply
  const handleApply = useCallback(async () => {
    if (framesToProcess.length === 0 || !enabled) return;

    setIsApplying(true);
    const processedFrames = new Map<string, ImageBitmap>();

    const options: PixelatorOptions = {
      enabled: true,
      pixelSize,
      palette,
      ditherType,
      ditherAmount,
      pixelShape,
      outlineEnabled,
      outlineColor,
      outlineThickness,
      contrast,
      saturation,
      brightness,
      // Advanced settings injection
      quantizationType,
      quantizeUsePixelated,
      quantizeQuality,
      quantizeNumColors,
      quantizeGamma,
      quantizeForceColors,
      quantizeUseRangeAdaptive,
      quantizeColorsPerChannel,
      quantizeLUTPreset,
    };

    try {
      for (const frame of framesToProcess) {
        const processed = await pixelateImage(frame.bitmap, options);
        processedFrames.set(frame.id, processed);
      }

      onFramesProcessed(processedFrames);
    } catch (error) {
      console.error('Pixelation process failed:', error);
      alert('Failed to apply pixelation to frames.');
    } finally {
      setIsApplying(false);
    }
  }, [
    framesToProcess,
    enabled,
    pixelSize,
    palette,
    ditherType,
    ditherAmount,
    pixelShape,
    outlineEnabled,
    outlineColor,
    outlineThickness,
    contrast,
    saturation,
    brightness,
    quantizationType,
    quantizeUsePixelated,
    quantizeQuality,
    quantizeNumColors,
    quantizeGamma,
    quantizeForceColors,
    quantizeUseRangeAdaptive,
    quantizeColorsPerChannel,
    quantizeLUTPreset,
    onFramesProcessed,
  ]);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Sprite Pixelator</h3>

      {/* Real-time Preview Area */}
      <div className={styles.previewSection}>
        <canvas ref={previewCanvasRef} className={styles.previewCanvas} />
        {!currentPreviewFrame && (
          <div className={styles.noPreview}>Select a frame to preview pixelation</div>
        )}
      </div>

      <div className={styles.scrollableSettings}>
        <div className={styles.checkboxRow}>
          <input
            type="checkbox"
            id="pixelator-enable"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={isApplying}
          />
          <label htmlFor="pixelator-enable">Enable Pixelation Filter</label>
        </div>

        {enabled && (
          <div className={styles.settingsGrid}>
            
            {/* 1. Core Scaling Options */}
            <div className={styles.sectionHeader}>Grid & Sizing</div>
            
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <span className={styles.label}>Pixel Size</span>
                <span className={styles.valueBadge}>{pixelSize}px</span>
              </div>
              <input
                type="range"
                min="1"
                max="32"
                value={pixelSize}
                onChange={(e) => setPixelSize(Number(e.target.value))}
                className={styles.slider}
                disabled={isApplying}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Pixel Style Shape</label>
              <select
                value={pixelShape}
                onChange={(e) => setPixelShape(e.target.value as PixelatorOptions['pixelShape'])}
                className={styles.select}
                disabled={isApplying}
              >
                <option value="square">Square Blocks (Standard)</option>
                <option value="circle">Circular Dots (LED Screen)</option>
                <option value="diamond">Diamond Grids (Cross Stitch)</option>
              </select>
            </div>

            {/* 2. Color Depth & Dithering */}
            <div className={styles.sectionHeader}>Quantization & Color Reduction</div>

            <div className={styles.field}>
              <label className={styles.label}>Quantization Type</label>
              <select
                value={quantizationType}
                onChange={(e) => setQuantizationType(e.target.value as any)}
                className={styles.select}
                disabled={isApplying}
              >
                <option value="none">None (Standard Preset Palette)</option>
                <option value="custom">Generate Custom Palette</option>
                <option value="per-channel">Per Channel</option>
                <option value="lut">Lookup Table</option>
              </select>
            </div>

            {/* IF None: show preset palette selector */}
            {quantizationType === 'none' && (
              <div className={styles.field}>
                <label className={styles.label}>Color System Palette</label>
                <select
                  value={palette}
                  onChange={(e) => setPalette(e.target.value as PixelatorOptions['palette'])}
                  className={styles.select}
                  disabled={isApplying}
                >
                  <option value="none">True Color (No Palette Limit)</option>
                  <option value="pico8">PICO-8 Console (16 Colors)</option>
                  <option value="gameboy">Original GameBoy Green (4 Colors)</option>
                  <option value="gameboy-color">GameBoy Color (24 Colors)</option>
                  <option value="c64">Commodore 64 (16 Colors)</option>
                  <option value="nes">Classic NES Console (42 Colors)</option>
                </select>
              </div>
            )}

            {/* IF Custom: show Dynamic Palette generation controls */}
            {quantizationType === 'custom' && (
              <div className={styles.subSettings} style={{ gridColumn: 'span 2' }}>
                <div className={styles.checkboxRow} style={{ marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    id="quantize-use-pixelated"
                    checked={quantizeUsePixelated}
                    onChange={(e) => setQuantizeUsePixelated(e.target.checked)}
                    disabled={isApplying}
                  />
                  <label htmlFor="quantize-use-pixelated">Use Pixelated Texture for Quantizing</label>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Color Mode</label>
                  <select className={styles.select} disabled={true}>
                    <option value="RGB">RGB</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Subsampling Quality</span>
                    <span className={styles.valueBadge}>{quantizeQuality === 1 ? 'High (1x)' : `${quantizeQuality}x`}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={quantizeQuality}
                    onChange={(e) => setQuantizeQuality(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isApplying}
                  />
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Number of Colors</span>
                    <span className={styles.valueBadge}>{quantizeNumColors} colors</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="256"
                    step="8"
                    value={quantizeNumColors}
                    onChange={(e) => setQuantizeNumColors(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isApplying}
                  />
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Gamma Adjust</span>
                    <span className={styles.valueBadge}>{quantizeGamma.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={quantizeGamma}
                    onChange={(e) => setQuantizeGamma(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isApplying}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Force Colors</label>
                  <select
                    value={quantizeForceColors}
                    onChange={(e) => setQuantizeForceColors(e.target.value as any)}
                    className={styles.select}
                    disabled={isApplying}
                  >
                    <option value="none">None</option>
                    <option value="black-white">Force Black & White</option>
                    <option value="nes-anchors">Force NES Anchors</option>
                  </select>
                </div>
              </div>
            )}

            {/* IF Per-Channel: show color bit parameters */}
            {quantizationType === 'per-channel' && (
              <div className={styles.subSettings} style={{ gridColumn: 'span 2' }}>
                <div className={styles.checkboxRow} style={{ marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    id="quantize-range-adaptive"
                    checked={quantizeUseRangeAdaptive}
                    onChange={(e) => setQuantizeUseRangeAdaptive(e.target.checked)}
                    disabled={isApplying}
                  />
                  <label htmlFor="quantize-range-adaptive">Use Range Adaptive Mode</label>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Color Mode</label>
                  <select className={styles.select} disabled={true}>
                    <option value="ColorsPerChannel">Colors Per Channel</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Colors Per Channel</span>
                    <span className={styles.valueBadge}>{quantizeColorsPerChannel}</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="256"
                    value={quantizeColorsPerChannel}
                    onChange={(e) => setQuantizeColorsPerChannel(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isApplying}
                  />
                </div>
              </div>
            )}

            {/* IF Lookup Table: show presets */}
            {quantizationType === 'lut' && (
              <div className={styles.subSettings} style={{ gridColumn: 'span 2' }}>
                <div className={styles.field}>
                  <label className={styles.label}>Hardware Preset LUT</label>
                  <select
                    value={quantizeLUTPreset}
                    onChange={(e) => setQuantizeLUTPreset(e.target.value as any)}
                    className={styles.select}
                    disabled={isApplying}
                  >
                    <option value="none">Default LUT (None)</option>
                    <option value="amiga-12bit">Amiga OCS (12-bit, 4096 colors)</option>
                    <option value="sega-md">Sega Mega Drive (9-bit analog)</option>
                    <option value="psx-15bit">Sony PlayStation (15-bit, 32768 colors)</option>
                    <option value="pc98">PC-98 analog color space</option>
                  </select>
                </div>
              </div>
            )}

            {/* Dither Selector — always visible when filter is active */}
            <>
              <div className={styles.sectionHeader}>Dithering Engine</div>
              <div className={styles.field}>
                <label className={styles.label}>Dither Type</label>
                <select
                  value={ditherType}
                  onChange={(e) => setDitherType(e.target.value as any)}
                  className={styles.select}
                  disabled={isApplying}
                >
                  <option value="none">Solid Color Matching (Flat)</option>
                  <option value="white-noise">White Noise Dither</option>
                  <option value="blue-noise">Blue Noise Dither</option>
                  <option value="bayer2x2">Bayer 2x2 Ordered Dither</option>
                  <option value="bayer4x4">Bayer 4x4 Ordered Dither</option>
                  <option value="bayer8x8">Bayer 8x8 Ordered Dither</option>
                  <option value="pattern">Pattern Ordered Dither</option>
                  <option value="floyd-steinberg">Floyd-Steinberg Error Diffusion</option>
                </select>
              </div>

              {ditherType !== 'none' && (
                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Dither Intensity</span>
                    <span className={styles.valueBadge}>{ditherAmount}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={ditherAmount}
                    onChange={(e) => setDitherAmount(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isApplying}
                  />
                </div>
              )}
            </>

            {/* 3. Sprite Outline Sharpness */}
            <div className={styles.sectionHeader}>Edges & Outlines</div>

            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                id="pixelator-outline"
                checked={outlineEnabled}
                onChange={(e) => setOutlineEnabled(e.target.checked)}
                disabled={isApplying}
              />
              <label htmlFor="pixelator-outline">Outline Silhouette</label>
            </div>

            {outlineEnabled && (
              <div className={styles.subSettings}>
                <div className={styles.fieldInline}>
                  <label className={styles.label}>Color</label>
                  <input
                    type="color"
                    value={outlineColor}
                    onChange={(e) => setOutlineColor(e.target.value)}
                    className={styles.colorPicker}
                    disabled={isApplying}
                  />
                </div>

                <div className={styles.field}>
                  <div className={styles.labelRow}>
                    <span className={styles.label}>Thickness</span>
                    <span className={styles.valueBadge}>{outlineThickness}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={outlineThickness}
                    onChange={(e) => setOutlineThickness(Number(e.target.value))}
                    className={styles.slider}
                    disabled={isApplying}
                  />
                </div>
              </div>
            )}

            {/* 4. Color Grading Adjustments */}
            <div className={styles.sectionHeader}>Retro Enhancements</div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <span className={styles.label}>Saturation</span>
                <span className={styles.valueBadge}>{saturation > 0 ? `+${saturation}` : saturation}</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className={styles.slider}
                disabled={isApplying}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <span className={styles.label}>Contrast</span>
                <span className={styles.valueBadge}>{contrast > 0 ? `+${contrast}` : contrast}</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className={styles.slider}
                disabled={isApplying}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <span className={styles.label}>Brightness</span>
                <span className={styles.valueBadge}>{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className={styles.slider}
                disabled={isApplying}
              />
            </div>

          </div>
        )}
      </div>

      <button
        onClick={handleApply}
        className={styles.applyButton}
        disabled={isApplying || framesToProcess.length === 0 || !enabled}
      >
        {isApplying 
          ? 'Applying Pixelation...' 
          : `Apply to ${selectedIds.size > 0 ? selectedIds.size : 'All'} Sprite Frames`
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
