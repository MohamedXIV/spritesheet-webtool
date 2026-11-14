/**
 * Spritecraft portable project archive v1.
 *
 * A .spritecraft file is a ZIP containing manifest.json and original binary
 * Blobs. It is deliberately independent of IndexedDB origin/device.
 * ZIP entries are generated paths, never user-supplied archive paths.
 *
 * Export/import only what Spritecraft actually saves in DbProject. This does
 * not claim to restore transient browser objects or missing original media.
 */
import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import type { DbProject } from './projectDatabase';

const FORMAT = 'spritecraft-project';
const VERSION = 1;
const MANIFEST = 'manifest.json';
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 5000;
const MAX_DEPTH = 48;

type FileMap = Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]>;
interface BlobReference {
  $spritecraftBlob: string;
  mime: string;
  size: number;
  sha256: string;
}
interface PortableManifest {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  project: unknown;
}

const PROJECT_TYPES = new Set([
  'spritesheet', 'pixelator', '3d-painter', 'trimsheet', 'stylizer',
]);

function assertSafeKey(key: string) {
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
    throw new Error('Project contains an unsafe data property');
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Spritecraft project data');
  }
  return value as Record<string, unknown>;
}

function checkedProject(value: unknown): DbProject {
  const project = asRecord(value);
  if (typeof project.id !== 'string' || !project.id || project.id.length > 256 ||
      typeof project.name !== 'string' || !project.name || project.name.length > 512 ||
      typeof project.type !== 'string' || !PROJECT_TYPES.has(project.type) ||
      !Number.isFinite(project.createdAt) || !Number.isFinite(project.updatedAt) ||
      !Array.isArray(project.frames) || project.frames.length > MAX_ENTRIES ||
      !project.metadata || typeof project.metadata !== 'object' ||
      Array.isArray(project.metadata)) {
    throw new Error('Backup does not contain a supported Spritecraft project');
  }

  for (const frame of project.frames) {
    const f = asRecord(frame);
    if (typeof f.id !== 'string' || !f.id || typeof f.sourceId !== 'string' ||
        typeof f.sourceColor !== 'string' || !Number.isFinite(f.index) ||
        !Number.isFinite(f.timestamp) || !(f.blob instanceof Blob) ||
        (f.durationMs !== undefined && (typeof f.durationMs !== 'number' || !Number.isFinite(f.durationMs) || f.durationMs <= 0)) ||
        (f.layers !== undefined && !Array.isArray(f.layers))) {
      throw new Error('Backup contains an invalid frame');
    }
    if (Array.isArray(f.layers)) {
      for (const layer of f.layers) {
        const l = asRecord(layer);
        if (typeof l.layerId !== 'string' ||
            (l.blob !== null && !(l.blob instanceof Blob))) {
          throw new Error('Backup contains an invalid frame layer');
        }
      }
    }
  }
  return project as unknown as DbProject;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Secure browser context required for verified project backups');
  }
  // Copy into an owned ArrayBuffer to satisfy modern TS DOM BufferSource types.
  const input = new Uint8Array(bytes.length);
  input.set(bytes);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input.buffer));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateDepth(depth: number) {
  if (depth > MAX_DEPTH) throw new Error('Project nesting is too deep for backup');
}

function checkByteBudget(current: number, addition: number) {
  if (current + addition > MAX_UNPACKED_BYTES) {
    throw new Error('Project exceeds the 512 MB portable backup limit');
  }
}

export async function encodeProjectBackup(project: DbProject): Promise<Uint8Array> {
  checkedProject(project);
  const entries: FileMap = Object.create(null);
  let totalBytes = 0;
  let blobIndex = 0;

  const encode = async (value: unknown, depth: number): Promise<unknown> => {
    validateDepth(depth);
    if (value instanceof Blob) {
      const data = new Uint8Array(await value.arrayBuffer());
      checkByteBudget(totalBytes, data.byteLength);
      totalBytes += data.byteLength;
      if (++blobIndex > MAX_ENTRIES) throw new Error('Too many attachments in project');
      const path = `blobs/${String(blobIndex).padStart(6, '0')}.bin`;
      entries[path] = [data, { level: 0 }];
      return {
        $spritecraftBlob: path,
        mime: value.type,
        size: data.byteLength,
        sha256: await sha256(data),
      } satisfies BlobReference;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_ENTRIES * 10) throw new Error('Project list is too large');
      const result: unknown[] = [];
      for (const item of value) result.push(await encode(item, depth + 1));
      return result;
    }
    if (value && typeof value === 'object') {
      if (Object.getPrototypeOf(value) !== Object.prototype &&
          Object.getPrototypeOf(value) !== null) {
        throw new Error('Unsupported object type in saved project');
      }
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, child] of Object.entries(value)) {
        assertSafeKey(key);
        if (child === undefined) continue; // JSON-compatible optional data
        result[key] = await encode(child, depth + 1);
      }
      return result;
    }
    if (value === undefined) return null;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    throw new Error('Unsupported value in saved project');
  };

  const portable = await encode(project, 0);
  const manifest: PortableManifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    project: portable,
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  if (manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new Error('Project metadata exceeds the 8 MB backup limit');
  }
  checkByteBudget(totalBytes, manifestBytes.length);
  entries[MANIFEST] = [manifestBytes, { level: 6 }];

  return new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 0 }, (error, result) => {
      if (error) reject(error);
      else if (result.length > MAX_ARCHIVE_BYTES) {
        reject(new Error('Portable backup exceeds 256 MB'));
      } else resolve(result);
    });
  });
}

export async function decodeProjectBackup(data: Uint8Array): Promise<DbProject> {
  if (data.byteLength < 22 || data.byteLength > MAX_ARCHIVE_BYTES ||
      data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) {
    throw new Error('Choose a valid .spritecraft backup (up to 256 MB)');
  }
  let totalBytes = 0;
  let entryCount = 0;
  let rejectArchive = false;

  // Check sizes from the central directory before allocating decompressed data.
  const extracted = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(data, {
      filter: info => {
        if (++entryCount > MAX_ENTRIES + 1 ||
            !Number.isSafeInteger(info.originalSize) || info.originalSize < 0 ||
            !Number.isSafeInteger(info.size) || info.size < 0 ||
            (info.name !== MANIFEST && !/^blobs\/[0-9]{6}\.bin$/.test(info.name)) ||
            (info.name === MANIFEST && info.originalSize > MAX_MANIFEST_BYTES) ||
            totalBytes + info.originalSize > MAX_UNPACKED_BYTES) {
          rejectArchive = true;
          return false;
        }
        totalBytes += info.originalSize;
        return true;
      },
    }, (error, files) => {
      if (rejectArchive) reject(new Error('Backup archive contains unsafe or oversized entries'));
      else if (error) reject(error);
      else resolve(files);
    });
  });
  const manifestFile = extracted[MANIFEST];
  if (!manifestFile) throw new Error('Spritecraft manifest is missing');

  let manifest: PortableManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestFile)) as PortableManifest;
  } catch {
    throw new Error('Spritecraft backup manifest is invalid JSON');
  }
  if (!manifest || manifest.format !== FORMAT || manifest.version !== VERSION) {
    throw new Error('Unsupported Spritecraft backup format or version');
  }

  const usedFiles = new Set<string>();
  const decode = async (value: unknown, depth: number): Promise<unknown> => {
    validateDepth(depth);
    if (Array.isArray(value)) {
      if (value.length > MAX_ENTRIES * 10) throw new Error('Backup list is too large');
      const result: unknown[] = [];
      for (const item of value) result.push(await decode(item, depth + 1));
      return result;
    }
    if (value && typeof value === 'object') {
      const record = asRecord(value);
      if (Object.hasOwn(record, '$spritecraftBlob')) {
        if (Object.keys(record).sort().join(',') !== '$spritecraftBlob,mime,sha256,size') {
          throw new Error('Invalid Blob reference in backup');
        }
        const path = record.$spritecraftBlob;
        if (typeof path !== 'string' || !/^blobs\/[0-9]{6}\.bin$/.test(path) ||
            usedFiles.has(path) || typeof record.mime !== 'string' || record.mime.length > 256 ||
            !Number.isSafeInteger(record.size) || (record.size as number) < 0 ||
            typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) {
          throw new Error('Invalid or repeated Blob reference');
        }
        const bytes = extracted[path];
        if (!bytes || bytes.length !== record.size ||
            await sha256(bytes) !== record.sha256) {
          throw new Error('Backup attachment is missing or corrupted');
        }
        usedFiles.add(path);
        const owned = new Uint8Array(bytes.length);
        owned.set(bytes);
        return new Blob([owned.buffer], { type: record.mime });
      }
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(record)) {
        assertSafeKey(key);
        result[key] = await decode(child, depth + 1);
      }
      return result;
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    throw new Error('Unsupported data in backup manifest');
  };

  const restored = await decode(manifest.project, 0);
  const project = checkedProject(restored);
  if (usedFiles.size !== Object.keys(extracted).length - 1) {
    throw new Error('Backup contains unexpected or unreferenced attachments');
  }
  return project;
}
