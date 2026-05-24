'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FrameState } from '@/lib/frameStore';

export interface UseFrameHistoryReturn {
  state: FrameState | null;
  setState: (
    newStateOrUpdater: FrameState | null | ((prev: FrameState | null) => FrameState | null)
  ) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  markSaved: () => void;
  resetHistory: (initialState: FrameState | null) => void;
  clearHistory: () => void;
}

/**
 * Bounded Undo/Redo history transaction hook with an embedded reference-counting
 * garbage collector to release unused ImageBitmap VRAM memory.
 */
export function useFrameHistory(maxDepth: number = 8): UseFrameHistoryReturn {
  const [activeState, setActiveState] = useState<FrameState | null>(null);
  
  // Stacks managed via mutable refs to prevent unnecessary re-renders
  const pastRef = useRef<FrameState[]>([]);
  const futureRef = useRef<FrameState[]>([]);
  const savedIndexRef = useRef<number>(0);
  const currentIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const updateUIFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
    setIsDirty(currentIndexRef.current !== savedIndexRef.current);
  }, []);

  /**
   * Reference-counting Garbage Collector:
   * Iterates through a discarded FrameState and safely closes any ImageBitmaps
   * that are no longer referenced in the active state or any remaining history states.
   */
  const collectGarbage = useCallback((
    discardedState: FrameState | null,
    currentState: FrameState | null,
    pastStack: FrameState[],
    futureStack: FrameState[]
  ) => {
    if (!discardedState) return;

    // Gather all currently reachable/alive ImageBitmaps
    const aliveBitmaps = new Set<ImageBitmap>();
    
    if (currentState) {
      currentState.frames.forEach(f => aliveBitmaps.add(f.bitmap));
    }
    pastStack.forEach(state => {
      state.frames.forEach(f => aliveBitmaps.add(f.bitmap));
    });
    futureStack.forEach(state => {
      state.frames.forEach(f => aliveBitmaps.add(f.bitmap));
    });

    // Close any bitmap in the discarded state that is no longer reachable
    discardedState.frames.forEach(f => {
      if (!aliveBitmaps.has(f.bitmap)) {
        try {
          f.bitmap.close();
        } catch (err) {
          console.debug('FrameHistory GC: could not close evicted bitmap', f.id, err);
        }
      }
    });
  }, []);

  const resetHistory = useCallback((initialState: FrameState | null) => {
    // Collect garbage on all current states before wiping
    pastRef.current.forEach(state => collectGarbage(state, null, [], []));
    futureRef.current.forEach(state => collectGarbage(state, null, [], []));
    if (activeState) {
      collectGarbage(activeState, null, [], []);
    }

    pastRef.current = [];
    futureRef.current = [];
    savedIndexRef.current = 0;
    currentIndexRef.current = 0;
    
    setActiveState(initialState);
    
    setCanUndo(false);
    setCanRedo(false);
    setIsDirty(false);
  }, [activeState, collectGarbage]);

  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    savedIndexRef.current = 0;
    currentIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    setIsDirty(false);
  }, []);

  const setState = useCallback((
    newStateOrUpdater: FrameState | null | ((prev: FrameState | null) => FrameState | null)
  ) => {
    setActiveState(prev => {
      let nextState: FrameState | null;
      if (typeof newStateOrUpdater === 'function') {
        nextState = newStateOrUpdater(prev);
      } else {
        nextState = newStateOrUpdater;
      }

      // If the state is identical, do nothing
      if (prev === nextState) return prev;

      // When a new state is set, we push the OLD state (prev) to the past stack
      if (prev) {
        pastRef.current.push(prev);
        currentIndexRef.current += 1;

        // Bounded depth manager: if we exceed maxDepth, evict the oldest state
        if (pastRef.current.length > maxDepth) {
          const evicted = pastRef.current.shift()!;
          // Adjust pointers
          savedIndexRef.current = Math.max(0, savedIndexRef.current - 1);
          currentIndexRef.current = Math.max(0, currentIndexRef.current - 1);
          
          // Garbage collect the evicted state's unreferenced bitmaps
          collectGarbage(evicted, nextState, pastRef.current, futureRef.current);
        }
      }

      // Clear the future stack (redo history is wiped on a new user action)
      if (futureRef.current.length > 0) {
        const discardedFuture = [...futureRef.current];
        futureRef.current = [];
        // GC all discarded redo states
        discardedFuture.forEach(state => {
          collectGarbage(state, nextState, pastRef.current, []);
        });
      }

      // Defer UI flags update to next tick to ensure state is committed
      setTimeout(updateUIFlags, 0);

      return nextState;
    });
  }, [maxDepth, collectGarbage, updateUIFlags]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0 || !activeState) return;

    setActiveState(current => {
      if (!current) return current;

      // Pop the last state from past
      const previous = pastRef.current.pop()!;
      
      // Push the current state to future (for Redo)
      futureRef.current.push(current);
      
      currentIndexRef.current -= 1;
      
      setTimeout(updateUIFlags, 0);
      return previous;
    });
  }, [activeState, updateUIFlags]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0 || !activeState) return;

    setActiveState(current => {
      if (!current) return current;

      // Pop the next state from future
      const next = futureRef.current.pop()!;
      
      // Push the current state to past (for Undo)
      pastRef.current.push(current);
      
      currentIndexRef.current += 1;
      
      setTimeout(updateUIFlags, 0);
      return next;
    });
  }, [activeState, updateUIFlags]);

  const markSaved = useCallback(() => {
    savedIndexRef.current = currentIndexRef.current;
    setIsDirty(false);
  }, []);

  // Safe cleanup on unmount
  useEffect(() => {
    return () => {
      // Call GC on everything remaining
      pastRef.current.forEach(state => {
        state.frames.forEach(f => {
          try { f.bitmap.close(); } catch {}
        });
      });
      futureRef.current.forEach(state => {
        state.frames.forEach(f => {
          try { f.bitmap.close(); } catch {}
        });
      });
    };
  }, []);

  return {
    state: activeState,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSaved,
    resetHistory,
    clearHistory
  };
}
