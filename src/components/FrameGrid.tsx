'use client';

/**
 * FrameGrid - Displays extracted frames with selection and reordering
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FrameData } from '@/types';
import styles from './FrameGrid.module.css';

interface FrameGridProps {
  frames: FrameData[];
  selectedIds: Set<string>;
  processingIds?: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  onReorder: (newOrder: string[]) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onRevertSelected?: () => void;
  canRevert?: boolean;
}

interface SortableFrameProps {
  frame: FrameData;
  isSelected: boolean;
  isProcessing: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function SortableFrame({ frame, isSelected, isProcessing, onClick }: SortableFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: frame.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    '--source-color': frame.sourceColor || 'transparent',
  } as React.CSSProperties;

  // Draw frame thumbnail to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame.bitmap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Check if bitmap is still valid
      if (frame.bitmap.width === 0 || frame.bitmap.height === 0) return;

      // Calculate thumbnail size maintaining aspect ratio
      const maxSize = 120;
      const scale = Math.min(maxSize / frame.bitmap.width, maxSize / frame.bitmap.height);
      canvas.width = frame.bitmap.width * scale;
      canvas.height = frame.bitmap.height * scale;

      ctx.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
    } catch {
      // Bitmap may have been closed - this is okay
    }
  }, [frame.bitmap]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.frame} ${isSelected ? styles.selected : ''} ${isProcessing ? styles.processing : ''}`}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <canvas ref={canvasRef} className={styles.thumbnail} />
      {frame.sourceColor && (
        <div 
          className={styles.sourceIndicator} 
          style={{ backgroundColor: frame.sourceColor }}
        />
      )}
      <div className={styles.frameIndex}>{frame.index + 1}</div>
      {isSelected && <div className={styles.checkmark}>✓</div>}
      {isProcessing && (
        <div className={styles.spinnerOverlay}>
          <div className={styles.spinner} />
        </div>
      )}
    </div>
  );
}

export function FrameGrid({
  frames,
  selectedIds,
  processingIds = new Set(),
  onSelectionChange,
  onReorder,
  onDeleteSelected,
  onDuplicateSelected,
  onRevertSelected,
  canRevert = false,
}: FrameGridProps) {
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleFrameClick = useCallback((frameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newSelection = new Set(selectedIds);

    if (e.shiftKey && lastClickedId) {
      // Range selection
      const frameIds = frames.map(f => f.id);
      const lastIndex = frameIds.indexOf(lastClickedId);
      const currentIndex = frameIds.indexOf(frameId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        
        for (let i = start; i <= end; i++) {
          newSelection.add(frameIds[i]);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      if (newSelection.has(frameId)) {
        newSelection.delete(frameId);
      } else {
        newSelection.add(frameId);
      }
    } else {
      // Single selection
      newSelection.clear();
      newSelection.add(frameId);
    }

    setLastClickedId(frameId);
    onSelectionChange(newSelection);
  }, [frames, selectedIds, lastClickedId, onSelectionChange]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = frames.findIndex(f => f.id === active.id);
      const newIndex = frames.findIndex(f => f.id === over.id);
      const newOrder = arrayMove(frames, oldIndex, newIndex).map(f => f.id);
      onReorder(newOrder);
    }
  }, [frames, onReorder]);

  const handleSelectAll = useCallback(() => {
    onSelectionChange(new Set(frames.map(f => f.id)));
  }, [frames, onSelectionChange]);

  const handleDeselectAll = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  if (frames.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No frames extracted yet</p>
        <p className={styles.hint}>Load a video to get started</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {selectedIds.size} / {frames.length} selected
        </span>
        <div className={styles.actions}>
          <button onClick={handleSelectAll} className={styles.button}>
            Select All
          </button>
          <button onClick={handleDeselectAll} className={styles.button}>
            Deselect
          </button>
          <button
            onClick={onDuplicateSelected}
            className={styles.button}
            disabled={selectedIds.size === 0}
          >
            Duplicate
          </button>
          {onRevertSelected && (
            <button
              onClick={onRevertSelected}
              className={`${styles.button} ${styles.revertButton}`}
              disabled={!canRevert}
              title="Revert to original"
            >
              Revert
            </button>
          )}
          <button
            onClick={onDeleteSelected}
            className={`${styles.button} ${styles.deleteButton}`}
            disabled={selectedIds.size === 0}
          >
            Delete
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={frames.map(f => f.id)} strategy={rectSortingStrategy}>
            {frames.map(frame => (
              <SortableFrame
                key={frame.id}
                frame={frame}
                isSelected={selectedIds.has(frame.id)}
                isProcessing={processingIds.has(frame.id)}
                onClick={(e) => handleFrameClick(frame.id, e)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
