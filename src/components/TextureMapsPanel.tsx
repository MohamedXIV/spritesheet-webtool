'use client';

import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight, Upload, X, ImageIcon } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import { MapSlot } from '@/lib/threePainter';
import styles from './TextureMapsPanel.module.css';

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, badge, children, defaultOpen = true }: {
  label: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean;
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

function SliderRow({ label, value, min, max, step = 0.01, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <input type="range" className={styles.sliderTrack}
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className={styles.sliderValue}>{value.toFixed(2)}</span>
    </div>
  );
}

// ── useMapSlot hook ─────────────────────────────────────────────────────────────

type PainterRef = ReturnType<typeof useThreePainterContext>['painter'];

function useMapSlot(slot: MapSlot, painter: PainterRef) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileName, setFileName]   = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  const load = (file: File) => {
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const url = URL.createObjectURL(file);
    prevUrl.current = url;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      painter?.setMap(slot, tex);
    });
    setObjectUrl(url);
    setFileName(file.name);
  };

  const clear = () => {
    if (prevUrl.current) { URL.revokeObjectURL(prevUrl.current); prevUrl.current = null; }
    painter?.setMap(slot, null);
    setObjectUrl(null);
    setFileName(null);
  };

  useEffect(() => () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); }, []);

  return { objectUrl, fileName, load, clear };
}

// ── MapSlotSection ─────────────────────────────────────────────────────────────

function MapSlotSection({ label, slot, badge, painter, controls }: {
  label: string; slot: MapSlot; badge?: string;
  painter: PainterRef; controls?: React.ReactNode;
}) {
  const { objectUrl, fileName, load, clear } = useMapSlot(slot, painter);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) load(file);
  };

  return (
    <Section label={label} badge={badge}>
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
            <img src={objectUrl} alt={fileName ?? ''} className={styles.thumb} />
            <div className={styles.thumbMeta}>
              <span className={styles.thumbName}>{fileName}</span>
              <button className={styles.clearBtn}
                onClick={(e) => { e.stopPropagation(); clear(); }} title="Remove map">
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
      {objectUrl && controls}
    </Section>
  );
}

// ── MatcapSlot ───────────────────────────────────────────────────────────────────

function MatcapSlot({ painter }: { painter: PainterRef }) {
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
    painter?.setMatcapTexture(null); // reverts to procedural built-in
    setObjectUrl(null);
    setFileName(null);
  };

  useEffect(() => () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); }, []);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) load(file);
  };

  return (
    <Section label="MATCAP" badge="Matcap mode">
      <p className={styles.slotHint}>Upload a matcap sphere PNG/JPG. Clear to revert to built-in.</p>
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
              <button className={styles.clearBtn}
                onClick={(e) => { e.stopPropagation(); clear(); }} title="Revert to procedural">
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

  const [aoIntensity,       setAoIntensity]       = useState(1.0);
  const [normalScale,       setNormalScale]       = useState(1.0);
  const [emissiveColor,     setEmissiveColor]     = useState('#ffffff');
  const [emissiveIntensity, setEmissiveIntensity] = useState(1.0);

  const isPBR = shadingMode === 'standard';

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
      {!isPBR && shadingMode !== 'matcap' && (
        <div className={styles.modeNotice}>
          Switch to <strong>PBR</strong> or <strong>Matcap</strong> shading to use these maps.
        </div>
      )}
      {isPBR && (
        <div className={styles.modeNoticeOk}>PBR mode active — all map slots enabled.</div>
      )}

      {/* Matcap */}
      <MatcapSlot painter={painter} />

      {/* AO */}
      <MapSlotSection label="AMBIENT OCCLUSION" slot="ao" badge="PBR" painter={painter}
        controls={
          <SliderRow label="Intensity" value={aoIntensity} min={0} max={1}
            onChange={(v) => { setAoIntensity(v); painter?.setMapIntensity('ao', v); }} />
        }
      />

      {/* Normal */}
      <MapSlotSection label="NORMAL MAP" slot="normal" badge="PBR" painter={painter}
        controls={
          <SliderRow label="Scale" value={normalScale} min={0} max={3} step={0.05}
            onChange={(v) => { setNormalScale(v); painter?.setMapIntensity('normalScale', v); }} />
        }
      />

      {/* Emissive */}
      <MapSlotSection label="EMISSIVE MAP" slot="emissive" badge="PBR" painter={painter}
        controls={
          <>
            <div className={styles.colorRow}>
              <span className={styles.sliderLabel}>Color</span>
              <input type="color" className={styles.colorSwatch} value={emissiveColor}
                onChange={(e) => {
                  setEmissiveColor(e.target.value);
                  painter?.setEmissiveColor(e.target.value);
                }}
              />
              <span className={styles.hexVal}>{emissiveColor.toUpperCase()}</span>
            </div>
            <SliderRow label="Intensity" value={emissiveIntensity} min={0} max={3} step={0.05}
              onChange={(v) => { setEmissiveIntensity(v); painter?.setMapIntensity('emissive', v); }} />
          </>
        }
      />

      {/* Roughness */}
      <MapSlotSection label="ROUGHNESS MAP" slot="roughness" badge="PBR" painter={painter} />

    </div>
  );
}
