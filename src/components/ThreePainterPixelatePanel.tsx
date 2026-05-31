'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainterPixelatePanel.module.css';

function Section({ label, children, defaultOpen = true }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={9} strokeWidth={2.5} /> : <ChevronRight size={9} strokeWidth={2.5} />}
        <span>{label}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function SliderRow({ label, value, min, max, unit = '', displayValue, onChange, disabled = false }: {
  label: string; value: number; min: number; max: number;
  unit?: string; displayValue?: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className={`${styles.sliderRow} ${disabled ? styles.sliderRowDisabled : ''}`}>
      <span className={styles.sliderLabel}>{label}</span>
      <input type="range" className={styles.sliderTrack}
        min={min} max={max} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.sliderValue}>{displayValue ?? `${value}${unit}`}</span>
    </div>
  );
}

function SelectRow({ label, value, onChange, options, disabled = false }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className={`${styles.selectRow} ${disabled ? styles.sliderRowDisabled : ''}`}>
      <span className={styles.selectLabel}>{label}</span>
      <select className={styles.select} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <label className={styles.switch}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.switchSlider} />
      </label>
    </div>
  );
}

export function ThreePainterPixelatePanel() {
  const { pixelatorOptions, updatePixelatorOptions, psxEnabled, setPsxEnabled } = useThreePainterContext();
  const p = pixelatorOptions;

  return (
    <div className={styles.container}>

      {/* PSX */}
      <Section label="VIEWPORT">
        <ToggleRow label="PSX vertex jitter" checked={psxEnabled} onChange={(v) => setPsxEnabled(v)} />
      </Section>

      {/* Pixelation */}
      <Section label="PIXELATION">
        <ToggleRow label="Enabled" checked={p.enabled} onChange={(v) => updatePixelatorOptions({ enabled: v })} />
        <SliderRow label="Pixel size" value={p.pixelSize} min={1} max={32} unit="px"
          onChange={(v) => updatePixelatorOptions({ pixelSize: v })} disabled={!p.enabled} />
        <SelectRow label="Quantization" value={p.quantizationType || 'none'} disabled={!p.enabled}
          onChange={(v) => updatePixelatorOptions({ quantizationType: v as any })}
          options={[
            { value: 'none',        label: 'None (preset palette)' },
            { value: 'custom',      label: 'Custom Palette' },
            { value: 'per-channel', label: 'Per Channel' },
            { value: 'lut',         label: 'Lookup Table' },
          ]}
        />

        {/* Preset Palette if QuantizationType is None */}
        {p.enabled && (p.quantizationType || 'none') === 'none' && (
          <SelectRow label="Palette Preset" value={p.palette} disabled={!p.enabled}
            onChange={(v) => updatePixelatorOptions({ palette: v as any })}
            options={[
              { value: 'none',          label: 'None (True color)' },
              { value: 'pico8',         label: 'PICO-8 (16)' },
              { value: 'gameboy',       label: 'Game Boy (4)' },
              { value: 'gameboy-color', label: 'GBC LCD' },
              { value: 'nes',           label: 'NES (54)' },
              { value: 'c64',           label: 'C64 (16)' },
            ]}
          />
        )}

        {/* Generate Custom Palette sub-options */}
        {p.enabled && p.quantizationType === 'custom' && (
          <div style={{ paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid rgba(255,255,255,0.1)', margin: '4px 0 8px 4px' }}>
            <ToggleRow label="Use pixelated input" checked={p.quantizeUsePixelated || false}
              onChange={(v) => updatePixelatorOptions({ quantizeUsePixelated: v })} />
            <SliderRow label="Subsampling" value={p.quantizeQuality || 2} min={1} max={8} displayValue={`${p.quantizeQuality || 2}x`}
              onChange={(v) => updatePixelatorOptions({ quantizeQuality: v })} />
            <SliderRow label="Colors" value={p.quantizeNumColors || 32} min={8} max={256} displayValue={`${p.quantizeNumColors || 32} cols`}
              onChange={(v) => updatePixelatorOptions({ quantizeNumColors: v })} />
            <SliderRow label="Gamma Adjust" value={Math.round((p.quantizeGamma || 1.0) * 10)} min={5} max={20} displayValue={`${(p.quantizeGamma || 1.0).toFixed(1)}`}
              onChange={(v) => updatePixelatorOptions({ quantizeGamma: v / 10 })} />
            <SelectRow label="Force Anchors" value={p.quantizeForceColors || 'none'}
              onChange={(v) => updatePixelatorOptions({ quantizeForceColors: v as any })}
              options={[
                { value: 'none',        label: 'None' },
                { value: 'black-white', label: 'Force B&W' },
                { value: 'nes-anchors', label: 'Force NES Anchors' },
              ]}
            />
          </div>
        )}

        {/* Per Channel sub-options */}
        {p.enabled && p.quantizationType === 'per-channel' && (
          <div style={{ paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid rgba(255,255,255,0.1)', margin: '4px 0 8px 4px' }}>
            <ToggleRow label="Adaptive Range" checked={p.quantizeUseRangeAdaptive || false}
              onChange={(v) => updatePixelatorOptions({ quantizeUseRangeAdaptive: v })} />
            <SliderRow label="Colors/Channel" value={p.quantizeColorsPerChannel || 256} min={2} max={256} displayValue={`${p.quantizeColorsPerChannel || 256}`}
              onChange={(v) => updatePixelatorOptions({ quantizeColorsPerChannel: v })} />
          </div>
        )}

        {/* Lookup Table sub-options */}
        {p.enabled && p.quantizationType === 'lut' && (
          <div style={{ paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid rgba(255,255,255,0.1)', margin: '4px 0 8px 4px' }}>
            <SelectRow label="Hardware Preset" value={p.quantizeLUTPreset || 'none'}
              onChange={(v) => updatePixelatorOptions({ quantizeLUTPreset: v as any })}
              options={[
                { value: 'none',        label: 'Default LUT (None)' },
                { value: 'amiga-12bit', label: 'Amiga OCS (12-bit)' },
                { value: 'sega-md',     label: 'Sega Mega Drive' },
                { value: 'psx-15bit',   label: 'PlayStation (15-bit)' },
                { value: 'pc98',        label: 'PC-98 analog' },
              ]}
            />
          </div>
        )}

        <SelectRow label="Shape" value={p.pixelShape} disabled={!p.enabled}
          onChange={(v) => updatePixelatorOptions({ pixelShape: v as any })}
          options={[
            { value: 'square',  label: 'Square' },
            { value: 'circle',  label: 'Circle' },
            { value: 'diamond', label: 'Diamond' },
          ]}
        />
      </Section>

      {/* Dither Section — always visible when filter is active */}
      {p.enabled && (
        <Section label="DITHER">
          <SelectRow label="Method" value={p.ditherType}
            onChange={(v) => updatePixelatorOptions({ ditherType: v as any })}
            options={[
              { value: 'none',            label: 'None' },
              { value: 'white-noise',     label: 'White Noise' },
              { value: 'blue-noise',      label: 'Blue Noise' },
              { value: 'bayer2x2',        label: 'Bayer 2×2' },
              { value: 'bayer4x4',        label: 'Bayer 4×4' },
              { value: 'bayer8x8',        label: 'Bayer 8×8' },
              { value: 'pattern',         label: 'Pattern Ordered' },
              { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
            ]}
          />
          {p.ditherType !== 'none' && (
            <SliderRow label="Intensity" value={p.ditherAmount} min={0} max={100} unit="%"
              onChange={(v) => updatePixelatorOptions({ ditherAmount: v })} />
          )}
        </Section>
      )}

      {/* Color adjustments */}
      {p.enabled && (
        <Section label="COLOR" defaultOpen={false}>
          <SliderRow label="Contrast"
            value={p.contrast} min={-100} max={100}
            displayValue={`${p.contrast > 0 ? '+' : ''}${p.contrast}`}
            onChange={(v) => updatePixelatorOptions({ contrast: v })} />
          <SliderRow label="Saturation"
            value={p.saturation} min={-100} max={100}
            displayValue={`${p.saturation > 0 ? '+' : ''}${p.saturation}`}
            onChange={(v) => updatePixelatorOptions({ saturation: v })} />
          <SliderRow label="Brightness"
            value={p.brightness} min={-100} max={100}
            displayValue={`${p.brightness > 0 ? '+' : ''}${p.brightness}`}
            onChange={(v) => updatePixelatorOptions({ brightness: v })} />
        </Section>
      )}

      {/* Outline */}
      {p.enabled && (
        <Section label="OUTLINE" defaultOpen={false}>
          <ToggleRow label="Enabled" checked={p.outlineEnabled}
            onChange={(v) => updatePixelatorOptions({ outlineEnabled: v })} />
          {p.outlineEnabled && (
            <>
              <div className={styles.colorRow}>
                <span className={styles.sliderLabel}>Color</span>
                <input type="color" className={styles.colorSwatch}
                  value={p.outlineColor}
                  onChange={(e) => updatePixelatorOptions({ outlineColor: e.target.value })} />
                <span className={styles.hexVal}>{p.outlineColor.toUpperCase()}</span>
              </div>
              <SliderRow label="Thickness" value={p.outlineThickness} min={1} max={5} unit="px"
                onChange={(v) => updatePixelatorOptions({ outlineThickness: v })} />
            </>
          )}
        </Section>
      )}

    </div>
  );
}
