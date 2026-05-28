'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { ThreePainter } from '@/lib/threePainter';
import { PixelatorOptions } from '@/lib/pixelator';
import { ShadingMode, LightingSettings } from '@/lib/lightingPresets';

export interface PaintingLayer {
  id: string;
  name: string;
  opacity: number;
  visible: boolean;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
  canvas: HTMLCanvasElement | null;
}

export type BrushTool = 'brush' | 'eraser' | 'eyedropper' | 'bucket';

export interface ThreePainterContextValue {
  projectId: string;
  projectName: string;
  setProjectName: (name: string) => void;
  isSaving: boolean;
  autosaveNotification: string | null;

  // Model
  loadedModelName: string | null;
  loadedModelSize: number | null;
  isModelLoaded: boolean;
  loadNewModel: (file: File) => Promise<void>;
  resetWorkspace: () => void;
  isLoadingModel: boolean;
  loadProgress: number;

  // Layers
  layers: PaintingLayer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, mode: PaintingLayer['blendMode']) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;

  // Brush
  activeTool: BrushTool;
  setActiveTool: (tool: BrushTool) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushOpacity: number;
  setBrushOpacity: (opacity: number) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;

  // Pixelator
  pixelatorOptions: PixelatorOptions;
  updatePixelatorOptions: (opts: Partial<PixelatorOptions>) => void;

  // Viewport
  psxEnabled: boolean;
  setPsxEnabled: (enabled: boolean) => void;
  isPaintMode: boolean;
  setIsPaintMode: (paint: boolean) => void;

  // Shading mode
  shadingMode: ShadingMode;
  setShadingMode: (mode: ShadingMode) => void;

  // Lighting
  activeLightingPresetId: string;
  setActiveLightingPresetId: (id: string) => void;
  lightingSettings: LightingSettings;
  updateLightingSettings: (settings: Partial<LightingSettings>) => void;

  // ThreePainter instance
  painter: ThreePainter | null;
  setPainterInstance: (painter: ThreePainter | null) => void;

  // History / Save
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  triggerSave: (customName?: string) => Promise<void>;
  triggerSaveAs: (name: string) => Promise<void>;

  // Panels
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;
}

export type { ShadingMode, LightingSettings };

const ThreePainterContext = createContext<ThreePainterContextValue | null>(null);

export function useThreePainterContext() {
  const ctx = useContext(ThreePainterContext);
  if (!ctx) throw new Error('useThreePainterContext must be used within ThreePainterProvider');
  return ctx;
}

interface ThreePainterProviderProps {
  value: ThreePainterContextValue;
  children: ReactNode;
}

export function ThreePainterProvider({ value, children }: ThreePainterProviderProps) {
  return (
    <ThreePainterContext.Provider value={value}>
      {children}
    </ThreePainterContext.Provider>
  );
}
