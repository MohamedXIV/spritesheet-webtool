'use client';

import React, { useState } from 'react';
import { Download, FileDown, Box } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainterExportPanel.module.css';

export function ThreePainterExportPanel() {
  const { painter, projectName, isModelLoaded } = useThreePainterContext();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportTexture = () => {
    if (!painter) return;
    const canvas = document.getElementById('three-painter-composite-canvas') as HTMLCanvasElement;
    if (!canvas) { alert('Could not find composite canvas.'); return; }
    try {
      const link = document.createElement('a');
      link.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-texture.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error(e);
      alert('Texture export failed — canvas security restriction.');
    }
  };

  const handleExportModelGLB = async () => {
    if (!painter || !isModelLoaded) return;
    setIsExporting(true);
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();
      let targetNode: any = null;
      painter.scene.traverse((child) => {
        if (!targetNode && child.parent === painter.scene && child.type === 'Group') targetNode = child;
      });
      if (!targetNode) targetNode = painter.scene;
      exporter.parse(
        targetNode,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.glb`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          setIsExporting(false);
        },
        (error) => {
          console.error(error);
          alert('GLB export failed.');
          setIsExporting(false);
        },
        { binary: true, animations: [], truncateDrawRange: true, onlyVisible: true }
      );
    } catch (e) {
      console.error(e);
      alert('Failed to load GLTF exporter.');
      setIsExporting(false);
    }
  };

  if (!isModelLoaded) {
    return (
      <div className={styles.empty}>
        <Box size={28} className={styles.emptyIcon} />
        <p>Import a 3D model to enable export.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>TEXTURE</span>
        <p className={styles.hint}>Bakes all layers, blends and pixelation into a single PNG.</p>
        <button className={styles.btn} onClick={handleExportTexture}>
          <Download size={12} strokeWidth={2.5} />
          Export Texture (.png)
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>MODEL</span>
        <p className={styles.hint}>Packages geometry + baked texture into a game-ready GLB.</p>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleExportModelGLB}
          disabled={isExporting}
        >
          <FileDown size={12} strokeWidth={2.5} />
          {isExporting ? 'Packaging…' : 'Export Model (.glb)'}
        </button>
      </div>

    </div>
  );
}
