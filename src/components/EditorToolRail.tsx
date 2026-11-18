'use client';

import React from 'react';
import {
  Move,
  SquareDashed,
  Lasso,
  Wand2,
  Paintbrush,
  Eraser,
  Stamp,
  PaintBucket,
  Blend,
  Pipette,
  Shapes,
  Type,
  Hand,
  Search,
  ArrowLeftRight,
} from 'lucide-react';
import type { EditorToolId, ToolSettings } from '@/lib/canvasTools';
import styles from './EditorToolRail.module.css';

interface EditorToolRailProps {
  settings: ToolSettings;
  onChange: (updater: (prev: ToolSettings) => ToolSettings) => void;
}

const TOOL_GROUPS: Array<Array<{ id: EditorToolId; label: string; key: string; Icon: React.ComponentType<{ size?: number }> }>> = [
  [
    { id: 'move', label: 'Move / Transform', key: 'V', Icon: Move },
    { id: 'marquee', label: 'Rectangular Marquee', key: 'M', Icon: SquareDashed },
    { id: 'lasso', label: 'Lasso Selection', key: 'L', Icon: Lasso },
    { id: 'wand', label: 'Magic Wand', key: 'W', Icon: Wand2 },
  ],
  [
    { id: 'brush', label: 'Brush', key: 'B', Icon: Paintbrush },
    { id: 'eraser', label: 'Eraser', key: 'E', Icon: Eraser },
    { id: 'clone', label: 'Clone Stamp (Alt+Click source)', key: 'S', Icon: Stamp },
    { id: 'bucket', label: 'Paint Bucket', key: 'G', Icon: PaintBucket },
    { id: 'gradient', label: 'Gradient', key: 'Shift+G', Icon: Blend },
  ],
  [
    { id: 'eyedropper', label: 'Eyedropper', key: 'I', Icon: Pipette },
    { id: 'shape', label: 'Shapes (Line/Rect/Ellipse)', key: 'U', Icon: Shapes },
    { id: 'text', label: 'Text Tool', key: 'T', Icon: Type },
  ],
  [
    { id: 'hand', label: 'Hand / Pan (Space)', key: 'H', Icon: Hand },
    { id: 'zoom', label: 'Zoom (Alt+Click zoom out)', key: 'Z', Icon: Search },
  ],
];

export function EditorToolRail({ settings, onChange }: EditorToolRailProps) {
  return (
    <div className={styles.rail} aria-label="Canvas Editing Tools">
      {TOOL_GROUPS.map((group, gIdx) => (
        <React.Fragment key={gIdx}>
          {gIdx > 0 && <div className={styles.separator} />}
          {group.map(({ id, label, key, Icon }) => (
            <button
              key={id}
              type="button"
              className={`${styles.toolBtn} ${settings.tool === id ? styles.toolBtnActive : ''}`}
              onClick={() => onChange(prev => ({ ...prev, tool: id }))}
              title={`${label} (${key})`}
              aria-label={label}
            >
              <Icon size={15} />
            </button>
          ))}
        </React.Fragment>
      ))}

      <div className={styles.swatchesArea}>
        <div className={styles.swatchStack}>
          <label
            className={styles.fgSwatch}
            style={{ backgroundColor: settings.foregroundColor }}
            title="Foreground Color"
          >
            <input
              type="color"
              className={styles.hiddenColorInput}
              value={settings.foregroundColor}
              onChange={e => onChange(prev => ({ ...prev, foregroundColor: e.target.value }))}
            />
          </label>
          <label
            className={styles.bgSwatch}
            style={{ backgroundColor: settings.backgroundColor }}
            title="Background Color"
          >
            <input
              type="color"
              className={styles.hiddenColorInput}
              value={settings.backgroundColor}
              onChange={e => onChange(prev => ({ ...prev, backgroundColor: e.target.value }))}
            />
          </label>
        </div>

        <div className={styles.swatchMiniActions}>
          <button
            type="button"
            className={styles.miniActionBtn}
            title="Reset Default Colors (D)"
            onClick={() =>
              onChange(prev => ({ ...prev, foregroundColor: '#ffffff', backgroundColor: '#000000' }))
            }
          >
            ▪
          </button>
          <button
            type="button"
            className={styles.miniActionBtn}
            title="Swap Foreground/Background (X)"
            onClick={() =>
              onChange(prev => ({
                ...prev,
                foregroundColor: prev.backgroundColor,
                backgroundColor: prev.foregroundColor,
              }))
            }
          >
            <ArrowLeftRight size={9} />
          </button>
        </div>
      </div>
    </div>
  );
}
