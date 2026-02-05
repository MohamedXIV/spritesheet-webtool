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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveMenu(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
          className={`${styles.menuTrigger} ${styles.appTitle} ${activeMenu === 'app' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('app')}
          onMouseEnter={() => onMouseEnter('app')}
          aria-haspopup="true"
          aria-expanded={activeMenu === 'app'}
          aria-label="Application menu"
        >
          <span className="text-primary">◆</span>
          Spritesheet Creator
        </button>
        {activeMenu === 'app' && (
          <div className={styles.dropdown} role="menu">
            <div className={`${styles.item} ${styles.itemDisabled}`} role="menuitem" aria-disabled="true">
              Version 0.1.0
            </div>
            <div className={styles.separator} role="separator" />
            <button className={styles.item} onClick={closeMenu} role="menuitem">
              About
            </button>
          </div>
        )}
      </div>

      {/* File Menu */}
      <div className={styles.menuItem}>
        <button
          className={`${styles.menuTrigger} ${activeMenu === 'file' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('file')}
          onMouseEnter={() => onMouseEnter('file')}
          aria-haspopup="true"
          aria-expanded={activeMenu === 'file'}
        >
          File
        </button>
        {activeMenu === 'file' && (
          <div className={styles.dropdown} role="menu">
            <button
              className={styles.item} 
              onClick={() => {
                onOpenVideo();
                closeMenu();
              }}
              role="menuitem"
            >
              Open Video...
              <span className={styles.shortcut}>Ctrl+O</span>
            </button>
            <div className={styles.separator} role="separator" />
            <button
              className={styles.item} 
              onClick={() => {
                onExport();
                closeMenu();
              }}
              role="menuitem"
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
          className={`${styles.menuTrigger} ${activeMenu === 'view' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('view')}
          onMouseEnter={() => onMouseEnter('view')}
          aria-haspopup="true"
          aria-expanded={activeMenu === 'view'}
        >
          View
        </button>
        {activeMenu === 'view' && (
          <div className={styles.dropdown} role="menu">
            {PANELS.map((panel) => (
              <button
                key={panel.id}
                className={styles.item}
                onClick={() => {
                  onTogglePanel(panel.id);
                }}
                role="menuitemcheckbox"
                aria-checked={visiblePanels.has(panel.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className={styles.checkContainer}>
                    {visiblePanels.has(panel.id) && <Check size={14} />}
                  </div>
                  {panel.name}
                </div>
              </button>
            ))}
            <div className={styles.separator} role="separator" />
            <button
              className={styles.item} 
              onClick={() => {
                onResetLayout();
                closeMenu();
              }}
              role="menuitem"
            >
              Reset Layout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
