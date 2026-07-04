'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { ThreePainter } from '@/lib/threePainter';
import { PixelatorOptions } from '@/lib/pixelator';
import { ShadingMode, LightingSettings } from '@/lib/lightingPresets';
import { TextureSourceSlot } from '@/types';

export interface PaintingLayer {
  id: string;
  name: string;
  type: 'paint' | 'fill';
  opacity: number;
  visible: boolean;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
  canvas: HTMLCanvasElement | null;

  // Fill settings
  fillColor?: string;
  fillTextureName?: string | null;
  fillTextureUrl?: string | null;

  // Mask settings
  maskCanvas?: HTMLCanvasElement | null;
  maskVisible?: boolean;
  maskActive?: boolean;

  // Filters & Curves
  filters?: {
    hue: number;
    saturation: number;
    brightness: number;
    contrast: number;
    curvesPoints: [number, number, number, number]; // [y0, x1, y1, y2]
  };

  // Smart Mask settings
  smartMaskType?: 'edges' | 'cavities' | 'height' | null;
  smartMaskContrast?: number;
  smartMaskThreshold?: number;
  smartMaskIntensity?: number;
  smartMaskInvert?: boolean;

  // Stylized shadow settings
  shadowTintEnabled?: boolean;
  shadowTintColor?: string;

  // Color quantization/banding
  quantizeColorsEnabled?: boolean;
  quantizeColorCount?: number;
}

export type BrushTool = 'brush' | 'eraser' | 'eyedropper' | 'bucket' | 'island-bucket';

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
  addLayer: (type?: 'paint' | 'fill') => void;
  deleteLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, mode: PaintingLayer['blendMode']) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  importImageToLayer?: (file: File, layerId: string) => void;
  clearLayer?: (layerId: string) => void;
  
  // Layer Fills, Masks, Filters
  toggleMask: (layerId: string) => void;
  setMaskVisible: (layerId: string, visible: boolean) => void;
  setMaskActive: (layerId: string, active: boolean) => void;
  updateLayerFillSettings: (layerId: string, settings: Partial<Pick<PaintingLayer, 'fillColor' | 'fillTextureName' | 'fillTextureUrl'>>) => void;
  updateLayerFilters: (layerId: string, filters: Partial<NonNullable<PaintingLayer['filters']>>) => void;
  updateLayerSmartMaskSettings: (layerId: string, settings: Partial<Pick<PaintingLayer, 'smartMaskType' | 'smartMaskContrast' | 'smartMaskThreshold' | 'smartMaskIntensity' | 'smartMaskInvert' | 'shadowTintEnabled' | 'shadowTintColor' | 'quantizeColorsEnabled' | 'quantizeColorCount'>>) => void;

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

  // Material Merger & UDIM Atlas Packing
  textureSlots: TextureSourceSlot[];
  setTextureSlots: React.Dispatch<React.SetStateAction<TextureSourceSlot[]>>;
  analyzeLoadedModel: () => void;
  applyTextureAtlas: (atlasSize: number) => Promise<void>;

  // Smart Materials baking & presets
  smartMaps: {
    edges: HTMLCanvasElement | null;
    cavities: HTMLCanvasElement | null;
    height: HTMLCanvasElement | null;
  } | null;
  bakeModelSmartMaps: () => Promise<void>;
  applySmartMaterialPreset: (presetId: string) => void;

  // PBR texture maps state synchronization
  pbrMaps: Record<string, { url: string | null; name: string | null }>;
  setPbrMap: (slot: string, url: string | null, name: string | null) => void;
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
