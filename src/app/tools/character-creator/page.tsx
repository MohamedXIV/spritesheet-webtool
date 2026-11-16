'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Dices, Loader2,
  Pause, Play, RotateCcw, Sparkles, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ACTIONS, COLOR_PRESETS, DIRECTIONS, FRAME_SIZE, createCharacter, getOptions,
  sanitizeCharacter, selectGender, SOURCE_REVISION, type Action, type CharacterConfig,
  type ColorSlot, type Gender, type Slot,
} from '@/lib/lpcCharacter';
import { composeSheet, downloadActionPng, downloadCharacterPack } from '@/lib/lpcComposer';
import styles from './page.module.css';

const STORAGE_KEY = 'spritecraft-lpc-character-v1';
const EDITOR_TABS: { id: 'body' | 'eyes' | 'hair' | 'beard' | 'top' | 'bottom' | 'shoes'; title: string; hint: string }[] = [
  { id: 'body', title: 'Body', hint: 'Base & skin' },
  { id: 'eyes', title: 'Expression', hint: 'Face details' },
  { id: 'hair', title: 'Hair', hint: 'Style & color' },
  { id: 'beard', title: 'Facial hair', hint: 'Beards' },
  { id: 'top', title: 'Tops', hint: 'Shirts' },
  { id: 'bottom', title: 'Bottoms', hint: 'Legwear' },
  { id: 'shoes', title: 'Footwear', hint: 'Shoes' },
];

const SLOT_COLOR: Partial<Record<Slot, ColorSlot>> = {
  body: 'skin', hair: 'hair', beard: 'hair', top: 'top', bottom: 'bottom', shoes: 'shoes',
};

function pick<T,>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomCharacter(current: CharacterConfig): CharacterConfig {
  const next = createCharacter(current.gender);
  for (const slot of ['eyes', 'hair', 'beard', 'top', 'bottom', 'shoes'] as Slot[]) {
    const options = getOptions(slot, next.gender).map(({ id }) => id);
    const choices = slot === 'eyes' ? options : [...options, null];
    next.selected[slot] = pick(choices);
  }
  for (const color of Object.keys(COLOR_PRESETS) as ColorSlot[]) next.colors[color] = pick(COLOR_PRESETS[color]);
  return next;
}

function OptionThumbnail({ config, slot, optionId, gender }: {
  config: CharacterConfig;
  slot: Slot;
  optionId?: string | null;
  gender?: Gender;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const previewConfig = gender
      ? selectGender(config, gender)
      : { ...config, selected: { ...config.selected, [slot]: optionId ?? null } };
    composeSheet(previewConfig, 'idle').then((sheet) => {
      if (!active) return;
      const context = canvasRef.current?.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
      context.drawImage(sheet, 0, 2 * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
    }).catch(() => { /* The main preview displays image-load failures. */ });
    return () => { active = false; };
  }, [config, slot, optionId, gender]);
  return <canvas ref={canvasRef} width={FRAME_SIZE} height={FRAME_SIZE} className={styles.optionSprite} aria-hidden="true" />;
}

export default function CharacterCreator() {
  const [config, setConfig] = useState<CharacterConfig>(() => createCharacter());
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<(typeof EDITOR_TABS)[number]['id']>('body');
  const [action, setAction] = useState<Action>('walk');
  const [direction, setDirection] = useState(2);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(8);
  const [zoom, setZoom] = useState(5);
  const [sheet, setSheet] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const currentAction = useMemo(() => ACTIONS.find((entry) => entry.id === action)!, [action]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setConfig(sanitizeCharacter(JSON.parse(saved)));
    } catch { /* Keep the default character when an old preset is corrupted. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config, ready]);

  useEffect(() => {
    let active = true;
    composeSheet(config, action).then((result) => {
      if (active) { setSheet(result); setError(null); }
    }).catch((reason: unknown) => {
      if (active) { setSheet(null); setError(reason instanceof Error ? reason.message : 'Could not load LPC assets'); }
    });
    return () => { active = false; };
  }, [config, action]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((previous) => (previous + 1) % currentAction.frames), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, fps, currentAction.frames]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    if (sheet) context.drawImage(sheet, (frame % currentAction.frames) * FRAME_SIZE, direction * FRAME_SIZE,
      FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
  }, [sheet, frame, direction, currentAction.frames]);

  function changeAction(next: Action) {
    setAction(next);
    setFrame(0);
  }

  function changeGender(gender: Gender) { setConfig((current) => selectGender(current, gender)); }

  function changeSelected(slot: Slot, id: string | null) {
    setConfig((current) => ({ ...current, selected: { ...current.selected, [slot]: id } }));
  }

  function changeColor(color: ColorSlot, value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    setConfig((current) => ({ ...current, colors: { ...current.colors, [color]: value } }));
  }

  async function exportFile(kind: 'png' | 'pack') {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'png') await downloadActionPng(config, action);
      else await downloadCharacterPack(config);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export failed');
    } finally { setBusy(false); }
  }

  const options = tab === 'body' ? [] : getOptions(tab, config.gender);
  const colorSlot = SLOT_COLOR[tab];

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link href="/" className={styles.back} aria-label="Back to SpriteCraft"><ArrowLeft size={18} /></Link>
          <div>
            <p className={styles.eyebrow}>SPRITECRAFT / CHARACTER WORKSHOP</p>
            <h1>Character Creator <span className={styles.beta}>ALPHA 01</span></h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" size="sm" onClick={() => setConfig(randomCharacter(config))}><Dices size={15} /> Randomize</Button>
          <Button variant="outline" size="sm" onClick={() => { setConfig(createCharacter(config.gender)); setTab('body'); }}><RotateCcw size={15} /> Reset</Button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Character categories">
          <div className={styles.panelHeading}><span>01 / COMPONENTS</span><Sparkles size={15} /></div>
          <nav className={styles.tabs}>
            {EDITOR_TABS.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setTab(entry.id)}
                className={`${styles.tab} ${tab === entry.id ? styles.tabActive : ''}`} aria-current={tab === entry.id ? 'page' : undefined}>
                <span>{entry.title}</span><small>{entry.hint}</small>
              </button>
            ))}
          </nav>
          <div className={styles.sidebarNote}>
            <strong>Modular LPC layers</strong>
            <p>Each part shares the same animation grid. Your last combination is kept in this browser.</p>
          </div>
        </aside>

        <section className={styles.stage} aria-label="Character preview">
          <div className={styles.stageToolbar}>
            <div><span className={styles.sectionNumber}>02 / LIVE PREVIEW</span><strong>Sprite viewport</strong></div>
            <div className={styles.zoomControls}>
              <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(2, value - 1))}><ZoomOut size={16} /></button>
              <span>{zoom * 100}%</span>
              <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(8, value + 1))}><ZoomIn size={16} /></button>
            </div>
          </div>

          <div className={styles.previewArea}>
            <div className={styles.previewGrid}>
              <canvas ref={previewRef} width={FRAME_SIZE} height={FRAME_SIZE} className={styles.sprite}
                style={{ width: `${FRAME_SIZE * zoom}px`, height: `${FRAME_SIZE * zoom}px` }}
                role="img" aria-label={`${config.gender} character ${action} animation facing ${DIRECTIONS[direction].label}`} />
            </div>
            {!sheet && !error && <div className={styles.loading}><Loader2 className={styles.spin} /> Composing layers…</div>}
          </div>

          <div className={styles.playback}>
            <div className={styles.directionRow} aria-label="Facing direction">
              {DIRECTIONS.map((item) => (
                <button key={item.id} onClick={() => setDirection(item.row)}
                  className={direction === item.row ? styles.controlActive : ''} aria-pressed={direction === item.row}>{item.label}</button>
              ))}
            </div>
            <div className={styles.animationControls}>
              <select aria-label="Animation" value={action} onChange={(event) => changeAction(event.target.value as Action)}>
                {ACTIONS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.frames} frames</option>)}
              </select>
              <button aria-label="Previous frame" title="Previous frame" onClick={() => { setPlaying(false); setFrame((current) => (current + currentAction.frames - 1) % currentAction.frames); }}><ChevronLeft size={18} /></button>
              <button aria-label={playing ? 'Pause animation' : 'Play animation'} title={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((current) => !current)} className={styles.playButton}>
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button aria-label="Next frame" title="Next frame" onClick={() => { setPlaying(false); setFrame((current) => (current + 1) % currentAction.frames); }}><ChevronRight size={18} /></button>
              <label className={styles.fps}>FPS <input type="number" min="1" max="24" value={fps} onChange={(event) => setFps(Math.max(1, Math.min(24, Number(event.target.value) || 1)))} /></label>
            </div>
            <div className={styles.frameCount}>Frame {frame % currentAction.frames + 1} / {currentAction.frames} · 64 × 64 px</div>
          </div>
        </section>

        <aside className={styles.inspector} aria-label="Edit selected component">
          <div className={styles.panelHeading}><span>03 / CUSTOMIZE</span><span>{tab.toUpperCase()}</span></div>
          <h2>{EDITOR_TABS.find((entry) => entry.id === tab)?.title}</h2>
          {tab === 'body' ? (
            <>
              <p className={styles.helper}>Pick a base. Compatible head, clothes and footwear will be selected automatically.</p>
              <div className={styles.choiceGrid}>
                {(['male', 'female'] as const).map((gender) => (
                  <button type="button" className={`${styles.choice} ${config.gender === gender ? styles.choiceActive : ''}`}
                    key={gender} onClick={() => changeGender(gender)} aria-pressed={config.gender === gender}>
                    <span className={styles.choicePreview}><OptionThumbnail config={config} slot="body" gender={gender} /></span>
                    <span>{gender === 'male' ? 'Male base' : 'Female base'}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className={styles.helper}>Swap this layer without changing the rest of your character.</p>
              <div className={styles.choiceGrid}>
                {tab !== 'eyes' && <button className={`${styles.choice} ${config.selected[tab] === null ? styles.choiceActive : ''}`}
                  onClick={() => changeSelected(tab, null)} aria-pressed={config.selected[tab] === null}>
                  <span className={styles.choicePreview}><OptionThumbnail config={config} slot={tab} optionId={null} /></span><span>None</span>
                </button>}
                {options.map((option) => (
                  <button key={option.id} className={`${styles.choice} ${config.selected[tab] === option.id ? styles.choiceActive : ''}`}
                    onClick={() => changeSelected(tab, option.id)} aria-pressed={config.selected[tab] === option.id}>
                    <span className={styles.choicePreview}><OptionThumbnail config={config} slot={tab} optionId={option.id} /></span><span>{option.label}</span>
                  </button>
                ))}
              </div>
              {tab === 'beard' && config.gender === 'female' && <p className={styles.helper}>Additional facial hair shapes can be added to the asset catalog later.</p>}
            </>
          )}

          {colorSlot && (
            <div className={styles.colorSection}>
              <h3>{colorSlot === 'skin' ? 'Skin tone' : `${colorSlot.charAt(0).toUpperCase()}${colorSlot.slice(1)} color`}</h3>
              <div className={styles.swatches}>
                {COLOR_PRESETS[colorSlot].map((hex) => (
                  <button key={hex} aria-label={`Set color ${hex}`} aria-pressed={config.colors[colorSlot] === hex}
                    className={config.colors[colorSlot] === hex ? styles.swatchActive : ''}
                    onClick={() => changeColor(colorSlot, hex)} style={{ backgroundColor: hex }} />
                ))}
                <label className={styles.customColor} title="Choose custom color">
                  <input aria-label="Custom color" type="color" value={config.colors[colorSlot]} onChange={(event) => changeColor(colorSlot, event.target.value)} />
                </label>
              </div>
              <p className={styles.colorValue}>{config.colors[colorSlot].toUpperCase()}</p>
            </div>
          )}

          <div className={styles.exportSection}>
            <h3>Export character</h3>
            <p>PNG exports the active animation. ZIP contains all four animations, your settings and art attribution.</p>
            <Button disabled={busy || !sheet} onClick={() => void exportFile('pack')} className={styles.exportPrimary}>
              {busy ? <Loader2 className={styles.spin} /> : <Download size={16} />} Export Animation Pack
            </Button>
            <Button disabled={busy || !sheet} onClick={() => void exportFile('png')} variant="outline" className={styles.exportSecondary}>
              <Download size={16} /> Export {currentAction.label} PNG
            </Button>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>Art: Universal LPC · Source revision {SOURCE_REVISION.slice(0, 8)} · Locally bundled starter library</span>
        <a href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator#licensing-and-attribution-credits"
          target="_blank" rel="noopener noreferrer">Art licenses & credits ↗</a>
      </footer>
    </main>
  );
}
