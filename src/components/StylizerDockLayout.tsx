'use client';

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';

import { StylizerMaterialLoaderPanel } from '@/components/StylizerMaterialLoaderPanel';
import { StylizerStylePanel } from '@/components/StylizerStylePanel';
import { StylizerMapOutputPanel } from '@/components/StylizerMapOutputPanel';
import { StylizerPreviewPanel } from '@/components/StylizerPreviewPanel';
import { StylizerPreview3DPanel } from '@/components/StylizerPreview3DPanel';
import { StylizerExportPanel } from '@/components/StylizerExportPanel';

import styles from './StylizerDockLayout.module.css';

const STORAGE_KEY = 'stylizer-dock-layout';

const PANEL_INFO: Record<string, { name: string }> = {
  'material-loader': { name: 'Material Maps' },
  'style': { name: 'Style' },
  'map-output': { name: 'Map Output' },
  'preview-2d': { name: 'Preview' },
  'preview-3d': { name: '3D Preview' },
  'export': { name: 'Export' },
};

export interface StylizerDockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface StylizerDockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

const defaultLayout = {
  global: { splitterSize: 6, splitterExtra: 4 },
  borders: [],
  layout: {
    type: 'row', weight: 100, children: [
      { type: 'tabset', weight: 24, children: [
        { type: 'tab', name: 'Material Maps', component: 'material-loader' },
        { type: 'tab', name: 'Style', component: 'style' },
      ]},
      { type: 'tabset', weight: 50, children: [
        { type: 'tab', name: 'Preview', component: 'preview-2d' },
        { type: 'tab', name: '3D Preview', component: 'preview-3d' },
      ]},
      { type: 'tabset', weight: 26, children: [
        { type: 'tab', name: 'Map Output', component: 'map-output' },
        { type: 'tab', name: 'Export', component: 'export' },
      ]},
    ],
  },
};

export const StylizerDockLayout = forwardRef<StylizerDockLayoutRef, StylizerDockLayoutProps>(
  function StylizerDockLayout({ onVisiblePanelsChange }, ref) {
    const layoutRef = useRef<Layout>(null);
    const [model, setModel] = useState<Model | null>(null);

    useEffect(() => {
      let layoutJson = defaultLayout;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) layoutJson = JSON.parse(saved);
      } catch { /* fallback */ }
      setModel(Model.fromJson(layoutJson));
    }, []);

    const handleModelChange = useCallback((newModel: Model) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newModel.toJson()));
        if (onVisiblePanelsChange) {
          const visible = new Set<string>();
          newModel.visitNodes((node) => {
            if (node.getType() === 'tab') {
              const c = (node as TabNode).getComponent();
              if (c) visible.add(c);
            }
          });
          onVisiblePanelsChange(visible);
        }
      } catch { /* ignore */ }
    }, [onVisiblePanelsChange]);

    const factory = useCallback((node: TabNode) => {
      const component = node.getComponent();
      switch (component) {
        case 'material-loader': return <div className={styles.panelContent}><StylizerMaterialLoaderPanel /></div>;
        case 'style': return <div className={styles.panelContent}><StylizerStylePanel /></div>;
        case 'map-output': return <div className={styles.panelContent}><StylizerMapOutputPanel /></div>;
        case 'preview-2d': return <div className={styles.panelContent}><StylizerPreviewPanel /></div>;
        case 'preview-3d': return <div className={styles.panelContent}><StylizerPreview3DPanel /></div>;
        case 'export': return <div className={styles.panelContent}><StylizerExportPanel /></div>;
        default: return <div className={styles.placeholder}>Unknown Panel: {component}</div>;
      }
    }, []);

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
          if (!firstTabsetId && node.getType() === 'tabset') firstTabsetId = node.getId();
        });
        if (firstTabsetId) {
          model.doAction(Actions.addNode(
            { type: 'tab', name: info.name, component: panelId },
            firstTabsetId, DockLocation.CENTER, -1, true,
          ));
          handleModelChange(model);
        }
      },
      removeTab: (panelId: string) => {
        if (!model) return;
        model.visitNodes((node) => {
          if (node.getType() === 'tab') {
            const c = (node as TabNode).getComponent();
            if (c === panelId) model.doAction(Actions.deleteTab(node.getId()));
          }
        });
        handleModelChange(model);
      },
      resetLayout: handleResetLayout,
    }), [model, handleModelChange, handleResetLayout]);

    if (!model) return <div className={styles.loading}>Loading layout...</div>;

    return (
      <div className={styles.container}>
        <div className={styles.layoutWrapper}>
          <Layout ref={layoutRef} model={model} factory={factory} onModelChange={handleModelChange} />
        </div>
      </div>
    );
  }
);
