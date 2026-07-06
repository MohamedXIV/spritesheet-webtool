'use client';

/**
 * StylizerContext - Shared state for the Material Stylizer tool's dock panels.
 * Holds the loaded PBR map set, stylizer options, and derived (cached) results.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { StylizerOptions } from '@/lib/stylizer';

export type MapSlot = 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'height';

export const MAP_SLOTS: MapSlot[] = ['albedo', 'normal', 'roughness', 'metallic', 'ao', 'height'];

export interface StylizerMaterial {
  maps: Partial<Record<MapSlot, ImageBitmap>>;
  resolution: { width: number; height: number } | null;
}

export interface StylizerDerived {
  stylizedAlbedo: ImageBitmap | null;
  normal: ImageBitmap | null;   // regenerated (or null if disabled)
  height: ImageBitmap | null;   // regenerated (or null if disabled)
  roughness: ImageBitmap | null; // flattened (or null if disabled)
  metallic: ImageBitmap | null;  // flattened (or null if disabled)
}

export interface StylizerContextValue {
  // Source material
  material: StylizerMaterial;
  loadMap: (slot: MapSlot, file: File) => Promise<void>;
  clearMap: (slot: MapSlot) => void;
  resetMaterial: () => void;
  hasAlbedo: boolean;

  // Options
  options: StylizerOptions;
  setOptions: (updater: (prev: StylizerOptions) => StylizerOptions) => void;

  // Derived results (recomputed by the page effect)
  derived: StylizerDerived;
  isProcessing: boolean;
  // Re-runs the full pipeline at source resolution for export. Every returned
  // bitmap is caller-owned (fresh or a clone) and must be closed by the caller.
  renderFullRes: () => Promise<Partial<Record<MapSlot, ImageBitmap>>>;

  // Preview UI state
  wipePosition: number;            // 0..100
  setWipePosition: (v: number) => void;
  tiled: boolean;
  setTiled: (v: boolean) => void;

  // Panel visibility / layout
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;

  // Project
  projectId: string;
  projectName: string;
  setProjectName: (name: string) => void;
  triggerSave: (customName?: string) => void;
  isSaving: boolean;
  autosaveNotification: string | null;
}

const StylizerContext = createContext<StylizerContextValue | null>(null);

export function useStylizerContext(): StylizerContextValue {
  const ctx = useContext(StylizerContext);
  if (!ctx) throw new Error('useStylizerContext must be used within StylizerProvider');
  return ctx;
}

interface StylizerProviderProps {
  value: StylizerContextValue;
  children: ReactNode;
}

export function StylizerProvider({ value, children }: StylizerProviderProps) {
  return <StylizerContext.Provider value={value}>{children}</StylizerContext.Provider>;
}
