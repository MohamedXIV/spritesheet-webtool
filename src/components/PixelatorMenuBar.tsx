'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useEditorContext } from '@/contexts/EditorContext';
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

export function PixelatorMenuBar() {
  const {
    visiblePanels,
    togglePanel,
    resetLayout,
    pixelatorSlicer,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    projectName,
    setProjectName,
    triggerSave,
    isSaving,
    autosaveNotification
  } = useEditorContext();

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
          {isDirty && <span className={styles.dirtyDot} title="Unsaved changes">●</span>}
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
                triggerSave?.();
                closeMenu();
              }}
            >
              <span className={styles.itemLabel}>Save Project</span>
              <span className={styles.itemHotkey}>Ctrl+S</span>
            </button>
            <div className={styles.separator} />
            <button 
              className={styles.item} 
              onClick={() => {
                pixelatorSlicer?.handleResetImage();
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

      {/* Edit Dropdown */}
      <div className={styles.menuItem}>
        <div 
          className={`${styles.menuTrigger} ${activeMenu === 'edit' ? styles.menuTriggerActive : ''}`}
          onClick={() => toggleMenu('edit')}
          onMouseEnter={() => onMouseEnter('edit')}
        >
          Edit
        </div>
        {activeMenu === 'edit' && (
          <div className={styles.dropdown}>
            <button 
              className={styles.item} 
              disabled={!canUndo}
              onClick={() => {
                undo?.();
                closeMenu();
              }}
            >
              <span className={styles.itemLabel}>Undo</span>
              <span className={styles.itemHotkey}>Ctrl+Z</span>
            </button>
            <button 
              className={styles.item} 
              disabled={!canRedo}
              onClick={() => {
                redo?.();
                closeMenu();
              }}
            >
              <span className={styles.itemLabel}>Redo</span>
              <span className={styles.itemHotkey}>Ctrl+Y</span>
            </button>
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
                    togglePanel(panel.id);
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
                resetLayout();
                closeMenu();
              }}
            >
              Reset Panels Layout
            </button>
          </div>
        )}
      </div>

      {/* Editable Project Name Input */}
      <div className={styles.menuItem} style={{ marginLeft: '12px' }}>
        <input
          type="text"
          value={projectName || ''}
          onChange={(e) => setProjectName?.(e.target.value)}
          placeholder="Untitled Project"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            color: '#cbd5e1',
            fontSize: '0.78rem',
            padding: '4px 10px',
            width: '180px',
            outline: 'none',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'rgba(168, 85, 247, 0.4)';
            e.target.style.background = 'rgba(0, 0, 0, 0.2)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.target.style.background = 'rgba(255, 255, 255, 0.03)';
          }}
        />
      </div>

      {/* Autosaved Indicator Status */}
      {autosaveNotification && (
        <span 
          style={{ 
            fontSize: '0.72rem', 
            color: '#10b981', 
            marginLeft: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }} />
          {autosaveNotification}
        </span>
      )}
      {isSaving && (
        <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '12px' }}>
          Saving...
        </span>
      )}
    </div>
  );
}
