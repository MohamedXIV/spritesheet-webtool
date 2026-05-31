'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trash2, Edit2, FolderOpen, Clock, Settings, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';
import { getAllProjectsSummary, deleteProject, renameProject, ProjectSummary } from '@/lib/projectDatabase';
import ChangelogDrawer from '@/components/ChangelogDrawer';
import styles from './page.module.css';

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // Interactive Changelog Drawer States
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [changelogFilter, setChangelogFilter] = useState<'All' | 'spritesheet' | 'pixelator' | '3d-painter'>('All');

  // Fetch projects from IndexedDB on mount
  const loadProjects = async () => {
    try {
      const list = await getAllProjectsSummary();
      setProjects(list);
    } catch (e) {
      console.error('Failed to load local projects:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the local project "${name}"? This action cannot be undone.`)) {
      try {
        await deleteProject(id);
        await loadProjects();
      } catch (e) {
        console.error('Failed to delete project:', e);
        alert('Failed to delete project');
      }
    }
  };

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleRenameSubmit = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await renameProject(id, editingName.trim());
      setEditingId(null);
      await loadProjects();
    } catch (e) {
      console.error('Failed to rename project:', e);
      alert('Failed to rename project');
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const openChangelog = (filter: 'All' | 'spritesheet' | 'pixelator' | '3d-painter') => {
    setChangelogFilter(filter);
    setIsChangelogOpen(true);
  };

  return (
    <main className={styles.main}>
      {/* Premium Background Orbs */}
      <div className={styles.heroBackground}>
        <div className={styles.gradientOrb1} />
        <div className={styles.gradientOrb2} />
      </div>

      {/* Hero Header */}
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => openChangelog('All')}
            className={styles.changelogTrigger}
            title="View platform update logs"
          >
            <Clock size={12} />
            Proxy Log History
          </button>
        </div>
        <h1 className={styles.title}>
          <span className={styles.titleMain}>SPRITECRAFT</span>
          <span className={styles.highlight}>PROXY SYSTEM</span>
        </h1>
        <div className={styles.ribbonWarning}>
          ⚠️ Don't rely on the save system, it's currently buggy
        </div>
        <p className={styles.subtitle}>
          Revamped high-performance client-side asset manipulators for modern proxies and game developers. 
          <strong> Fully Private. Zero server uploads. GPU Accelerated.</strong>
        </p>
      </header>

      {/* Tools Portal Cards */}
      <section className={styles.toolsSuite}>
        <div className={styles.toolCard} data-version="v0.8.2-beta">
          <div className={styles.scanline} />
          <div className={styles.toolIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="4" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <div className={styles.toolTitleRow}>
            <h2 className={styles.toolTitle}>Video to Spritesheet</h2>
            <button 
              onClick={() => openChangelog('spritesheet')}
              className={styles.toolChangelogBtn}
              title="View tool updates history"
            >
              <Clock size={12} />
            </button>
          </div>
          <p className={styles.toolDesc}>
            Load video files (MP4, WebM) or individual images, extract precise frames, 
            remove backgrounds, and compile them into a game-ready spritesheet with JSON metadata.
          </p>
          <ul className={styles.toolFeatures}>
            <li>► FPS-controlled custom frame extraction</li>
            <li>► AI background & watermark removals</li>
            <li>► Sprite outline stroke customizations</li>
            <li>► modern dockable tabbed workspace layout</li>
          </ul>
          <Link href="/tools/video-to-spritesheet" className={styles.toolCta}>
            Launch Spritesheet Editor
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className={styles.toolCard} data-version="v0.5.0-alpha">
          <div className={styles.scanline} />
          <div className={`${styles.toolIcon} ${styles.iconPixel}`}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M7 7h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" fill="currentColor"/>
            </svg>
          </div>
          <div className={styles.toolTitleRow}>
            <h2 className={styles.toolTitle}>Sprite Pixelator</h2>
            <button 
              onClick={() => openChangelog('pixelator')}
              className={styles.toolChangelogBtn}
              title="View tool updates history"
            >
              <Clock size={12} />
            </button>
          </div>
          <p className={styles.toolDesc}>
            Convert packed spritesheets, high-res images, or video clips into retro pixel art. 
            Specify slicing dimensions, apply classic palettes, and dither grids.
          </p>
          <ul className={styles.toolFeatures}>
            <li>► Grid-based or dimension-based sprite slicing</li>
            <li>► Presets: NES, PICO-8, Commodore 64, GameBoy</li>
            <li>► Bayer and Floyd-Steinberg dither models</li>
            <li>► Custom pixel layouts (Blocks, Circles, Diamonds)</li>
          </ul>
          <Link href="/tools/pixelator" className={`${styles.toolCta} ${styles.ctaPixel}`}>
            Launch Sprite Pixelator
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className={styles.toolCard} data-version="v0.2.1-alpha">
          <div className={styles.scanline} />
          <div className={`${styles.toolIcon} ${styles.icon3d}`}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
              <line x1="12" y1="12" x2="12" y2="22" />
            </svg>
          </div>
          <div className={styles.toolTitleRow}>
            <h2 className={styles.toolTitle}>3D Pixel-Painter</h2>
            <button 
              onClick={() => openChangelog('3d-painter')}
              className={styles.toolChangelogBtn}
              title="View tool updates history"
            >
              <Clock size={12} />
            </button>
          </div>
          <p className={styles.toolDesc}>
            Import 3D models, paint directly on UV textures in real-time, composite paint layers, 
            and apply authentic console-style vertex snaps, wobbly texture coordinates, and dither filters.
          </p>
          <ul className={styles.toolFeatures}>
            <li>► Import GLTF, GLB, OBJ, and FBX meshes</li>
            <li>► 5-layer compositor with opacity & blend modes</li>
            <li>► Maya-style paint & viewport navigation</li>
            <li>► Viewport-level classic PSX hardware shader</li>
          </ul>
          <Link href="/tools/3d-pixelator" className={`${styles.toolCta} ${styles.cta3d}`}>
            Launch 3D Pixel-Painter
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Recent Local Projects Dashboard Section */}
      <section className={styles.recentProjectsSection}>
        <h3 className={styles.projectsHeader}>
          <FolderOpen size={22} style={{ color: 'var(--danger-color, #FF007F)' }} />
          Recent Local Proxy Operations
        </h3>

        {isLoading ? (
          <div className={styles.emptyState}>
            <p>Scanning Inter-Knot database store...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No local operations found. Create one by saving your workspace (Ctrl+S) in any tool above!</p>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map((proj) => {
              const isSpritesheet = proj.type === 'spritesheet';
              const isPixelator = proj.type === 'pixelator';
              const isThreePainter = proj.type === '3d-painter';

              let targetLink = '';
              if (isSpritesheet) targetLink = `/tools/video-to-spritesheet?project=${proj.id}`;
              else if (isPixelator) targetLink = `/tools/pixelator?project=${proj.id}`;
              else if (isThreePainter) targetLink = `/tools/3d-pixelator?project=${proj.id}`;

              return (
                <div key={proj.id} className={styles.projectCard}>
                  <div className={styles.projectHeader}>
                    <span 
                      className={`${styles.projectTypeBadge} ${
                        isSpritesheet 
                          ? styles.badgeSpritesheet 
                          : isPixelator 
                            ? styles.badgePixelator 
                            : styles.badge3d
                      }`}
                    >
                      {isSpritesheet ? '🎬 Spritesheet' : isPixelator ? '👾 Pixelator' : '📦 3D Painter'}
                    </span>
                    <div className={styles.projectActions}>
                      <button 
                        className={styles.actionButton}
                        onClick={() => startRename(proj.id, proj.name)}
                        title="Rename Operation"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        className={`${styles.actionButton} ${styles.deleteButton}`}
                        onClick={() => handleDelete(proj.id, proj.name)}
                        title="Delete Operation"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {editingId === proj.id ? (
                    <div style={{ display: 'flex', gap: '6px', margin: '4px 0' }}>
                      <input 
                        type="text" 
                        value={editingName} 
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit(proj.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        style={{
                          flex: 1,
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '2px solid var(--primary-color, #CCFF00)',
                          color: '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          outline: 'none',
                          fontFamily: 'var(--font-family)'
                        }}
                        autoFocus
                      />
                      <button 
                        onClick={() => handleRenameSubmit(proj.id)}
                        style={{
                          background: 'var(--primary-color, #CCFF00)',
                          border: '2px solid #0b0b0f',
                          color: '#0b0b0f',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 900,
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <h4 className={styles.projectName} title={proj.name}>
                      {proj.name}
                    </h4>
                  )}

                  <div className={styles.projectMetadata}>
                    <div className={styles.projectMetaRow}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> Saved:
                      </span>
                      <strong>{formatDate(proj.updatedAt)}</strong>
                    </div>
                    <div className={styles.projectMetaRow}>
                      <span>{isThreePainter ? 'Layers Count:' : 'Frames Count:'}</span>
                      <strong>{proj.frameCount} {isThreePainter ? 'layers' : 'frames'}</strong>
                    </div>
                  </div>

                  <Link href={targetLink} className={styles.projectLink}>
                    <FolderOpen size={14} />
                    Restore Local Workspace
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Hub Features grid */}
      <section className={styles.featuresSection}>
        <h3 className={styles.featuresHeader}>Proxy Engine Core Highlights</h3>
        <div className={styles.featureGrid}>
          <div className={styles.feature}>
            <h4>100% Client-Side Pipeline</h4>
            <p>Everything processes locally in your browser thread using GPU-accelerated canvas API and WebCodecs decoders. No files ever touch outer servers.</p>
          </div>
          <div className={styles.feature}>
            <h4>Game Engine Compatible</h4>
            <p>Export compiled Spritesheets as standard PNG alongside industry-standard JSON coordinates compatible with Unity, Godot, Unreal, and WebGL players.</p>
          </div>
          <div className={styles.feature}>
            <h4>Advanced Hardware Shaders</h4>
            <p>Experience super fast retro pixelation filters, Bayer and custom ordered dithering, wobbly PSX Snaps, and layers compositing in microseconds.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Built with Next.js • Client-Side WASM & Canvas Decoders • Open Source & Ad-Free</p>
      </footer>

      {/* Interactive Operations Drawer */}
      <ChangelogDrawer 
        isOpen={isChangelogOpen} 
        onClose={() => setIsChangelogOpen(false)} 
        initialFilter={changelogFilter} 
      />
    </main>
  );
}
