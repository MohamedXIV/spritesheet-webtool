// src/app/tools/trimsheet/page.tsx
'use client';

/** Trimsheet Builder workspace - owns all state, assembles context, autosaves. */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjectSave } from '@/hooks/useProjectSave';
import { getProject } from '@/lib/projectDatabase';
import {
  Region, TrimMaterial, TrimResolution, MapChannel, MAP_CHANNELS,
  NormRect, DEFAULT_TILING, makeRegionId,
} from '@/lib/trimsheetTypes';
import { TrimsheetBaker } from '@/lib/trimsheetBaker';
import {
  fetchPolyhavenIndex, PolyhavenAsset,
} from '@/lib/trimsheetMaterials';
import { TrimsheetProvider, TrimsheetContextValue } from '@/contexts/TrimsheetContext';
import { TrimsheetDockLayout, TrimsheetDockLayoutRef } from '@/components/TrimsheetDockLayout';
import { TrimsheetMenuBar } from '@/components/TrimsheetMenuBar';
import styles from './page.module.css';

export default function TrimsheetPage() {
  const [projectId, setProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('Untitled Trimsheet');
  const [isDirty, setIsDirty] = useState(false);

  const [resolution, setResolutionState] = useState<TrimResolution>(1024);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<TrimMaterial[]>([]);
  const [enabledChannels, setEnabledChannels] = useState<MapChannel[]>([...MAP_CHANNELS]);
  const [bakeVersion, setBakeVersion] = useState(0);
  const [visiblePanels, setVisiblePanels] = useState<Set<string>>(new Set());
  const [loadingRegionIds, setLoadingRegionIds] = useState<Set<string>>(new Set());

  const [polyhavenAssets, setPolyhavenAssets] = useState<PolyhavenAsset[]>([]);
  const [polyhavenError, setPolyhavenError] = useState<string | null>(null);
  const [polyhavenLoading, setPolyhavenLoading] = useState(false);

  const bakerRef = useRef<TrimsheetBaker | null>(null);
  const dockRef = useRef<TrimsheetDockLayoutRef>(null);
  const materialsRef = useRef<Map<string, TrimMaterial>>(new Map());

  // Keep a fast id->material map in sync for the baker.
  useEffect(() => {
    const map = new Map<string, TrimMaterial>();
    for (const m of materials) map.set(m.id, m);
    materialsRef.current = map;
  }, [materials]);

  // Initialize the baker once (client-only; OffscreenCanvas needs the browser).
  useEffect(() => {
    bakerRef.current = new TrimsheetBaker(1024);
    setBakeVersion((v) => v + 1);
    return () => { bakerRef.current?.dispose(); bakerRef.current = null; };
  }, []);

  // Load an existing project if ?project=<id> is present.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('project');
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const proj = await getProject(id);
        if (!active || !proj) return;
        const opts = proj.metadata?.trimsheetOptions;
        setProjectId(proj.id);
        setProjectName(proj.name);
        if (opts) {
          const res = (opts.resolution ?? 1024) as TrimResolution;
          setResolutionState(res);
          // Ensure the baker matches the loaded resolution before compositing.
          if (bakerRef.current) {
            bakerRef.current.setResolution(res, [], materialsRef.current);
          }
          const loadedRegions: Region[] = Array.isArray(opts.regions)
            ? opts.regions.map((r) => ({ ...r, keepAspect: r.keepAspect ?? true }))
            : [];
          setRegions(loadedRegions);
          // Re-composite each region (materials best-effort; empty => fallback fills).
          loadedRegions.forEach((r) => {
            const mat = r.materialId ? materialsRef.current.get(r.materialId) ?? null : null;
            bakerRef.current?.compositeRegion(r, mat);
          });
          setBakeVersion((v) => v + 1);
        }
      } catch (err) {
        console.error('Failed to load trimsheet project:', err);
      }
    })();
    return () => { active = false; };
  }, []);

  // Generate a fresh project id for brand-new projects (no ?project= to load).
  useEffect(() => {
    const hasProjectParam = new URLSearchParams(window.location.search).get('project');
    if (!hasProjectParam && !projectId) {
      setProjectId(`trimsheet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    }
  }, [projectId]);

  // Fetch Polyhaven index once.
  useEffect(() => {
    let active = true;
    setPolyhavenLoading(true);
    fetchPolyhavenIndex()
      .then((list) => { if (active) setPolyhavenAssets(list); })
      .catch((err) => {
        console.warn('Polyhaven index fetch failed:', err);
        if (active) setPolyhavenError('Polyhaven offline. Upload your own textures instead.');
      })
      .finally(() => { if (active) setPolyhavenLoading(false); });
    return () => { active = false; };
  }, []);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const recomposite = useCallback((region: Region) => {
    const baker = bakerRef.current;
    if (!baker) return;
    const mat = region.materialId ? materialsRef.current.get(region.materialId) ?? null : null;
    baker.compositeRegion(region, mat);
    setBakeVersion((v) => v + 1);
  }, []);

  // --- Region operations ---
  const addRegion = useCallback((rect: NormRect) => {
    const region: Region = {
      id: makeRegionId(),
      name: `Region ${regions.length + 1}`,
      rect,
      materialId: null,
      tiling: { ...DEFAULT_TILING },
      keepAspect: true,
    };
    setRegions((prev) => [...prev, region]);
    setSelectedRegionId(region.id);
    recomposite(region);
    markDirty();
  }, [regions.length, recomposite, markDirty]);

  const updateRegionRect = useCallback((id: string, rect: NormRect) => {
    setRegions((prev) => {
      const old = prev.find((r) => r.id === id);
      if (old) bakerRef.current?.clearRegion(old.rect); // erase previous footprint
      const next = prev.map((r) => (r.id === id ? { ...r, rect } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const updateRegionTiling = useCallback((id: string, tiling: Partial<Region['tiling']>) => {
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, tiling: { ...r.tiling, ...tiling } } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const renameRegion = useCallback((id: string, name: string) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    markDirty();
  }, [markDirty]);

  const deleteRegion = useCallback((id: string) => {
    setRegions((prev) => {
      const old = prev.find((r) => r.id === id);
      if (old) bakerRef.current?.clearRegion(old.rect);
      return prev.filter((r) => r.id !== id);
    });
    setSelectedRegionId((cur) => (cur === id ? null : cur));
    setBakeVersion((v) => v + 1);
    markDirty();
  }, [markDirty]);

  const splitRegion = useCallback((id: string, axis: 'horizontal' | 'vertical') => {
    setRegions((prev) => {
      const r = prev.find((x) => x.id === id);
      if (!r) return prev;
      bakerRef.current?.clearRegion(r.rect);
      const a: Region = { ...r, id: makeRegionId(), tiling: { ...r.tiling } };
      const b: Region = { ...r, id: makeRegionId(), name: `${r.name} B`, tiling: { ...r.tiling } };
      if (axis === 'vertical') {
        a.rect = { ...r.rect, w: r.rect.w / 2 };
        b.rect = { ...r.rect, x: r.rect.x + r.rect.w / 2, w: r.rect.w / 2 };
      } else {
        a.rect = { ...r.rect, h: r.rect.h / 2 };
        b.rect = { ...r.rect, y: r.rect.y + r.rect.h / 2, h: r.rect.h / 2 };
      }
      a.name = `${r.name} A`;
      const next = prev.flatMap((x) => (x.id === id ? [a, b] : [x]));
      recomposite(a); recomposite(b);
      setSelectedRegionId(a.id);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const mergeRegions = useCallback((idA: string, idB: string) => {
    setRegions((prev) => {
      const a = prev.find((r) => r.id === idA);
      const b = prev.find((r) => r.id === idB);
      if (!a || !b) return prev;
      bakerRef.current?.clearRegion(a.rect);
      bakerRef.current?.clearRegion(b.rect);
      const x1 = Math.min(a.rect.x, b.rect.x);
      const y1 = Math.min(a.rect.y, b.rect.y);
      const x2 = Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
      const y2 = Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h);
      const merged: Region = {
        ...a, id: makeRegionId(), name: `${a.name}+${b.name}`,
        rect: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
      };
      const next = prev.filter((r) => r.id !== idA && r.id !== idB);
      next.push(merged);
      recomposite(merged);
      setSelectedRegionId(merged.id);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const mergeSelectedRegions = useCallback(() => {
    const ids = [...selectedRegionIds];
    if (ids.length < 2) return;
    setRegions((prev) => {
      const toMerge = ids.map((id) => prev.find((r) => r.id === id)).filter(Boolean) as Region[];
      if (toMerge.length < 2) return prev;
      for (const r of toMerge) bakerRef.current?.clearRegion(r.rect);
      const x1 = Math.min(...toMerge.map((r) => r.rect.x));
      const y1 = Math.min(...toMerge.map((r) => r.rect.y));
      const x2 = Math.max(...toMerge.map((r) => r.rect.x + r.rect.w));
      const y2 = Math.max(...toMerge.map((r) => r.rect.y + r.rect.h));
      const merged: Region = {
        ...toMerge[0],
        id: makeRegionId(),
        name: toMerge.map((r) => r.name).join('+'),
        rect: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
      };
      const idSet = new Set(ids);
      const next = prev.filter((r) => !idSet.has(r.id));
      next.push(merged);
      recomposite(merged);
      setSelectedRegionId(merged.id);
      return next;
    });
    setSelectedRegionIds(new Set());
    markDirty();
  }, [selectedRegionIds, recomposite, markDirty]);

  const stretchRegion = useCallback((id: string, axis: 'horizontal' | 'vertical') => {
    setRegions((prev) => {
      const r = prev.find((x) => x.id === id);
      if (!r) return prev;
      bakerRef.current?.clearRegion(r.rect);
      const stretched: Region = {
        ...r,
        rect: axis === 'horizontal'
          ? { ...r.rect, x: 0, w: 1 }
          : { ...r.rect, y: 0, h: 1 },
      };
      const next = prev.map((x) => (x.id === id ? stretched : x));
      recomposite(stretched);
      return next;
    });
    setBakeVersion((v) => v + 1);
    markDirty();
  }, [recomposite, markDirty]);

  const generateGrid = useCallback((rows: number, cols: number) => {
    // Replace existing regions with a fresh grid.
    setRegions((prev) => {
      for (const r of prev) bakerRef.current?.clearRegion(r.rect);
      const next: Region[] = [];
      const w = 1 / cols, h = 1 / rows;
      let n = 1;
      for (let ry = 0; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
          next.push({
            id: makeRegionId(), name: `Region ${n++}`,
            rect: { x: cx * w, y: ry * h, w, h },
            materialId: null, tiling: { ...DEFAULT_TILING },
            keepAspect: true,
          });
        }
      }
      next.forEach((r) => recomposite(r));
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const updateRegionKeepAspect = useCallback((id: string, keepAspect: boolean) => {
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, keepAspect } : r));
      const updated = next.find((r) => r.id === id);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const setLoadingRegionId = useCallback((id: string, isLoading: boolean) => {
    setLoadingRegionIds((prev) => {
      const next = new Set(prev);
      if (isLoading) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // --- Material operations ---
  const assignMaterialToRegion = useCallback((regionId: string, material: TrimMaterial) => {
    setMaterials((prev) => (prev.some((m) => m.id === material.id)
      ? prev.map((m) => (m.id === material.id ? material : m))
      : [...prev, material]));
    materialsRef.current.set(material.id, material);
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === regionId ? { ...r, materialId: material.id } : r));
      const updated = next.find((r) => r.id === regionId);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  const setRegionFlatColor = useCallback((regionId: string, color: string) => {
    // A flat color becomes an inline 'flat' material with no maps.
    const flatMat: TrimMaterial = {
      id: `flat-${regionId}`, name: `Flat ${color}`, source: 'flat',
      maps: { albedo: null, normal: null, roughness: null, metalness: null, ao: null },
      flatColor: color, thumbnailUrl: '',
    };
    assignMaterialToRegion(regionId, flatMat);
  }, [assignMaterialToRegion]);

  const clearRegionMaterial = useCallback((regionId: string) => {
    setRegions((prev) => {
      const next = prev.map((r) => (r.id === regionId ? { ...r, materialId: null } : r));
      const updated = next.find((r) => r.id === regionId);
      if (updated) recomposite(updated);
      return next;
    });
    markDirty();
  }, [recomposite, markDirty]);

  // --- Resolution ---
  const setResolution = useCallback((res: TrimResolution) => {
    setResolutionState(res);
    bakerRef.current?.setResolution(res, regions, materialsRef.current);
    setBakeVersion((v) => v + 1);
    markDirty();
  }, [regions, markDirty]);

  // --- Channels ---
  const toggleChannel = useCallback((ch: MapChannel) => {
    setEnabledChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }, []);

  // --- Export ---
  const exportZip = useCallback(async () => {
    const baker = bakerRef.current;
    if (!baker) return;
    const ordered = MAP_CHANNELS.filter((c) => enabledChannels.includes(c));
    if (ordered.length === 0) { alert('Enable at least one map channel to export.'); return; }
    try {
      const blob = await baker.export(regions, ordered, projectName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(projectName || 'trimsheet').replace(/[^a-z0-9_-]+/gi, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Trimsheet export failed:', err);
      alert('Export failed. See console for details.');
    }
  }, [regions, enabledChannels, projectName]);

  // --- Panels ---
  const togglePanel = useCallback((panelId: string) => {
    if (visiblePanels.has(panelId)) dockRef.current?.removeTab(panelId);
    else dockRef.current?.addTab(panelId);
  }, [visiblePanels]);
  const resetLayout = useCallback(() => dockRef.current?.resetLayout(), []);

  const trimsheetOptions = useMemo(() => ({ resolution, regions }), [resolution, regions]);

  const { triggerSave, triggerSaveAs } = useProjectSave({
    projectId, setProjectId, projectName, setProjectName,
    type: 'trimsheet',
    frameState: null,
    customFrames: async () => [], // trimsheet stores no frames
    trimsheetOptions,
    fps: 0, loopMode: 'loop', isDirty,
    markSaved: () => setIsDirty(false),
  });

  // Save wrapper. Persisted contract is { resolution, regions } via the
  // trimsheetOptions memo; full material persistence is deferred.
  const doSave = useCallback(async (customName?: string) => {
    await triggerSave(customName);
  }, [triggerSave]);

  const contextValue: TrimsheetContextValue = {
    baker: bakerRef.current,
    bakeVersion,
    resolution, setResolution,
    regions, selectedRegionId, selectRegion: setSelectedRegionId,
    selectedRegionIds, setSelectedRegionIds,
    addRegion, updateRegionRect, updateRegionTiling, updateRegionKeepAspect, renameRegion, deleteRegion,
    splitRegion, mergeRegions, mergeSelectedRegions, stretchRegion, generateGrid,
    materials, assignMaterialToRegion, setRegionFlatColor, clearRegionMaterial,
    loadingRegionIds, setLoadingRegionId,
    polyhavenAssets, polyhavenError, polyhavenLoading,
    enabledChannels, toggleChannel, exportZip,
    isDirty, triggerSave: doSave, triggerSaveAs,
    projectName, setProjectName,
    visiblePanels, togglePanel, resetLayout,
  };

  return (
    <TrimsheetProvider value={contextValue}>
      <div className={styles.page}>
        <TrimsheetMenuBar />
        <div className={styles.body}>
          <TrimsheetDockLayout ref={dockRef} onVisiblePanelsChange={setVisiblePanels} />
        </div>
      </div>
    </TrimsheetProvider>
  );
}
