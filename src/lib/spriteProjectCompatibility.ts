/**
 * Compatibility adapter for documents saved by the standalone Sprite Pixelator
 * and by the earlier Video-to-Spritesheet editor.
 *
 * This is an in-memory view only: opening old projects must NOT migrate,
 * rewrite, delete, or alter the IndexedDB record.
 */
import type { DbProject, DbProjectFrame } from './projectDatabase';
import type { Folder, ProjectLayer, SourceInfo } from '@/types';

export type SpriteProjectType = 'spritesheet' | 'pixelator';

export function isSpriteProjectType(type: DbProject['type']): type is SpriteProjectType {
  return type === 'spritesheet' || type === 'pixelator';
}

export function projectToolHref(project: Pick<DbProject, 'id' | 'type'>): string {
  const editor = isSpriteProjectType(project.type)
    ? '/tools/sprite-editor'
    : project.type === '3d-painter'
      ? '/tools/3d-pixelator'
      : `/tools/${project.type}`;
  return `${editor}?project=${encodeURIComponent(project.id)}`;
}

const baseLayer: ProjectLayer = {
  id: 'layer-base',
  name: 'Base Frame',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
};

export interface SpriteProjectRestorePlan {
  type: SpriteProjectType;
  frames: DbProjectFrame[];
  folders: Folder[];
  selectedIds: Set<string>;
  globalLayers: ProjectLayer[];
}

export function prepareSpriteProjectRestore(project: DbProject): SpriteProjectRestorePlan {
  if (!isSpriteProjectType(project.type)) {
    throw new Error('This project belongs to a different Spritecraft tool.');
  }
  const frameIds = new Set(project.frames.map(frame => frame.id));
  const assigned = new Set<string>();

  const folders: Folder[] = (Array.isArray(project.metadata.folders)
    ? project.metadata.folders : [])
    .filter((folder): folder is Folder =>
      !!folder && typeof folder.id === 'string' &&
      typeof folder.name === 'string' && Array.isArray(folder.frameIds))
    .map(folder => ({
      ...folder,
      frameIds: folder.frameIds.filter(id => {
        if (typeof id !== 'string' || !frameIds.has(id) || assigned.has(id)) return false;
        assigned.add(id);
        return true;
      }),
    }));

  const orphaned = project.frames
    .filter(frame => !assigned.has(frame.id))
    .map(frame => frame.id);

  if (orphaned.length || folders.length === 0) {
    folders.push({
      id: folders.some(folder => folder.id === 'folder-recovered')
        ? 'folder-unassigned-frames' : 'folder-recovered',
      name: folders.length ? 'Unassigned Frames' : 'Frames',
      frameIds: orphaned,
      color: '#3b82f6',
      visible: true,
      collapsed: false,
    });
  }

  const selected = Array.isArray(project.metadata.selectedIds)
    ? project.metadata.selectedIds.filter(id => frameIds.has(id))
    : project.frames.map(frame => frame.id);

  const storedLayers = project.metadata.globalLayers;
  const globalLayers: ProjectLayer[] =
    Array.isArray(storedLayers) && storedLayers.length
      ? storedLayers.map(layer => ({ ...layer }))
      : [{ ...baseLayer }];

  if (!globalLayers.some(layer => layer.id === 'layer-base')) {
    globalLayers.unshift({ ...baseLayer });
  }

  return {
    type: project.type,
    frames: project.frames,
    folders,
    selectedIds: new Set(selected),
    globalLayers,
  };
}

/**
 * Projects created before source-list persistence still contain all the frame
 * source IDs and folder names. Reconstruct a read-only display list from those
 * records, and reconcile saved counts with frames that still exist.
 */
export function restoreSpriteSources(
  project: DbProject,
  folders: readonly Folder[]
): SourceInfo[] {
  const bySource = new Map<string, SourceInfo>();
  const saved = Array.isArray(project.metadata.sources)
    ? project.metadata.sources
    : [];

  for (const source of saved) {
    if (source && typeof source.id === 'string' && typeof source.name === 'string' &&
        (source.type === 'image' || source.type === 'video' || source.type === 'gif')) {
      bySource.set(source.id, { ...source, frameCount: 0 });
    }
  }

  for (const frame of project.frames) {
    const existing = bySource.get(frame.sourceId);
    if (existing) {
      existing.frameCount += 1;
      continue;
    }
    const matchingFolder = folders.find(folder => folder.frameIds.includes(frame.id));
    bySource.set(frame.sourceId, {
      id: frame.sourceId,
      name: matchingFolder?.name || 'Imported Frames',
      type: 'image',
      color: frame.sourceColor,
      frameCount: 1,
    });
  }
  return [...bySource.values()].filter(source => source.frameCount > 0);
}
