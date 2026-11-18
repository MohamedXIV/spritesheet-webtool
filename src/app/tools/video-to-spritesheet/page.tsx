'use client';

/**
 * Editor Page - Unified Video/GIF/Spritesheet Editor with:
 * - Dual-mode Preview & Canvas Editor workspace
 * - Photoshop-grade Layer & Mask Stack (Raster/Fill/Adjustment/Group, Masks, Blending, Shared vs Per-Frame)
 * - Interactive Spritesheet Slicer with Offset/Spacing/Padding, Linked Guides, and Slice-as-Masks
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { LoopMode } from '@/components/Timeline';
import { BackgroundMode } from '@/components/PreviewPlayer';
import { DockLayout, DockLayoutRef } from '@/components/DockLayout';
import { EditorProvider } from '@/contexts/EditorContext';
import { EditorMenuBar } from '@/components/EditorMenuBar';
import { OutlineOptions } from '@/lib/outlineGenerator';
import { PixelatorOptions } from '@/lib/pixelator';
import { extractFrames, getVideoInfo } from '@/lib/videoDecoder';
import { loadImagesAsFrames, isVideoFile, isImageFile } from '@/lib/imageLoader';
import { sliceSpritesheet } from '@/lib/spritesheetSlicer';
import { importGifFrames, isGifFile } from '@/lib/gifImporter';
import {
  FrameState,
  getOrderedFrames,
  getSelectedFrames,
  disposeFrames,
  createFolder,
  deleteFolder,
  renameFolder,
  toggleFolderVisibility,
  toggleFolderCollapse,
  moveFrameToFolder,
  moveFramesToFolder,
  addFramesToFolder,
  reorderFolders,
  reorderFramesInFolder,
  deleteSelectedFrames,
  appendSourceFrames,
} from '@/lib/frameStore';
import {
  FrameData,
  ExtractionProgress,
  SourceInfo,
  SOURCE_COLORS,
  Folder,
  ProjectLayer,
  LayerPixelData,
} from '@/types';
import {
  DEFAULT_ADJUSTMENT_CONFIG,
  DEFAULT_FILL_CONFIG,
  alphaBitmapToGrayscaleMask,
  cloneLayerPixelData,
  compositeFrameLayers,
  createBaseProjectLayer,
  createSolidMaskBitmap,
  invertGrayscaleMaskBitmap,
  materializeLayerCanvas,
  renderLayerTreeToCanvas,
} from '@/lib/layerCompositor';
import {
  DEFAULT_TOOL_SETTINGS,
  SelectionMask,
  ToolSettings,
  selectionToGrayscaleMaskBitmap,
} from '@/lib/canvasTools';
import {
  DEFAULT_SLICE_SETTINGS,
  SheetSliceSettings,
  computeSliceLayout,
  normalizeSliceSettings,
} from '@/lib/slicerGuides';
import styles from './page.module.css';
import { useFrameHistory } from '@/hooks/useFrameHistory';
import { useProjectSave } from '@/hooks/useProjectSave';
import { useWorkspaceShortcuts } from '@/hooks/useWorkspaceShortcuts';
import { useAppDialog } from '@/components/AppDialogProvider';
import { updateFrameDurations as withFrameDurations } from '@/lib/timelineFrameTiming';
import {
  prepareSpriteProjectRestore,
  restoreSpriteSources,
  type SpriteProjectType,
} from '@/lib/spriteProjectCompatibility';
import {
  replaceSourceSheetFrames,
  restoreSourceSheetAssets,
  type SourceSheetAsset,
} from '@/lib/sourceSheetAssets';

type EditorState = 'idle' | 'extracting' | 'ready';

const FRAME_WARNING_THRESHOLD = 240;

export default function EditorPage() {
  const { confirm: confirmAction, alert: showMessage } = useAppDialog();
  const [editorState, setEditorState] = useState<EditorState>('idle');

  const {
    state: frameState,
    setState: setFrameState,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    resetHistory,
  } = useFrameHistory(30);

  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [fps, setFps] = useState(12);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [decoderType, setDecoderType] = useState<string>('');
  const [loopMode, setLoopMode] = useState<LoopMode>('normal');
  const [showFrameWarning, setShowFrameWarning] = useState(false);
  const [processingFrameIds, setProcessingFrameIds] = useState<Set<string>>(new Set());

  // Preview background and outline settings
  const [previewBgMode, setPreviewBgMode] = useState<BackgroundMode>('none');
  const [previewBgColor, setPreviewBgColor] = useState('#1a1a2e');
  const [previewOutline, setPreviewOutline] = useState<Partial<OutlineOptions>>({ enabled: false });

  // --- UNIFIED PREVIEW EDIT MODE & TOOL STATE ---
  const [editMode, setEditMode] = useState(false);
  const [toolSettings, setToolSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [selectionMask, setSelectionMask] = useState<SelectionMask | null>(null);
  const [editTarget, setEditTarget] = useState<'layer' | 'mask'>('layer');
  const [maskSoloLayerId, setMaskSoloLayerId] = useState<string | null>(null);

  // --- PHOTOSHOP-GRADE LAYERS ---
  const [globalLayers, setGlobalLayers] = useState<ProjectLayer[]>(() => [createBaseProjectLayer()]);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-base');

  const globalLayersRef = useRef<ProjectLayer[]>(globalLayers);
  globalLayersRef.current = globalLayers;
  const frameStateRef = useRef<FrameState | null>(frameState);
  frameStateRef.current = frameState;

  // Keep globalLayers synchronized whenever Undo/Redo changes frameState.projectLayers
  useEffect(() => {
    if (frameState?.projectLayers && frameState.projectLayers.length > 0) {
      setGlobalLayers(frameState.projectLayers);
    }
  }, [frameState?.projectLayers]);

  // Onion Skinning Settings
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [onionSkinPrevFrames, setOnionSkinPrevFrames] = useState(1);
  const [onionSkinNextFrames, setOnionSkinNextFrames] = useState(0);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(0.4);

  // Save Subsystem states
  const [projectId, setProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('Untitled Spritesheet Project');
  const [projectType, setProjectType] = useState<SpriteProjectType>('spritesheet');
  const [loadedSources, setLoadedSources] = useState<SourceInfo[]>([]);

  // Active Real-Time Pixelator State Hooks
  const [pixelatorEnabled, setPixelatorEnabled] = useState(true);
  const [pixelSize, setPixelSize] = useState(8);
  const [pixelatorPalette, setPixelatorPalette] = useState<PixelatorOptions['palette']>('none');
  const [pixelatorDitherType, setPixelatorDitherType] = useState<PixelatorOptions['ditherType']>('none');
  const [pixelatorDitherAmount, setPixelatorDitherAmount] = useState(50);
  const [pixelatorPixelShape, setPixelatorPixelShape] = useState<PixelatorOptions['pixelShape']>('square');
  const [pixelatorOutlineEnabled, setPixelatorOutlineEnabled] = useState(false);
  const [pixelatorOutlineColor, setPixelatorOutlineColor] = useState('#000000');
  const [pixelatorOutlineThickness, setPixelatorOutlineThickness] = useState(1);
  const [pixelatorContrast, setPixelatorContrast] = useState(0);
  const [pixelatorSaturation, setPixelatorSaturation] = useState(0);
  const [pixelatorBrightness, setPixelatorBrightness] = useState(0);

  // Interactive Spritesheet Slicer State
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null);
  const [sheetDimensions, setSheetDimensions] = useState<{ width: number; height: number } | null>(null);
  const [sliceSettings, setSliceSettings] = useState<SheetSliceSettings>(DEFAULT_SLICE_SETTINGS);
  const [isSlicerModalOpen, setIsSlicerModalOpen] = useState(false);
  const [isSlicingSheet, setIsSlicingSheet] = useState(false);
  const [sourceSheetAssets, setSourceSheetAssets] = useState<SourceSheetAsset[]>([]);
  const [editingSheetSourceId, setEditingSheetSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProjectId(`spritesheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [projectId]);

  const {
    triggerSave,
    triggerSaveAs,
    isSaving,
    autosaveNotification,
  } = useProjectSave({
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    type: projectType,
    frameState,
    fps,
    loopMode,
    previewBgMode,
    previewBgColor,
    pixelatorOptions: {
      enabled: pixelatorEnabled,
      pixelSize,
      palette: pixelatorPalette,
      ditherType: pixelatorDitherType,
      ditherAmount: pixelatorDitherAmount,
      pixelShape: pixelatorPixelShape,
      outlineEnabled: pixelatorOutlineEnabled,
      outlineColor: pixelatorOutlineColor,
      outlineThickness: pixelatorOutlineThickness,
      contrast: pixelatorContrast,
      saturation: pixelatorSaturation,
      brightness: pixelatorBrightness,
    },
    slicerOptions: sliceSettings,
    isDirty,
    markSaved,
    globalLayers,
    sources: loadedSources,
    sourceSheets: sourceSheetAssets,
  });

  // Panel visibility tracking
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(
    new Set([
      'media-loader',
      'frame-grid',
      'preview',
      'timeline',
      'bg-removal',
      'outline',
      'watermark',
      'export',
      'frame-layers',
    ])
  );
  const dockLayoutRef = useRef<DockLayoutRef>(null);
  const sourceColorIndexRef = useRef(0);
  const originalFramesRef = useRef<Map<string, ImageBitmap>>(new Map());

  // URL project deep-linking restore effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;

    setEditorState('extracting');
    setProgress({ current: 0, total: 100, percentage: 0 });

    import('@/lib/projectDatabase').then(async ({ getProject }) => {
      try {
        const project = await getProject(id);
        if (!project) {
          void showMessage({ title: 'Project unavailable', message: 'Project not found locally.' });
          setEditorState('idle');
          return;
        }

        const restorePlan = prepareSpriteProjectRestore(project);
        setProjectType(restorePlan.type);
        setProjectId(project.id);
        setProjectName(project.name);
        setFps(project.metadata.fps || 12);
        setLoopMode((project.metadata.loopMode as LoopMode) || 'normal');
        setPreviewBgMode((project.metadata.previewBgMode as BackgroundMode) || 'none');
        setPreviewBgColor(project.metadata.previewBgColor || '#1a1a2e');

        if (project.metadata.slicerOptions) {
          setSliceSettings(normalizeSliceSettings(project.metadata.slicerOptions));
        }

        const pixels = project.metadata.pixelatorOptions;
        if (pixels) {
          setPixelatorEnabled(pixels.enabled ?? true);
          setPixelSize(pixels.pixelSize ?? 8);
          setPixelatorPalette(pixels.palette ?? 'none');
          setPixelatorDitherType(pixels.ditherType ?? 'none');
          setPixelatorDitherAmount(pixels.ditherAmount ?? 50);
          setPixelatorPixelShape(pixels.pixelShape ?? 'square');
          setPixelatorOutlineEnabled(pixels.outlineEnabled ?? false);
          setPixelatorOutlineColor(pixels.outlineColor ?? '#000000');
          setPixelatorOutlineThickness(pixels.outlineThickness ?? 1);
          setPixelatorContrast(pixels.contrast ?? 0);
          setPixelatorSaturation(pixels.saturation ?? 0);
          setPixelatorBrightness(pixels.brightness ?? 0);
        }

        const restoredLayers = restorePlan.globalLayers.map(l => ({ ...l }));
        const restoredFrames: FrameData[] = [];

        for (const f of restorePlan.frames) {
          const bitmap = await createImageBitmap(f.blob);
          const layersMap: Record<string, LayerPixelData> = {};

          if (f.layers && f.layers.length > 0) {
            for (const savedLayer of f.layers) {
              const bmp = savedLayer.blob ? await createImageBitmap(savedLayer.blob) : null;
              const maskBitmap = savedLayer.maskBlob ? await createImageBitmap(savedLayer.maskBlob) : null;
              layersMap[savedLayer.layerId] = {
                bitmap: bmp,
                maskBitmap,
                offsetX: savedLayer.offsetX ?? 0,
                offsetY: savedLayer.offsetY ?? 0,
              };
            }
          }

          if (!layersMap['layer-base']) {
            layersMap['layer-base'] = {
              bitmap: await createImageBitmap(bitmap),
              maskBitmap: null,
              offsetX: 0,
              offsetY: 0,
            };
          }

          restoredFrames.push({
            id: f.id,
            index: f.index,
            timestamp: f.timestamp,
            durationMs: f.durationMs,
            layers: layersMap,
            bitmap,
            sourceId: f.sourceId,
            sourceColor: f.sourceColor,
          });
        }

        // Hydrate sharedData for any layer whose scope === 'shared'
        for (const layer of restoredLayers) {
          if (layer.scope === 'shared' && !layer.sharedData && restoredFrames[0]?.layers?.[layer.id]) {
            layer.sharedData = await cloneLayerPixelData(restoredFrames[0].layers[layer.id]);
          }
        }

        setGlobalLayers(restoredLayers);
        setActiveLayerId(restoredLayers[0].id);

        const restoredState: FrameState = {
          frames: restoredFrames,
          folders: restorePlan.folders,
          selectedIds: restorePlan.selectedIds,
          projectLayers: restoredLayers,
        };

        originalFramesRef.current.clear();
        for (const frame of restoredFrames) {
          const clone = await createImageBitmap(frame.bitmap);
          originalFramesRef.current.set(frame.id, clone);
        }

        setLoadedSources(restoreSpriteSources(project, restorePlan.folders));
        const persistedSheets = restoreSourceSheetAssets(project.metadata.sourceSheets);
        setSourceSheetAssets(persistedSheets);
        const firstSheet = persistedSheets[0];
        if (firstSheet) {
          setSheetFile(new File([firstSheet.blob], firstSheet.name, { type: firstSheet.blob.type }));
          setSheetPreviewUrl(URL.createObjectURL(firstSheet.blob));
          setSheetDimensions({ width: firstSheet.width, height: firstSheet.height });
          setEditingSheetSourceId(firstSheet.sourceId);
          setSliceSettings(firstSheet.slice);
        } else {
          setSheetFile(null);
          setSheetPreviewUrl(null);
          setSheetDimensions(null);
          setEditingSheetSourceId(null);
        }

        resetHistory(restoredState);
        setEditorState('ready');
      } catch (err) {
        console.error('Failed to restore project:', err);
        void showMessage({ title: 'Cannot restore project', message: 'Failed to load project.' });
        setEditorState('idle');
      }
    });
  }, [resetHistory, showMessage]);

  // --- Interactive Slicer Actions ---
  const loadNewSheetFile = useCallback(async (file: File) => {
    if (!isImageFile(file) || file.type === 'image/gif' || /\.gif$/i.test(file.name)) {
      void showMessage({
        title: 'Unsupported spritesheet',
        message: 'Use Media Loader for animated GIFs. The Slicer accepts static PNG, WebP, or JPEG spritesheets.',
      });
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (width === 0 || height === 0) throw new Error('Image has no pixels');

      setSheetFile(file);
      setEditingSheetSourceId(null);
      setSheetPreviewUrl(URL.createObjectURL(file));
      setSheetDimensions({ width, height });
      setSliceSettings(prev => ({
        ...DEFAULT_SLICE_SETTINGS,
        sliceAsMasks: prev.sliceAsMasks,
        cols: 4,
        rows: 4,
        cellWidth: Math.max(1, Math.floor(width / 4)),
        cellHeight: Math.max(1, Math.floor(height / 4)),
      }));
      setIsSlicerModalOpen(true);
    } catch (error) {
      console.error('Failed to inspect spritesheet:', error);
      void showMessage({
        title: 'Image could not be opened',
        message: 'This image could not be opened as a spritesheet.',
      });
    }
  }, [showMessage]);

  useEffect(() => {
    return () => {
      if (sheetPreviewUrl) URL.revokeObjectURL(sheetPreviewUrl);
    };
  }, [sheetPreviewUrl]);

  const resetSheetFile = useCallback(() => {
    setSheetFile(null);
    setSheetPreviewUrl(null);
    setSheetDimensions(null);
    setEditingSheetSourceId(null);
    setIsSlicerModalOpen(false);
  }, []);

  const selectSavedSheet = useCallback((sourceId: string) => {
    const asset = sourceSheetAssets.find(item => item.sourceId === sourceId);
    if (!asset) return;
    setSheetFile(new File([asset.blob], asset.name, { type: asset.blob.type }));
    setSheetPreviewUrl(URL.createObjectURL(asset.blob));
    setSheetDimensions({ width: asset.width, height: asset.height });
    setEditingSheetSourceId(asset.sourceId);
    setSliceSettings(normalizeSliceSettings(asset.slice, asset.width, asset.height));
    setIsSlicerModalOpen(true);
  }, [sourceSheetAssets]);

  const handleSliceSheet = useCallback(async (settingsOverride?: SheetSliceSettings) => {
    if (!sheetFile || !sheetDimensions || isSlicingSheet) return;
    const effective = normalizeSliceSettings(settingsOverride ?? sliceSettings, sheetDimensions.width, sheetDimensions.height);
    const layout = computeSliceLayout(sheetDimensions.width, sheetDimensions.height, effective);
    const count = layout.rects.length;
    if (count < 1 || count > 1024) {
      void showMessage({
        title: 'Invalid slice grid',
        message: 'Select slicing settings producing between 1 and 1024 frames.',
      });
      return;
    }

    const previousAsset = sourceSheetAssets.find(item => item.sourceId === editingSheetSourceId);
    const replacing = !!previousAsset;
    const affectedCount = replacing
      ? (frameState?.frames.filter(frame => frame.sourceId === previousAsset.sourceId).length ?? 0)
      : 0;
    if (
      affectedCount > 0 &&
      !(await confirmAction({
        title: 'Replace existing slices?',
        message: `Re-slice ${affectedCount} frames from "${previousAsset!.name}"? This replaces edits and paint layers on those frames. Undo can restore them; other sources are untouched.`,
        confirmLabel: 'Re-slice frames',
        danger: true,
      }))
    ) {
      return;
    }

    setIsSlicingSheet(true);
    let imported: FrameData[] = [];
    try {
      const sourceId =
        previousAsset?.sourceId ?? `source-sheet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const sourceColor =
        loadedSources.find(source => source.id === sourceId)?.color ??
        SOURCE_COLORS[sourceColorIndexRef.current++ % SOURCE_COLORS.length];

      const result = await sliceSpritesheet(
        sheetFile,
        effective,
        sourceId,
        sourceColor,
        globalLayersRef.current
      );
      imported = result.frames;
      if (imported.length === 0) throw new Error('No sprites were found in the selected grid');

      const folderId =
        previousAsset?.folderId ?? `folder-sheet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const folder: Folder = {
        id: folderId,
        name: sheetFile.name.replace(/\.[^.]+$/, ''),
        frameIds: imported.map(frame => frame.id),
        visible: true,
        collapsed: false,
        color: sourceColor,
      };

      setSliceSettings(effective);
      setFrameState(previous => {
        const next =
          previous && replacing
            ? replaceSourceSheetFrames(previous, sourceId, folder, imported)
            : appendSourceFrames(previous, imported, folder);
        return { ...next, projectLayers: globalLayersRef.current };
      });

      setLoadedSources(previous => {
        const next: SourceInfo = {
          id: sourceId,
          name: sheetFile.name,
          type: 'image',
          frameCount: imported.length,
          color: sourceColor,
        };
        return previous.some(item => item.id === sourceId)
          ? previous.map(item => (item.id === sourceId ? next : item))
          : [...previous, next];
      });

      const asset: SourceSheetAsset = {
        sourceId,
        folderId,
        name: sheetFile.name,
        blob: sheetFile,
        width: sheetDimensions.width,
        height: sheetDimensions.height,
        slice: effective,
      };
      setSourceSheetAssets(previous => [...previous.filter(item => item.sourceId !== sourceId), asset]);
      setEditingSheetSourceId(sourceId);
      setCurrentFrame(0);
      setEditorState('ready');
      setIsSlicerModalOpen(false);
      setShowFrameWarning(previous => previous || (frameState?.frames.length || 0) + imported.length > FRAME_WARNING_THRESHOLD);
    } catch (error) {
      console.error('Spritesheet slicing failed:', error);
      const closed = new Set<ImageBitmap>();
      for (const frame of imported) {
        if (!closed.has(frame.bitmap)) {
          closed.add(frame.bitmap);
          try { frame.bitmap.close(); } catch {}
        }
        Object.values(frame.layers || {}).forEach(lp => {
          if (lp.bitmap && !closed.has(lp.bitmap)) {
            closed.add(lp.bitmap);
            try { lp.bitmap.close(); } catch {}
          }
          if (lp.maskBitmap && !closed.has(lp.maskBitmap)) {
            closed.add(lp.maskBitmap);
            try { lp.maskBitmap.close(); } catch {}
          }
        });
      }
      void showMessage({
        title: 'Slicing failed',
        message: 'Failed to slice spritesheet. Check the selected guides and image.',
      });
    } finally {
      setIsSlicingSheet(false);
    }
  }, [
    sheetFile,
    sheetDimensions,
    isSlicingSheet,
    sliceSettings,
    sourceSheetAssets,
    editingSheetSourceId,
    frameState?.frames,
    loadedSources,
    setFrameState,
    confirmAction,
    showMessage,
  ]);

  // --- HELPER: Recomposite All Frames for Layer Stack Changes ---
  const recompositeAndCommit = useCallback(async (
    nextLayers: ProjectLayer[],
    mutatedFrames?: FrameData[]
  ) => {
    setGlobalLayers(nextLayers);
    const current = frameStateRef.current;
    if (!current || current.frames.length === 0) return;

    const baseFrames = mutatedFrames ?? current.frames;
    const updatedFrames = await Promise.all(
      baseFrames.map(async f => {
        const nextBitmap = await compositeFrameLayers(
          f.layers,
          nextLayers,
          f.bitmap.width,
          f.bitmap.height
        );
        return { ...f, bitmap: nextBitmap };
      })
    );

    setFrameState({
      ...current,
      frames: updatedFrames,
      projectLayers: nextLayers,
    });
  }, [setFrameState]);

  const commitStructureOnly = useCallback((nextLayers: ProjectLayer[], mutatedFrames?: FrameData[]) => {
    setGlobalLayers(nextLayers);
    const current = frameStateRef.current;
    if (!current) return;
    setFrameState({
      ...current,
      frames: mutatedFrames ?? current.frames,
      projectLayers: nextLayers,
    });
  }, [setFrameState]);

  // --- PHOTOSHOP-GRADE LAYER & MASK OPERATIONS ---
  const addGlobalLayer = useCallback(
    async (type: ProjectLayer['type'] = 'raster', name?: string) => {
      const prev = globalLayersRef.current;
      const newId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const defaultName =
        type === 'group'
          ? `Group ${prev.length + 1}`
          : type === 'fill'
            ? `Fill Layer ${prev.length + 1}`
            : type === 'adjustment'
              ? `Adjustments ${prev.length + 1}`
              : `Layer ${prev.length + 1}`;

      const newLayer: ProjectLayer = {
        id: newId,
        name: name || defaultName,
        type,
        parentId: null,
        collapsed: false,
        scope: 'per-frame',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        locked: false,
        alphaLocked: false,
        clipped: false,
        maskEnabled: true,
        maskInverted: false,
        ...(type === 'fill' ? { fillConfig: { ...DEFAULT_FILL_CONFIG } } : {}),
        ...(type === 'adjustment' ? { adjustmentConfig: { ...DEFAULT_ADJUSTMENT_CONFIG } } : {}),
      };

      const nextLayers = [...prev, newLayer];
      setActiveLayerId(newId);
      setEditTarget('layer');

      if (type === 'fill' || type === 'adjustment') {
        await recompositeAndCommit(nextLayers);
      } else {
        commitStructureOnly(nextLayers);
      }
    },
    [recompositeAndCommit, commitStructureOnly]
  );

  const duplicateGlobalLayer = useCallback(async (id: string) => {
    const prev = globalLayersRef.current;
    const idx = prev.findIndex(l => l.id === id);
    if (idx === -1) return;
    const src = prev[idx];
    const newId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clonedShared = src.sharedData ? await cloneLayerPixelData(src.sharedData) : undefined;
    const dup: ProjectLayer = {
      ...src,
      id: newId,
      name: `${src.name} copy`,
      sharedData: clonedShared,
      fillConfig: src.fillConfig ? { ...src.fillConfig } : undefined,
      adjustmentConfig: src.adjustmentConfig ? { ...src.adjustmentConfig } : undefined,
    };
    const nextLayers = [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)];

    const current = frameStateRef.current;
    if (!current || current.frames.length === 0) {
      setGlobalLayers(nextLayers);
      setActiveLayerId(newId);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const existingData = f.layers?.[src.id];
        if (!existingData) return f;
        const cloned = await cloneLayerPixelData(existingData);
        return {
          ...f,
          layers: { ...(f.layers || {}), [newId]: cloned },
        };
      })
    );
    setActiveLayerId(newId);
    await recompositeAndCommit(nextLayers, updatedFrames);
  }, [recompositeAndCommit]);

  const deleteGlobalLayer = useCallback(async (id: string) => {
    if (id === 'layer-base') return;
    const prev = globalLayersRef.current;
    const target = prev.find(l => l.id === id);
    if (!target) return;

    const nextLayers = prev
      .filter(l => l.id !== id)
      .map(l => (l.parentId === id ? { ...l, parentId: target.parentId ?? null } : l));

    if (activeLayerId === id) {
      setActiveLayerId(nextLayers[0]?.id ?? 'layer-base');
      setEditTarget('layer');
    }
    if (maskSoloLayerId === id) setMaskSoloLayerId(null);

    const current = frameStateRef.current;
    if (!current) {
      setGlobalLayers(nextLayers);
      return;
    }

    const cleanedFrames = current.frames.map(f => {
      if (!f.layers || !(id in f.layers)) return f;
      const copy = { ...f.layers };
      delete copy[id];
      return { ...f, layers: copy };
    });

    await recompositeAndCommit(nextLayers, cleanedFrames);
  }, [activeLayerId, maskSoloLayerId, recompositeAndCommit]);

  const reorderGlobalLayers = useCallback(
    async (fromIndex: number, toIndex: number, targetParentId?: string | null) => {
      const prev = globalLayersRef.current;
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return;
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      const updatedMoved =
        targetParentId !== undefined && moved.id !== targetParentId
          ? { ...moved, parentId: targetParentId }
          : moved;
      copy.splice(toIndex, 0, updatedMoved);
      await recompositeAndCommit(copy);
    },
    [recompositeAndCommit]
  );

  const updateGlobalLayer = useCallback(
    async (id: string, updates: Partial<ProjectLayer>) => {
      const prev = globalLayersRef.current;
      const current = frameStateRef.current;
      const targetLayer = prev.find(l => l.id === id);
      if (!targetLayer) return;

      let mutatedFrames: FrameData[] | undefined;
      const nextUpdates: Partial<ProjectLayer> = { ...updates };

      // Handle scope migration cleanly
      if (updates.scope && updates.scope !== targetLayer.scope && current && current.frames.length > 0) {
        if (updates.scope === 'shared') {
          const ordered = getOrderedFrames(current);
          const refFrame = ordered[currentFrame] || current.frames[0];
          const srcData = refFrame?.layers?.[id];
          nextUpdates.sharedData = srcData ? await cloneLayerPixelData(srcData) : { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
        } else {
          // shared -> per-frame
          const sharedSrc = targetLayer.sharedData;
          if (sharedSrc) {
            mutatedFrames = await Promise.all(
              current.frames.map(async f => ({
                ...f,
                layers: {
                  ...(f.layers || {}),
                  [id]: await cloneLayerPixelData(sharedSrc),
                },
              }))
            );
          }
          nextUpdates.sharedData = undefined;
        }
      }

      const nextLayers = prev.map(l => (l.id === id ? { ...l, ...nextUpdates } : l));

      const needsRecomposite =
        updates.visible !== undefined ||
        updates.opacity !== undefined ||
        updates.blendMode !== undefined ||
        updates.clipped !== undefined ||
        updates.maskEnabled !== undefined ||
        updates.maskInverted !== undefined ||
        updates.fillConfig !== undefined ||
        updates.adjustmentConfig !== undefined ||
        updates.scope !== undefined ||
        updates.parentId !== undefined;

      if (needsRecomposite) {
        await recompositeAndCommit(nextLayers, mutatedFrames);
      } else {
        commitStructureOnly(nextLayers, mutatedFrames);
      }
    },
    [currentFrame, recompositeAndCommit, commitStructureOnly]
  );

  const mergeLayerDown = useCallback(async (id: string) => {
    const prev = globalLayersRef.current;
    const idx = prev.findIndex(l => l.id === id);
    if (idx <= 0) return;
    const topLayer = prev[idx];
    const belowLayer = prev[idx - 1];
    if (belowLayer.type === 'group' || topLayer.type === 'group') return;

    const current = frameStateRef.current;
    const mergedBelow: ProjectLayer = {
      ...belowLayer,
      type: 'raster',
      fillConfig: undefined,
      adjustmentConfig: undefined,
    };
    const nextLayers = prev
      .map(l => (l.id === belowLayer.id ? mergedBelow : l))
      .filter(l => l.id !== topLayer.id);

    setActiveLayerId(belowLayer.id);
    if (!current) {
      setGlobalLayers(nextLayers);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const w = f.bitmap.width;
        const h = f.bitmap.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        renderLayerTreeToCanvas(
          canvas,
          [
            { ...belowLayer, visible: true },
            { ...topLayer, visible: true, clipped: false },
          ],
          f.layers,
          null
        );
        const mergedBmp = await createImageBitmap(canvas);
        const nextMap = { ...(f.layers || {}) };
        delete nextMap[topLayer.id];
        nextMap[belowLayer.id] = {
          bitmap: mergedBmp,
          maskBitmap: null,
          offsetX: 0,
          offsetY: 0,
        };
        return { ...f, layers: nextMap };
      })
    );

    await recompositeAndCommit(nextLayers, updatedFrames);
  }, [recompositeAndCommit]);

  const mergeVisibleLayers = useCallback(async () => {
    const prev = globalLayersRef.current;
    const current = frameStateRef.current;
    const base = createBaseProjectLayer();
    const hidden = prev.filter(l => l.id !== 'layer-base' && !l.visible);
    const nextLayers = [base, ...hidden];
    setActiveLayerId(base.id);
    setEditTarget('layer');
    setMaskSoloLayerId(null);

    if (!current) {
      setGlobalLayers(nextLayers);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const composited = await compositeFrameLayers(f.layers, prev, f.bitmap.width, f.bitmap.height);
        const nextMap: Record<string, LayerPixelData> = {
          [base.id]: { bitmap: composited, maskBitmap: null, offsetX: 0, offsetY: 0 },
        };
        for (const hLayer of hidden) {
          if (f.layers?.[hLayer.id]) nextMap[hLayer.id] = f.layers[hLayer.id];
        }
        return { ...f, layers: nextMap, bitmap: await createImageBitmap(composited) };
      })
    );

    setGlobalLayers(nextLayers);
    setFrameState({ ...current, frames: updatedFrames, projectLayers: nextLayers });
  }, [setFrameState]);

  const flattenLayers = useCallback(async () => {
    const prev = globalLayersRef.current;
    const current = frameStateRef.current;
    const base = createBaseProjectLayer();
    const nextLayers = [base];
    setActiveLayerId(base.id);
    setEditTarget('layer');
    setMaskSoloLayerId(null);

    if (!current) {
      setGlobalLayers(nextLayers);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const composited = await compositeFrameLayers(f.layers, prev, f.bitmap.width, f.bitmap.height);
        return {
          ...f,
          layers: {
            [base.id]: { bitmap: composited, maskBitmap: null, offsetX: 0, offsetY: 0 },
          },
          bitmap: await createImageBitmap(composited),
        };
      })
    );

    setGlobalLayers(nextLayers);
    setFrameState({ ...current, frames: updatedFrames, projectLayers: nextLayers });
  }, [setFrameState]);

  const addLayerMask = useCallback(async (layerId: string, fill: 'white' | 'black' = 'white') => {
    const current = frameStateRef.current;
    const prev = globalLayersRef.current;
    const target = prev.find(l => l.id === layerId);
    if (!target || !current || current.frames.length === 0) return;

    if (target.scope === 'shared') {
      const refFrame = current.frames[0];
      const maskBmp = await createSolidMaskBitmap(refFrame.bitmap.width, refFrame.bitmap.height, fill);
      const nextLayers = prev.map(l =>
        l.id === layerId
          ? {
              ...l,
              maskEnabled: true,
              maskInverted: false,
              sharedData: {
                ...(l.sharedData || { bitmap: null, maskBitmap: null }),
                maskBitmap: maskBmp,
              },
            }
          : l
      );
      setEditTarget('mask');
      await recompositeAndCommit(nextLayers);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const prevData = f.layers?.[layerId] ?? { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
        if (prevData.maskBitmap) return f;
        const maskBmp = await createSolidMaskBitmap(f.bitmap.width, f.bitmap.height, fill);
        return {
          ...f,
          layers: {
            ...(f.layers || {}),
            [layerId]: { ...prevData, maskBitmap: maskBmp },
          },
        };
      })
    );

    const nextLayers = prev.map(l =>
      l.id === layerId ? { ...l, maskEnabled: true, maskInverted: false } : l
    );
    setEditTarget('mask');
    await recompositeAndCommit(nextLayers, updatedFrames);
  }, [recompositeAndCommit]);

  const maskFromSelection = useCallback(async (layerId: string) => {
    if (!selectionMask?.bounds) return;
    const current = frameStateRef.current;
    const prev = globalLayersRef.current;
    const target = prev.find(l => l.id === layerId);
    if (!target || !current) return;

    const ordered = getOrderedFrames(current);
    const activeFrame = ordered[currentFrame] || current.frames[0];
    if (!activeFrame) return;

    const maskBmp = await selectionToGrayscaleMaskBitmap(selectionMask);

    if (target.scope === 'shared') {
      const nextLayers = prev.map(l =>
        l.id === layerId
          ? {
              ...l,
              maskEnabled: true,
              maskInverted: false,
              sharedData: { ...(l.sharedData || { bitmap: null, maskBitmap: null }), maskBitmap: maskBmp },
            }
          : l
      );
      setEditTarget('mask');
      await recompositeAndCommit(nextLayers);
      return;
    }

    const updatedFrames = current.frames.map(f => {
      if (f.id !== activeFrame.id) return f;
      const prevData = f.layers?.[layerId] ?? { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
      return {
        ...f,
        layers: {
          ...(f.layers || {}),
          [layerId]: { ...prevData, maskBitmap: maskBmp },
        },
      };
    });
    const nextLayers = prev.map(l =>
      l.id === layerId ? { ...l, maskEnabled: true, maskInverted: false } : l
    );
    setEditTarget('mask');
    await recompositeAndCommit(nextLayers, updatedFrames);
  }, [selectionMask, currentFrame, recompositeAndCommit]);

  const invertLayerMask = useCallback(async (layerId: string) => {
    const current = frameStateRef.current;
    const prev = globalLayersRef.current;
    const target = prev.find(l => l.id === layerId);
    if (!target || !current) return;

    if (target.scope === 'shared' && target.sharedData?.maskBitmap) {
      const inverted = await invertGrayscaleMaskBitmap(target.sharedData.maskBitmap);
      const nextLayers = prev.map(l =>
        l.id === layerId
          ? { ...l, sharedData: { ...l.sharedData!, maskBitmap: inverted } }
          : l
      );
      await recompositeAndCommit(nextLayers);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const pd = f.layers?.[layerId];
        if (!pd?.maskBitmap) return f;
        const inverted = await invertGrayscaleMaskBitmap(pd.maskBitmap);
        return {
          ...f,
          layers: { ...(f.layers || {}), [layerId]: { ...pd, maskBitmap: inverted } },
        };
      })
    );
    await recompositeAndCommit(prev, updatedFrames);
  }, [recompositeAndCommit]);

  const applyLayerMask = useCallback(async (layerId: string) => {
    const current = frameStateRef.current;
    const prev = globalLayersRef.current;
    const target = prev.find(l => l.id === layerId);
    if (!target || !current) return;

    if (maskSoloLayerId === layerId) setMaskSoloLayerId(null);
    setEditTarget('layer');

    if (target.scope === 'shared' && target.sharedData?.maskBitmap && current.frames[0]) {
      const ref = current.frames[0];
      const canvas = await materializeLayerCanvas(target, target.sharedData, ref.bitmap.width, ref.bitmap.height, true);
      const bmp = await createImageBitmap(canvas);
      const nextLayers = prev.map(l =>
        l.id === layerId
          ? { ...l, maskInverted: false, sharedData: { bitmap: bmp, maskBitmap: null, offsetX: 0, offsetY: 0 } }
          : l
      );
      await recompositeAndCommit(nextLayers);
      return;
    }

    const updatedFrames = await Promise.all(
      current.frames.map(async f => {
        const pd = f.layers?.[layerId];
        if (!pd?.maskBitmap) return f;
        const canvas = await materializeLayerCanvas(target, pd, f.bitmap.width, f.bitmap.height, true);
        const bmp = await createImageBitmap(canvas);
        return {
          ...f,
          layers: {
            ...(f.layers || {}),
            [layerId]: { bitmap: bmp, maskBitmap: null, offsetX: 0, offsetY: 0 },
          },
        };
      })
    );
    const nextLayers = prev.map(l => (l.id === layerId ? { ...l, maskInverted: false } : l));
    await recompositeAndCommit(nextLayers, updatedFrames);
  }, [maskSoloLayerId, recompositeAndCommit]);

  const deleteLayerMask = useCallback(async (layerId: string) => {
    const current = frameStateRef.current;
    const prev = globalLayersRef.current;
    const target = prev.find(l => l.id === layerId);
    if (!target || !current) return;

    if (maskSoloLayerId === layerId) setMaskSoloLayerId(null);
    setEditTarget('layer');

    if (target.scope === 'shared') {
      const nextLayers = prev.map(l =>
        l.id === layerId && l.sharedData
          ? { ...l, sharedData: { ...l.sharedData, maskBitmap: null } }
          : l
      );
      await recompositeAndCommit(nextLayers);
      return;
    }

    const updatedFrames = current.frames.map(f => {
      const pd = f.layers?.[layerId];
      if (!pd?.maskBitmap) return f;
      return {
        ...f,
        layers: { ...(f.layers || {}), [layerId]: { ...pd, maskBitmap: null } },
      };
    });
    await recompositeAndCommit(prev, updatedFrames);
  }, [maskSoloLayerId, recompositeAndCommit]);

  const commitFrameLayerEdit = useCallback(
    async (
      frameId: string,
      layerId: string,
      target: 'layer' | 'mask',
      canvas: HTMLCanvasElement,
      offsetX = 0,
      offsetY = 0
    ) => {
      const current = frameStateRef.current;
      const layers = globalLayersRef.current;
      const layer = layers.find(l => l.id === layerId);
      if (!current || !layer) return;

      const bmp = await createImageBitmap(canvas);

      if (layer.scope === 'shared') {
        const nextLayers = layers.map(l => {
          if (l.id !== layerId) return l;
          const prevShared = l.sharedData ?? { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
          return {
            ...l,
            sharedData:
              target === 'mask'
                ? { ...prevShared, maskBitmap: bmp }
                : { ...prevShared, bitmap: bmp, offsetX, offsetY },
          };
        });
        await recompositeAndCommit(nextLayers);
        return;
      }

      const updatedFrames = await Promise.all(
        current.frames.map(async f => {
          if (f.id !== frameId) return f;
          const prevData = f.layers?.[layerId] ?? { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
          const nextData: LayerPixelData =
            target === 'mask'
              ? { ...prevData, maskBitmap: bmp }
              : { ...prevData, bitmap: bmp, offsetX, offsetY };
          const nextMap = { ...(f.layers || {}), [layerId]: nextData };
          const composited = await compositeFrameLayers(nextMap, layers, canvas.width, canvas.height);
          return { ...f, layers: nextMap, bitmap: composited };
        })
      );

      setFrameState({ ...current, frames: updatedFrames, projectLayers: layers });
    },
    [recompositeAndCommit, setFrameState]
  );

  const commitLayerOffset = useCallback(
    async (frameId: string, layerId: string, offsetX: number, offsetY: number) => {
      const current = frameStateRef.current;
      const layers = globalLayersRef.current;
      const layer = layers.find(l => l.id === layerId);
      if (!current || !layer) return;

      if (layer.scope === 'shared') {
        const nextLayers = layers.map(l =>
          l.id === layerId && l.sharedData
            ? { ...l, sharedData: { ...l.sharedData, offsetX, offsetY } }
            : l
        );
        await recompositeAndCommit(nextLayers);
        return;
      }

      const updatedFrames = await Promise.all(
        current.frames.map(async f => {
          if (f.id !== frameId) return f;
          const prevData = f.layers?.[layerId];
          if (!prevData) return f;
          const nextMap = {
            ...(f.layers || {}),
            [layerId]: { ...prevData, offsetX, offsetY },
          };
          const composited = await compositeFrameLayers(nextMap, layers, f.bitmap.width, f.bitmap.height);
          return { ...f, layers: nextMap, bitmap: composited };
        })
      );
      setFrameState({ ...current, frames: updatedFrames, projectLayers: layers });
    },
    [recompositeAndCommit, setFrameState]
  );

  // --- FOLDER ACTIONS ---
  const folders = useMemo(() => (frameState ? frameState.folders : []), [frameState]);

  const handleCreateFolder = useCallback((name: string, color?: string) => {
    setFrameState(prev => {
      if (!prev) return prev;
      const folderColor = color || SOURCE_COLORS[prev.folders.length % SOURCE_COLORS.length];
      return createFolder(prev, name, folderColor);
    });
  }, [setFrameState]);

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      const folder = frameState?.folders.find(item => item.id === folderId);
      if (!folder) return;
      const confirmed = await confirmAction({
        title: 'Delete folder?',
        message: `Delete "${folder.name}" and its ${folder.frameIds.length} frames? You can undo this action.`,
        confirmLabel: 'Delete folder',
        danger: true,
      });
      if (!confirmed) return;
      setFrameState(prev => (prev ? deleteFolder(prev, folderId) : prev));
    },
    [frameState, setFrameState, confirmAction]
  );

  const handleRenameFolder = useCallback((folderId: string, name: string) => {
    setFrameState(prev => (prev ? renameFolder(prev, folderId, name) : prev));
  }, [setFrameState]);

  const handleToggleFolderVisibility = useCallback((folderId: string) => {
    setFrameState(prev => (prev ? toggleFolderVisibility(prev, folderId) : prev));
  }, [setFrameState]);

  const handleToggleFolderCollapse = useCallback((folderId: string) => {
    setFrameState(prev => (prev ? toggleFolderCollapse(prev, folderId) : prev));
  }, [setFrameState]);

  const handleMoveFrameToFolder = useCallback(
    (frameId: string, folderId: string, targetIndex?: number) => {
      setFrameState(prev => (prev ? moveFrameToFolder(prev, frameId, folderId, targetIndex) : prev));
    },
    [setFrameState]
  );

  const handleMoveFramesToFolder = useCallback(
    (frameIds: string[], folderId: string) => {
      setFrameState(prev => (prev ? moveFramesToFolder(prev, frameIds, folderId) : prev));
    },
    [setFrameState]
  );

  const handleCopyFramesToFolder = useCallback(
    async (frameIds: string[], folderId: string) => {
      if (frameIds.length === 0 || !frameStateRef.current) return;
      const framesToCopy = frameStateRef.current.frames.filter(f => frameIds.includes(f.id));
      if (framesToCopy.length === 0) return;

      try {
        const copiedFrames: FrameData[] = [];
        for (const frame of framesToCopy) {
          const clonedBitmap = await createImageBitmap(frame.bitmap);
          const clonedLayers: Record<string, LayerPixelData> = {};
          if (frame.layers) {
            for (const [lid, pd] of Object.entries(frame.layers)) {
              clonedLayers[lid] = await cloneLayerPixelData(pd);
            }
          }
          const newId = `frame-copy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          copiedFrames.push({
            ...frame,
            id: newId,
            bitmap: clonedBitmap,
            layers: clonedLayers,
          });
        }
        setFrameState(prev => (prev ? addFramesToFolder(prev, copiedFrames, folderId) : prev));
      } catch (e) {
        console.error('Failed to copy frames:', e);
        void showMessage({
          title: 'Copy failed',
          message: 'Failed to copy frames due to an image cloning error.',
        });
      }
    },
    [setFrameState, showMessage]
  );

  const handleReorderFolders = useCallback(
    (fromIndex: number, toIndex: number) => {
      setFrameState(prev => (prev ? reorderFolders(prev, fromIndex, toIndex) : prev));
    },
    [setFrameState]
  );

  const handleReorderFramesInFolder = useCallback(
    (folderId: string, fromIndex: number, toIndex: number) => {
      setFrameState(prev => (prev ? reorderFramesInFolder(prev, folderId, fromIndex, toIndex) : prev));
    },
    [setFrameState]
  );

  // Cleanup on unmount
  useEffect(() => {
    const originalMap = originalFramesRef.current;
    return () => {
      originalMap.forEach(b => {
        try { b.close(); } catch {}
      });
      originalMap.clear();
      if (frameStateRef.current) {
        try { disposeFrames(frameStateRef.current); } catch {}
      }
    };
  }, []);

  // --- MEDIA LOADER ---
  const handleMediaLoad = useCallback(
    async (files: File[]) => {
      setEditorState('extracting');
      setProgress({ current: 0, total: 0, percentage: 0 });
      setShowFrameWarning(false);

      try {
        let totalExpectedFrames = 0;
        for (const file of files) {
          if (isVideoFile(file)) {
            try {
              const info = await getVideoInfo(file);
              totalExpectedFrames += Math.floor(info.duration * fps);
            } catch (e) {
              console.error('Failed to get video info for', file.name, e);
            }
          } else if (isGifFile(file) || isImageFile(file)) {
            totalExpectedFrames += 1;
          }
        }

        const newFrames: FrameData[] = [];
        const newSources: SourceInfo[] = [...loadedSources];
        let framesExtractedSoFar = 0;
        const incomingFolders: Folder[] = [];

        for (const file of files) {
          const sourceId = `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const sourceColor = SOURCE_COLORS[sourceColorIndexRef.current % SOURCE_COLORS.length];
          sourceColorIndexRef.current++;

          if (isVideoFile(file)) {
            const result = await extractFrames(file, fps, sourceId, sourceColor, (p: ExtractionProgress) => {
              const current = framesExtractedSoFar + p.current;
              setProgress({
                current,
                total: totalExpectedFrames,
                percentage: totalExpectedFrames > 0 ? Math.round((current / totalExpectedFrames) * 100) : 0,
              });
            });
            setDecoderType(result.decoderType);
            newFrames.push(...result.frames);
            newSources.push({
              id: sourceId,
              name: file.name,
              type: 'video',
              frameCount: result.frames.length,
              color: sourceColor,
            });
            incomingFolders.push({
              id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
              frameIds: result.frames.map(f => f.id),
              visible: true,
              collapsed: false,
              color: sourceColor,
            });
            framesExtractedSoFar += result.frames.length;
          } else if (isGifFile(file)) {
            const gifFrames = await importGifFrames(file, sourceId, sourceColor, (completed, total) => {
              const progressTotal = Math.max(totalExpectedFrames, framesExtractedSoFar + total);
              const current = framesExtractedSoFar + completed;
              setProgress({
                current,
                total: progressTotal,
                percentage: Math.round((current / progressTotal) * 100),
              });
            });
            newFrames.push(...gifFrames);
            newSources.push({
              id: sourceId,
              name: file.name,
              type: 'gif',
              frameCount: gifFrames.length,
              color: sourceColor,
            });
            incomingFolders.push({
              id: `folder-gif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              name: file.name.replace(/\.[^.]+$/, ''),
              frameIds: gifFrames.map(frame => frame.id),
              visible: true,
              collapsed: false,
              color: sourceColor,
            });
            framesExtractedSoFar += gifFrames.length;
          } else if (isImageFile(file)) {
            const current = framesExtractedSoFar + 1;
            setProgress({
              current,
              total: totalExpectedFrames,
              percentage: totalExpectedFrames > 0 ? Math.round((current / totalExpectedFrames) * 100) : 0,
            });
            const imageFrames = await loadImagesAsFrames([file], sourceId, sourceColor, newFrames.length);
            newFrames.push(...imageFrames);
            newSources.push({
              id: sourceId,
              name: file.name,
              type: 'image',
              frameCount: 1,
              color: sourceColor,
            });
            incomingFolders.push({
              id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              frameIds: imageFrames.map(f => f.id),
              visible: true,
              collapsed: false,
              color: sourceColor,
            });
            framesExtractedSoFar += 1;
          }
        }

        // Initialize structured LayerPixelData for all newly loaded/extracted frames
        const layers = globalLayersRef.current;
        for (const frame of newFrames) {
          const frameLayers: Record<string, LayerPixelData> = {};
          for (const layer of layers) {
            if (layer.id === 'layer-base') {
              frameLayers[layer.id] = {
                bitmap: await createImageBitmap(frame.bitmap),
                maskBitmap: null,
                offsetX: 0,
                offsetY: 0,
              };
            } else if (layer.scope === 'per-frame' && layer.type === 'raster') {
              frameLayers[layer.id] = { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
            }
          }
          frame.layers = frameLayers;
        }

        const existingFrames = frameStateRef.current?.frames || [];
        const allFrames = [...existingFrames, ...newFrames];

        setLoadedSources(newSources);
        setFrameState(previous => ({
          frames: [...(previous?.frames || []), ...newFrames],
          folders: [...(previous?.folders || []), ...incomingFolders],
          selectedIds: new Set(newFrames.map(frame => frame.id)),
          projectLayers: layers,
        }));
        setCurrentFrame(0);
        setEditorState('ready');

        if (allFrames.length > FRAME_WARNING_THRESHOLD) {
          setShowFrameWarning(true);
        }
      } catch (error) {
        console.error('Extraction failed:', error);
        void showMessage({
          title: 'Media import failed',
          message: 'Failed to load media. Please try different files.',
        });
        setEditorState(loadedSources.length > 0 ? 'ready' : 'idle');
      }

      setProgress(null);
    },
    [fps, loadedSources, setFrameState, showMessage]
  );

  const handleRemoveSource = useCallback(
    (sourceId: string) => {
      if (!frameState) return;
      const removedFrameIds = new Set(frameState.frames.filter(f => f.sourceId === sourceId).map(f => f.id));
      const remainingFrames = frameState.frames.filter(f => f.sourceId !== sourceId);
      const newFolders = frameState.folders
        .map(folder => ({
          ...folder,
          frameIds: folder.frameIds.filter(id => !removedFrameIds.has(id)),
        }))
        .filter(folder => folder.frameIds.length > 0);

      const newSources = loadedSources.filter(s => s.id !== sourceId);
      setLoadedSources(newSources);

      if (remainingFrames.length > 0) {
        if (newFolders.length === 0) {
          newFolders.push({
            id: 'folder-main',
            name: 'Main Frames',
            frameIds: remainingFrames.map(f => f.id),
            visible: true,
            collapsed: false,
            color: '#3b82f6',
          });
        }
        const remainingFrameIds = new Set(remainingFrames.map(f => f.id));
        setFrameState({
          frames: remainingFrames,
          folders: newFolders,
          selectedIds: new Set(Array.from(frameState.selectedIds).filter(id => remainingFrameIds.has(id))),
          projectLayers: globalLayersRef.current,
        });
      } else {
        setFrameState({ frames: [], folders: [], selectedIds: new Set(), projectLayers: globalLayersRef.current });
        setEditorState('idle');
      }
      setShowFrameWarning(remainingFrames.length > FRAME_WARNING_THRESHOLD);
    },
    [frameState, loadedSources, setFrameState]
  );

  const handleUpdateFrameDurations = useCallback(
    (frameIds: ReadonlySet<string>, durationMs: number | null) => {
      setFrameState(previous => (previous ? withFrameDurations(previous, frameIds, durationMs) : previous));
    },
    [setFrameState]
  );

  const handleSelectionChange = useCallback(
    (selectedIds: Set<string>) => {
      if (!frameState) return;
      setFrameState({ ...frameState, selectedIds });
    },
    [frameState, setFrameState]
  );

  const handleOrderChange = useCallback(
    (newOrder: string[]) => {
      if (!frameState) return;
      const newFolders = frameState.folders.map(folder => ({
        ...folder,
        frameIds: [...newOrder].filter(id => folder.frameIds.includes(id)),
      }));
      setFrameState({ ...frameState, folders: newFolders });
    },
    [frameState, setFrameState]
  );

  const handleDeleteSelected = useCallback(
    async (requestedIds?: ReadonlySet<string>) => {
      const ids = new Set(requestedIds ?? frameState?.selectedIds ?? []);
      const amount = frameState?.frames.filter(frame => ids.has(frame.id)).length ?? 0;
      if (!amount) return;
      const confirmed = await confirmAction({
        title: amount === 1 ? 'Delete frame?' : `Delete ${amount} frames?`,
        message: 'The selected frames will be removed from the project. You can use Undo to restore them.',
        confirmLabel: 'Delete frames',
        danger: true,
      });
      if (!confirmed) return;
      setFrameState(prev => {
        if (!prev) return prev;
        const currentIds = new Set(prev.frames.filter(frame => ids.has(frame.id)).map(frame => frame.id));
        if (!currentIds.size) return prev;
        return deleteSelectedFrames({ ...prev, selectedIds: currentIds });
      });
      setCurrentFrame(value => Math.max(0, Math.min(value, Math.max(0, (frameState?.frames.length ?? 0) - amount - 1))));
    },
    [frameState, setFrameState, confirmAction]
  );

  // Batch Tools -> Active/Base Layer + Layer Compositor
  const handleFramesProcessed = useCallback(
    async (processedFrames: Map<string, ImageBitmap>) => {
      const current = frameStateRef.current;
      if (!current) return;
      const layers = globalLayersRef.current;
      const active = layers.find(l => l.id === activeLayerId);
      const targetLayerId = active?.type === 'raster' && active.scope !== 'shared' ? active.id : 'layer-base';

      const updatedFrames = await Promise.all(
        current.frames.map(async frame => {
          const processed = processedFrames.get(frame.id);
          if (!processed) return frame;

          if (!originalFramesRef.current.has(frame.id)) {
            try {
              const clone = await createImageBitmap(frame.bitmap);
              originalFramesRef.current.set(frame.id, clone);
            } catch {}
          }

          const prevData = frame.layers?.[targetLayerId];
          const nextLayersMap: Record<string, LayerPixelData> = {
            ...(frame.layers || {}),
            [targetLayerId]: {
              bitmap: processed,
              maskBitmap: prevData?.maskBitmap ?? null,
              offsetX: 0,
              offsetY: 0,
            },
          };
          const composited = await compositeFrameLayers(nextLayersMap, layers, processed.width, processed.height);
          return { ...frame, layers: nextLayersMap, bitmap: composited };
        })
      );

      setFrameState({ ...current, frames: updatedFrames, projectLayers: layers });
    },
    [activeLayerId, setFrameState]
  );

  // Non-destructive Background Removal -> Grayscale Layer Mask on target layer
  const handleBackgroundMasksApplied = useCallback(
    async (processedAlphaBitmaps: Map<string, ImageBitmap>) => {
      const current = frameStateRef.current;
      if (!current) return;
      const layers = globalLayersRef.current;
      const active = layers.find(l => l.id === activeLayerId);
      const targetLayerId = active?.type === 'raster' && active.scope !== 'shared' ? active.id : 'layer-base';

      const updatedFrames = await Promise.all(
        current.frames.map(async frame => {
          const alphaBmp = processedAlphaBitmaps.get(frame.id);
          if (!alphaBmp) return frame;

          const maskBitmap = await alphaBitmapToGrayscaleMask(alphaBmp);
          try { alphaBmp.close(); } catch {}

          const prevData = frame.layers?.[targetLayerId] ?? {
            bitmap: await createImageBitmap(frame.bitmap),
            maskBitmap: null,
            offsetX: 0,
            offsetY: 0,
          };
          const nextLayersMap: Record<string, LayerPixelData> = {
            ...(frame.layers || {}),
            [targetLayerId]: { ...prevData, maskBitmap },
          };
          const composited = await compositeFrameLayers(
            nextLayersMap,
            layers,
            frame.bitmap.width,
            frame.bitmap.height
          );
          return { ...frame, layers: nextLayersMap, bitmap: composited };
        })
      );

      const nextLayers = layers.map(l =>
        l.id === targetLayerId ? { ...l, maskEnabled: true, maskInverted: false } : l
      );
      setGlobalLayers(nextLayers);
      setFrameState({ ...current, frames: updatedFrames, projectLayers: nextLayers });
    },
    [activeLayerId, setFrameState]
  );

  const handleRevertSelected = useCallback(async () => {
    const current = frameStateRef.current;
    if (!current) return;
    const framesToRevert =
      current.selectedIds.size > 0
        ? current.frames.filter(f => current.selectedIds.has(f.id))
        : current.frames;

    const revertedFrames = new Map<string, ImageBitmap>();
    for (const frame of framesToRevert) {
      const original = originalFramesRef.current.get(frame.id);
      if (original) {
        revertedFrames.set(frame.id, await createImageBitmap(original));
      }
    }

    if (revertedFrames.size === 0) {
      void showMessage({ title: 'Nothing to revert', message: 'No original frames to revert to.' });
      return;
    }

    const layers = globalLayersRef.current;
    const updatedFrames = await Promise.all(
      current.frames.map(async frame => {
        const reverted = revertedFrames.get(frame.id);
        if (!reverted) return frame;
        const nextLayersMap: Record<string, LayerPixelData> = {
          ...(frame.layers || {}),
          'layer-base': {
            bitmap: await createImageBitmap(reverted),
            maskBitmap: null,
            offsetX: 0,
            offsetY: 0,
          },
        };
        const composited = await compositeFrameLayers(nextLayersMap, layers, reverted.width, reverted.height);
        return { ...frame, layers: nextLayersMap, bitmap: composited };
      })
    );

    setFrameState({ ...current, frames: updatedFrames, projectLayers: layers });
  }, [setFrameState, showMessage]);

  const canRevert = !!(frameState && originalFramesRef.current.size > 0);
  const orderedFrames = useMemo(() => (frameState ? getOrderedFrames(frameState) : []), [frameState]);
  const selectedFrames = useMemo(() => (frameState ? getSelectedFrames(frameState) : []), [frameState]);

  const togglePanel = useCallback(
    (panelId: string) => {
      const newVisible = new Set(visiblePanels);
      if (newVisible.has(panelId)) {
        newVisible.delete(panelId);
        dockLayoutRef.current?.removeTab(panelId);
      } else {
        newVisible.add(panelId);
        dockLayoutRef.current?.addTab(panelId);
      }
      setVisiblePanels(newVisible);
    },
    [visiblePanels]
  );

  const resetLayout = useCallback(() => {
    dockLayoutRef.current?.resetLayout();
    setVisiblePanels(
      new Set([
        'media-loader',
        'frame-grid',
        'preview',
        'timeline',
        'frame-layers',
        'bg-removal',
        'outline',
        'pixelate',
        'watermark',
        'export',
      ])
    );
  }, []);

  useWorkspaceShortcuts([
    { id: 'save-project', key: 's', mod: true, allowWhenEditing: true, run: () => { void triggerSave(); } },
    { id: 'undo', key: 'z', mod: true, run: undo },
    { id: 'redo', key: 'y', mod: true, run: redo },
    { id: 'redo-shift', key: 'z', mod: true, shift: true, run: redo },
  ]);

  useEffect(() => {
    if (editorState === 'extracting') return;
    const next: EditorState = frameState?.frames.length ? 'ready' : 'idle';
    if (next !== editorState) setEditorState(next);
  }, [editorState, frameState?.frames.length]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const editorContextValue = useMemo(
    () => ({
      editorState,
      extractionProgress: progress,
      frameState,
      orderedFrames,
      selectedFrames,
      processingFrameIds,
      folders,
      createFolder: handleCreateFolder,
      deleteFolder: handleDeleteFolder,
      renameFolder: handleRenameFolder,
      toggleFolderVisibility: handleToggleFolderVisibility,
      toggleFolderCollapse: handleToggleFolderCollapse,
      moveFrameToFolder: handleMoveFrameToFolder,
      moveFramesToFolder: handleMoveFramesToFolder,
      copyFramesToFolder: handleCopyFramesToFolder,
      reorderFolders: handleReorderFolders,
      reorderFramesInFolder: handleReorderFramesInFolder,
      fps,
      currentFrame,
      loopMode,
      previewBgMode,
      previewBgColor,
      previewOutline,
      setFps,
      setCurrentFrame,
      setLoopMode,
      setPreviewBgMode,
      setPreviewBgColor,
      setPreviewOutline,
      setProcessingFrameIds,
      handleFramesProcessed,
      handleBackgroundMasksApplied,
      handleSelectionChange,
      handleOrderChange,
      handleDeleteSelected,
      handleRevertSelected,
      updateFrameDurations: handleUpdateFrameDurations,
      canRevert,
      handleMediaLoad,
      handleRemoveSource,
      loadedSources,
      visiblePanels,
      togglePanel,
      resetLayout,

      pixelatorSlicer: {
        appendToWorkspace: true,
        savedSheets: sourceSheetAssets.map(asset => ({ id: asset.sourceId, name: asset.name })),
        editingSourceId: editingSheetSourceId,
        selectSavedSheet,
        file: sheetFile,
        originalImgSrc: sheetPreviewUrl,
        imgDimensions: sheetDimensions,
        sliceSettings,
        setSliceSettings,
        isSlicerModalOpen,
        setIsSlicerModalOpen,
        isSlicing: isSlicingSheet,
        handleSliceSpritesheet: handleSliceSheet,
        loadNewFile: loadNewSheetFile,
        handleResetImage: resetSheetFile,
      },

      undo,
      redo,
      canUndo,
      canRedo,
      isDirty,
      markSaved,
      projectId,
      projectName,
      setProjectName,
      triggerSave,
      triggerSaveAs,
      isSaving,
      autosaveNotification,

      activePixelatorOptions: {
        enabled: pixelatorEnabled,
        pixelSize,
        palette: pixelatorPalette,
        ditherType: pixelatorDitherType,
        ditherAmount: pixelatorDitherAmount,
        pixelShape: pixelatorPixelShape,
        outlineEnabled: pixelatorOutlineEnabled,
        outlineColor: pixelatorOutlineColor,
        outlineThickness: pixelatorOutlineThickness,
        contrast: pixelatorContrast,
        saturation: pixelatorSaturation,
        brightness: pixelatorBrightness,
        setEnabled: setPixelatorEnabled,
        setPixelSize,
        setPalette: setPixelatorPalette,
        setDitherType: setPixelatorDitherType,
        setDitherAmount: setPixelatorDitherAmount,
        setPixelShape: setPixelatorPixelShape,
        setOutlineEnabled: setPixelatorOutlineEnabled,
        setOutlineColor: setPixelatorOutlineColor,
        setOutlineThickness: setPixelatorOutlineThickness,
        setContrast: setPixelatorContrast,
        setSaturation: setPixelatorSaturation,
        setBrightness: setPixelatorBrightness,
      },

      editMode,
      setEditMode,
      toolSettings,
      setToolSettings,
      selectionMask,
      setSelectionMask,
      editTarget,
      setEditTarget,
      maskSoloLayerId,
      setMaskSoloLayerId,

      globalLayers,
      activeLayerId,
      setActiveLayerId,
      addGlobalLayer,
      duplicateGlobalLayer,
      deleteGlobalLayer,
      reorderGlobalLayers,
      updateGlobalLayer,
      mergeLayerDown,
      mergeVisibleLayers,
      flattenLayers,
      addLayerMask,
      maskFromSelection,
      invertLayerMask,
      applyLayerMask,
      deleteLayerMask,
      commitFrameLayerEdit,
      commitLayerOffset,

      onionSkinEnabled,
      setOnionSkinEnabled,
      onionSkinPrevFrames,
      setOnionSkinPrevFrames,
      onionSkinNextFrames,
      setOnionSkinNextFrames,
      onionSkinOpacity,
      setOnionSkinOpacity,
    }),
    [
      editorState,
      progress,
      frameState,
      orderedFrames,
      selectedFrames,
      processingFrameIds,
      folders,
      handleCreateFolder,
      handleDeleteFolder,
      handleRenameFolder,
      handleToggleFolderVisibility,
      handleToggleFolderCollapse,
      handleMoveFrameToFolder,
      handleMoveFramesToFolder,
      handleCopyFramesToFolder,
      handleReorderFolders,
      handleReorderFramesInFolder,
      fps,
      currentFrame,
      loopMode,
      previewBgMode,
      previewBgColor,
      previewOutline,
      handleFramesProcessed,
      handleBackgroundMasksApplied,
      handleSelectionChange,
      handleOrderChange,
      handleDeleteSelected,
      handleRevertSelected,
      handleUpdateFrameDurations,
      canRevert,
      handleMediaLoad,
      handleRemoveSource,
      loadedSources,
      visiblePanels,
      togglePanel,
      resetLayout,
      sourceSheetAssets,
      editingSheetSourceId,
      selectSavedSheet,
      sheetFile,
      sheetPreviewUrl,
      sheetDimensions,
      sliceSettings,
      isSlicerModalOpen,
      isSlicingSheet,
      handleSliceSheet,
      loadNewSheetFile,
      resetSheetFile,
      undo,
      redo,
      canUndo,
      canRedo,
      isDirty,
      markSaved,
      projectId,
      projectName,
      triggerSave,
      triggerSaveAs,
      isSaving,
      autosaveNotification,
      pixelatorEnabled,
      pixelSize,
      pixelatorPalette,
      pixelatorDitherType,
      pixelatorDitherAmount,
      pixelatorPixelShape,
      pixelatorOutlineEnabled,
      pixelatorOutlineColor,
      pixelatorOutlineThickness,
      pixelatorContrast,
      pixelatorSaturation,
      pixelatorBrightness,
      editMode,
      toolSettings,
      selectionMask,
      editTarget,
      maskSoloLayerId,
      globalLayers,
      activeLayerId,
      addGlobalLayer,
      duplicateGlobalLayer,
      deleteGlobalLayer,
      reorderGlobalLayers,
      updateGlobalLayer,
      mergeLayerDown,
      mergeVisibleLayers,
      flattenLayers,
      addLayerMask,
      maskFromSelection,
      invertLayerMask,
      applyLayerMask,
      deleteLayerMask,
      commitFrameLayerEdit,
      commitLayerOffset,
      onionSkinEnabled,
      onionSkinPrevFrames,
      onionSkinNextFrames,
      onionSkinOpacity,
    ]
  );

  return (
    <EditorProvider value={editorContextValue}>
      <div className={styles.dockContainer}>
        <header className={styles.header}>
          <EditorMenuBar />
          <div className={styles.headerInfo}>
            {decoderType && (
              <span className={styles.decoderBadge}>
                {decoderType === 'webcodecs' ? '⚡ WebCodecs' : '🎬 Canvas Fallback'}
              </span>
            )}
            {editorState === 'ready' && (
              <span className={styles.frameCount}>
                {selectedFrames.length} / {orderedFrames.length} frames selected
              </span>
            )}
          </div>
        </header>

        {showFrameWarning && orderedFrames.length > 0 && (
          <div className={styles.warning}>
            ⚠️ {orderedFrames.length} frames extracted. Consider selecting fewer frames for better performance.
            <button onClick={() => setShowFrameWarning(false)} className={styles.warningClose}>
              ×
            </button>
          </div>
        )}

        <DockLayout ref={dockLayoutRef} onVisiblePanelsChange={setVisiblePanels} />
      </div>
    </EditorProvider>
  );
}
