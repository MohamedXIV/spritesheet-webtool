'use client';

import React, { useState, useRef, useEffect, useContext } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight, Upload, X, ImageIcon, Layers } from 'lucide-react';
import { ThreePainterContext, useThreePainterContext, PaintingLayer } from '@/contexts/ThreePainterContext';
import { TrimsheetContext, useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { MapSlot } from '@/lib/threePainter';
import { makeMaterialId, TrimMaterial } from '@/lib/trimsheetTypes';
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

type TexturePanelSlot = MapSlot | 'albedo';
type PainterRef = ReturnType<typeof useThreePainterContext>['painter'] | null;

function useMapSlot(slot: TexturePanelSlot, painter: PainterRef) {
  const painterCtx = useContext(ThreePainterContext);
  const trimsheetCtx = useContext(TrimsheetContext);
  const isTrimsheetMode = !!trimsheetCtx;

  // Resolve current map values
  let objectUrl: string | null = null;
  let fileName: string | null = null;

  if (isTrimsheetMode) {
    const region = trimsheetCtx.regions.find(r => r.id === trimsheetCtx.selectedRegionId);
    const material = region?.materialId ? trimsheetCtx.materials.find(m => m.id === region.materialId) || null : null;
    const slotName = slot === 'ao' ? 'ao' : slot === 'normal' ? 'normal' : slot === 'roughness' ? 'roughness' : slot === 'metalness' ? 'metalness' : 'albedo';
    const bitmap = material?.maps[slotName] || null;
    if (bitmap) {
      objectUrl = material?.thumbnailUrl || null;
      fileName = `${slot.toUpperCase()} Map (${bitmap.width}x${bitmap.height})`;
    }
  } else if (painterCtx) {
    const currentMap = painterCtx.pbrMaps[slot as MapSlot] || { url: null, name: null };
    objectUrl = currentMap.url;
    fileName = currentMap.name;
  }

  const load = async (file: File) => {
    if (isTrimsheetMode) {
      const region = trimsheetCtx.regions.find(r => r.id === trimsheetCtx.selectedRegionId);
      if (!region) return;
      
      const bitmap = await createImageBitmap(file);
      const slotName = slot === 'ao' ? 'ao' : slot === 'normal' ? 'normal' : slot === 'roughness' ? 'roughness' : slot === 'metalness' ? 'metalness' : 'albedo';
      
      const currentMaterial = region.materialId ? trimsheetCtx.materials.find(m => m.id === region.materialId) || null : null;
      
      let updatedMat: TrimMaterial;
      if (currentMaterial) {
        updatedMat = {
          ...currentMaterial,
          maps: {
            ...currentMaterial.maps,
            [slotName]: bitmap
          }
        };
        if (slotName === 'albedo') {
          updatedMat.thumbnailUrl = URL.createObjectURL(file);
        }
      } else {
        const mapsObj: TrimMaterial['maps'] = { albedo: null, normal: null, roughness: null, metalness: null, ao: null };
        mapsObj[slotName] = bitmap;
        updatedMat = {
          id: makeMaterialId(),
          name: `Custom Region Material`,
          source: 'upload' as const,
          maps: mapsObj,
          thumbnailUrl: slotName === 'albedo' ? URL.createObjectURL(file) : '',
        };
      }
      trimsheetCtx.assignMaterialToRegion(region.id, updatedMat);
    } else if (painterCtx) {
      if (objectUrl && objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
      const url = URL.createObjectURL(file);
      new THREE.TextureLoader().load(url, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        painter?.setMap(slot as MapSlot, tex);
      });
      painterCtx.setPbrMap(slot as MapSlot, url, file.name);
    }
  };

  const clear = () => {
    if (isTrimsheetMode) {
      const region = trimsheetCtx.regions.find(r => r.id === trimsheetCtx.selectedRegionId);
      if (!region) return;
      const currentMaterial = region.materialId ? trimsheetCtx.materials.find(m => m.id === region.materialId) || null : null;
      if (currentMaterial) {
        const slotName = slot === 'ao' ? 'ao' : slot === 'normal' ? 'normal' : slot === 'roughness' ? 'roughness' : slot === 'metalness' ? 'metalness' : 'albedo';
        const updatedMat = {
          ...currentMaterial,
          maps: {
            ...currentMaterial.maps,
            [slotName]: null
          }
        };
        trimsheetCtx.assignMaterialToRegion(region.id, updatedMat);
      }
    } else if (painterCtx) {
      if (objectUrl && objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
      painter?.setMap(slot as MapSlot, null);
      painterCtx.setPbrMap(slot as MapSlot, null, null);
    }
  };

  return { objectUrl, fileName, load, clear };
}

// ── MapSlotSection ─────────────────────────────────────────────────────────────

function MapSlotSection({ label, slot, badge, painter, controls }: {
  label: string; slot: TexturePanelSlot; badge?: string;
  painter: PainterRef; controls?: React.ReactNode;
}) {
  const { objectUrl, fileName, load, clear } = useMapSlot(slot, painter);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) load(file);
  };

  const handleClear = () => {
    clear();
    if (inputRef.current) inputRef.current.value = '';
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
                onClick={(e) => { e.stopPropagation(); handleClear(); }} title="Remove map">
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
    if (inputRef.current) inputRef.current.value = '';
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

// ── AlbedoSlot ───────────────────────────────────────────────────────────────────

interface AlbedoSlotProps {
  layers: PaintingLayer[];
  activeLayerId: string;
  importImageToLayer?: (file: File, id: string) => void;
  clearLayer?: (id: string) => void;
}

function AlbedoSlot({ layers, activeLayerId, importImageToLayer, clearLayer }: AlbedoSlotProps) {
  const fillLayers = layers.filter(l => l.type === 'fill');
  
  const [targetLayerId, setTargetLayerId] = useState(() => {
    const activeFill = fillLayers.find(l => l.id === activeLayerId);
    return activeFill ? activeFill.id : (fillLayers[0]?.id || '');
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const targetLayer = fillLayers.find(l => l.id === targetLayerId);
  const objectUrl = targetLayer?.fillTextureUrl || null;
  const fileName = targetLayer?.fillTextureName || null;

  useEffect(() => {
    const activeFill = fillLayers.find(l => l.id === activeLayerId);
    if (activeFill) {
      setTargetLayerId(activeFill.id);
    } else if (!fillLayers.some(l => l.id === targetLayerId) && fillLayers.length > 0) {
      setTargetLayerId(fillLayers[0].id);
    }
  }, [activeLayerId, layers]);

  const load = (file: File) => {
    if (targetLayer && targetLayer.fillTextureName) {
      const proceed = confirm(`Are you sure you want to replace the existing texture map "${targetLayer.fillTextureName}" on this Fill Layer?`);
      if (!proceed) return;
    }

    if (importImageToLayer) {
      importImageToLayer(file, targetLayerId);
    }
  };

  const clear = () => {
    if (clearLayer) {
      clearLayer(targetLayerId);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) load(file);
  };

  if (fillLayers.length === 0) {
    return (
      <Section label="ALBEDO / DIFFUSE" badge="Core Fill Layer Only">
        <p className={styles.slotHint}>Import an external image directly into a fill layer. Updates the 3D model & applies pixelation instantly.</p>
        <div style={{
          padding: '12px 10px',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px dashed rgba(239, 68, 68, 0.25)',
          borderRadius: '6px',
          color: '#f87171',
          fontSize: '11px',
          lineHeight: '1.4',
          textAlign: 'center'
        }}>
          ⚠️ Please create a <strong>Fill Layer</strong> in the Canvas Layers panel first to import Albedo maps.
        </div>
      </Section>
    );
  }

  return (
    <Section label="ALBEDO / DIFFUSE" badge="Core Fill Layer Only">
      <p className={styles.slotHint}>Import an external image directly into a fill layer. Updates the 3D model & applies pixelation instantly.</p>
      
      <div className={styles.layerSelectRow}>
        <span className={styles.sliderLabel}>Target Layer</span>
        <select 
          className={styles.layerSelect}
          value={targetLayerId}
          onChange={(e) => setTargetLayerId(e.target.value)}
        >
          {fillLayers.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

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
                onClick={(e) => { e.stopPropagation(); clear(); }} title="Clear Albedo">
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
    </Section>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function TextureMapsPanel() {
  const painterCtx = useContext(ThreePainterContext);
  const trimsheetCtx = useContext(TrimsheetContext);
  const isTrimsheetMode = !!trimsheetCtx;

  // Resolving states
  const painter = painterCtx?.painter ?? null;
  const shadingMode = painterCtx?.shadingMode ?? 'standard';
  const isModelLoaded = painterCtx?.isModelLoaded ?? false;
  const layers = painterCtx?.layers ?? [];
  const activeLayerId = painterCtx?.activeLayerId ?? '';
  const importImageToLayer = painterCtx?.importImageToLayer;
  const clearLayer = painterCtx?.clearLayer;
  const canvasResolution = painterCtx?.canvasResolution ?? 512;
  const setCanvasResolution = painterCtx?.setCanvasResolution;
  const textureTiling = painterCtx?.textureTiling ?? 1.0;
  const setTextureTiling = painterCtx?.setTextureTiling;

  const [aoIntensity,       setAoIntensity]       = useState(1.0);
  const [normalScale,       setNormalScale]       = useState(1.0);
  const [emissiveColor,     setEmissiveColor]     = useState('#ffffff');
  const [emissiveIntensity, setEmissiveIntensity] = useState(1.0);
  
  // New Maps State
  const [metalness,         setMetalness]         = useState(1.0);
  const [displacementScale, setDisplacementScale] = useState(0.1);

  const isPBR = shadingMode === 'standard';

  // Trimsheet specific resolving
  const region = trimsheetCtx?.regions.find(r => r.id === trimsheetCtx.selectedRegionId) || null;
  const material = region?.materialId ? trimsheetCtx?.materials.find(m => m.id === region.materialId) || null : null;

  if (isTrimsheetMode) {
    if (!region) {
      return (
        <div className={styles.empty}>
          <Upload size={26} className={styles.emptyIcon} />
          <p>Select a region in the Trimsheet editor to inspect and assign PBR texture maps.</p>
        </div>
      );
    }

    return (
      <div className={styles.container}>
        {/* Global Resolution & Tiling Controls */}
        <div className={styles.settingsGroup}>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>Trimsheet Size</span>
            <select
              className={styles.settingSelect}
              value={trimsheetCtx.resolution}
              onChange={(e) => trimsheetCtx.setResolution(Number(e.target.value) as any)}
            >
              <option value={512}>512 x 512</option>
              <option value={1024}>1024 x 1024 (1K HD)</option>
              <option value={2048}>2048 x 2048 (2K Ultra)</option>
            </select>
          </div>

          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>Region Tiling</span>
            <input
              type="range"
              className={styles.sliderTrack}
              min={0.25}
              max={8.0}
              step={0.25}
              value={region.tiling.scale}
              onChange={(e) => trimsheetCtx.updateRegionTiling(region.id, { scale: Number(e.target.value) })}
            />
            <span className={styles.settingValue}>{region.tiling.scale.toFixed(2)}x</span>
          </div>
        </div>

        {/* Trimsheet Mode Info */}
        <div className={styles.modeNoticeOk}>
          PBR Region Map Composer — drop or select textures per channel.
        </div>

        {/* Albedo / Diffuse */}
        <MapSlotSection label="ALBEDO / DIFFUSE MAP" slot="albedo" badge="PBR" painter={null} />

        {/* AO */}
        <MapSlotSection label="AMBIENT OCCLUSION" slot="ao" badge="PBR" painter={null} />

        {/* Normal */}
        <MapSlotSection label="NORMAL MAP" slot="normal" badge="PBR" painter={null} />

        {/* Metalness */}
        <MapSlotSection label="METALNESS MAP" slot="metalness" badge="PBR" painter={null} />

        {/* Roughness */}
        <MapSlotSection label="ROUGHNESS MAP" slot="roughness" badge="PBR" painter={null} />
      </div>
    );
  }

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

      {/* Global Resolution & Tiling Controls */}
      <div className={styles.settingsGroup}>
        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>Canvas Resolution</span>
          <select
            className={styles.settingSelect}
            value={canvasResolution}
            onChange={(e) => setCanvasResolution?.(Number(e.target.value))}
          >
            <option value={512}>512 x 512 (Standard)</option>
            <option value={1024}>1024 x 1024 (1K HD)</option>
            <option value={2048}>2048 x 2048 (2K Ultra)</option>
          </select>
        </div>

        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>Tiling Scale</span>
          <input
            type="range"
            className={styles.sliderTrack}
            min={1.0}
            max={20.0}
            step={0.1}
            value={textureTiling}
            onChange={(e) => setTextureTiling?.(Number(e.target.value))}
          />
          <span className={styles.settingValue}>{textureTiling.toFixed(1)}x</span>
        </div>
      </div>

      {/* Mode hint */}
      {!isPBR && shadingMode !== 'matcap' && (
        <div className={styles.modeNotice}>
          Switch to <strong>PBR</strong> or <strong>Matcap</strong> shading to use these maps.
        </div>
      )}
      {isPBR && (
        <div className={styles.modeNoticeOk}>PBR mode active — all map slots enabled.</div>
      )}

      {/* Albedo / Diffuse */}
      <AlbedoSlot 
        layers={layers} 
        activeLayerId={activeLayerId} 
        importImageToLayer={importImageToLayer} 
        clearLayer={clearLayer}
      />

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

      {/* Metalness */}
      <MapSlotSection label="METALNESS MAP" slot="metalness" badge="PBR" painter={painter}
        controls={
          <SliderRow label="Metallic" value={metalness} min={0} max={1}
            onChange={(v) => { setMetalness(v); painter?.setMapIntensity('metalness', v); }} />
        }
      />

      {/* Displacement */}
      <MapSlotSection label="DISPLACEMENT MAP" slot="displacement" badge="PBR" painter={painter}
        controls={
          <SliderRow label="Scale" value={displacementScale} min={0} max={1} step={0.02}
            onChange={(v) => { setDisplacementScale(v); painter?.setMapIntensity('displacementScale', v); }} />
        }
      />

      {/* Alpha / Transparency */}
      <MapSlotSection label="ALPHA (TRANSPARENCY)" slot="alpha" badge="PBR" painter={painter} />

      {/* Roughness */}
      <MapSlotSection label="ROUGHNESS MAP" slot="roughness" badge="PBR" painter={painter} />

    </div>
  );
}
