'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trash2, Edit2, FolderOpen, Clock, Layout } from 'lucide-react';
import { getAllProjectsSummary, deleteProject, renameProject, ProjectSummary } from '@/lib/projectDatabase';
import ChangelogDrawer from '@/components/ChangelogDrawer';
import { ThemeToggle } from '@/components/ThemeToggle';
import styles from './page.module.css';

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // Interactive Changelog Drawer States
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [changelogFilter, setChangelogFilter] = useState<'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer'>('All');

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

  const openChangelog = (filter: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer') => {
    setChangelogFilter(filter);
    setIsChangelogOpen(true);
  };

  return (
    <main className={styles.main}>
      {/* Left Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.logoRow}>
            <span className={styles.logoIcon}>◆</span>
            <h2 className={styles.logoText}>SPRITECRAFT</h2>
          </div>
          <p className={styles.logoMotto}>PROXY WORKSHOP</p>
          
          <nav className={styles.navMenu}>
            <Link href="/" className={`${styles.navItem} ${styles.navItemActive}`}>
              <Layout size={16} />
              <span>Dashboard</span>
            </Link>
            <Link href="/tools/video-to-spritesheet" className={styles.navItem}>
              🎬 Video Spritesheet
            </Link>
            <Link href="/tools/pixelator" className={styles.navItem}>
              👾 Sprite Pixelator
            </Link>
            <Link href="/tools/3d-pixelator" className={styles.navItem}>
              📦 3D Pixel-Painter
            </Link>
            <Link href="/tools/stylizer" className={styles.navItem}>
              🎨 Material Stylizer
            </Link>
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          <div className={styles.disclaimerBox}>
            <p className={styles.warningTitle}>⚠️ LOCAL STORAGE ONLY</p>
            <p className={styles.warningDesc}>
              Saved projects reside in IndexedDB. Make sure to export your sheets as PNG/JSON before clearing browser data.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <button 
              onClick={() => openChangelog('All')}
              className={styles.changelogTrigger}
              title="View platform update logs"
            >
              <Clock size={12} />
              Proxy Log History
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main Dashboard Content Area */}
      <div className={styles.contentArea}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            Advance with expert guidance
          </h1>
          <p className={styles.subtitle}>
            Revamped high-performance client-side asset manipulators for modern indie game developers and artists.
            <strong> Fully Private. Zero server uploads. GPU Accelerated.</strong>
          </p>
        </header>

        {/* Tools Portal Cards */}
        <section className={styles.toolsSuite}>
          <div className={styles.toolCard}>
            <div className={styles.toolHeader}>
              <div className={styles.toolIcon}>🎬</div>
              <span className={styles.toolBadge}>v0.8.2-beta</span>
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
              <li>► Modern dockable tabbed workspace layout</li>
            </ul>
            <Link href="/tools/video-to-spritesheet" className={styles.toolCta}>
              Launch Spritesheet Editor
            </Link>
          </div>

          <div className={styles.toolCard}>
            <div className={styles.toolHeader}>
              <div className={styles.toolIcon}>👾</div>
              <span className={styles.toolBadge}>v0.5.0-alpha</span>
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
            <Link href="/tools/pixelator" className={styles.toolCta}>
              Launch Sprite Pixelator
            </Link>
          </div>

          <div className={styles.toolCard}>
            <div className={styles.toolHeader}>
              <div className={styles.toolIcon}>📦</div>
              <span className={styles.toolBadge}>v0.2.1-alpha</span>
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
            <Link href="/tools/3d-pixelator" className={styles.toolCta}>
              Launch 3D Pixel-Painter
            </Link>
          </div>

          <div className={styles.toolCard}>
            <div className={styles.toolHeader}>
              <div className={styles.toolIcon}>🧱</div>
              <span className={styles.toolBadge}>v0.9.0-beta</span>
            </div>
            <div className={styles.toolTitleRow}>
              <h2 className={styles.toolTitle}>Trimsheet Builder</h2>
              <button
                onClick={() => openChangelog('trimsheet')}
                className={styles.toolChangelogBtn}
                title="View tool updates history"
              >
                <Clock size={12} />
              </button>
            </div>
            <p className={styles.toolDesc}>
              Lay out named regions on a square trimsheet, drop Polyhaven or your own PBR materials
              onto each region with per-region tiling, and export engine-ready albedo, normal,
              roughness, metalness, and AO maps plus a region JSON.
            </p>
            <ul className={styles.toolFeatures}>
              <li>► Grid + freeform region layout</li>
              <li>► Polyhaven library + custom texture upload</li>
              <li>► Per-region tiling: scale, offset, rotation</li>
              <li>► Exports 5 PBR maps + region JSON as .zip</li>
            </ul>
            <Link href="/tools/trimsheet" className={styles.toolCta}>
              Launch Trimsheet Builder
            </Link>
          </div>

          <div className={styles.toolCard}>
            <div className={styles.toolHeader}>
              <div className={styles.toolIcon}>🎨</div>
              <span className={styles.toolBadge}>v0.10.0-beta</span>
            </div>
            <div className={styles.toolTitleRow}>
              <h2 className={styles.toolTitle}>Material Stylizer</h2>
              <button
                onClick={() => openChangelog('stylizer')}
                className={styles.toolChangelogBtn}
                title="View tool updates history"
              >
                <Clock size={12} />
              </button>
            </div>
            <p className={styles.toolDesc}>
              Convert realistic textures and PBR materials into hand-painted, stylized looks —
              painterly, cel, watercolor, or sketch — with baked lighting and regenerated maps.
            </p>
            <Link href="/tools/stylizer" className={styles.toolCta}>
              Launch Material Stylizer
            </Link>
          </div>
        </section>

        {/* Recent Local Projects Dashboard Section */}
        <section className={styles.recentProjectsSection}>
          <h3 className={styles.projectsHeader}>
            <FolderOpen size={18} style={{ color: 'var(--primary-color)' }} />
            Recent Local Operations
          </h3>

          {isLoading ? (
            <div className={styles.emptyState}>
              <p>Scanning local IndexedDB database store...</p>
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
                const isTrimsheet = proj.type === 'trimsheet';
                const isStylizer = proj.type === 'stylizer';

                let targetLink = '';
                if (isSpritesheet) targetLink = `/tools/video-to-spritesheet?project=${proj.id}`;
                else if (isPixelator) targetLink = `/tools/pixelator?project=${proj.id}`;
                else if (isThreePainter) targetLink = `/tools/3d-pixelator?project=${proj.id}`;
                else if (isTrimsheet) targetLink = `/tools/trimsheet?project=${proj.id}`;
                else if (isStylizer) targetLink = `/tools/stylizer?project=${proj.id}`;

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
                        {isSpritesheet ? '🎬 Spritesheet' : isPixelator ? '👾 Pixelator' : isTrimsheet ? '🧱 Trimsheet' : isStylizer ? '🎨 Stylizer' : '📦 3D Painter'}
                      </span>
                      <div className={styles.projectActions}>
                        <button 
                          className={styles.actionButton}
                          onClick={() => startRename(proj.id, proj.name)}
                          title="Rename Operation"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          onClick={() => handleDelete(proj.id, proj.name)}
                          title="Delete Operation"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {editingId === proj.id ? (
                      <div style={{ display: 'flex', gap: '6px', margin: '8px 0 4px' }}>
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
                            background: 'var(--background-color)',
                            border: '2px solid var(--border-color)',
                            color: 'var(--text-color)',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.8rem',
                            outline: 'none',
                            fontFamily: 'inherit'
                          }}
                          autoFocus
                        />
                        <button 
                          onClick={() => handleRenameSubmit(proj.id)}
                          style={{
                            background: 'var(--primary-color)',
                            border: '2px solid var(--border-color)',
                            color: '#ffffff',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textTransform: 'uppercase'
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
                          <Clock size={11} /> Saved:
                        </span>
                        <strong>{formatDate(proj.updatedAt)}</strong>
                      </div>
                      <div className={styles.projectMetaRow}>
                        <span>{isThreePainter ? 'Layers Count:' : isTrimsheet ? 'Regions Count:' : 'Frames Count:'}</span>
                        <strong>{proj.frameCount} {isThreePainter ? 'layers' : isTrimsheet ? 'regions' : 'frames'}</strong>
                      </div>
                    </div>

                    <Link href={targetLink} className={styles.projectLink}>
                      <FolderOpen size={13} />
                      Restore Workspace
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Engine Highlights grid */}
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
      </div>

      {/* Interactive Operations Drawer */}
      <ChangelogDrawer 
        isOpen={isChangelogOpen} 
        onClose={() => setIsChangelogOpen(false)} 
        initialFilter={changelogFilter as 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet'}
      />
    </main>
  );
}
