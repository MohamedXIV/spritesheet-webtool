'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight, Upload, X, ImageIcon } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import { MapSlot, MapIntensitySlot } from '@/lib/threePainter';
import styles from './TextureMapsPanel.module.css';

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, children, defaultOpen = true, badge }: {
  label: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={9} strokeWidth={2.5} /> : <ChevronRight size={9} strokeWidth={2.5} />}
        <span>{label}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ── Slider Row ────────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step = 0.01, unit = '', onChange }: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <input type="range" className={styles.sliderTrack}
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className={styles.sliderValue}>{value.toFixed(2)}{unit}</span>
    </div>
  );
}

// ── Map Slot ──────────────────────────────────────────────────────────────────

interface MapSlotState {
  objectUrl: string | null;
  fileName: string | null;
}

function useMapSlot(slot: MapSlot, painter: ReturnType<typeof useThreePainterContext>['painter']) {
  const [state, setState] = useState<MapSlotState>({ objectUrl: null, fileName: null });
  const prevUrl = useRef<string | null>(null);

  const load = (file: File) => {
    // Revoke previous URL
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const url = URL.createObjectURL(file);
    prevUrl.current = url;
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      painter?.setMap(slot, tex);
    });
    setState({ objectUrl: url, fileName: file.name });
  };

  const clear = () => {
    if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = null; }
    painter?.setMap(slot, null);
    setState({ objectUrl: null, fileName: null });
  };

  // Cleanup on unmount
  useEffect(() => () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); }, []);

  return { ...state, load, clear };
}

function DropZone({ slot, painter, children }: {
  slot: MapSlot;
  painter: ReturnType<typeof useThreePainterContext>['painter'];
  children: (props: ReturnType<typeof useMapSlot>) => React.ReactNode;
}) {
  const state = useMapSlot(slot, painter);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) state.load(file);
  };

  return (
    <div
      className={`${styles.dropZone} ${dragging ? styles.dropZoneDrag : ''} ${state.objectUrl ? styles.dropZoneLoaded : ''}`}
      onClick={() => !state.objectUrl && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
    >
      <input ref={inputRef} type="file" accept="image/*" className={styles.hiddenInput}
        onChange={(e) => handleFiles(e.target.files)} />

      {state.objectUrl ? (
        <div className={styles.thumbRow}>
          <img src={state.objectUrl} alt={state.fileName ?? ''} className={styles.thumb} />
          <div className={styles.thumbMeta}>
            <span className={styles.thumbName}>{state.fileName}</span>
            <button className={styles.thumbClear} onClick={(e) => { e.stopPropagation(); state.clear(); }} title="Remove">
              <X size={9} />
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.dropPlaceholder}>
          <Upload size={13} className={styles.dropIcon} />
          <span>Drop image or click</span>
        </div>
      )}
    </div>
  );

  void children; // used below via composition
}

// Composed slot: DropZone + its controls
function MapSlotSection({
  label, slot, badge, painter, controls,
}: {
  label: string;
  slot: MapSlot;
  badge?: string;
  painter: ReturnType<typeof useThreePainterContext>['painter'];
  controls?: React.ReactNode;
}) {
  const state = useMapSlot(slot, painter);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) state.load(file);
  };

  return (
    <Section label={label} badge={badge}>
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropZoneDrag : ''} ${state.objectUrl ? styles.dropZoneLoaded : ''}`}
        onClick={() => !state.objectUrl && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" accept="image/*" className={styles.hiddenInput}
          onChange={(e) => handleFiles(e.target.files)} />

        {state.objectUrl ? (
          <div className={styles.thumbRow}>
            <img src={state.objectUrl} alt={state.fileName ?? ''} className={styles.thumb} />
            <div className={styles.thumbMeta}>
              <span className={styles.thumbName}>{state.fileName}</span>
              <button className={styles.clearBtn} onClick={(e) => { e.stopPropagation(); state.clear(); }} title="Remove map">
                <X size={9} /> Clear
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.dropPlaceholder}>
            <Upload size={13} className={styles.dropIcon} />
            <span>Drop image or click to browse</span>
          </div>
        )}
      </div>

      {state.objectUrl && controls}
    </Section>
  );
}

// Matcap slot is different: it targets matcapMaterial, not pbrMaterial
function MatcapSlot({ painter }: { painter: ReturnType<typeof useThreePainterContext>['painter'] }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileName, setFileName]   = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const load = (file: File) => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const url = URL.createObjectURL(file);
    prevUrl.current = url;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.needsUpdate = true;
      painter?.setMatcapTexture(tex);
    });
    setObjectUrl(url);
    setFileName(file.name);
  };

  const clear = () => {
    if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = null; }
    painter?.setMatcapTexture(null); // reverts to procedural
    setObjectUrl(null); setFileName(null);
  };

  useEffect(() => () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); }, []);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) load(file);
  };

  return (
    <Section label="MATCAP" badge="Matcap mode">
      <p className={styles.slotHint}>Upload a matcap sphere PNG. Reverts to built-in procedural if cleared.</p>
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropZoneDrag : ''} ${objectUrl ? styles.dropZoneLoaded : ''}`}
        onClick={() => !objectUrl && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" accept="image/*" className={styles.hiddenInput}
          onChange={(e) => handleFiles(e.target.files)} />
        {objectUrl ? (
          <div className={styles.thumbRow}>
            <img src={objectUrl} alt={fileName ?? ''} className={`${styles.thumb} ${styles.thumbRound}`} />
            <div className={styles.thumbMeta}>
              <span className={styles.thumbName}>{fileName}</span>
              <button className={styles.clearBtn} onClick={(e) => { e.stopPropagation(); clear(); }} title="Revert to procedural">
                <X size={9} /> Clear
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.dropPlaceholder}>
            <ImageIcon size={13} className={styles.dropIcon} />
            <span>Drop matcap sphere image</span>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function TextureMapsPanel() {
  const { painter, shadingMode, isModelLoaded } = useThreePainterContext();

  // Per-slot intensity state
  const [aoIntensity,     setAoIntensity]     = useState(1.0);
  const [normalScale,     setNormalScale]     = useState(1.0);
  const [emissiveColor,   setEmissiveColor]   = useState('#ffffff');
  const [emissiveIntensity, setEmissiveIntensity] = useState(1.0);

  const isPBR     = shadingMode === 'standard';
  const isMatcap  = shadingMode === 'matcap';

  if (!isModelLoaded) {
    return (
      <div className={styles.empty}>
        <Upload size={26} className={styles.emptyIcon} />
        <p>Import a model first to assign texture maps.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>

      {/* Mode hint */}
      {!isPBR && !isMatcap && (
        <div className={styles.modeNotice}>
          Switch to <strong>PBR</strong> or <strong>Matcap</strong> shading to use these maps.
        </div>
      )}
      {isPBR && (
        <div className={styles.modeNoticeOk}>
          PBR mode active — all map slots enabled.
        </div>
      )}

      {/* Matcap slot */}
      <MatcapSlot painter={painter} />

      {/* AO */}
      <MapSlotSection
        label="AMBIENT OCCLUSION" slot="ao" badge="PBR" painter={painter}
        controls={
          <SliderRow label="Intensity" value={aoIntensity} min={0} max={1} step={0.01}
            onChange={(v) => { setAoIntensity(v); painter?.setMapIntensity('ao', v); }} />
        }
      />

      {/* Normal */}
      <MapSlotSection
        label="NORMAL MAP" slot="normal" badge="PBR" painter={painter}
        controls={
          <SliderRow label="Scale" value={normalScale} min={0} max={3} step={0.05}
            onChange={(v) => { setNormalScale(v); painter?.setMapIntensity('normalScale', v); }} />
        }
      />

      {/* Emissive */}
      <MapSlotSection
        label="EMISSIVE MAP" slot="emissive" badge="PBR" painter={painter}
        controls={
          <>
            <div className={styles.colorRow}>
              <span className={styles.sliderLabel}>Color</span>
              <input type="color" className={styles.colorSwatch} value={emissiveColor}
                onChange={(e) => {
                  setEmissiveColor(e.target.value);
                  painter?.['pbrMaterial'] && (painter as any).pbrMaterial.emissive?.set(e.target.value);
                }} />
              <span className={styles.hexVal}>{emissiveColor.toUpperCase()}</span>
            </div>
            <SliderRow label="Intensity" value={emissiveIntensity} min={0} max={3} step={0.05}
              onChange={(v) => { setEmissiveIntensity(v); painter?.setMapIntensity('emissive', v); }} />
          </>
        }
      />

      {/* Roughness */}
      <MapSlotSection
        label="ROUGHNESS MAP" slot="roughness" badge="PBR" painter={painter}
      />

    </div>
  );
}
