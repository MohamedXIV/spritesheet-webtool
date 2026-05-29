'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import { useThreePainterContext, ShadingMode } from '@/contexts/ThreePainterContext';
import { LIGHTING_PRESETS, LightingSettings } from '@/lib/lightingPresets';
import styles from './LightingPanel.module.css';

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

function SliderRow({ label, value, min, max, step = 1, unit = '', onChange, disabled = false }: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className={`${styles.sliderRow} ${disabled ? styles.sliderRowDisabled : ''}`}>
      <span className={styles.sliderLabel}>{label}</span>
      <input type="range" className={styles.sliderTrack}
        min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.sliderValue}>{value}{unit}</span>
    </div>
  );
}

function LightRow({ label, color, intensity, enabled, onToggle, onColor, onIntensity }: {
  label: string; color: string; intensity: number; enabled: boolean;
  onToggle: () => void; onColor: (c: string) => void; onIntensity: (v: number) => void;
}) {
  return (
    <div className={`${styles.lightRow} ${!enabled ? styles.lightRowOff : ''}`}>
      <button className={`${styles.lightToggle} ${enabled ? styles.lightToggleOn : ''}`}
        onClick={onToggle} title={enabled ? 'Disable' : 'Enable'}>
        <Lightbulb size={9} />
      </button>
      <span className={styles.lightLabel}>{label}</span>
      <input type="color" className={styles.lightColor} value={color} disabled={!enabled}
        onChange={(e) => onColor(e.target.value)} />
      <input type="range" className={styles.sliderTrack}
        min={0} max={2} step={0.05} value={intensity} disabled={!enabled}
        onChange={(e) => onIntensity(Number(e.target.value))} style={{ flex: 1 }} />
      <span className={styles.sliderValue}>{intensity.toFixed(1)}</span>
    </div>
  );
}

const SHADING_MODES: { value: ShadingMode; label: string; hint: string }[] = [
  { value: 'unlit',    label: 'Unlit',  hint: 'Flat / pixel art' },
  { value: 'matcap',  label: 'Matcap', hint: 'Anime / hand-painted' },
  { value: 'toon',    label: 'Toon',   hint: 'Cel-shaded' },
  { value: 'standard', label: 'PBR',   hint: 'Physically-based' },
];

export function LightingPanel() {
  const {
    painter, shadingMode, setShadingMode,
    activeLightingPresetId, setActiveLightingPresetId,
    lightingSettings, updateLightingSettings, psxEnabled,
  } = useThreePainterContext();

  const [local, setLocal] = useState<LightingSettings>(lightingSettings);
  const [toonSteps, setToonSteps] = useState(3);

  useEffect(() => { setLocal(lightingSettings); }, [lightingSettings]);

  const commit = (patch: Partial<LightingSettings>) => {
    const next = { ...local, ...patch } as LightingSettings;
    setLocal(next);
    updateLightingSettings(next);
    painter?.setLightingSettings(next);
  };

  const handlePreset = (id: string) => {
    setActiveLightingPresetId(id);
    painter?.applyLightingPreset(id);
    const preset = LIGHTING_PRESETS.find(p => p.id === id);
    if (preset) { setLocal(preset.settings); updateLightingSettings(preset.settings); }
  };

  const handleShadingMode = (mode: ShadingMode) => {
    setShadingMode(mode);
    painter?.setShadingMode(mode);
  };

  const handleToonSteps = (v: number) => {
    setToonSteps(v);
    painter?.setToonSteps(v);
  };

  const needsLights = (shadingMode === 'toon' || shadingMode === 'standard') && !psxEnabled;

  return (
    <div className={styles.container}>

      <Section label="SHADING MODE">
        <div className={styles.modeGrid}>
          {SHADING_MODES.map(({ value, label, hint }) => (
            <button key={value}
              className={`${styles.modeBtn} ${shadingMode === value && !psxEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => handleShadingMode(value)} title={hint} disabled={psxEnabled}>
              {label}
            </button>
          ))}
        </div>
        {psxEnabled && <p className={styles.psxNote}>PSX shader active — shading mode overridden</p>}
      </Section>

      <Section label="PRESET">
        <div className={styles.presetGrid}>
          {LIGHTING_PRESETS.map(p => (
            <button key={p.id}
              className={`${styles.presetBtn} ${activeLightingPresetId === p.id ? styles.presetBtnActive : ''}`}
              onClick={() => handlePreset(p.id)} title={`Suggested: ${p.suggestedMode}`}>
              {p.name}
            </button>
          ))}
        </div>
      </Section>

      <Section label="AMBIENT" defaultOpen={needsLights}>
        <div className={styles.ambientRow}>
          <input type="color" className={styles.lightColor} value={local.ambient.color}
            onChange={(e) => commit({ ambient: { ...local.ambient, color: e.target.value } })} />
          <input type="range" className={styles.sliderTrack} min={0} max={2} step={0.05}
            value={local.ambient.intensity} style={{ flex: 1 }}
            onChange={(e) => commit({ ambient: { ...local.ambient, intensity: Number(e.target.value) } })} />
          <span className={styles.sliderValue}>{local.ambient.intensity.toFixed(1)}</span>
        </div>
      </Section>

      <Section label="LIGHTS" defaultOpen={needsLights}>
        {!needsLights && (
          <p className={styles.noLightsNote}>
            Switch to <strong>Toon</strong> or <strong>PBR</strong> to use directional lights.
          </p>
        )}
        <LightRow label="Key" color={local.key.color} intensity={local.key.intensity} enabled={local.key.enabled}
          onToggle={() => commit({ key: { ...local.key, enabled: !local.key.enabled } })}
          onColor={(c) => commit({ key: { ...local.key, color: c } })}
          onIntensity={(v) => commit({ key: { ...local.key, intensity: v } })} />
        <SliderRow label="Azimuth"   value={local.key.azimuth}   min={0}   max={360} unit="°" disabled={!local.key.enabled} onChange={(v) => commit({ key: { ...local.key, azimuth: v } })} />
        <SliderRow label="Elevation" value={local.key.elevation} min={-90} max={90}  unit="°" disabled={!local.key.enabled} onChange={(v) => commit({ key: { ...local.key, elevation: v } })} />
        <div className={styles.lightDivider} />
        <LightRow label="Fill" color={local.fill.color} intensity={local.fill.intensity} enabled={local.fill.enabled}
          onToggle={() => commit({ fill: { ...local.fill, enabled: !local.fill.enabled } })}
          onColor={(c) => commit({ fill: { ...local.fill, color: c } })}
          onIntensity={(v) => commit({ fill: { ...local.fill, intensity: v } })} />
        <SliderRow label="Azimuth"   value={local.fill.azimuth}   min={0}   max={360} unit="°" disabled={!local.fill.enabled} onChange={(v) => commit({ fill: { ...local.fill, azimuth: v } })} />
        <SliderRow label="Elevation" value={local.fill.elevation} min={-90} max={90}  unit="°" disabled={!local.fill.enabled} onChange={(v) => commit({ fill: { ...local.fill, elevation: v } })} />
        <div className={styles.lightDivider} />
        <LightRow label="Rim" color={local.rim.color} intensity={local.rim.intensity} enabled={local.rim.enabled}
          onToggle={() => commit({ rim: { ...local.rim, enabled: !local.rim.enabled } })}
          onColor={(c) => commit({ rim: { ...local.rim, color: c } })}
          onIntensity={(v) => commit({ rim: { ...local.rim, intensity: v } })} />
        <SliderRow label="Azimuth"   value={local.rim.azimuth}   min={0}   max={360} unit="°" disabled={!local.rim.enabled} onChange={(v) => commit({ rim: { ...local.rim, azimuth: v } })} />
        <SliderRow label="Elevation" value={local.rim.elevation} min={-90} max={90}  unit="°" disabled={!local.rim.enabled} onChange={(v) => commit({ rim: { ...local.rim, elevation: v } })} />
      </Section>

      {shadingMode === 'toon' && !psxEnabled && (
        <Section label="TOON">
          <SliderRow label="Bands" value={toonSteps} min={2} max={5} onChange={handleToonSteps} />
          <p className={styles.toonHint}>2 = hard manga &nbsp;·&nbsp; 5 = soft gradient</p>
        </Section>
      )}

    </div>
  );
}
