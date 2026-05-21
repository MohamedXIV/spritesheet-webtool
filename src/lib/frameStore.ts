/**
 * Frame Store - Manages extracted frames, folders, and selection state
 */

import { FrameData, Folder } from '@/types';

export interface FrameState {
  frames: FrameData[];
  folders: Folder[];
  selectedIds: Set<string>;
}

/**
 * Create initial frame state from extracted frames
 */
export function createFrameState(frames: FrameData[]): FrameState {
  const defaultFolder: Folder = {
    id: 'folder-main',
    name: 'Main Frames',
    frameIds: frames.map(f => f.id),
    visible: true,
    collapsed: false,
    color: '#3b82f6' // Default Blue
  };
  
  return {
    frames,
    folders: [defaultFolder],
    selectedIds: new Set(frames.map(f => f.id))
  };
}

/**
 * Get frames in active (visible) folders in their current order
 */
export function getOrderedFrames(state: FrameState): FrameData[] {
  const activeFrameIds: string[] = [];
  
  state.folders.forEach(folder => {
    if (folder.visible) {
      activeFrameIds.push(...folder.frameIds);
    }
  });
  
  return activeFrameIds
    .map(id => state.frames.find(f => f.id === id))
    .filter((f): f is FrameData => f !== undefined);
}

/**
 * Get ALL frames in folder sequence, regardless of visibility
 */
export function getFoldersOrderedFrames(state: FrameState): FrameData[] {
  const allFrameIds: string[] = [];
  
  state.folders.forEach(folder => {
    allFrameIds.push(...folder.frameIds);
  });
  
  return allFrameIds
    .map(id => state.frames.find(f => f.id === id))
    .filter((f): f is FrameData => f !== undefined);
}

/**
 * Get selected frames in their current order
 */
export function getSelectedFrames(state: FrameState): FrameData[] {
  const ordered = getOrderedFrames(state);
  return ordered.filter(f => state.selectedIds.has(f.id));
}

/**
 * Toggle frame selection
 */
export function toggleFrameSelection(state: FrameState, frameId: string): FrameState {
  const newSelected = new Set(state.selectedIds);
  if (newSelected.has(frameId)) {
    newSelected.delete(frameId);
  } else {
    newSelected.add(frameId);
  }
  return { ...state, selectedIds: newSelected };
}

/**
 * Select a range of frames (Shift+Click behavior)
 */
export function selectFrameRange(
  state: FrameState,
  fromId: string,
  toId: string
): FrameState {
  const orderedIds = getOrderedFrames(state).map(f => f.id);
  const fromIndex = orderedIds.indexOf(fromId);
  const toIndex = orderedIds.indexOf(toId);
  
  if (fromIndex === -1 || toIndex === -1) return state;
  
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  
  const newSelected = new Set(state.selectedIds);
  for (let i = start; i <= end; i++) {
    newSelected.add(orderedIds[i]);
  }
  
  return { ...state, selectedIds: newSelected };
}

/**
 * Select all frames
 */
export function selectAllFrames(state: FrameState): FrameState {
  const orderedIds = getOrderedFrames(state).map(f => f.id);
  return {
    ...state,
    selectedIds: new Set(orderedIds)
  };
}

/**
 * Deselect all frames
 */
export function deselectAllFrames(state: FrameState): FrameState {
  return {
    ...state,
    selectedIds: new Set()
  };
}

/**
 * Delete selected frames and clean up their bitmaps
 */
export function deleteSelectedFrames(state: FrameState): FrameState {
  // Close bitmaps of deleted frames to free memory
  state.frames
    .filter(f => state.selectedIds.has(f.id))
    .forEach(f => f.bitmap.close());
  
  const remainingFrames = state.frames.filter(f => !state.selectedIds.has(f.id));
  
  const newFolders = state.folders.map(folder => ({
    ...folder,
    frameIds: folder.frameIds.filter(id => !state.selectedIds.has(id))
  }));
  
  return {
    frames: remainingFrames,
    folders: newFolders,
    selectedIds: new Set()
  };
}

/**
 * Folder Operations
 */

export function createFolder(state: FrameState, name: string, color: string): FrameState {
  const newFolder: Folder = {
    id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    frameIds: [],
    visible: true,
    collapsed: false,
    color
  };
  
  return {
    ...state,
    folders: [...state.folders, newFolder]
  };
}

export function deleteFolder(state: FrameState, folderId: string): FrameState {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return state;
  
  // Close bitmaps of frames in this folder to release memory
  state.frames
    .filter(f => folder.frameIds.includes(f.id))
    .forEach(f => f.bitmap.close());
  
  const remainingFrames = state.frames.filter(f => !folder.frameIds.includes(f.id));
  const newFolders = state.folders.filter(f => f.id !== folderId);
  
  // Keep at least one default folder
  if (newFolders.length === 0) {
    newFolders.push({
      id: 'folder-main',
      name: 'Main Frames',
      frameIds: [],
      visible: true,
      collapsed: false,
      color: '#3b82f6'
    });
  }
  
  const remainingIds = new Set(remainingFrames.map(f => f.id));
  const newSelected = new Set(Array.from(state.selectedIds).filter(id => remainingIds.has(id)));
  
  return {
    frames: remainingFrames,
    folders: newFolders,
    selectedIds: newSelected
  };
}

export function renameFolder(state: FrameState, folderId: string, name: string): FrameState {
  const newFolders = state.folders.map(f => 
    f.id === folderId ? { ...f, name } : f
  );
  return { ...state, folders: newFolders };
}

export function toggleFolderVisibility(state: FrameState, folderId: string): FrameState {
  const newFolders = state.folders.map(f => 
    f.id === folderId ? { ...f, visible: !f.visible } : f
  );
  return { ...state, folders: newFolders };
}

export function toggleFolderCollapse(state: FrameState, folderId: string): FrameState {
  const newFolders = state.folders.map(f => 
    f.id === folderId ? { ...f, collapsed: !f.collapsed } : f
  );
  return { ...state, folders: newFolders };
}

export function moveFrameToFolder(
  state: FrameState, 
  frameId: string, 
  targetFolderId: string,
  targetIndex?: number
): FrameState {
  const newFolders = state.folders.map(folder => {
    // Remove frameId from its current folder
    let frameIds = folder.frameIds.filter(id => id !== frameId);
    
    // Add frameId to target folder
    if (folder.id === targetFolderId) {
      if (targetIndex !== undefined) {
        frameIds.splice(targetIndex, 0, frameId);
      } else {
        frameIds.push(frameId);
      }
    }
    
    return { ...folder, frameIds };
  });
  
  return { ...state, folders: newFolders };
}

export function reorderFolders(state: FrameState, fromIndex: number, toIndex: number): FrameState {
  const newFolders = [...state.folders];
  const [movedFolder] = newFolders.splice(fromIndex, 1);
  newFolders.splice(toIndex, 0, movedFolder);
  return { ...state, folders: newFolders };
}

export function reorderFramesInFolder(
  state: FrameState,
  folderId: string,
  fromIndex: number,
  toIndex: number
): FrameState {
  const newFolders = state.folders.map(folder => {
    if (folder.id === folderId) {
      const frameIds = [...folder.frameIds];
      const [movedId] = frameIds.splice(fromIndex, 1);
      frameIds.splice(toIndex, 0, movedId);
      return { ...folder, frameIds };
    }
    return folder;
  });
  
  return { ...state, folders: newFolders };
}

/**
 * Clean up all frame bitmaps (call when unmounting)
 */
export function disposeFrames(state: FrameState): void {
  state.frames.forEach(f => {
    try {
      f.bitmap.close();
    } catch {
      // Bitmap may already be closed
    }
  });
}
