'use client';

/**
 * DockLayout - VS Code-style docking layout using flexlayout-react
 */

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { useEditorContext } from '@/contexts/EditorContext';

// Panel components (lazy imported via factory)
import { VideoLoader } from '@/components/VideoLoader';
import { FrameGrid } from '@/components/FrameGrid';
import { PreviewPlayer } from '@/components/PreviewPlayer';
import { Timeline } from '@/components/Timeline';
import { ExportPanel } from '@/components/ExportPanel';
import { BackgroundRemovalPanel } from '@/components/BackgroundRemovalPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { WatermarkRemovalPanel } from '@/components/WatermarkRemovalPanel';
import { ProgressBar } from '@/components/ProgressBar';

import styles from './DockLayout.module.css';

const STORAGE_KEY = 'editor-dock-layout';

// Panel info for adding tabs dynamically
const PANEL_INFO: Record<string, { name: string }> = {
  'video-loader': { name: 'Load Video' },
  'frame-grid': { name: 'Frames' },
  'preview': { name: 'Preview' },
  'timeline': { name: 'Timeline' },
  'bg-removal': { name: 'Background Removal' },
  'outline': { name: 'Outline' },
  'watermark': { name: 'Watermark' },
  'export': { name: 'Export' },
};

// Ref type for external control
export interface DockLayoutRef {
  addTab: (panelId: string) => void;
  removeTab: (panelId: string) => void;
  resetLayout: () => void;
}

interface DockLayoutProps {
  onVisiblePanelsChange?: (panels: Set<string>) => void;
}

// Default layout configuration
// Using 'as any' because flexlayout-react types are incomplete
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
        weight: 25,
        children: [
          { type: 'tab', name: 'Load Video', component: 'video-loader' },
          { type: 'tab', name: 'Frames', component: 'frame-grid' },
        ],
      },
      {
        type: 'row',
        weight: 45,
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
        weight: 30,
        children: [
          { type: 'tab', name: 'Background Removal', component: 'bg-removal' },
          { type: 'tab', name: 'Outline', component: 'outline' },
          { type: 'tab', name: 'Watermark', component: 'watermark' },
          { type: 'tab', name: 'Export', component: 'export' },
        ],
      },
    ],
  },
};

export const DockLayout = forwardRef<DockLayoutRef, DockLayoutProps>(function DockLayout(
  { onVisiblePanelsChange },
  ref
) {
  const ctx = useEditorContext();
  const layoutRef = useRef<Layout>(null);
  const [model, setModel] = useState<Model | null>(null);

  // Load layout from localStorage or use default
  useEffect(() => {
    let layoutJson = defaultLayout;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        layoutJson = JSON.parse(saved);
      }
    } catch {
      // Use default
    }
    
    setModel(Model.fromJson(layoutJson));
  }, []);

  // Save layout on change and update visible panels
  const handleModelChange = useCallback((newModel: Model) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newModel.toJson()));
      
      // Track visible panels
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
      // Ignore save errors
    }
  }, [onVisiblePanelsChange]);

  // Factory function to create panel content
  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent();
    
    switch (component) {
      case 'video-loader':
        return (
          <div className={styles.panelContent}>
            <VideoLoader onVideoSelect={ctx.handleVideoLoad} />
            {ctx.editorState === 'extracting' && ctx.extractionProgress && (
              <div className={styles.extractionOverlay}>
                <div className={styles.extractionContent}>
                  <div className={styles.spinner}></div>
                  <div className={styles.extractionText}>
                    Extracting frame {ctx.extractionProgress.current} of {ctx.extractionProgress.total}
                  </div>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ width: `${ctx.extractionProgress.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
        
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
        
      case 'bg-removal':
        if (ctx.editorState !== 'ready' || !ctx.frameState) {
          return <div className={styles.panelContent}><div className={styles.placeholder}>Load a video first</div></div>;
        }
        return (
          <div className={styles.panelContent}>
            <BackgroundRemovalPanel
              frames={ctx.orderedFrames}
              selectedIds={ctx.frameState.selectedIds}
              onFramesProcessed={ctx.handleFramesProcessed}
              onProcessingChange={ctx.setProcessingFrameIds}
            />
          </div>
        );
        
      case 'outline':
        if (ctx.editorState !== 'ready' || !ctx.frameState) {
          return <div className={styles.panelContent}><div className={styles.placeholder}>Load a video first</div></div>;
        }
        return (
          <div className={styles.panelContent}>
            <OutlinePanel
              frames={ctx.orderedFrames}
              selectedIds={ctx.frameState.selectedIds}
              currentPreviewFrame={
                (ctx.selectedFrames.length > 0 ? ctx.selectedFrames : ctx.orderedFrames)[ctx.currentFrame] || 
                ctx.orderedFrames[0] || 
                null
              }
              onFramesProcessed={ctx.handleFramesProcessed}
              onSettingsChange={ctx.setPreviewOutline}
            />
          </div>
        );
        
      case 'watermark':
        if (ctx.editorState !== 'ready' || !ctx.frameState) {
          return <div className={styles.panelContent}><div className={styles.placeholder}>Load a video first</div></div>;
        }
        return (
          <div className={styles.panelContent}>
            <WatermarkRemovalPanel
              frames={ctx.orderedFrames}
              selectedIds={ctx.frameState.selectedIds}
              onFramesProcessed={ctx.handleFramesProcessed}
            />
          </div>
        );
        
      default:
        return <div className={styles.placeholder}>Unknown panel: {component}</div>;
    }
  }, [ctx]);

  // Reset layout to default
  const handleResetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const newModel = Model.fromJson(defaultLayout);
    setModel(newModel);
    handleModelChange(newModel);
  }, [handleModelChange]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addTab: (panelId: string) => {
      if (!model) return;
      const info = PANEL_INFO[panelId];
      if (!info) return;
      
      // Find first tabset and add tab there
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
});
