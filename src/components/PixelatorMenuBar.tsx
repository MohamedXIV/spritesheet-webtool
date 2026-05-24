'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import styles from './PixelatorMenuBar.module.css';

const PANELS = [
  { id: 'spritesheet-slicer', name: 'Spritesheet Slicer' },
  { id: 'frame-grid', name: 'Frames' },
  { id: 'preview', name: 'Preview' },
  { id: 'timeline', name: 'Timeline' },
  { id: 'pixelate', name: 'Pixelation' },
  { id: 'bg-removal', name: 'Background Removal' },
  { id: 'watermark', name: 'Watermark' },
  { id: 'export', name: 'Export' },
] as const;

interface PixelatorMenuBarProps {
  visiblePanels: Set<string>;
  onTogglePanel: (panelId: string) => void;
  onResetLayout: () => void;
  onResetWorkspace: () => void;
}

export function PixelatorMenuBar({
  visiblePanels,
  onTogglePanel,
  onResetLayout,
  onResetWorkspace,
}: PixelatorMenuBarProps) {
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
      {/* App Logo & Link */}
      <div className={styles.menuItem}>
        <div 
          className={`${styles.menuTrigger} ${styles.appTitle} ${activeMenu === 'app' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('app')}
          onMouseEnter={() => onMouseEnter('app')}
        >
          <span className={styles.logoBullet}>◆</span>
          Sprite Pixelator
        </div>
        {activeMenu === 'app' && (
          <div className={styles.dropdown}>
            <div className={`${styles.item} ${styles.itemDisabled}`}>
              Version 0.1.0 (Beta)
            </div>
            <div className={styles.separator} />
            <Link href="/" className={styles.item} onClick={closeMenu}>
              ← Back to Portal Hub
            </Link>
          </div>
        )}
      </div>

      {/* File Dropdown */}
      <div className={styles.menuItem}>
        <div 
          className={`${styles.menuTrigger} ${activeMenu === 'file' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('file')}
          onMouseEnter={() => onMouseEnter('file')}
        >
          File
        </div>
        {activeMenu === 'file' && (
          <div className={styles.dropdown}>
            <button 
              className={styles.item} 
              onClick={() => {
                onResetWorkspace();
                closeMenu();
              }}
            >
              Reset Workspace
            </button>
            <div className={styles.separator} />
            <Link href="/" className={styles.item} onClick={closeMenu}>
              Exit to Portal Hub
            </Link>
          </div>
        )}
      </div>

      {/* View Dropdown (Toggles Panels) */}
      <div className={styles.menuItem}>
        <div 
          className={`${styles.menuTrigger} ${activeMenu === 'view' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('view')}
          onMouseEnter={() => onMouseEnter('view')}
        >
          View
        </div>
        {activeMenu === 'view' && (
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>Workspace Panels</div>
            {PANELS.map(panel => {
              const isChecked = visiblePanels.has(panel.id);
              return (
                <button
                  key={panel.id}
                  className={styles.itemWithCheck}
                  onClick={() => {
                    onTogglePanel(panel.id);
                  }}
                >
                  <span className={styles.checkWrapper}>
                    {isChecked && <Check size={14} className={styles.checkIcon} />}
                  </span>
                  <span>{panel.name}</span>
                </button>
              );
            })}
            <div className={styles.separator} />
            <button 
              className={styles.item}
              onClick={() => {
                onResetLayout();
                closeMenu();
              }}
            >
              Reset Panels Layout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
