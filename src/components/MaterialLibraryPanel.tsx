'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, RefreshCw, Layers, Sparkles } from 'lucide-react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
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
  const {
    layers,
    activeLayerId,
    updateLayerFillSettings,
    painter,
    isModelLoaded,
    setPbrMap,
  } = useThreePainterContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [polyhavenAssets, setPolyhavenAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingAssetId, setApplyingAssetId] = useState<string | null>(null);

  const activeLayer = layers.find(l => l.id === activeLayerId);
  const isFillLayer = activeLayer?.type === 'fill';

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

  const handleApplyLocalMaterial = (mat: typeof LOCAL_MATERIALS[0]) => {
    if (!isFillLayer) {
      alert('Please select a "fill" layer to apply a material texture.');
      return;
    }
    setApplyingAssetId(mat.id);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      mat.generate(ctx, 512, 512);

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          updateLayerFillSettings(activeLayerId, {
            fillTextureName: mat.name,
            fillTextureUrl: url,
          });
        }
        // Reset normal and roughness maps
        setPbrMap('normal', null, null);
        setPbrMap('roughness', null, null);
        if (painter) {
          painter.setMap('normal', null);
          painter.setMap('roughness', null);
        }
        setApplyingAssetId(null);
      }, 'image/png');
    } catch (err) {
      console.error(err);
      setApplyingAssetId(null);
    }
  };

  const handleApplyPolyhavenMaterial = async (asset: Asset) => {
    if (!isFillLayer) {
      alert('Please select a "fill" layer to apply a material texture.');
      return;
    }
    setApplyingAssetId(asset.id);

    try {
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
        const resObj = mapObject["1k"] || mapObject["2k"] || Object.values(mapObject)[0];
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
      updateLayerFillSettings(activeLayerId, {
        fillTextureName: asset.name,
        fillTextureUrl: localDiffUrl,
      });

      // 2. Load Normal Map if available and painter exists
      if (normalUrl && painter) {
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
      } else {
        setPbrMap('normal', null, null);
        if (painter) painter.setMap('normal', null);
      }

      // 3. Load Roughness Map if available and painter exists
      if (roughnessUrl && painter) {
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
      } else {
        setPbrMap('roughness', null, null);
        if (painter) painter.setMap('roughness', null);
      }

    } catch (err) {
      console.error('Failed to download Polyhaven textures:', err);
      alert('Error fetching texture files. Check connection or console.');
    } finally {
      setApplyingAssetId(null);
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
      {!isFillLayer && (
        <div className={styles.warningBanner}>
          <Layers size={13} />
          <span>Select or add a <strong>Fill Layer</strong> in Canvas Layers to apply materials.</span>
        </div>
      )}

      {/* Toolbar: Search and Filter */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={12} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search material assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
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

          {/* Polyhaven materials */}
          {filteredPolyhaven.map(asset => (
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
