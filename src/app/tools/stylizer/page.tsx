'use client';

/**
 * Material Stylizer Workspace - converts realistic PBR materials into stylized looks.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StylizerProvider, StylizerContextValue, StylizerMaterial, StylizerDerived, MapSlot, MAP_SLOTS } from '@/contexts/StylizerContext';
import { StylizerDockLayout, StylizerDockLayoutRef } from '@/components/StylizerDockLayout';
import { StylizerMenuBar } from '@/components/StylizerMenuBar';
import {
  StylizerOptions, DEFAULT_STYLIZER_OPTIONS,
  stylize, bakeLighting, regenerateNormal, regenerateHeight, flattenMap,
} from '@/lib/stylizer';
import { useProjectSave } from '@/hooks/useProjectSave';
import styles from './page.module.css';

const EMPTY_MATERIAL: StylizerMaterial = { maps: {}, resolution: null };
const EMPTY_DERIVED: StylizerDerived = {
  stylizedAlbedo: null, normal: null, height: null, roughness: null, metallic: null,
};

const PREVIEW_MAX = 1024;

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function disposeBitmap(b: ImageBitmap | null | undefined) {
  if (b) { try { b.close(); } catch { /* noop */ } }
}

export default function StylizerPage() {
  const [material, setMaterial] = useState<StylizerMaterial>(EMPTY_MATERIAL);
  const [options, setOptionsState] = useState<StylizerOptions>(DEFAULT_STYLIZER_OPTIONS);
  const [derived, setDerived] = useState<StylizerDerived>(EMPTY_DERIVED);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wipePosition, setWipePosition] = useState(50);
  const [tiled, setTiled] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set([
    'material-loader', 'style', 'map-output', 'preview-2d', 'preview-3d', 'export',
  ]));
  const dockRef = useRef<StylizerDockLayoutRef>(null);

  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('Untitled Material');
  useEffect(() => {
    if (!projectId) setProjectId(`stylizer-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  }, [projectId]);

  const setOptions = useCallback((updater: (prev: StylizerOptions) => StylizerOptions) => {
    setOptionsState(updater);
  }, []);

  // --- Map loading ---
  const loadMap = useCallback(async (slot: MapSlot, file: File) => {
    const bmp = await fileToBitmap(file);
    setMaterial((prev) => {
      disposeBitmap(prev.maps[slot]);
      const maps = { ...prev.maps, [slot]: bmp };
      const resolution = slot === 'albedo'
        ? { width: bmp.width, height: bmp.height }
        : prev.resolution;
      return { maps, resolution };
    });
  }, []);

  const clearMap = useCallback((slot: MapSlot) => {
    setMaterial((prev) => {
      disposeBitmap(prev.maps[slot]);
      const maps = { ...prev.maps };
      delete maps[slot];
      return { ...prev, maps, resolution: slot === 'albedo' ? null : prev.resolution };
    });
  }, []);

  const resetMaterial = useCallback(() => {
    setMaterial((prev) => {
      MAP_SLOTS.forEach((s) => disposeBitmap(prev.maps[s]));
      return EMPTY_MATERIAL;
    });
  }, []);

  // --- Processing effect (debounced) ---
  const runIdRef = useRef(0);
  useEffect(() => {
    const albedo = material.maps.albedo;
    if (!albedo) {
      setDerived((prev) => {
        disposeBitmap(prev.stylizedAlbedo); disposeBitmap(prev.normal);
        disposeBitmap(prev.height); disposeBitmap(prev.roughness); disposeBitmap(prev.metallic);
        return EMPTY_DERIVED;
      });
      return;
    }
    const runId = ++runIdRef.current;
    setIsProcessing(true);
    const handle = setTimeout(async () => {
      try {
        // Downscale albedo for preview if large.
        let previewAlbedo = albedo;
        const longEdge = Math.max(albedo.width, albedo.height);
        if (longEdge > PREVIEW_MAX) {
          const scale = PREVIEW_MAX / longEdge;
          previewAlbedo = await createImageBitmap(albedo, {
            resizeWidth: Math.round(albedo.width * scale),
            resizeHeight: Math.round(albedo.height * scale),
            resizeQuality: 'high',
          });
        }

        let styled = await stylize(previewAlbedo, options);
        if (options.bakeAO || options.bakeShading) {
          const baked = await bakeLighting(styled, material.maps.ao, material.maps.height, options);
          disposeBitmap(styled); styled = baked;
        }
        const normal = options.regenerateNormal ? await regenerateNormal(styled, options.normalStrength) : null;
        const height = options.regenerateHeight ? await regenerateHeight(styled) : null;
        const roughness = options.flattenRoughness && material.maps.roughness
          ? await flattenMap(material.maps.roughness, 4) : null;
        const metallic = options.flattenMetallic && material.maps.metallic
          ? await flattenMap(material.maps.metallic, 2) : null;

        if (runId !== runIdRef.current) {
          [styled, normal, height, roughness, metallic].forEach(disposeBitmap);
          if (previewAlbedo !== albedo) disposeBitmap(previewAlbedo);
          return;
        }
        if (previewAlbedo !== albedo) disposeBitmap(previewAlbedo);

        setDerived((prev) => {
          disposeBitmap(prev.stylizedAlbedo); disposeBitmap(prev.normal);
          disposeBitmap(prev.height); disposeBitmap(prev.roughness); disposeBitmap(prev.metallic);
          return { stylizedAlbedo: styled, normal, height, roughness, metallic };
        });
      } finally {
        if (runId === runIdRef.current) setIsProcessing(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [material.maps.albedo, material.maps.ao, material.maps.height, material.maps.roughness, material.maps.metallic, options]);

  // --- Persistence: serialize source maps as frames ---
  const customFrames = useCallback(async () => {
    const frames = [];
    let index = 0;
    for (const slot of MAP_SLOTS) {
      const bmp = material.maps[slot];
      if (!bmp) continue;
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
      frames.push({ id: slot, index: index++, timestamp: 0, blob, sourceId: 'stylizer', sourceColor: '#8b5cf6' });
    }
    return frames;
  }, [material.maps]);

  const savedSlots = useMemo(() => MAP_SLOTS.filter((s) => material.maps[s]), [material.maps]);

  const { triggerSave, isSaving, autosaveNotification } = useProjectSave({
    projectId, setProjectId, projectName, setProjectName,
    type: 'stylizer',
    frameState: null,
    customFrames,
    fps: 0, loopMode: 'normal',
    isDirty: !!material.maps.albedo,
    stylizerOptions: options,
    stylizerMapSlots: savedSlots,
  });

  // --- Deep-link restore ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;
    import('@/lib/projectDatabase').then(async ({ getProject }) => {
      const project = await getProject(id);
      if (!project || project.type !== 'stylizer') return;
      setProjectId(project.id);
      setProjectName(project.name);
      if (project.metadata.stylizerOptions) setOptionsState(project.metadata.stylizerOptions);
      const maps: Partial<Record<MapSlot, ImageBitmap>> = {};
      let resolution: { width: number; height: number } | null = null;
      for (const f of project.frames) {
        const slot = f.id as MapSlot;
        if (!MAP_SLOTS.includes(slot)) continue;
        const bmp = await createImageBitmap(f.blob);
        maps[slot] = bmp;
        if (slot === 'albedo') resolution = { width: bmp.width, height: bmp.height };
      }
      setMaterial({ maps, resolution });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Dispose all bitmaps on unmount ---
  useEffect(() => {
    return () => {
      setMaterial((prev) => {
        MAP_SLOTS.forEach((s) => disposeBitmap(prev.maps[s]));
        return prev;
      });
      setDerived((prev) => {
        disposeBitmap(prev.stylizedAlbedo); disposeBitmap(prev.normal);
        disposeBitmap(prev.height); disposeBitmap(prev.roughness); disposeBitmap(prev.metallic);
        return prev;
      });
    };
  }, []);

  // --- Panel toggles ---
  const togglePanel = useCallback((panelId: string) => {
    setVisiblePanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) { next.delete(panelId); dockRef.current?.removeTab(panelId); }
      else { next.add(panelId); dockRef.current?.addTab(panelId); }
      return next;
    });
  }, []);
  const resetLayout = useCallback(() => {
    dockRef.current?.resetLayout();
    setVisiblePanels(new Set(['material-loader', 'style', 'map-output', 'preview-2d', 'preview-3d', 'export']));
  }, []);

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); triggerSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [triggerSave]);

  const ctxValue: StylizerContextValue = useMemo(() => ({
    material,
    loadMap, clearMap, resetMaterial,
    hasAlbedo: !!material.maps.albedo,
    options, setOptions,
    derived, isProcessing,
    wipePosition, setWipePosition, tiled, setTiled,
    visiblePanels, togglePanel, resetLayout,
    projectId, projectName, setProjectName,
    triggerSave, isSaving, autosaveNotification,
  }), [material, loadMap, clearMap, resetMaterial, options, setOptions, derived, isProcessing,
    wipePosition, tiled, visiblePanels, togglePanel, resetLayout,
    projectId, projectName, triggerSave, isSaving, autosaveNotification]);

  return (
    <StylizerProvider value={ctxValue}>
      <div className={styles.container}>
        <StylizerMenuBar />
        <StylizerDockLayout ref={dockRef} onVisiblePanelsChange={setVisiblePanels} />
      </div>
    </StylizerProvider>
  );
}
