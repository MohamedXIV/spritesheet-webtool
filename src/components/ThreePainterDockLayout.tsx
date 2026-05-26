'use client';

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';

// Import workspace panels
import { ThreePainterPreview } from '@/components/ThreePainterPreview';
import { BrushPanel } from '@/components/BrushPanel';
import { LayersPanel } from '@/components/LayersPanel';
import { ThreePainterPixelatePanel } from '@/components/ThreePainterPixelatePanel';
import { ThreePainterExportPanel } from '@/components/ThreePainterExportPanel';

import styles from './ThreePainterDockLayout.module.css';

const STORAGE_KEY = 'three-painter-dock-layout';

// Panel definitions for adding dynamically
const PANEL_INFO: Record<string, { name: string }> = {
  '3d-preview': { name: '3D Preview Port' },
  'brush-panel': { name: 'Brush toolbox' },
  'layers-panel': { name: 'Canvas Layers' },
  'pixelate-panel': { name: 'Retro Pixelation' },
  'export-panel': { name: 'Export Assets' },
};

export interface ThreePainterDockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface ThreePainterDockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

// Default layout preset for 3D Paint workspace
const defaultLayout = {
  global: {
    splitterSize: 6,
    splitterExtra: 4,
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'row',
        weight: 75,
        children: [
          {
            type: 'tabset',
            weight: 70,
            children: [
              { type: 'tab', name: '3D Viewport', component: '3d-preview' },
            ],
          },
          {
            type: 'tabset',
            weight: 30,
            children: [
              { type: 'tab', name: 'Brush Options', component: 'brush-panel' },
              { type: 'tab', name: 'Layers', component: 'layers-panel' },
            ],
          },
        ],
      },
      {
        type: 'tabset',
        weight: 25,
        children: [
          { type: 'tab', name: 'Pixelation & Shading', component: 'pixelate-panel' },
          { type: 'tab', name: 'Export Output', component: 'export-panel' },
        ],
      },
    ],
  },
};

export const ThreePainterDockLayout = forwardRef<ThreePainterDockLayoutRef, ThreePainterDockLayoutProps>(
  function ThreePainterDockLayout({ onVisiblePanelsChange }, ref) {
    const ctx = useThreePainterContext();
    const layoutRef = useRef<Layout>(null);
    const [model, setModel] = useState<Model | null>(null);

    // Load saved layout or default
    useEffect(() => {
      let layoutJson = defaultLayout;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          layoutJson = JSON.parse(saved);
        }
      } catch {
        // Fallback
      }
      setModel(Model.fromJson(layoutJson));
    }, []);

    // Save layout on changes
    const handleModelChange = useCallback((newModel: Model) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModel.toJson()));
        
        if (onVisiblePanelsChange) {
          const visible = new Set<string>();
          newModel.visitNodes((node) => {
            if (node.getType() === 'tab') {
              const component = (node as TabNode).getComponent();
              if (component) visible.add(component);
            }
          });
          onVisiblePanelsChange(visible);
        }
      } catch {
        // Ignore
      }
    }, [onVisiblePanelsChange]);

    // Component Factory
    const factory = useCallback((node: TabNode) => {
      const component = node.getComponent();
      const isLoaded = ctx.isModelLoaded;

      // Preview panel is always visible so they can drag & drop models
      if (component === '3d-preview') {
        return (
          <div className={styles.panelContent}>
            <ThreePainterPreview />
          </div>
        );
      }

      // Placeholder fallback for other panels if model isn't loaded yet
      if (!isLoaded) {
        return (
          <div className={styles.panelContent}>
            <div className={styles.placeholder}>
              <div className={styles.placeholderContent}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.placeholderIcon}>
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <p>Import a 3D model in the viewport first to activate this panel.</p>
              </div>
            </div>
          </div>
        );
      }

      switch (component) {
        case 'brush-panel':
          return (
            <div className={styles.panelContent}>
              <BrushPanel />
            </div>
          );

        case 'layers-panel':
          return (
            <div className={styles.panelContent}>
              <LayersPanel />
            </div>
          );

        case 'pixelate-panel':
          return (
            <div className={styles.panelContent}>
              <ThreePainterPixelatePanel />
            </div>
          );

        case 'export-panel':
          return (
            <div className={styles.panelContent}>
              <ThreePainterExportPanel />
            </div>
          );

        default:
          return <div className={styles.placeholder}>Unknown Panel Component: {component}</div>;
      }
    }, [ctx.isModelLoaded]);

    const handleResetLayout = useCallback(() => {
      localStorage.removeItem(STORAGE_KEY);
      const newModel = Model.fromJson(defaultLayout);
      setModel(newModel);
      handleModelChange(newModel);
    }, [handleModelChange]);

    useImperativeHandle(ref, () => ({
      addTab: (panelId: string) => {
        if (!model) return;
        const info = PANEL_INFO[panelId];
        if (!info) return;

        let firstTabsetId: string | null = null;
        model.visitNodes((node) => {
          if (!firstTabsetId && node.getType() === 'tabset') {
            firstTabsetId = node.getId();
          }
        });

        if (firstTabsetId) {
          model.doAction(Actions.addNode(
            { type: 'tab', name: info.name, component: panelId },
            firstTabsetId,
            DockLocation.CENTER,
            -1,
            true
          ));
          handleModelChange(model);
        }
      },
      removeTab: (panelId: string) => {
        if (!model) return;
        model.visitNodes((node) => {
          if (node.getType() === 'tab') {
            const component = (node as TabNode).getComponent();
            if (component === panelId) {
              model.doAction(Actions.deleteTab(node.getId()));
            }
          }
        });
        handleModelChange(model);
      },
      resetLayout: handleResetLayout,
    }), [model, handleModelChange, handleResetLayout]);

    if (!model) {
      return <div className={styles.loading}>Loading layout...</div>;
    }

    return (
      <div className={styles.container}>
        <div className={styles.layoutWrapper}>
          <Layout
            ref={layoutRef}
            model={model}
            factory={factory}
            onModelChange={handleModelChange}
          />
        </div>
      </div>
    );
  }
);
