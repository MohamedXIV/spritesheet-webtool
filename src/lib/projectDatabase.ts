/**
 * projectDatabase - Asynchronous IndexedDB storage engine for local offline saving
 */

import type { StylizerOptions } from '@/lib/stylizer';

export interface ProjectMetadata {
  folders: any[];
  selectedIds: string[];
  fps: number;
  loopMode: string;
  previewBgMode?: string;
  previewBgColor?: string;
  pixelatorOptions?: any; // Options for stand-alone pixelator
  slicerOptions?: {
    sliceType: 'grid' | 'dimensions';
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
  };
  threePainterOptions?: {
    loadedModelName: string | null;
    loadedModelSize: number | null;
    pixelatorOptions: any;
    brushOptions: any;
    psxEnabled: boolean;
    layers: {
      id: string;
      name: string;
      type: 'paint' | 'fill';
      opacity: number;
      visible: boolean;
      blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
      fillColor?: string;
      fillTextureName?: string | null;
      maskVisible?: boolean;
      maskActive?: boolean;
      filters?: {
        hue: number;
        saturation: number;
        brightness: number;
        contrast: number;
        curvesPoints: [number, number, number, number];
      };
    }[];
  };
  globalLayers?: {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
  }[];
  trimsheetOptions?: {
    resolution: number;
    regions: any[];
    // Material persistence is deferred; only resolution + regions are written today.
    materials?: {
      id: string;
      name: string;
      source: 'polyhaven' | 'upload' | 'flat';
      flatColor?: string;
      // Polyhaven: store asset id for re-fetch. Upload: store per-channel blobs.
      polyhavenAssetId?: string;
      uploadBlobs?: { channel: string; blob: Blob }[];
      thumbnailUrl?: string;
    }[];
    enabledChannels?: string[];
  };
  stylizerOptions?: StylizerOptions;
  stylizerMapSlots?: string[]; // ordered MapSlot names matching the saved frame blobs
  previewShape?: 'sphere' | 'box' | 'plane' | 'custom';
  customModelName?: string | null;
}

export interface DbProjectFrameLayer {
  layerId: string;
  blob: Blob | null; // Compressed PNG layer image
}

export interface DbProjectFrame {
  id: string;
  index: number;
  timestamp: number;
  durationMs?: number;
  sourceId: string;
  sourceColor: string;
  blob: Blob; // Binary PNG frame stored in database
  layers?: DbProjectFrameLayer[]; // Optional layers storage
}

export interface DbProject {
  id: string;
  name: string;
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer';
  createdAt: number;
  updatedAt: number;
  metadata: ProjectMetadata;
  frames: DbProjectFrame[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  type: 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer';
  createdAt: number;
  updatedAt: number;
  frameCount: number;
}

const DB_NAME = 'SpriteCraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

/**
 * Open connections to IndexedDB
 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in browser client thread'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Save or update a project in database
 */
export async function saveProject(project: DbProject): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // A successful put request is NOT a committed transaction.
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => {
      const error = transaction.error;
      db.close();
      reject(new Error(`Failed to save project: ${error?.message || 'transaction error'}`));
    };
    transaction.onabort = () => {
      const error = transaction.error;
      db.close();
      reject(new Error(`Project save aborted: ${error?.message || 'transaction aborted'}`));
    };

    // Keep the original creation date for successive saves of the same project.
    // Read and write in the same transaction to avoid an interleaving update.
    const existingRequest = store.get(project.id);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as DbProject | undefined;
      store.put({
        ...project,
        createdAt: existing?.createdAt ?? project.createdAt,
        updatedAt: Date.now(),
        metadata: {
          ...project.metadata,
          selectedIds: Array.from(project.metadata.selectedIds || []),
        },
      });
    };
  });
}

/**
 * Retrieve a project by its unique ID
 */
export async function getProject(id: string): Promise<DbProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    let result: DbProject | null = null;
    request.onsuccess = () => { result = request.result || null; };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => {
      const error = transaction.error;
      db.close();
      reject(new Error(`Failed to fetch project: ${error?.message || 'transaction error'}`));
    };
    transaction.onabort = () => {
      db.close();
      reject(new Error('Project read aborted'));
    };
  });
}

/**
 * Retrieve metadata summaries of all saved projects (omitting heavy frame Blobs)
 */
export async function getAllProjectsSummary(): Promise<ProjectSummary[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).openCursor();
    const summaries: ProjectSummary[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const val = cursor.value as DbProject;
      summaries.push({
        id: val.id,
        name: val.name,
        type: val.type,
        createdAt: val.createdAt,
        updatedAt: val.updatedAt,
        frameCount: val.frames?.length || 0,
      });
      cursor.continue();
    };
    transaction.oncomplete = () => {
      db.close();
      summaries.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(summaries);
    };
    transaction.onerror = () => {
      const error = transaction.error;
      db.close();
      reject(new Error(`Failed to list projects: ${error?.message || 'transaction error'}`));
    };
    transaction.onabort = () => {
      db.close();
      reject(new Error('Project list read aborted'));
    };
  });
}

/**
 * Delete a project by its ID
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => {
      const error = transaction.error;
      db.close();
      reject(new Error(`Failed to delete project: ${error?.message || 'transaction error'}`));
    };
    transaction.onabort = () => {
      db.close();
      reject(new Error('Project deletion aborted'));
    };
  });
}

/**
 * Rename an existing project
 */
export async function renameProject(id: string, newName: string): Promise<void> {
  const project = await getProject(id);
  if (!project) {
    throw new Error('Project not found');
  }
  project.name = newName;
  project.updatedAt = Date.now();
  await saveProject(project);
}
