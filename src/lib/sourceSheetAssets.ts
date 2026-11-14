/**
 * Source PNG/WebP/JPEG images are stored as original Blobs in the same
 * IndexedDB project record as the extracted frames. No cloud upload, no
 * destructive migration, and no recompression of the source.
 */
import type { FrameData, Folder } from '@/types';
import type { FrameState } from './frameStore';

export interface SheetSliceSettings {
  sliceType: 'grid' | 'dimensions';
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

export interface SourceSheetAsset {
  sourceId: string;
  folderId: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  slice: SheetSliceSettings;
}

export function restoreSourceSheetAssets(value: unknown): SourceSheetAsset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((asset): asset is SourceSheetAsset => {
    if (!asset || typeof asset.sourceId !== 'string' ||
        typeof asset.folderId !== 'string' || typeof asset.name !== 'string' ||
        !(asset.blob instanceof Blob) ||
        !Number.isSafeInteger(asset.width) || asset.width < 1 ||
        !Number.isSafeInteger(asset.height) || asset.height < 1 ||
        !asset.slice || !['grid', 'dimensions'].includes(asset.slice.sliceType) ||
        seen.has(asset.sourceId)) return false;
    seen.add(asset.sourceId);
    return true;
  });
}

/**
 * Re-slice replaces only frames associated with the chosen source. This is a
 * pure history operation: old FrameData and ImageBitmaps remain untouched so
 * Undo can restore paintings, selections, and folder assignments.
 */
export function replaceSourceSheetFrames(
  state: FrameState,
  sourceId: string,
  folder: Folder,
  frames: FrameData[]
): FrameState {
  if (!frames.length || frames.some(frame => frame.sourceId !== sourceId)) {
    throw new Error('Resliced frames must belong to the selected spritesheet');
  }

  const removedIds = new Set(
    state.frames.filter(frame => frame.sourceId === sourceId).map(frame => frame.id)
  );
  const oldPosition = state.frames.findIndex(frame => frame.sourceId === sourceId);
  const otherFrames = state.frames.filter(frame => !removedIds.has(frame.id));
  const insertionIndex = oldPosition < 0
    ? otherFrames.length
    : state.frames.slice(0, oldPosition).filter(frame => !removedIds.has(frame.id)).length;
  otherFrames.splice(insertionIndex, 0, ...frames);

  const target = state.folders.find(item => item.id === folder.id);
  const nextFolders = state.folders.map(item => {
    const firstOld = item.frameIds.findIndex(id => removedIds.has(id));
    const remaining = item.frameIds.filter(id => !removedIds.has(id));
    if (item.id === folder.id) {
      const insertAt = firstOld >= 0 ? firstOld : remaining.length;
      remaining.splice(insertAt, 0, ...frames.map(frame => frame.id));
    }
    return { ...item, frameIds: remaining };
  });

  if (!target) {
    nextFolders.push({ ...folder, frameIds: frames.map(frame => frame.id) });
  }
  return {
    frames: otherFrames,
    folders: nextFolders,
    selectedIds: new Set(frames.map(frame => frame.id)),
  };
}
