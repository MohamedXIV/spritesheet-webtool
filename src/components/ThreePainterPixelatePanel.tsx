'use client';

import React from 'react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainterPixelatePanel.module.css';

export function ThreePainterPixelatePanel() {
  const {
    pixelatorOptions,
    updatePixelatorOptions,
    psxEnabled,
    setPsxEnabled,
  } = useThreePainterContext();

  const handleTogglePixelator = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ enabled: e.target.checked });
  };

  const handleChangePixelSize = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ pixelSize: parseInt(e.target.value) });
  };

  const handleChangePalette = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updatePixelatorOptions({ palette: e.target.value as any });
  };

  const handleChangeDither = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updatePixelatorOptions({ ditherType: e.target.value as any });
  };

  const handleChangeDitherAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ ditherAmount: parseInt(e.target.value) });
  };

  const handleChangeShape = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updatePixelatorOptions({ pixelShape: e.target.value as any });
  };

  const handleChangeOutline = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ outlineEnabled: e.target.checked });
  };

  const handleChangeOutlineColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ outlineColor: e.target.value });
  };

  const handleChangeOutlineThickness = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ outlineThickness: parseInt(e.target.value) });
  };

  const handleChangeContrast = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ contrast: parseInt(e.target.value) });
  };

  const handleChangeSaturation = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ saturation: parseInt(e.target.value) });
  };

  const handleChangeBrightness = (e: React.ChangeEvent<HTMLInputElement>) => {
    updatePixelatorOptions({ brightness: parseInt(e.target.value) });
  };

  return (
    <div className={styles.container}>
      {/* 1. Viewport Shader Emulation (PSX Viewport Jitter) */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>PSX Viewport Emulation</h4>
        <div className={styles.toggleRow}>
          <div className={styles.toggleText}>
            <span>Retro Console Viewport</span>
            <p>Emulate wobbly textures and jittery geometry in the 3D preview.</p>
          </div>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={psxEnabled}
              onChange={(e) => setPsxEnabled(e.target.checked)}
            />
            <span className={styles.switchSlider}></span>
          </label>
        </div>
      </div>

      {/* 2. Texture Pixelation Filters */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Texture Pixelation</h4>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={pixelatorOptions.enabled}
              onChange={handleTogglePixelator}
            />
            <span className={styles.switchSlider}></span>
          </label>
        </div>

        {pixelatorOptions.enabled && (
          <div className={styles.controlsList}>
            {/* Pixel Size Slider */}
            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Pixel Downscale Size</span>
                <strong>{pixelatorOptions.pixelSize}x</strong>
              </div>
              <input
                type="range"
                min="1"
                max="32"
                value={pixelatorOptions.pixelSize}
                onChange={handleChangePixelSize}
                className={styles.slider}
              />
            </div>

            {/* Retro Color Palette Selection */}
            <div className={styles.controlRow}>
              <label>Color Palette</label>
              <select
                className={styles.select}
                value={pixelatorOptions.palette}
                onChange={handleChangePalette}
              >
                <option value="none">None (True Color)</option>
                <option value="pico8">PICO-8 (16 Colors)</option>
                <option value="gameboy">Original GameBoy (4 Green Tones)</option>
                <option value="gameboy-color">GameBoy Color (Retro LCD)</option>
                <option value="nes">NES Preset (54 Colors)</option>
                <option value="c64">Commodore 64 (16 Colors)</option>
              </select>
            </div>

            {/* Dither Controls */}
            {pixelatorOptions.palette !== 'none' && (
              <>
                <div className={styles.controlRow}>
                  <label>Dither Model</label>
                  <select
                    className={styles.select}
                    value={pixelatorOptions.ditherType}
                    onChange={handleChangeDither}
                  >
                    <option value="none">None (Solid Quantization)</option>
                    <option value="bayer4x4">Bayer Ordered Matrix (4x4)</option>
                    <option value="bayer8x8">Bayer Ordered Matrix (8x8)</option>
                    <option value="floyd-steinberg">Floyd-Steinberg (Error Diffusion)</option>
                  </select>
                </div>

                {pixelatorOptions.ditherType !== 'none' && (
                  <div className={styles.sliderGroup}>
                    <div className={styles.sliderLabelRow}>
                      <span>Dither Intensity</span>
                      <strong>{pixelatorOptions.ditherAmount}%</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={pixelatorOptions.ditherAmount}
                      onChange={handleChangeDitherAmount}
                      className={styles.slider}
                    />
                  </div>
                )}
              </>
            )}

            {/* Pixel Shape */}
            <div className={styles.controlRow}>
              <label>Pixel Render Shape</label>
              <select
                className={styles.select}
                value={pixelatorOptions.pixelShape}
                onChange={handleChangeShape}
              >
                <option value="square">Square Blocks (Classic)</option>
                <option value="circle">Circles Dots (Sieve Look)</option>
                <option value="diamond">Diamonds Grid (Diagonal)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 3. Color Balance adjustments */}
      {pixelatorOptions.enabled && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Texture Color Adjustments</h4>
          <div className={styles.controlsList}>
            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Contrast</span>
                <strong>{pixelatorOptions.contrast > 0 ? '+' : ''}{pixelatorOptions.contrast}</strong>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={pixelatorOptions.contrast}
                onChange={handleChangeContrast}
                className={styles.slider}
              />
            </div>

            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Saturation</span>
                <strong>{pixelatorOptions.saturation > 0 ? '+' : ''}{pixelatorOptions.saturation}</strong>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={pixelatorOptions.saturation}
                onChange={handleChangeSaturation}
                className={styles.slider}
              />
            </div>

            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabelRow}>
                <span>Brightness</span>
                <strong>{pixelatorOptions.brightness > 0 ? '+' : ''}{pixelatorOptions.brightness}</strong>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={pixelatorOptions.brightness}
                onChange={handleChangeBrightness}
                className={styles.slider}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Sharp Outline Stroke */}
      {pixelatorOptions.enabled && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Silhouette Outline</h4>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={pixelatorOptions.outlineEnabled}
                onChange={handleChangeOutline}
              />
              <span className={styles.switchSlider}></span>
            </label>
          </div>

          {pixelatorOptions.outlineEnabled && (
            <div className={styles.controlsList} style={{ marginTop: '10px' }}>
              <div className={styles.controlRow}>
                <label>Outline Color</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    className={styles.outlineColorPicker}
                    value={pixelatorOptions.outlineColor}
                    onChange={handleChangeOutlineColor}
                  />
                  <span className={styles.hexCode}>{pixelatorOptions.outlineColor.toUpperCase()}</span>
                </div>
              </div>

              <div className={styles.sliderGroup}>
                <div className={styles.sliderLabelRow}>
                  <span>Stroke Thickness</span>
                  <strong>{pixelatorOptions.outlineThickness}px</strong>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={pixelatorOptions.outlineThickness}
                  onChange={handleChangeOutlineThickness}
                  className={styles.slider}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
