'use client';

/**
 * EditorContext - Shared state for all dock panels
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { FrameData, SourceInfo, Folder } from '@/types';
import { FrameState } from '@/lib/frameStore';
import { LoopMode } from '@/components/Timeline';
import { BackgroundMode } from '@/components/PreviewPlayer';
import { OutlineOptions } from '@/lib/outlineGenerator';

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
  handleFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
  handleSelectionChange: (ids: Set<string>) => void;
  handleOrderChange: (ids: string[]) => void;
  handleDeleteSelected: () => void;
  handleRevertSelected: () => void;
  canRevert: boolean;
  
  // Media loading
  handleMediaLoad: (files: File[]) => void;
  handleRemoveSource: (sourceId: string) => void;
  loadedSources: SourceInfo[];
  
  // Panel visibility
  visiblePanels: Set<string>;
  togglePanel: (panelId: string) => void;
  resetLayout: () => void;

  // Standalone Pixelator slicing state (optional)
  pixelatorSlicer?: {
    file: File | null;
    originalImgSrc: string | null;
    imgDimensions: { width: number; height: number } | null;
    sliceType: 'grid' | 'dimensions';
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    isSlicing: boolean;
    setSliceType: (type: 'grid' | 'dimensions') => void;
    setCols: (val: number) => void;
    setRows: (val: number) => void;
    setCellWidth: (val: number) => void;
    setCellHeight: (val: number) => void;
    handleSliceSpritesheet: () => void;
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
