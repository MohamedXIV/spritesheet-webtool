'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Paintbrush, Eraser, Pipette, PaintBucket,
  ChevronDown, ChevronRight, Plus, Trash2, Check, X, Pencil, Sparkles,
} from 'lucide-react';
import { useThreePainterContext, BrushTool } from '@/contexts/ThreePainterContext';
import {
  ColorPalette,
  BUILT_IN_PALETTES,
  loadCustomPalettes,
  saveCustomPalettes,
  createCustomPalette,
} from '@/lib/palettes';
import styles from './BrushPanel.module.css';

// ─── Collapsible Section ─────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ label, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)}>
        {open
          ? <ChevronDown size={9} strokeWidth={2.5} />
          : <ChevronRight size={9} strokeWidth={2.5} />
        }
        <span>{label}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ─── Compact Slider Row ───────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, unit = '', onChange }: SliderRowProps) {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        className={styles.sliderTrack}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.sliderValue}>{value}{unit}</span>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function BrushPanel() {
  const {
    activeTool, setActiveTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    brushOpacity, setBrushOpacity,
    brushHardness, setBrushHardness,
    isPaintMode, setIsPaintMode,
  } = useThreePainterContext();

  // ── Palette state ────────────────────────────────────────────────────────
  const [allPalettes, setAllPalettes] = useState<ColorPalette[]>([]);
  const [activePaletteId, setActivePaletteId] = useState<string>('basic');
  const [paletteDropdownOpen, setPaletteDropdownOpen] = useState(false);
  const [editingPalette, setEditingPalette] = useState(false);
  const [showNewPaletteInput, setShowNewPaletteInput] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newPaletteInputRef = useRef<HTMLInputElement>(null);

  // Load built-ins + saved custom palettes on mount
  useEffect(() => {
    const custom = loadCustomPalettes();
    setAllPalettes([...BUILT_IN_PALETTES, ...custom]);
  }, []);

  // Auto-focus the new-palette input when it appears
  useEffect(() => {
    if (showNewPaletteInput) newPaletteInputRef.current?.focus();
  }, [showNewPaletteInput]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPaletteDropdownOpen(false);
        setShowNewPaletteInput(false);
        setNewPaletteName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Exit edit mode when switching palettes
  const handleSelectPalette = (id: string) => {
    setActivePaletteId(id);
    setEditingPalette(false);
    setPaletteDropdownOpen(false);
    setShowNewPaletteInput(false);
  };

  const activePalette = allPalettes.find(p => p.id === activePaletteId) ?? allPalettes[0];

  // ── Palette mutations ────────────────────────────────────────────────────

  const persistCustom = useCallback((updated: ColorPalette[]) => {
    setAllPalettes(updated);
    saveCustomPalettes(updated.filter(p => !p.isBuiltIn));
  }, []);

  const handleCreatePalette = () => {
    if (!newPaletteName.trim()) return;
    const np = createCustomPalette(newPaletteName.trim());
    persistCustom([...allPalettes, np]);
    setActivePaletteId(np.id);
    setEditingPalette(true);
    setNewPaletteName('');
    setShowNewPaletteInput(false);
    setPaletteDropdownOpen(false);
  };

  const handleDeletePalette = (id: string) => {
    persistCustom(allPalettes.filter(p => p.id !== id));
    if (activePaletteId === id) setActivePaletteId('basic');
  };

  const handleAddCurrentColor = () => {
    if (!activePalette || activePalette.isBuiltIn) return;
    // Avoid duplicates
    if (activePalette.colors.includes(brushColor.toLowerCase())) return;
    persistCustom(
      allPalettes.map(p =>
        p.id === activePaletteId ? { ...p, colors: [...p.colors, brushColor.toLowerCase()] } : p
      )
    );
  };

  const handleRemoveColor = (idx: number) => {
    if (!activePalette || activePalette.isBuiltIn) return;
    persistCustom(
      allPalettes.map(p =>
        p.id === activePaletteId ? { ...p, colors: p.colors.filter((_, i) => i !== idx) } : p
      )
    );
  };

  // ── Tool helpers ─────────────────────────────────────────────────────────

  const TOOLS: [BrushTool, string, React.ReactNode][] = [
    ['brush',         'Brush (B)',       <Paintbrush  size={13} strokeWidth={2} />],
    ['eraser',        'Eraser (E)',      <Eraser      size={13} strokeWidth={2} />],
    ['eyedropper',    'Pick (I)',        <Pipette     size={13} strokeWidth={2} />],
    ['bucket',        'Flood Fill (G)',  <PaintBucket size={13} strokeWidth={2} />],
    ['island-bucket', 'Island Fill (U)', <Sparkles    size={13} strokeWidth={2} />],
  ];

  const handleToolClick = (tool: BrushTool) => {
    setActiveTool(tool);
    if (!isPaintMode) setIsPaintMode(true);
  };

  const handleHexChange = (raw: string) => {
    let v = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) setBrushColor(v);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>

      {/* ── Mode Toggle ─────────────────────────────────────────────── */}
      <div className={styles.modeBar}>
        <button
          className={`${styles.modeBtn} ${!isPaintMode ? styles.modeBtnActive : ''}`}
          onClick={() => setIsPaintMode(false)}
        >
          View
        </button>
        <button
          className={`${styles.modeBtn} ${isPaintMode ? styles.modeBtnActive : ''}`}
          onClick={() => setIsPaintMode(true)}
        >
          Paint
        </button>
      </div>

      {isPaintMode ? (
        <>
          {/* ── Tools ─────────────────────────────────────────────────── */}
          <Section label="TOOLS">
            <div className={styles.toolGrid}>
              {TOOLS.map(([tool, title, icon]) => (
                <button
                  key={tool}
                  className={`${styles.toolBtn} ${activeTool === tool ? styles.toolBtnActive : ''}`}
                  onClick={() => handleToolClick(tool)}
                  title={title}
                >
                  {icon}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Color ─────────────────────────────────────────────────── */}
          <Section label="COLOR">
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorSwatch}
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                title="Open color picker"
              />
              <input
                type="text"
                className={styles.hexInput}
                value={brushColor.toUpperCase()}
                spellCheck={false}
                maxLength={7}
                onChange={(e) => handleHexChange(e.target.value)}
              />
            </div>
          </Section>

          {/* ── Palette ───────────────────────────────────────────────── */}
          <Section label="PALETTE">
            {/* Selector row */}
            <div className={styles.paletteBar}>
              <div className={styles.paletteDropdownWrap} ref={dropdownRef}>
                <button
                  className={styles.paletteSelector}
                  onClick={() => setPaletteDropdownOpen(!paletteDropdownOpen)}
                >
                  <span>{activePalette?.name ?? '—'}</span>
                  <ChevronDown size={9} strokeWidth={2.5} />
                </button>

                {paletteDropdownOpen && (
                  <div className={styles.paletteMenu}>
                    {allPalettes.map(p => (
                      <div key={p.id} className={styles.paletteMenuItem}>
                        <button
                          className={`${styles.paletteMenuName} ${p.id === activePaletteId ? styles.paletteMenuActive : ''}`}
                          onClick={() => handleSelectPalette(p.id)}
                        >
                          {p.name}
                          {!p.isBuiltIn && <span className={styles.customTag}>custom</span>}
                        </button>
                        {!p.isBuiltIn && (
                          <button
                            className={styles.paletteMenuDelete}
                            onClick={(e) => { e.stopPropagation(); handleDeletePalette(p.id); }}
                            title="Delete palette"
                          >
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                    ))}

                    <div className={styles.menuDivider} />

                    {showNewPaletteInput ? (
                      <div className={styles.newPaletteRow}>
                        <input
                          ref={newPaletteInputRef}
                          type="text"
                          className={styles.newPaletteInput}
                          placeholder="Palette name…"
                          value={newPaletteName}
                          onChange={(e) => setNewPaletteName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreatePalette();
                            if (e.key === 'Escape') { setShowNewPaletteInput(false); setNewPaletteName(''); }
                          }}
                        />
                        <button className={styles.newPaletteConfirm} onClick={handleCreatePalette} title="Create">
                          <Check size={9} />
                        </button>
                        <button className={styles.newPaletteCancel} onClick={() => { setShowNewPaletteInput(false); setNewPaletteName(''); }} title="Cancel">
                          <X size={9} />
                        </button>
                      </div>
                    ) : (
                      <button className={styles.newPaletteBtn} onClick={() => setShowNewPaletteInput(true)}>
                        <Plus size={9} />
                        New Palette
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Edit toggle — only for custom palettes */}
              {activePalette && !activePalette.isBuiltIn && (
                <button
                  className={`${styles.editBtn} ${editingPalette ? styles.editBtnActive : ''}`}
                  onClick={() => setEditingPalette(!editingPalette)}
                  title={editingPalette ? 'Stop editing' : 'Edit palette'}
                >
                  <Pencil size={9} />
                </button>
              )}
            </div>

            {/* Swatch grid */}
            {activePalette && (
              <div className={styles.swatchGrid}>
                {activePalette.colors.map((color, i) => (
                  <div key={`${color}-${i}`} className={styles.swatchWrap}>
                    <button
                      className={`${styles.swatch} ${brushColor.toLowerCase() === color.toLowerCase() ? styles.swatchActive : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => { if (!editingPalette) setBrushColor(color); }}
                      title={color.toUpperCase()}
                    />
                    {editingPalette && (
                      <button
                        className={styles.swatchRemove}
                        onClick={() => handleRemoveColor(i)}
                        title="Remove color"
                      >
                        <X size={5} />
                      </button>
                    )}
                  </div>
                ))}

                {/* Empty state for new custom palettes */}
                {activePalette.colors.length === 0 && (
                  <span className={styles.emptyPalette}>
                    {activePalette.isBuiltIn ? 'No colors.' : 'Add colors below ↓'}
                  </span>
                )}
              </div>
            )}

            {/* Edit toolbar */}
            {editingPalette && activePalette && !activePalette.isBuiltIn && (
              <button className={styles.addColorBtn} onClick={handleAddCurrentColor}>
                <Plus size={9} />
                Add current color
                <span className={styles.addColorPreview} style={{ backgroundColor: brushColor }} />
              </button>
            )}
          </Section>

          {/* ── Brush ─────────────────────────────────────────────────── */}
          <Section label="BRUSH">
            <SliderRow
              label="Size"
              value={brushSize}
              min={1} max={100}
              unit="px"
              onChange={setBrushSize}
            />
            <SliderRow
              label="Opacity"
              value={Math.round(brushOpacity * 100)}
              min={1} max={100}
              unit="%"
              onChange={(v) => setBrushOpacity(v / 100)}
            />
            <SliderRow
              label="Hardness"
              value={Math.round(brushHardness * 100)}
              min={0} max={100}
              unit="%"
              onChange={(v) => setBrushHardness(v / 100)}
            />
          </Section>
        </>
      ) : (
        /* ── View Mode hint ─────────────────────────────────────────── */
        <div className={styles.viewHint}>
          <p className={styles.viewHintTitle}>Camera Orbit Mode</p>
          <div className={styles.viewHintRows}>
            <span><kbd>RMB</kbd> Rotate</span>
            <span><kbd>MMB</kbd> Pan</span>
            <span><kbd>Scroll</kbd> Zoom</span>
          </div>
          <button className={styles.activatePaintBtn} onClick={() => setIsPaintMode(true)}>
            Activate Painter
          </button>
        </div>
      )}
    </div>
  );
}
