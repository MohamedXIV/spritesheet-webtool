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
    layers, activeLayerId,
  } = useThreePainterContext();

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16) || 0;
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };

  const activeLayer = layers.find(l => l.id === activeLayerId);
  const isEditingMask = !!(activeLayer?.maskActive && activeLayer?.maskCanvas);
  const isBlockedFill = !!(activeLayer?.type === 'fill' && !isEditingMask);

  // ── Palette state ────────────────────────────────────────────────────────
  const [allPalettes, setAllPalettes] = useState<ColorPalette[]>(() => [
    ...BUILT_IN_PALETTES,
    ...loadCustomPalettes()
  ]);
  const [activePaletteId, setActivePaletteId] = useState<string>('basic');
  const [paletteDropdownOpen, setPaletteDropdownOpen] = useState(false);
  const [editingPalette, setEditingPalette] = useState(false);
  const [showNewPaletteInput, setShowNewPaletteInput] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newPaletteInputRef = useRef<HTMLInputElement>(null);

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

  const TOOLS: [BrushTool, string, React.ComponentType<{ size?: number; strokeWidth?: number }>][] = [
    ['brush',         'Brush (B)',       Paintbrush],
    ['eraser',        'Eraser (E)',      Eraser],
    ['eyedropper',    'Pick (I)',        Pipette],
    ['bucket',        'Flood Fill (G)',  PaintBucket],
    ['island-bucket', 'Island Fill (U)', Sparkles],
  ];

  const handleToolClick = (tool: BrushTool) => {
    setActiveTool(tool);
    if (!isPaintMode) setIsPaintMode(true);
  };

  const handleHexChange = (raw: string) => {
    const v = raw.startsWith('#') ? raw : `#${raw}`;
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
        isBlockedFill ? (
          <div className={styles.blockedOverlay}>
            <X className={styles.blockedIcon} size={28} />
            <h3 className={styles.blockedTitle}>Painting Blocked</h3>
            <p className={styles.blockedDesc}>
              This is a <strong>Fill Layer</strong>. You cannot paint directly on its texture map.
            </p>
            <p className={styles.blockedHint}>
              Click the **Sparkles icon** to add/edit a layer mask, or select a Paint Layer to draw.
            </p>
          </div>
        ) : (
          <>
            {isEditingMask && (
              <div className={styles.maskWarningBanner}>
                <Sparkles size={12} className={styles.maskWarningIcon} />
                <span>Mask Editor Active (Grayscale Brush Mode)</span>
              </div>
            )}

            {/* ── Tools ─────────────────────────────────────────────────── */}
            <Section label="TOOLS">
              <div className={styles.toolGrid}>
                {TOOLS.map(([tool, title, Icon]) => (
                  <button
                    key={tool}
                    className={`${styles.toolBtn} ${activeTool === tool ? styles.toolBtnActive : ''}`}
                    onClick={() => handleToolClick(tool)}
                    title={title}
                  >
                    <Icon size={13} strokeWidth={2} />
                  </button>
                ))}
              </div>
            </Section>

            {/* ── Mask Color / Grayscale Selection ──────────────────────── */}
            {isEditingMask ? (
              <Section label="MASK GRAYSCALE">
                <div className={styles.grayscaleContainer}>
                  <SliderRow
                    label="Luminance"
                    value={Math.round((() => {
                      const rgb = hexToRgb(brushColor);
                      const gray = Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
                      return (gray / 255) * 100;
                    })())}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(pct) => {
                      const val = Math.round((pct / 100) * 255);
                      const hex = '#' + ((1 << 24) + (val << 16) + (val << 8) + val).toString(16).slice(1);
                      setBrushColor(hex);
                    }}
                  />
                  <div className={styles.grayPresets}>
                    <button
                      className={`${styles.grayPresetBtn} ${brushColor.toLowerCase() === '#ffffff' ? styles.grayPresetActive : ''}`}
                      onClick={() => setBrushColor('#ffffff')}
                      title="Fully Reveal (White)"
                    >
                      Reveal
                    </button>
                    <button
                      className={`${styles.grayPresetBtn} ${brushColor.toLowerCase() === '#808080' ? styles.grayPresetActive : ''}`}
                      onClick={() => setBrushColor('#808080')}
                      title="50% Transparency (Gray)"
                    >
                      50%
                    </button>
                    <button
                      className={`${styles.grayPresetBtn} ${brushColor.toLowerCase() === '#000000' ? styles.grayPresetActive : ''}`}
                      onClick={() => setBrushColor('#000000')}
                      title="Fully Hide (Black)"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </Section>
            ) : (
              <>
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
              </>
            )}

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
        )
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
