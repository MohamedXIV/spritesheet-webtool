/**
 * projectDatabase - Asynchronous IndexedDB storage engine for local offline saving
 */

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
}

export interface DbProjectFrame {
  id: string;
  index: number;
  timestamp: number;
  sourceId: string;
  sourceColor: string;
  blob: Blob; // Binary PNG frame stored in database
}

export interface DbProject {
  id: string;
  name: string;
  type: 'spritesheet' | 'pixelator';
  createdAt: number;
  updatedAt: number;
  metadata: ProjectMetadata;
  frames: DbProjectFrame[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  type: 'spritesheet' | 'pixelator';
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
    
    // Convert folders set back to array if any sets exist in metadata
    const cleanProject = {
      ...project,
      updatedAt: Date.now(),
      metadata: {
        ...project.metadata,
        selectedIds: Array.from(project.metadata.selectedIds || []),
      }
    };

    const request = store.put(cleanProject);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to save project: ${request.error?.message}`));
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
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error(`Failed to fetch project: ${request.error?.message}`));
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
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const summaries: ProjectSummary[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
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
      } else {
        // Sort summaries by updatedAt descending (newest first)
        summaries.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(summaries);
      }
    };

    request.onerror = () => {
      reject(new Error(`Failed to list projects: ${request.error?.message}`));
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
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete project: ${request.error?.message}`));
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
