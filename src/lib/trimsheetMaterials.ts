// src/lib/trimsheetMaterials.ts
/**
 * trimsheetMaterials - Build TrimMaterial objects (5 PBR map bitmaps) from
 * Polyhaven assets or user-uploaded files. React-free.
 */

import {
  TrimMaterial,
  TrimMaterialMaps,
  MapChannel,
  MAP_CHANNELS,
  makeMaterialId,
} from './trimsheetTypes';

const PH_HEADERS = { 'User-Agent': 'SpritesheetWebtoolTrimsheet' };

export interface PolyhavenAsset {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
}

/** Fetch the Polyhaven textures index. Throws on network failure. */
export async function fetchPolyhavenIndex(): Promise<PolyhavenAsset[]> {
  const res = await fetch('https://api.polyhaven.com/assets?t=textures', { headers: PH_HEADERS });
  if (!res.ok) throw new Error('Failed to retrieve Polyhaven index');
  const data = await res.json();
  return Object.keys(data).map((key) => {
    const item = data[key];
    return {
      id: key,
      name: item.name,
      category: item.categories?.[0] || 'other',
      thumbnail: item.thumbnail_url || `https://cdn.polyhaven.com/asset_img/thumbs/${key}.png?width=128&height=128`,
    };
  });
}

/** Pick a URL from a Polyhaven map object, preferring 1k then 2k, jpg then png. */
function getMapUrl(mapObject: any): string | null {
  if (!mapObject) return null;
  const resObj = mapObject['1k'] || mapObject['2k'] || Object.values(mapObject)[0];
  if (!resObj) return null;
  const formatObj = (resObj as any)['jpg'] || (resObj as any)['png'] || Object.values(resObj as any)[0];
  return (formatObj as any)?.url || null;
}

async function urlToBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download map: ${url}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

/**
 * Build a full TrimMaterial from a Polyhaven asset. Missing channels stay null
 * (the baker substitutes solid fallbacks). Throws only if the index/file
 * fetch fails; individual missing maps are tolerated.
 */
export async function loadPolyhavenMaterial(asset: PolyhavenAsset): Promise<TrimMaterial> {
  const res = await fetch(`https://api.polyhaven.com/files/${asset.id}`, { headers: PH_HEADERS });
  if (!res.ok) throw new Error('Failed to fetch Polyhaven asset files');
  const data = await res.json();

  const lowercaseKeys: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    lowercaseKeys[key.toLowerCase()] = data[key];
  }

  const urls: Record<MapChannel, string | null> = {
    albedo: getMapUrl(lowercaseKeys.diffuse || lowercaseKeys.diff || lowercaseKeys.col || lowercaseKeys.albedo),
    normal: getMapUrl(lowercaseKeys.nor_gl || lowercaseKeys.nor || lowercaseKeys.normal || lowercaseKeys.nor_dx),
    roughness: getMapUrl(lowercaseKeys.rough || lowercaseKeys.roughness),
    metalness: getMapUrl(lowercaseKeys.metal || lowercaseKeys.metalness),
    ao: getMapUrl(lowercaseKeys.ao),
  };

  const maps: TrimMaterialMaps = {
    albedo: null, normal: null, roughness: null, metalness: null, ao: null,
  };

  await Promise.all(
    MAP_CHANNELS.map(async (ch) => {
      const url = urls[ch];
      if (!url) return;
      try {
        maps[ch] = await urlToBitmap(url);
      } catch {
        maps[ch] = null; // tolerate per-map failure
      }
    }),
  );

  return {
    id: makeMaterialId(),
    name: asset.name,
    source: 'polyhaven',
    maps,
    thumbnailUrl: asset.thumbnail,
  };
}

/** Map a user-provided File set to channels. Albedo is required. */
export interface UploadMapFiles {
  albedo: File;
  normal?: File | null;
  roughness?: File | null;
  metalness?: File | null;
  ao?: File | null;
}

export async function loadUploadMaterial(name: string, fileSet: UploadMapFiles): Promise<TrimMaterial> {
  const fileFor: Record<MapChannel, File | null | undefined> = {
    albedo: fileSet.albedo,
    normal: fileSet.normal,
    roughness: fileSet.roughness,
    metalness: fileSet.metalness,
    ao: fileSet.ao,
  };

  const maps: TrimMaterialMaps = {
    albedo: null, normal: null, roughness: null, metalness: null, ao: null,
  };

  await Promise.all(
    MAP_CHANNELS.map(async (ch) => {
      const f = fileFor[ch];
      if (!f) return;
      maps[ch] = await createImageBitmap(f);
    }),
  );

  // Thumbnail = albedo as a data/object URL for the panel grid.
  const thumbnailUrl = URL.createObjectURL(fileSet.albedo);

  return {
    id: makeMaterialId(),
    name: name || fileSet.albedo.name,
    source: 'upload',
    maps,
    thumbnailUrl,
  };
}

/** Count how many of the 5 channels are present (for the "N/5 maps" badge). */
export function countMaps(material: TrimMaterial): number {
  return MAP_CHANNELS.reduce((n, ch) => n + (material.maps[ch] ? 1 : 0), 0);
}

/** Dispose all bitmaps + revoke any object URL. Call when removing a material. */
export function disposeMaterial(material: TrimMaterial): void {
  for (const ch of MAP_CHANNELS) {
    material.maps[ch]?.close();
  }
  if (material.source === 'upload' && material.thumbnailUrl.startsWith('blob:')) {
    URL.revokeObjectURL(material.thumbnailUrl);
  }
}
