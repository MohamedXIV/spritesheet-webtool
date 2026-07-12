'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Upload, X, ImageIcon } from 'lucide-react';
import { useStylizerContext, MAP_SLOTS, MapSlot } from '@/contexts/StylizerContext';
import styles from './StylizerMaterialLoaderPanel.module.css';

const SLOT_LABELS: Record<MapSlot, string> = {
  albedo: 'Albedo / Base Color',
  normal: 'Normal',
  roughness: 'Roughness',
  metallic: 'Metallic',
  ao: 'Ambient Occlusion',
  height: 'Height / Displacement',
};

const SLOT_PATTERNS: Record<MapSlot, RegExp> = {
  albedo: /(albedo|basecolor|base_color|diffuse|_col|_color)/i,
  normal: /(normal|_nrm|_nor|_norm)/i,
  roughness: /(rough|_rgh)/i,
  metallic: /(metal|metallic|_met)/i,
  ao: /(ao|occlusion|_occ)/i,
  height: /(height|displace|_disp|_hgt|bump)/i,
};

export function detectSlot(filename: string): MapSlot | null {
  for (const slot of MAP_SLOTS) {
    if (SLOT_PATTERNS[slot].test(filename)) return slot;
  }
  return null;
}

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

function BitmapThumbnail({ bitmap }: { bitmap: ImageBitmap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, 40, 40);
    }
  }, [bitmap]);
  return <canvas ref={canvasRef} className={styles.thumbCanvas} />;
}

export function StylizerMaterialLoaderPanel() {
  const ctx = useStylizerContext();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [draggingSlot, setDraggingSlot] = useState<string | null>(null);

  const onFile = useCallback((slot: MapSlot, file: File | undefined) => {
    if (file) ctx.loadMap(slot, file);
  }, [ctx]);

  const onDrop = useCallback((slot: MapSlot, e: React.DragEvent) => {
    e.preventDefault();
    setDraggingSlot(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const detected = detectSlot(file.name) ?? slot;
    ctx.loadMap(detected, file);
  }, [ctx]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Material Maps</span>
        <button className={styles.resetBtn} onClick={ctx.resetMaterial}>Reset</button>
      </div>

      <div className={styles.slots}>
        <Section label="REQUIRED MAPS">
          {(() => {
            const slot: MapSlot = 'albedo';
            const loaded = !!ctx.material.maps[slot];
            const bmp = ctx.material.maps[slot] || null;
            const dragging = draggingSlot === slot;
            return (
              <div key={slot} className={styles.slotWrapper}>
                <span className={styles.slotLabel}>
                  {SLOT_LABELS[slot]} <span className={styles.requiredStar}>*</span>
                </span>
                <div
                  className={`${styles.dropZone} ${dragging ? styles.dropZoneDrag : ''} ${loaded ? styles.dropZoneLoaded : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDraggingSlot(slot); }}
                  onDragLeave={() => setDraggingSlot(null)}
                  onDrop={(e) => onDrop(slot, e)}
                  onClick={() => !loaded && inputRefs.current[slot]?.click()}
                >
                  <input
                    ref={(el) => { inputRefs.current[slot] = el; }}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => onFile(slot, e.target.files?.[0])}
                  />
                  {loaded && bmp ? (
                    <div className={styles.thumbRow}>
                      <BitmapThumbnail bitmap={bmp} />
                      <div className={styles.thumbMeta}>
                        <span className={styles.thumbName}>Albedo Map ({bmp.width}x{bmp.height})</span>
                        <button className={styles.clearBtn}
                          onClick={(e) => { e.stopPropagation(); ctx.clearMap(slot); }}>
                          <X size={9} /> Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.dropPlaceholder}>
                      <Upload size={13} className={styles.dropIcon} />
                      <span>Drop base albedo texture here</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Section>

        <Section label="OPTIONAL MAPS" defaultOpen={true}>
          {MAP_SLOTS.filter(s => s !== 'albedo').map((slot) => {
            const loaded = !!ctx.material.maps[slot];
            const bmp = ctx.material.maps[slot] || null;
            const dragging = draggingSlot === slot;
            return (
              <div key={slot} className={styles.slotWrapper}>
                <span className={styles.slotLabel}>{SLOT_LABELS[slot]}</span>
                <div
                  className={`${styles.dropZone} ${dragging ? styles.dropZoneDrag : ''} ${loaded ? styles.dropZoneLoaded : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDraggingSlot(slot); }}
                  onDragLeave={() => setDraggingSlot(null)}
                  onDrop={(e) => onDrop(slot, e)}
                  onClick={() => !loaded && inputRefs.current[slot]?.click()}
                >
                  <input
                    ref={(el) => { inputRefs.current[slot] = el; }}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => onFile(slot, e.target.files?.[0])}
                  />
                  {loaded && bmp ? (
                    <div className={styles.thumbRow}>
                      <BitmapThumbnail bitmap={bmp} />
                      <div className={styles.thumbMeta}>
                        <span className={styles.thumbName}>{slot.toUpperCase()} Map ({bmp.width}x{bmp.height})</span>
                        <button className={styles.clearBtn}
                          onClick={(e) => { e.stopPropagation(); ctx.clearMap(slot); }}>
                          <X size={9} /> Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.dropPlaceholder}>
                      <ImageIcon size={13} className={styles.dropIcon} />
                      <span>Drop optional {slot} map here</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </Section>
      </div>

      <p className={styles.hint}>Albedo is required. Filenames auto-detect their slot.</p>
    </div>
  );
}
