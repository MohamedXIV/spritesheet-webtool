// src/contexts/TrimsheetContext.tsx
'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { Region, TrimMaterial, TrimResolution, MapChannel } from '@/lib/trimsheetTypes';
import { TrimsheetBaker } from '@/lib/trimsheetBaker';
import { PolyhavenAsset } from '@/lib/trimsheetMaterials';

export interface TrimsheetContextValue {
  // Baker (single mutation sink for pixels)
  baker: TrimsheetBaker | null;
  /** Bump this number whenever the baker buffers change, to trigger canvas redraw. */
  bakeVersion: number;

  // Resolution
  resolution: TrimResolution;
  setResolution: (res: TrimResolution) => void;

  // Regions
  regions: Region[];
  selectedRegionId: string | null;
  selectRegion: (id: string | null) => void;
  addRegion: (rect: Region['rect']) => void;
  updateRegionRect: (id: string, rect: Region['rect']) => void;
  updateRegionTiling: (id: string, tiling: Partial<Region['tiling']>) => void;
  renameRegion: (id: string, name: string) => void;
  deleteRegion: (id: string) => void;
  splitRegion: (id: string, axis: 'horizontal' | 'vertical') => void;
  mergeRegions: (idA: string, idB: string) => void;
  generateGrid: (rows: number, cols: number) => void;

  // Materials
  materials: TrimMaterial[];
  assignMaterialToRegion: (regionId: string, material: TrimMaterial) => void;
  setRegionFlatColor: (regionId: string, color: string) => void;
  clearRegionMaterial: (regionId: string) => void;

  // Polyhaven index (shared across panels)
  polyhavenAssets: PolyhavenAsset[];
  polyhavenError: string | null;
  polyhavenLoading: boolean;

  // Export
  enabledChannels: MapChannel[];
  toggleChannel: (ch: MapChannel) => void;
  exportZip: () => Promise<void>;

  // Save
  isDirty: boolean;
  triggerSave: (customName?: string) => Promise<void>;
  triggerSaveAs: (name: string) => Promise<void>;
  projectName: string;
  setProjectName: (name: string) => void;

  // Panels
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;
}

const TrimsheetContext = createContext<TrimsheetContextValue | null>(null);

export function useTrimsheetContext(): TrimsheetContextValue {
  const ctx = useContext(TrimsheetContext);
  if (!ctx) throw new Error('useTrimsheetContext must be used within TrimsheetProvider');
  return ctx;
}

interface TrimsheetProviderProps {
  value: TrimsheetContextValue;
  children: ReactNode;
}

export function TrimsheetProvider({ value, children }: TrimsheetProviderProps) {
  return <TrimsheetContext.Provider value={value}>{children}</TrimsheetContext.Provider>;
}
