'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar, Info, Layers } from 'lucide-react';
import { changelogData, ChangelogVersion } from '@/data/changelog';
import styles from './ChangelogDrawer.module.css';

interface ChangelogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilter?: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet';
}

export default function ChangelogDrawer({ isOpen, onClose, initialFilter = 'All' }: ChangelogDrawerProps) {
  const [activeFilter, setActiveFilter] = useState<'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet'>('All');

  // Sync initial filter when drawer opens
  useEffect(() => {
    if (isOpen) {
      setActiveFilter(initialFilter);
    }
  }, [isOpen, initialFilter]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredData = activeFilter === 'All'
    ? changelogData
    : changelogData.filter(v => v.toolScope === activeFilter);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`${styles.backdrop} ${isOpen ? styles.backdropVisible : ''}`} 
        onClick={onClose}
      />

      {/* Sliding Drawer Container */}
      <aside 
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}
        aria-label="System Operations Changelog"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <Clock size={20} />
            <h2 className={styles.title}>System Changelog</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="Close Panel">
            <X size={18} />
          </button>
        </div>

        {/* Tab Filters */}
        <div className={styles.filterRow}>
          <button 
            className={`${styles.filterBtn} ${activeFilter === 'All' ? styles.filterBtnActive : ''}`}
            onClick={() => setActiveFilter('All')}
          >
            All Updates
          </button>
          <button 
            className={`${styles.filterBtn} ${activeFilter === 'spritesheet' ? styles.filterBtnActive : ''}`}
            onClick={() => setActiveFilter('spritesheet')}
          >
            Spritesheet
          </button>
          <button 
            className={`${styles.filterBtn} ${activeFilter === 'pixelator' ? styles.filterBtnActive : ''}`}
            onClick={() => setActiveFilter('pixelator')}
          >
            Pixelator
          </button>
          <button 
            className={`${styles.filterBtn} ${activeFilter === '3d-painter' ? styles.filterBtnActive : ''}`}
            onClick={() => setActiveFilter('3d-painter')}
          >
            3D Painter
          </button>
        </div>

        {/* Log Content List */}
        <div className={styles.contentList}>
          {filteredData.length === 0 ? (
            <div className={styles.emptyState}>
              <Info size={40} />
              <p>No operational logs matching this query filter.</p>
            </div>
          ) : (
            filteredData.map((ver, idx) => (
              <div key={`${ver.version}-${idx}`} className={styles.versionBlock}>
                {/* Block Title & Meta */}
                <div className={styles.versionHeader}>
                  <div className={styles.versionBadgeArea}>
                    <span className={styles.versionTag}>{ver.version}</span>
                    <span className={styles.toolBadge}>{ver.toolName}</span>
                  </div>
                  <div className={styles.dateArea}>
                    <Calendar size={12} />
                    <span>{ver.date}</span>
                  </div>
                </div>

                {/* Individual Logs List */}
                <div className={styles.itemsContainer}>
                  {ver.items.map((item, itemIdx) => {
                    let catClass = styles.catAdded;
                    if (item.category === 'Changed') catClass = styles.catChanged;
                    else if (item.category === 'Fixed') catClass = styles.catFixed;
                    else if (item.category === 'Security') catClass = styles.catSecurity;

                    return (
                      <div key={itemIdx} className={styles.itemRow}>
                        <span className={`${styles.catBadge} ${catClass}`}>
                          {item.category}
                        </span>
                        <span className={styles.itemText}>{item.detail}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
