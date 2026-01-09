/**
 * Frame Store - Manages extracted frames and selection state
 */

import { FrameData } from '@/types';

export interface FrameState {
  frames: FrameData[];
  selectedIds: Set<string>;
  orderedIds: string[];
}

/**
 * Create initial frame state from extracted frames
 */
export function createFrameState(frames: FrameData[]): FrameState {
  return {
    frames,
    selectedIds: new Set(frames.map(f => f.id)),
    orderedIds: frames.map(f => f.id)
  };
}

/**
 * Get frames in their current order
 */
export function getOrderedFrames(state: FrameState): FrameData[] {
  return state.orderedIds
    .map(id => state.frames.find(f => f.id === id))
    .filter((f): f is FrameData => f !== undefined);
}

/**
 * Get selected frames in their current order
 */
export function getSelectedFrames(state: FrameState): FrameData[] {
  return state.orderedIds
    .filter(id => state.selectedIds.has(id))
    .map(id => state.frames.find(f => f.id === id))
    .filter((f): f is FrameData => f !== undefined);
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
  const fromIndex = state.orderedIds.indexOf(fromId);
  const toIndex = state.orderedIds.indexOf(toId);
  
  if (fromIndex === -1 || toIndex === -1) return state;
  
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  
  const newSelected = new Set(state.selectedIds);
  for (let i = start; i <= end; i++) {
    newSelected.add(state.orderedIds[i]);
  }
  
  return { ...state, selectedIds: newSelected };
}

/**
 * Select all frames
 */
export function selectAllFrames(state: FrameState): FrameState {
  return {
    ...state,
    selectedIds: new Set(state.orderedIds)
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
  const remainingIds = state.orderedIds.filter(id => !state.selectedIds.has(id));
  
  return {
    frames: remainingFrames,
    selectedIds: new Set(),
    orderedIds: remainingIds
  };
}

/**
 * Reorder frames (for drag and drop)
 */
export function reorderFrames(
  state: FrameState,
  fromIndex: number,
  toIndex: number
): FrameState {
  const newOrder = [...state.orderedIds];
  const [movedId] = newOrder.splice(fromIndex, 1);
  newOrder.splice(toIndex, 0, movedId);
  
  return { ...state, orderedIds: newOrder };
}

/**
 * Move frame by ID to a new position
 */
export function moveFrame(
  state: FrameState,
  frameId: string,
  toIndex: number
): FrameState {
  const fromIndex = state.orderedIds.indexOf(frameId);
  if (fromIndex === -1) return state;
  
  return reorderFrames(state, fromIndex, toIndex);
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
