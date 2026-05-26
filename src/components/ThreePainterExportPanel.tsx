'use client';

import React, { useState } from 'react';
import { Download, FileDown, Box } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import styles from './ThreePainterExportPanel.module.css';

export function ThreePainterExportPanel() {
  const {
    painter,
    projectName,
    isModelLoaded,
  } = useThreePainterContext();

  const [isExporting, setIsExporting] = useState(false);

  /**
   * Bake and download the composite 2D texture as a PNG file
   */
  const handleExportTexture = () => {
    if (!painter) return;

    // Grab the offscreen composite texture canvas directly from DOM
    const canvas = document.getElementById('three-painter-composite-canvas') as HTMLCanvasElement;
                   
    if (!canvas) {
      alert('Failed to find composition texture canvas');
      return;
    }

    try {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-texture.png`;
      link.href = url;
      link.click();
    } catch (e) {
      console.error('Texture export failed:', e);
      alert('Failed to export texture due to canvas security rules.');
    }
  };

  /**
   * Export the 3D model with the custom texture baked in as a GLB file
   */
  const handleExportModelGLB = async () => {
    if (!painter || !isModelLoaded) return;
    setIsExporting(true);

    try {
      // Import GLTFExporter dynamically to keep page load ultra-fast
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();

      // Find the loaded model group inside the ThreeJS scene
      let targetNode: any = null;
      painter.scene.traverse((child) => {
        if (!targetNode && child.name.includes('loaded-group') || child.parent === painter.scene && child !== painter.camera && child.type === 'Group') {
          targetNode = child;
        }
      });

      if (!targetNode) {
        // Fallback: export the entire scene (excluding camera)
        targetNode = painter.scene;
      }

      // Export using binary format (GLB) to bundle geometry, UVs, and custom texture together
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
          console.error('GLTF Export failed:', error);
          alert('Failed to export model as GLB.');
          setIsExporting(false);
        },
        {
          binary: true,
          animations: [],
          truncateDrawRange: true,
          onlyVisible: true,
        }
      );
    } catch (e) {
      console.error('Model export setup failed:', e);
      alert('Failed to load ThreeJS exporter utility.');
      setIsExporting(false);
    }
  };

  if (!isModelLoaded) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.placeholderContent}>
          <Box size={32} className={styles.placeholderIcon} />
          <p>Import a 3D model first to activate export operations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Texture Asset Bake</h4>
        <p className={styles.description}>
          Bake all painting layers, opacities, blend modes, and pixelation/dither filters into a single, optimized PNG texture map.
        </p>
        <button className={styles.exportButton} onClick={handleExportTexture}>
          <Download size={16} />
          Export Texture (PNG)
        </button>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>3D Mesh Assembly</h4>
        <p className={styles.description}>
          Compile the 3D geometry alongside the custom retro texture, and package it into a single, game-ready binary GLB file compatible with Unity, Unreal, Godot, and Blender.
        </p>
        <button
          className={`${styles.exportButton} ${styles.glbButton}`}
          onClick={handleExportModelGLB}
          disabled={isExporting}
        >
          <FileDown size={16} />
          {isExporting ? 'Packaging Asset...' : 'Export Model (GLB)'}
        </button>
      </div>
    </div>
  );
}
