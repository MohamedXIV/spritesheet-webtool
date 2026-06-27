// src/components/TrimsheetDockLayout.tsx
'use client';

/** TrimsheetDockLayout - flexlayout-react workspace for the Trimsheet Builder. */

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';

import { TrimsheetCanvas } from '@/components/TrimsheetCanvas';
import { RegionPanel } from '@/components/RegionPanel';
import { TrimMaterialPanel } from '@/components/TrimMaterialPanel';
import { RegionInspectorPanel } from '@/components/RegionInspectorPanel';
import { TrimsheetExportPanel } from '@/components/TrimsheetExportPanel';

import styles from './TrimsheetDockLayout.module.css';

const STORAGE_KEY = 'trimsheet-dock-layout';

const PANEL_INFO: Record<string, { name: string }> = {
  'canvas': { name: 'Trimsheet' },
  'regions': { name: 'Regions' },
  'materials': { name: 'Materials' },
  'inspector': { name: 'Region Inspector' },
  'export': { name: 'Export' },
};

export interface TrimsheetDockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface TrimsheetDockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

const defaultLayout = {
  global: { splitterSize: 6, splitterExtra: 4 },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset', weight: 22,
        children: [
          { type: 'tab', name: 'Regions', component: 'regions' },
          { type: 'tab', name: 'Region Inspector', component: 'inspector' },
        ],
      },
      {
        type: 'tabset', weight: 53,
        children: [{ type: 'tab', name: 'Trimsheet', component: 'canvas' }],
      },
      {
        type: 'tabset', weight: 25,
        children: [
          { type: 'tab', name: 'Materials', component: 'materials' },
          { type: 'tab', name: 'Export', component: 'export' },
        ],
      },
    ],
  },
};

export const TrimsheetDockLayout = forwardRef<TrimsheetDockLayoutRef, TrimsheetDockLayoutProps>(
  function TrimsheetDockLayout({ onVisiblePanelsChange }, ref) {
    const layoutRef = useRef<Layout>(null);
    const [model, setModel] = useState<Model | null>(null);

    useEffect(() => {
      let layoutJson = defaultLayout;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) layoutJson = JSON.parse(saved);
      } catch { /* use default */ }
      setModel(Model.fromJson(layoutJson));
    }, []);

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
      } catch { /* ignore */ }
    }, [onVisiblePanelsChange]);

    const factory = useCallback((node: TabNode) => {
      const component = node.getComponent();
      switch (component) {
        case 'canvas':
          return <div className={styles.panelContent}><TrimsheetCanvas /></div>;
        case 'regions':
          return <div className={styles.panelContent}><RegionPanel /></div>;
        case 'materials':
          return <div className={styles.panelContent}><TrimMaterialPanel /></div>;
        case 'inspector':
          return <div className={styles.panelContent}><RegionInspectorPanel /></div>;
        case 'export':
          return <div className={styles.panelContent}><TrimsheetExportPanel /></div>;
        default:
          return <div className={styles.placeholder}>Unknown panel: {component}</div>;
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
          if (node.getType() === 'tab' && (node as TabNode).getComponent() === panelId) {
            model.doAction(Actions.deleteTab(node.getId()));
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
  },
);
