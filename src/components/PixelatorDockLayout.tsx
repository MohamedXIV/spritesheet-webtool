'use client';

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { useEditorContext } from '@/contexts/EditorContext';

// Import modular panels
import { SpritesheetSlicer } from '@/components/SpritesheetSlicer';
import { FrameGrid } from '@/components/FrameGrid';
import { PreviewPlayer } from '@/components/PreviewPlayer';
import { Timeline } from '@/components/Timeline';
import { ExportPanel } from '@/components/ExportPanel';
import { PixelationPanel } from '@/components/PixelationPanel';
import { BackgroundRemovalPanel } from '@/components/BackgroundRemovalPanel';
import { WatermarkRemovalPanel } from '@/components/WatermarkRemovalPanel';

import styles from './PixelatorDockLayout.module.css';

const STORAGE_KEY = 'pixelator-dock-layout';

// Panel definitions for adding dynamically
const PANEL_INFO: Record<string, { name: string }> = {
  'spritesheet-slicer': { name: 'Spritesheet Slicer' },
  'frame-grid': { name: 'Frames' },
  'preview': { name: 'Preview' },
  'timeline': { name: 'Timeline' },
  'pixelate': { name: 'Pixelation' },
  'bg-removal': { name: 'Background Removal' },
  'watermark': { name: 'Watermark' },
  'export': { name: 'Export' },
};

export interface PixelatorDockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface PixelatorDockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

// Default layout preset for Sprite Pixelator workspace
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
        type: 'tabset',
        weight: 28,
        children: [
          { type: 'tab', name: 'Spritesheet Slicer', component: 'spritesheet-slicer' },
          { type: 'tab', name: 'Frames', component: 'frame-grid' },
        ],
      },
      {
        type: 'row',
        weight: 47,
        children: [
          {
            type: 'tabset',
            weight: 70,
            children: [
              { type: 'tab', name: 'Preview', component: 'preview' },
            ],
          },
          {
            type: 'tabset',
            weight: 30,
            children: [
              { type: 'tab', name: 'Timeline', component: 'timeline' },
            ],
          },
        ],
      },
      {
        type: 'tabset',
        weight: 25,
        children: [
          { type: 'tab', name: 'Pixelation', component: 'pixelate' },
          { type: 'tab', name: 'Background Removal', component: 'bg-removal' },
          { type: 'tab', name: 'Watermark', component: 'watermark' },
          { type: 'tab', name: 'Export', component: 'export' },
        ],
      },
    ],
  },
};

export const PixelatorDockLayout = forwardRef<PixelatorDockLayoutRef, PixelatorDockLayoutProps>(
  function PixelatorDockLayout({ onVisiblePanelsChange }, ref) {
    const ctx = useEditorContext();
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
      const framesCount = ctx.orderedFrames.length;

      // Slicer panel does not require frames to be loaded
      if (component === 'spritesheet-slicer') {
        return (
          <div className={styles.panelContent}>
            <SpritesheetSlicer />
          </div>
        );
      }

      // Placeholder fallback for other panels if frames aren't loaded
      if (framesCount === 0) {
        return (
          <div className={styles.panelContent}>
            <div className={styles.placeholder}>
              <div className={styles.placeholderContent}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.placeholderIcon}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>Slice and Load a Spritesheet first to activate this panel.</p>
              </div>
            </div>
          </div>
        );
      }

      switch (component) {
        case 'frame-grid':
          return (
            <div className={styles.panelContent}>
              {ctx.frameState && (
                <FrameGrid
                  frames={ctx.orderedFrames}
                  selectedIds={ctx.frameState.selectedIds}
                  processingIds={ctx.processingFrameIds}
                  onSelectionChange={ctx.handleSelectionChange}
                  onReorder={ctx.handleOrderChange}
                  onDeleteSelected={ctx.handleDeleteSelected}
                  onDuplicateSelected={() => {}}
                  onRevertSelected={ctx.handleRevertSelected}
                  canRevert={ctx.canRevert}
                />
              )}
            </div>
          );

        case 'preview':
          return (
            <div className={styles.panelContent}>
              <PreviewPlayer
                frames={ctx.selectedFrames.length > 0 ? ctx.selectedFrames : ctx.orderedFrames}
                fps={ctx.fps}
                currentFrame={ctx.currentFrame}
                onFrameChange={ctx.setCurrentFrame}
                loopMode={ctx.loopMode}
                outlineOptions={ctx.previewOutline}
                backgroundMode={ctx.previewBgMode}
                backgroundColor={ctx.previewBgColor}
                onBackgroundModeChange={ctx.setPreviewBgMode}
                onBackgroundColorChange={ctx.setPreviewBgColor}
                pixelatorOptions={ctx.activePixelatorOptions}
              />
            </div>
          );

        case 'timeline':
          return (
            <div className={styles.panelContent}>
              <Timeline
                frameCount={ctx.selectedFrames.length > 0 ? ctx.selectedFrames.length : ctx.orderedFrames.length}
                currentFrame={ctx.currentFrame}
                fps={ctx.fps}
                loopMode={ctx.loopMode}
                onFpsChange={ctx.setFps}
                onFrameSelect={ctx.setCurrentFrame}
                onLoopModeChange={ctx.setLoopMode}
                frames={ctx.orderedFrames}
              />
            </div>
          );

        case 'pixelate':
          return (
            <div className={styles.panelContent}>
              <PixelationPanel
                frames={ctx.orderedFrames}
                selectedIds={ctx.frameState?.selectedIds || new Set()}
                currentPreviewFrame={
                  (ctx.selectedFrames.length > 0 ? ctx.selectedFrames : ctx.orderedFrames)[ctx.currentFrame] ||
                  ctx.orderedFrames[0] ||
                  null
                }
                onFramesProcessed={ctx.handleFramesProcessed}
              />
            </div>
          );

        case 'bg-removal':
          return (
            <div className={styles.panelContent}>
              <BackgroundRemovalPanel
                frames={ctx.orderedFrames}
                selectedIds={ctx.frameState?.selectedIds || new Set()}
                onFramesProcessed={ctx.handleFramesProcessed}
                onProcessingChange={ctx.setProcessingFrameIds}
              />
            </div>
          );

        case 'watermark':
          return (
            <div className={styles.panelContent}>
              <WatermarkRemovalPanel
                frames={ctx.orderedFrames}
                selectedIds={ctx.frameState?.selectedIds || new Set()}
                onFramesProcessed={ctx.handleFramesProcessed}
              />
            </div>
          );

        case 'export':
          return (
            <div className={styles.panelContent}>
              <ExportPanel
                frames={ctx.selectedFrames.length > 0 ? ctx.selectedFrames : ctx.orderedFrames}
                fps={ctx.fps}
                loopMode={ctx.loopMode}
                previewBackgroundColor={ctx.previewBgMode === 'color' ? ctx.previewBgColor : undefined}
              />
            </div>
          );

        default:
          return <div className={styles.placeholder}>Unknown Panel Component: {component}</div>;
      }
    }, [ctx]);

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
