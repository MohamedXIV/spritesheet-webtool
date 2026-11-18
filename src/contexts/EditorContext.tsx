'use client';

/**
 * EditorContext - Shared state for all dock panels, unified Preview Editor,
 * Photoshop-grade Layers & Masks, and Interactive Spritesheet Slicer.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { FrameData, SourceInfo, Folder, ProjectLayer } from '@/types';
import { FrameState } from '@/lib/frameStore';
import { LoopMode } from '@/components/Timeline';
import { BackgroundMode } from '@/components/PreviewPlayer';
import { OutlineOptions } from '@/lib/outlineGenerator';
import type { SelectionMask, ToolSettings } from '@/lib/canvasTools';
import type { SheetSliceSettings } from '@/lib/slicerGuides';

export type BrushTool = 'brush' | 'eraser' | 'eyedropper' | 'bucket';

interface EditorContextValue {
  // Editor state
  editorState: 'idle' | 'extracting' | 'ready';
  extractionProgress: { current: number; total: number; percentage: number } | null;

  // Frames
  frameState: FrameState | null;
  orderedFrames: FrameData[];
  selectedFrames: FrameData[];
  processingFrameIds: Set<string>;

  // Folders
  folders: Folder[];
  createFolder: (name: string, color?: string) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  toggleFolderVisibility: (id: string) => void;
  toggleFolderCollapse: (id: string) => void;
  moveFrameToFolder: (frameId: string, folderId: string, targetIndex?: number) => void;
  moveFramesToFolder: (frameIds: string[], folderId: string) => void;
  copyFramesToFolder: (frameIds: string[], folderId: string) => Promise<void>;
  reorderFolders: (fromIndex: number, toIndex: number) => void;
  reorderFramesInFolder: (folderId: string, fromIndex: number, toIndex: number) => void;

  // Playback
  fps: number;
  currentFrame: number;
  loopMode: LoopMode;

  // Preview settings
  previewBgMode: BackgroundMode;
  previewBgColor: string;
  previewOutline: Partial<OutlineOptions>;

  // Callbacks
  setFps: (fps: number) => void;
  setCurrentFrame: (frame: number) => void;
  setLoopMode: (mode: LoopMode) => void;
  setPreviewBgMode: (mode: BackgroundMode) => void;
  setPreviewBgColor: (color: string) => void;
  setPreviewOutline: (opts: Partial<OutlineOptions>) => void;
  setProcessingFrameIds: (ids: Set<string>) => void;

  // Frame operations
  handleFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => Promise<void> | void;
  handleBackgroundMasksApplied?: (masks: Map<string, ImageBitmap>) => Promise<void>;
  handleSelectionChange: (ids: Set<string>) => void;
  handleOrderChange: (ids: string[]) => void;
  handleDeleteSelected: (ids?: ReadonlySet<string>) => Promise<void>;
  handleRevertSelected: () => void;
  /** Apply a timing change to frame IDs; null clears overrides (uses FPS). */
  updateFrameDurations: (frameIds: ReadonlySet<string>, durationMs: number | null) => void;
  canRevert: boolean;

  // Media loading
  handleMediaLoad: (files: File[]) => void;
  handleRemoveSource: (sourceId: string) => void;
  loadedSources: SourceInfo[];

  // Panel visibility
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;

  // Interactive Spritesheet Slicer state
  pixelatorSlicer?: {
    appendToWorkspace?: boolean;
    savedSheets?: Array<{ id: string; name: string }>;
    editingSourceId?: string | null;
    selectSavedSheet?: (id: string) => void;
    file: File | null;
    originalImgSrc: string | null;
    imgDimensions: { width: number; height: number } | null;
    sliceSettings: SheetSliceSettings;
    setSliceSettings: React.Dispatch<React.SetStateAction<SheetSliceSettings>>;
    isSlicerModalOpen: boolean;
    setIsSlicerModalOpen: (open: boolean) => void;
    isSlicing: boolean;
    handleSliceSpritesheet: (settingsOverride?: SheetSliceSettings) => Promise<void> | void;
    loadNewFile: (file: File) => void;
    handleResetImage: () => void;
  };

  // Active real-time pixelation options
  activePixelatorOptions?: {
    enabled: boolean;
    pixelSize: number;
    palette: any;
    ditherType: any;
    ditherAmount: number;
    pixelShape: any;
    outlineEnabled: boolean;
    outlineColor: string;
    outlineThickness: number;
    contrast: number;
    saturation: number;
    brightness: number;
    setEnabled: (val: boolean) => void;
    setPixelSize: (val: number) => void;
    setPalette: (val: any) => void;
    setDitherType: (val: any) => void;
    setDitherAmount: (val: number) => void;
    setPixelShape: (val: any) => void;
    setOutlineEnabled: (val: boolean) => void;
    setOutlineColor: (val: string) => void;
    setOutlineThickness: (val: number) => void;
    setContrast: (val: number) => void;
    setSaturation: (val: number) => void;
    setBrightness: (val: number) => void;
  };

  // Undo/Redo & Save Subsystem
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDirty?: boolean;
  markSaved?: () => void;
  projectId?: string;
  projectName?: string;
  setProjectName?: (name: string) => void;
  triggerSave?: (customName?: string) => Promise<void>;
  triggerSaveAs?: (newName: string) => Promise<void>;
  isSaving?: boolean;
  autosaveNotification?: string | null;

  // --- UNIFIED PREVIEW EDIT MODE & TOOL STATE ---
  editMode?: boolean;
  setEditMode?: (enabled: boolean) => void;
  toolSettings?: ToolSettings;
  setToolSettings?: React.Dispatch<React.SetStateAction<ToolSettings>>;
  selectionMask?: SelectionMask | null;
  setSelectionMask?: (sel: SelectionMask | null) => void;
  editTarget?: 'layer' | 'mask';
  setEditTarget?: (target: 'layer' | 'mask') => void;
  maskSoloLayerId?: string | null;
  setMaskSoloLayerId?: (id: string | null) => void;

  // --- PHOTOSHOP-GRADE LAYERS & MASKS ---
  globalLayers?: ProjectLayer[];
  activeLayerId?: string;
  setActiveLayerId?: (id: string) => void;
  addGlobalLayer?: (type?: ProjectLayer['type'], name?: string) => void;
  duplicateGlobalLayer?: (id: string) => Promise<void>;
  deleteGlobalLayer?: (id: string) => Promise<void>;
  reorderGlobalLayers?: (fromIndex: number, toIndex: number, targetParentId?: string | null) => Promise<void>;
  updateGlobalLayer?: (id: string, updates: Partial<ProjectLayer>) => Promise<void>;
  mergeLayerDown?: (id: string) => Promise<void>;
  mergeVisibleLayers?: () => Promise<void>;
  flattenLayers?: () => Promise<void>;
  addLayerMask?: (layerId: string, fill?: 'white' | 'black') => Promise<void>;
  maskFromSelection?: (layerId: string) => Promise<void>;
  invertLayerMask?: (layerId: string) => Promise<void>;
  applyLayerMask?: (layerId: string) => Promise<void>;
  deleteLayerMask?: (layerId: string) => Promise<void>;
  commitFrameLayerEdit?: (
    frameId: string,
    layerId: string,
    target: 'layer' | 'mask',
    canvas: HTMLCanvasElement,
    offsetX?: number,
    offsetY?: number
  ) => Promise<void>;
  commitLayerOffset?: (
    frameId: string,
    layerId: string,
    offsetX: number,
    offsetY: number
  ) => Promise<void>;

  // Onion Skinning settings
  onionSkinEnabled?: boolean;
  setOnionSkinEnabled?: (enabled: boolean) => void;
  onionSkinPrevFrames?: number;
  setOnionSkinPrevFrames?: (num: number) => void;
  onionSkinNextFrames?: number;
  setOnionSkinNextFrames?: (num: number) => void;
  onionSkinOpacity?: number;
  setOnionSkinOpacity?: (opacity: number) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext() {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error('useEditorContext must be used within EditorProvider');
  }
  return ctx;
}

export function useOptionalEditorContext() {
  return useContext(EditorContext);
}

interface EditorProviderProps {
  value: EditorContextValue;
  children: ReactNode;
}

export function EditorProvider({ value, children }: EditorProviderProps) {
  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}
