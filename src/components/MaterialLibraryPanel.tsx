'use client';

import React, { useState, useEffect, useRef, useContext } from 'react';
import { Search, Loader2, RefreshCw, Layers, Sparkles, Upload } from 'lucide-react';
import { ThreePainterContext, useThreePainterContext } from '@/contexts/ThreePainterContext';
import { TrimsheetContext, useTrimsheetContext } from '@/contexts/TrimsheetContext';
import { loadPolyhavenMaterial, loadUploadMaterial } from '@/lib/trimsheetMaterials';
import * as THREE from 'three';
import styles from './MaterialLibraryPanel.module.css';

interface Asset {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
}

// Procedural texture generators for offline / local library
const LOCAL_MATERIALS = [
  {
    id: 'local-wood-planks',
    name: 'Procedural Wood Planks (Local)',
    category: 'wood',
    generate: (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#5c3a21';
      const plankHeight = H / 8;
      for (let i = 0; i <= 8; i++) {
        ctx.fillRect(0, i * plankHeight, W, 2);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      for (let i = 0; i < 8; i++) {
        const offset = (i % 2) * (W / 2);
        ctx.fillRect(offset, i * plankHeight, 3, plankHeight);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      for (let i = 0; i < W; i += 4) {
        ctx.fillRect(i, 0, 1 + Math.random() * 2, H);
      }
    }
  },
  {
    id: 'local-metal-brushed',
    name: 'Procedural Brushed Steel (Local)',
    category: 'metal',
    generate: (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#55585d');
      grad.addColorStop(0.5, '#888d95');
      grad.addColorStop(1, '#44474c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let i = 0; i < H; i += 2) {
        ctx.fillRect(0, i, W, 1);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      for (let i = 0; i < H; i += 3) {
        ctx.fillRect(0, i, W, 1);
      }
    },
  },
  {
    id: 'local-stone-bricks',
    name: 'Procedural Stone Brick (Local)',
    category: 'stone',
    generate: (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 1000; i++) {
        ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      ctx.fillStyle = '#334155';
      const rows = 10;
      const rowH = H / rows;
      for (let i = 0; i <= rows; i++) {
        ctx.fillRect(0, i * rowH, W, 3);
      }
      for (let i = 0; i < rows; i++) {
        const cols = 5;
        const colW = W / cols;
        const offset = (i % 2) * (colW / 2);
        for (let j = 0; j <= cols + 1; j++) {
          ctx.fillRect(j * colW - offset, i * rowH, 3, rowH);
        }
      }
    }
  },
  {
    id: 'local-checkerboard',
    name: 'Procedural Checkerboard (Local)',
    category: 'pattern',
    generate: (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const size = W / 8;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          ctx.fillStyle = (i + j) % 2 === 0 ? '#1e293b' : '#f8fafc';
          ctx.fillRect(i * size, j * size, size, size);
        }
      }
    }
  },
  {
    id: 'local-rust-noise',
    name: 'Procedural Rust & Grime (Local)',
    category: 'plaster',
    generate: (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      ctx.fillStyle = '#4a2c11';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 5000; i++) {
        const size = 1 + Math.random() * 6;
        ctx.fillStyle = Math.random() > 0.4 ? '#8a3e0f' : '#221509';
        ctx.fillRect(Math.random() * W, Math.random() * H, size, size);
      }
      // blur effect
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(0, 0, W, H);
    }
  }
];

export function MaterialLibraryPanel() {
  const painterCtx = useContext(ThreePainterContext);
  const trimsheetCtx = useContext(TrimsheetContext);
  const isTrimsheetMode = !!trimsheetCtx;

  // Painter specific destructured states (safe fallback)
  const layers = painterCtx?.layers ?? [];
  const activeLayerId = painterCtx?.activeLayerId ?? '';
  const updateLayerFillSettings = painterCtx?.updateLayerFillSettings;
  const painter = painterCtx?.painter ?? null;
  const isModelLoaded = painterCtx?.isModelLoaded ?? false;
  const setPbrMap = painterCtx?.setPbrMap;

  // Expose materialResolution state
  const [localMaterialRes, setLocalMaterialRes] = useState<'1k' | '2k' | '4k'>('2k');
  const materialResolution = isTrimsheetMode ? localMaterialRes : (painterCtx?.materialResolution ?? '2k');
  const setMaterialResolution = isTrimsheetMode ? setLocalMaterialRes : (painterCtx?.setMaterialResolution ?? (() => {}));

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [polyhavenAssets, setPolyhavenAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingAssetId, setApplyingAssetId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);

  // Reset pagination on filter change
  useEffect(() => {
    setVisibleCount(24);
  }, [searchQuery, activeCategory]);

  // Target element validation
  const activeLayer = layers.find(l => l.id === activeLayerId);
  const isFillLayer = activeLayer?.type === 'fill';
  const hasSelectedRegion = !!trimsheetCtx?.selectedRegionId;

  const isTargetActive = isTrimsheetMode ? hasSelectedRegion : isFillLayer;

  // Fetch Polyhaven textures
  useEffect(() => {
    let active = true;
    const fetchAssets = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('https://api.polyhaven.com/assets?t=textures', {
          headers: {
            'User-Agent': 'SpritesheetWebtoolSmartMaterials'
          }
        });
        if (!res.ok) throw new Error('Failed to retrieve Polyhaven index');
        const data = await res.json();
        
        if (!active) return;
        const list: Asset[] = Object.keys(data).map(key => {
          const item = data[key];
          return {
            id: key,
            name: item.name,
            category: item.categories?.[0] || 'other',
            thumbnail: item.thumbnail_url || `https://cdn.polyhaven.com/asset_img/thumbs/${key}.png?width=128&height=128`
          };
        });
        setPolyhavenAssets(list);
      } catch (err: any) {
        console.warn('Polyhaven fetch error, falling back to local library:', err);
        setError('Network offline or Polyhaven API blocked. Showing local library.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAssets();
    return () => { active = false; };
  }, []);

  const handleApplyLocalMaterial = async (mat: typeof LOCAL_MATERIALS[0]) => {
    if (!isTargetActive) {
      alert(isTrimsheetMode ? 'Please select a region first.' : 'Please select a "fill" layer to apply a material texture.');
      return;
    }
    setApplyingAssetId(mat.id);

    try {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      mat.generate(ctx, size, size);

      if (isTrimsheetMode) {
        const regionId = trimsheetCtx.selectedRegionId;
        if (!regionId) return;

        const bitmap = await createImageBitmap(canvas);
        const newMat = {
          id: `procedural-${mat.id}-${Date.now()}`,
          name: mat.name,
          source: 'upload' as const,
          maps: {
            albedo: bitmap,
            normal: null,
            roughness: null,
            metalness: null,
            ao: null,
          },
          thumbnailUrl: canvas.toDataURL(),
        };
        trimsheetCtx.assignMaterialToRegion(regionId, newMat);
        setApplyingAssetId(null);
      } else {
        canvas.toBlob((blob) => {
          if (blob && updateLayerFillSettings) {
            const url = URL.createObjectURL(blob);
            updateLayerFillSettings(activeLayerId, {
              fillTextureName: mat.name,
              fillTextureUrl: url,
            });
          }
          // Reset normal and roughness maps
          if (setPbrMap) {
            setPbrMap('normal', null, null);
            setPbrMap('roughness', null, null);
          }
          if (painter) {
            painter.setMap('normal', null);
            painter.setMap('roughness', null);
          }
          setApplyingAssetId(null);
        }, 'image/png');
      }
    } catch (err) {
      console.error(err);
      setApplyingAssetId(null);
    }
  };

  const handleApplyPolyhavenMaterial = async (asset: Asset) => {
    if (!isTargetActive) {
      alert(isTrimsheetMode ? 'Please select a region first.' : 'Please select a "fill" layer to apply a material texture.');
      return;
    }
    setApplyingAssetId(asset.id);

    try {
      if (isTrimsheetMode) {
        const regionId = trimsheetCtx.selectedRegionId;
        if (!regionId) return;
        trimsheetCtx.setLoadingRegionId(regionId, true);

        // Map Asset format to PolyhavenAsset expected by loadPolyhavenMaterial
        const phAsset = {
          id: asset.id,
          name: asset.name,
          category: asset.category,
          thumbnail: asset.thumbnail,
        };
        // Wait, loadPolyhavenMaterial uses materialResolution state internally or maps it?
        // Ah! In loadPolyhavenMaterial, it uses getMapUrl which was:
        // getMapUrl(mapObject: any): string | null
        // Let's check: does it support the quality parameter?
        // Let's modify loadPolyhavenMaterial to accept custom resolution! Or let's rewrite it here or pass the selected quality.
        // Actually, we can just pass the selected quality if we modify loadPolyhavenMaterial in trimsheetMaterials.ts,
        // OR we can fetch it ourselves right here and assign it!
        // Wait, loadPolyhavenMaterial in trimsheetMaterials.ts is already very clean:
        // Let's read it:
        // export async function loadPolyhavenMaterial(asset: PolyhavenAsset): Promise<TrimMaterial> { ... }
        // If we fetch and load the material here, we can pass our materialResolution!
        // But wait! Can we update loadPolyhavenMaterial signature to take a second optional resolution parameter?
        // Let's check trimsheetMaterials.ts:
        // export async function loadPolyhavenMaterial(asset: PolyhavenAsset, resolution: string = '1k'): Promise<TrimMaterial> { ... }
        // And inside getMapUrl:
        // function getMapUrl(mapObject: any, preferredRes: string = '1k'): string | null {
        //   const resObj = mapObject[preferredRes] || mapObject['1k'] || mapObject['2k'] || ...
        // }
        // This is incredibly easy and elegant! Let's modify trimsheetMaterials.ts to support quality selection first,
        // then call it with `materialResolution`!
        
        const mat = await loadPolyhavenMaterial(phAsset, materialResolution);
        trimsheetCtx.assignMaterialToRegion(regionId, mat);
        trimsheetCtx.setLoadingRegionId(regionId, false);
      } else {
        const res = await fetch(`https://api.polyhaven.com/files/${asset.id}`, {
          headers: {
            'User-Agent': 'SpritesheetWebtoolSmartMaterials'
          }
        });
        if (!res.ok) throw new Error('Failed to fetch asset file data');
        const data = await res.json();

        const lowercaseKeys: Record<string, any> = {};
        for (const key of Object.keys(data)) {
          lowercaseKeys[key.toLowerCase()] = data[key];
        }

        const getMapUrl = (mapObject: any) => {
          if (!mapObject) return null;
          const order = [materialResolution, '2k', '1k', '4k', '8k'];
          let resObj = null;
          for (const resKey of order) {
            if (mapObject[resKey]) {
              resObj = mapObject[resKey];
              break;
            }
          }
          if (!resObj) resObj = Object.values(mapObject)[0];
          if (!resObj) return null;
          const formatObj = resObj["jpg"] || resObj["png"] || Object.values(resObj)[0];
          return formatObj?.url || null;
        };

        const diffuseUrl = getMapUrl(lowercaseKeys.diffuse || lowercaseKeys.diff || lowercaseKeys.col || lowercaseKeys.albedo);
        const normalUrl = getMapUrl(lowercaseKeys.nor || lowercaseKeys.normal || lowercaseKeys.nor_gl || lowercaseKeys.nor_dx);
        const roughnessUrl = getMapUrl(lowercaseKeys.rough || lowercaseKeys.roughness);

        if (!diffuseUrl) {
          alert('Could not find a valid diffuse map for this asset.');
          setApplyingAssetId(null);
          return;
        }

        // 1. Download diffuse map as blob
        const diffRes = await fetch(diffuseUrl);
        const diffBlob = await diffRes.blob();
        const localDiffUrl = URL.createObjectURL(diffBlob);

        // Apply diffuse map to fill layer
        if (updateLayerFillSettings) {
          updateLayerFillSettings(activeLayerId, {
            fillTextureName: asset.name,
            fillTextureUrl: localDiffUrl,
          });
        }

        // 2. Load Normal Map if available and painter exists
        if (normalUrl && painter && setPbrMap) {
          try {
            const normRes = await fetch(normalUrl);
            const normBlob = await normRes.blob();
            const localNormUrl = URL.createObjectURL(normBlob);

            const texLoader = new THREE.TextureLoader();
            texLoader.load(localNormUrl, (tex) => {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.needsUpdate = true;
              painter.setMap('normal', tex);
            });
            setPbrMap('normal', localNormUrl, `${asset.name}_normal.jpg`);
          } catch (normErr) {
            console.warn('Failed to download normal map:', normErr);
            setPbrMap('normal', null, null);
            painter.setMap('normal', null);
          }
        } else if (setPbrMap) {
          setPbrMap('normal', null, null);
          if (painter) painter.setMap('normal', null);
        }

        // 3. Load Roughness Map if available and painter exists
        if (roughnessUrl && painter && setPbrMap) {
          try {
            const roughRes = await fetch(roughnessUrl);
            const roughBlob = await roughRes.blob();
            const localRoughUrl = URL.createObjectURL(roughBlob);

            const texLoader = new THREE.TextureLoader();
            texLoader.load(localRoughUrl, (tex) => {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.needsUpdate = true;
              painter.setMap('roughness', tex);
            });
            setPbrMap('roughness', localRoughUrl, `${asset.name}_roughness.jpg`);
          } catch (roughErr) {
            console.warn('Failed to download roughness map:', roughErr);
            setPbrMap('roughness', null, null);
            painter.setMap('roughness', null);
          }
        } else if (setPbrMap) {
          setPbrMap('roughness', null, null);
          if (painter) painter.setMap('roughness', null);
        }
      }
    } catch (err) {
      console.error('Failed to download Polyhaven textures:', err);
      alert('Error fetching texture files. Check connection or console.');
    } finally {
      setApplyingAssetId(null);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTrimsheetMode) {
      const regionId = trimsheetCtx.selectedRegionId;
      if (!regionId) { alert('Select a region first.'); return; }
      const albedo = e.target.files?.[0];
      if (!albedo) return;
      try {
        const mat = await loadUploadMaterial(albedo.name, { albedo });
        trimsheetCtx.assignMaterialToRegion(regionId, mat);
      } catch (err) {
        console.error(err);
        alert('Failed to load uploaded image.');
      } finally {
        e.target.value = '';
      }
    } else {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!isFillLayer) {
        alert('Select a fill layer first.');
        return;
      }
      const url = URL.createObjectURL(file);
      if (updateLayerFillSettings) {
        updateLayerFillSettings(activeLayerId, {
          fillTextureName: file.name,
          fillTextureUrl: url
        });
      }
      e.target.value = '';
    }
  };

  // Combine local and remote assets for rendering
  const filteredLocal = LOCAL_MATERIALS.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || m.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredPolyhaven = polyhavenAssets.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || m.category.includes(activeCategory);
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', label: 'All Materials' },
    { id: 'wood', label: 'Wood' },
    { id: 'metal', label: 'Metal' },
    { id: 'stone', label: 'Stone & Brick' },
    { id: 'plaster', label: 'Plaster/Wall' },
    { id: 'terrain', label: 'Terrain' },
  ];

  return (
    <div className={styles.container}>
      {/* Target layer warning */}
      {!isTargetActive && (
        <div className={styles.warningBanner}>
          <Layers size={13} />
          <span>
            {isTrimsheetMode 
              ? 'Select or add a region in the Trimsheet editor to apply materials.'
              : 'Select or add a "fill" layer in Canvas Layers to apply materials.'}
          </span>
        </div>
      )}

      {/* Upload Box (Trimsheet only) */}
      {isTrimsheetMode && (
        <div className={styles.uploadBox}>
          <strong className={styles.uploadLabel}>Upload custom albedo texture</strong>
          <input type="file" accept="image/*" className={styles.uploadInput} onChange={onUpload} />
          <span className={styles.hint}>
            Assigns albedo to the selected region. Additional PBR channels can be managed in the <strong>Texture Maps</strong> panel.
          </span>
        </div>
      )}

      {/* Toolbar: Search and Filter */}
      <div className={styles.toolbar}>
        <div className={styles.row}>
          <div className={styles.searchWrap} style={{ flex: 1 }}>
            <Search size={12} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search material assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className={styles.qualitySelect}
            value={materialResolution}
            onChange={(e) => setMaterialResolution(e.target.value as any)}
            title="Download Texture Resolution from Polyhaven"
          >
            <option value="1k">1K Quality</option>
            <option value="2k">2K Quality</option>
            <option value="4k">4K Quality</option>
          </select>
        </div>

        <div className={styles.categories}>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`${styles.catButton} ${activeCategory === cat.id ? styles.catButtonActive : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Container */}
      <div className={styles.gridContainer}>
        {loading && (
          <div className={styles.loadingSpinner}>
            <Loader2 className={styles.spinner} size={20} />
            <span>Fetching Polyhaven database...</span>
          </div>
        )}

        {error && (
          <div className={styles.errorBanner}>
            <span>{error}</span>
          </div>
        )}

        <div className={styles.grid}>
          {/* Local materials */}
          {filteredLocal.map(mat => (
            <div
              key={mat.id}
              className={`${styles.card} ${applyingAssetId === mat.id ? styles.cardApplying : ''}`}
              onClick={() => handleApplyLocalMaterial(mat)}
            >
              <div className={styles.thumbWrap}>
                <div className={`${styles.localPreview} ${styles['local-' + mat.category] || ''}`}>
                  <Sparkles size={16} />
                  <span>PROCEDURAL</span>
                </div>
                {applyingAssetId === mat.id && (
                  <div className={styles.applyingOverlay}>
                    <Loader2 className={styles.spinner} size={16} />
                  </div>
                )}
              </div>
              <div className={styles.meta}>
                <span className={styles.title}>{mat.name}</span>
                <span className={styles.tag}>local</span>
              </div>
            </div>
          ))}

          {/* Polyhaven materials (paginated) */}
          {filteredPolyhaven.slice(0, visibleCount).map(asset => (
            <div
              key={asset.id}
              className={`${styles.card} ${applyingAssetId === asset.id ? styles.cardApplying : ''}`}
              onClick={() => handleApplyPolyhavenMaterial(asset)}
            >
              <div className={styles.thumbWrap}>
                <img
                  src={asset.thumbnail}
                  alt={asset.name}
                  className={styles.thumb}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="%233f3f46" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';
                  }}
                />
                {applyingAssetId === asset.id && (
                  <div className={styles.applyingOverlay}>
                    <Loader2 className={styles.spinner} size={16} />
                  </div>
                )}
              </div>
              <div className={styles.meta}>
                <span className={styles.title}>{asset.name}</span>
                <span className={styles.tag}>PBR</span>
              </div>
            </div>
          ))}

          {/* Load More Button */}
          {visibleCount < filteredPolyhaven.length && (
            <div className={styles.loadMoreContainer}>
              <button
                className={styles.loadMoreButton}
                onClick={() => setVisibleCount(prev => prev + 24)}
              >
                Load More ({filteredPolyhaven.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>

        {!loading && filteredLocal.length === 0 && filteredPolyhaven.length === 0 && (
          <div className={styles.empty}>
            <span>No materials match your search filters.</span>
          </div>
        )}
      </div>
    </div>
  );
}
