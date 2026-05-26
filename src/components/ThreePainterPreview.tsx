'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Upload, Box, Loader2 } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import { ThreePainter } from '@/lib/threePainter';
import styles from './ThreePainterPreview.module.css';

export function ThreePainterPreview() {
  const {
    painter,
    setPainterInstance,
    isModelLoaded,
    loadNewModel,
    isLoadingModel,
    loadProgress,
    activeTool,
    brushColor,
    brushSize,
    brushOpacity,
    brushHardness,
    psxEnabled,
    isPaintMode,
    setBrushColor,
  } = useThreePainterContext();

  const viewportRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Initialize Three.js viewport painter
  useEffect(() => {
    if (!viewportRef.current) return;

    // Grab or create the offscreen composite canvas updated by React layers compositor
    let compCanvas = document.getElementById('three-painter-composite-canvas') as HTMLCanvasElement;
    if (!compCanvas) {
      compCanvas = document.createElement('canvas');
      compCanvas.id = 'three-painter-composite-canvas';
      compCanvas.width = 512;
      compCanvas.height = 512;
      // Paint baseline texture color
      const ctx = compCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#dfdfdf';
        ctx.fillRect(0, 0, 512, 512);
      }
      document.body.appendChild(compCanvas);
      // Hide offscreen
      compCanvas.style.position = 'absolute';
      compCanvas.style.left = '-9999px';
      compCanvas.style.top = '-9999px';
    }
    compositeCanvasRef.current = compCanvas;

    // React-to-Three paint dispatch bridge
    const handlePaintStroke = (u: number, v: number, isStart: boolean, isEnd: boolean) => {
      // Find the React-side dispatcher which will be hook-bound in the parent page page.tsx!
      const dispatcher = (window as any).__threePaintStrokeDispatcher;
      if (dispatcher) {
        dispatcher(u, v, isStart, isEnd);
      }
    };

    const painterInstance = new ThreePainter({
      canvasElement: viewportRef.current,
      textureCanvas: compCanvas,
      onPaintStroke: handlePaintStroke,
      onColorPicked: (hex) => setBrushColor(hex),
    });

    setPainterInstance(painterInstance);

    // Sync options initially
    painterInstance.setPSXShader(psxEnabled);
    painterInstance.setPaintMode(isPaintMode);

    // Observe viewport size changes to resize camera aspects
    const resizeObserver = new ResizeObserver(() => {
      painterInstance.handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      painterInstance.dispose();
      setPainterInstance(null);
    };
  }, []);

  // Sync settings when context states modify
  useEffect(() => {
    if (painter) {
      painter.setPSXShader(psxEnabled);
    }
  }, [psxEnabled, painter]);

  useEffect(() => {
    if (painter) {
      painter.setPaintMode(isPaintMode);
    }
  }, [isPaintMode, painter]);

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['gltf', 'glb', 'obj', 'fbx'].includes(ext || '')) {
        await loadNewModel(file);
      } else {
        alert('Invalid format. Please upload a GLTF, GLB, OBJ, or FBX model.');
      }
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await loadNewModel(e.target.files[0]);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${dragActive ? styles.dragActive : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {/* 1. WebGL 3D Viewport canvas */}
      <canvas
        ref={viewportRef}
        className={`${styles.canvas} ${!isModelLoaded ? styles.hidden : ''}`}
      />

      {/* 2. Drag & Drop Initial State Loader */}
      {!isModelLoaded && !isLoadingModel && (
        <div className={styles.dropZone}>
          <div className={styles.uploadCard}>
            <div className={styles.iconCircle}>
              <Upload size={32} className={styles.uploadIcon} />
            </div>
            <h3>Import 3D Asset</h3>
            <p className={styles.dropText}>
              Drag and drop your <strong>GLTF, GLB, OBJ, or FBX</strong> file here, or browse local workspace.
            </p>
            <label className={styles.browseButton}>
              Browse Files
              <input
                type="file"
                accept=".gltf,.glb,.obj,.fbx"
                onChange={handleFileInput}
                className={styles.fileInput}
              />
            </label>
            <div className={styles.formatNotice}>
              Mesh must already contain UV coordinates to enable direct painting.
            </div>
          </div>
        </div>
      )}

      {/* 3. Model Loading Progress Overlay */}
      {isLoadingModel && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingCard}>
            <Loader2 className={styles.spinner} size={40} />
            <h3>Parsing Geometry...</h3>
            <div className={styles.progressBarBg}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${Math.max(5, loadProgress)}%` }}
              />
            </div>
            <span className={styles.progressPct}>
              {loadProgress >= 0 ? `${loadProgress}%` : 'Reading file structures...'}
            </span>
          </div>
        </div>
      )}

      {/* 4. Drag hover indicator */}
      {dragActive && (
        <div className={styles.dragIndicator}>
          <div className={styles.dragCard}>
            <Box size={48} className={styles.dragIcon} />
            <h2>Drop 3D Mesh Here</h2>
          </div>
        </div>
      )}

      {/* 5. Viewport Control HUD overlay */}
      {isModelLoaded && !isLoadingModel && (
        <div className={styles.hudOverlay}>
          <div className={styles.hudBadge}>
            {isPaintMode ? '🎨 Painter Tool Active' : '🌐 Camera Orbit Mode'}
          </div>
          <div className={styles.hudControls}>
            <span><strong>LMB</strong>: {isPaintMode ? 'Draw Stroke' : 'Rotate view'}</span>
            <span className={styles.separator}>•</span>
            <span><strong>RMB</strong>: Rotate Camera</span>
            <span className={styles.separator}>•</span>
            <span><strong>MMB</strong>: Pan Camera</span>
            <span className={styles.separator}>•</span>
            <span><strong>Scroll</strong>: Zoom</span>
            {isPaintMode && (
              <>
                <span className={styles.separator}>•</span>
                <span><strong>Shift+LMB</strong>: Pick Color</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
