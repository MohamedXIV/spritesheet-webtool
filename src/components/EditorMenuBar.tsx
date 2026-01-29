'use client';

/**
 * EditorMenuBar - Professional menu bar with custom CSS implementation
 * Bypasses Shadcn/Tailwind conflicts for precise control
 */

import React, { useState, useEffect, useRef } from 'react';
import styles from './EditorMenuBar.module.css';
import { Check } from 'lucide-react';

// Panel definitions for the View menu
const PANELS = [
  { id: 'video-loader', name: 'Load Video' },
  { id: 'frame-grid', name: 'Frames' },
  { id: 'preview', name: 'Preview' },
  { id: 'timeline', name: 'Timeline' },
  { id: 'bg-removal', name: 'Background Removal' },
  { id: 'outline', name: 'Outline' },
  { id: 'watermark', name: 'Watermark' },
  { id: 'export', name: 'Export' },
] as const;

interface EditorMenuBarProps {
  visiblePanels: Set<string>;
  onTogglePanel: (panelId: string) => void;
  onResetLayout: () => void;
  onOpenVideo: () => void;
  onExport: () => void;
}

export function EditorMenuBar({
  visiblePanels,
  onTogglePanel,
  onResetLayout,
  onOpenVideo,
  onExport,
}: EditorMenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (name: string) => {
    setActiveMenu(activeMenu === name ? null : name);
  };

  const onMouseEnter = (name: string) => {
    if (activeMenu) {
      setActiveMenu(name);
    }
  };

  const closeMenu = () => {
    setActiveMenu(null);
  };

  return (
    <div className={styles.menubar} ref={menuRef}>
      {/* App Name */}
      <div className={styles.menuItem}>
        <button
          type="button"
          className={`${styles.menuTrigger} ${styles.appTitle} ${activeMenu === 'app' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('app')}
          onMouseEnter={() => onMouseEnter('app')}
        >
          <span className="text-primary">◆</span>
          Spritesheet Creator
        </button>
        {activeMenu === 'app' && (
          <div className={styles.dropdown}>
            <div className={`${styles.item} ${styles.itemDisabled}`}>
              Version 0.1.0
            </div>
            <div className={styles.separator} />
            <button
              type="button"
              className={styles.item}
              onClick={closeMenu}
            >
              About
            </button>
          </div>
        )}
      </div>

      {/* File Menu */}
      <div className={styles.menuItem}>
        <button
          type="button"
          className={`${styles.menuTrigger} ${activeMenu === 'file' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('file')}
          onMouseEnter={() => onMouseEnter('file')}
        >
          File
        </button>
        {activeMenu === 'file' && (
          <div className={styles.dropdown}>
            <button
              type="button"
              className={styles.item} 
              onClick={() => {
                onOpenVideo();
                closeMenu();
              }}
            >
              Open Video...
              <span className={styles.shortcut}>Ctrl+O</span>
            </button>
            <div className={styles.separator} />
            <button
              type="button"
              className={styles.item} 
              onClick={() => {
                onExport();
                closeMenu();
              }}
            >
              Export...
              <span className={styles.shortcut}>Ctrl+E</span>
            </button>
          </div>
        )}
      </div>

      {/* View Menu */}
      <div className={styles.menuItem}>
        <button
          type="button"
          className={`${styles.menuTrigger} ${activeMenu === 'view' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('view')}
          onMouseEnter={() => onMouseEnter('view')}
        >
          View
        </button>
        {activeMenu === 'view' && (
          <div className={styles.dropdown}>
            {PANELS.map((panel) => (
              <button
                type="button"
                key={panel.id}
                className={styles.item}
                onClick={() => {
                  onTogglePanel(panel.id);
                  // Don't close menu to allow multiple toggles, or close if standard behavior? 
                  // Standard behavior usually keeps open for checkboxes but single click for actions.
                  // I'll keep it open for convenience.
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className={styles.checkContainer}>
                    {visiblePanels.has(panel.id) && <Check size={14} />}
                  </div>
                  {panel.name}
                </div>
              </button>
            ))}
            <div className={styles.separator} />
            <button
              type="button"
              className={styles.item} 
              onClick={() => {
                onResetLayout();
                closeMenu();
              }}
            >
              Reset Layout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
