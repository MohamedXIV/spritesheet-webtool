'use client';

/**
 * FrameGrid - Displays extracted frames with selection, folders, and reordering
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  Plus,
  GripVertical,
  Check,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  X
} from 'lucide-react';
import { useEditorContext } from '@/contexts/EditorContext';
import { FrameData, Folder, SOURCE_COLORS } from '@/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import gsap from 'gsap';
import styles from './FrameGrid.module.css';

interface SortableFrameProps {
  frame: FrameData;
  isSelected: boolean;
  isProcessing: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function SortableFrame({ frame, isSelected, isProcessing, onClick }: SortableFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { folders, moveFrameToFolder } = useEditorContext();
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
      if (frame.bitmap.width === 0 || frame.bitmap.height === 0) return;

      // Calculate thumbnail size maintaining aspect ratio
      const maxSize = 120;
      const scale = Math.min(maxSize / frame.bitmap.width, maxSize / frame.bitmap.height);
      canvas.width = frame.bitmap.width * scale;
      canvas.height = frame.bitmap.height * scale;

      ctx.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
    } catch {
      // Bitmap may have been closed
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
      
      {/* Folder Move Dropdown Overlay */}
      <div className={styles.moveOverlay} onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={styles.moveButton} title="Move to Folder">
              <FolderIcon size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={styles.dropdownContent}>
            <DropdownMenuLabel className={styles.dropdownLabel}>Move to Folder</DropdownMenuLabel>
            <DropdownMenuSeparator className={styles.dropdownSeparator} />
            {folders.map(fold => (
              <DropdownMenuItem
                key={fold.id}
                onClick={(e) => {
                  e.stopPropagation();
                  moveFrameToFolder(frame.id, fold.id);
                }}
                className={styles.dropdownItem}
              >
                <span className={styles.colorIndicator} style={{ backgroundColor: fold.color }} />
                {fold.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isProcessing && (
        <div className={styles.spinnerOverlay}>
          <div className={styles.spinner} />
        </div>
      )}
    </div>
  );
}

interface FolderSectionProps {
  folder: Folder;
  frames: FrameData[];
  selectedIds: Set<string>;
  processingIds: Set<string>;
  editingFolderId: string | null;
  renameValue: string;
  setEditingFolderId: (id: string | null) => void;
  setRenameValue: (val: string) => void;
  onFrameClick: (frameId: string, e: React.MouseEvent) => void;
}

function FolderSection({
  folder,
  frames,
  selectedIds,
  processingIds,
  editingFolderId,
  renameValue,
  setEditingFolderId,
  setRenameValue,
  onFrameClick,
}: FolderSectionProps) {
  const {
    renameFolder,
    toggleFolderVisibility,
    toggleFolderCollapse,
    deleteFolder,
    reorderFramesInFolder,
  } = useEditorContext();

  const contentRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const isEditing = editingFolderId === folder.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id });

  const folderStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    '--folder-theme-color': folder.color,
  } as React.CSSProperties;

  // Resolve frames belonging to this folder in their correct order
  const folderFrames = folder.frameIds
    .map(id => frames.find(f => f.id === id))
    .filter((f): f is FrameData => f !== undefined);

  // GSAP Accordion Collapse/Expand Animation
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (folder.collapsed) {
        gsap.set(el, { height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' });
      } else {
        gsap.set(el, { height: 'auto', opacity: 1, overflow: 'visible', pointerEvents: 'auto' });
      }
      return;
    }

    if (folder.collapsed) {
      gsap.killTweensOf(el);
      gsap.to(el, {
        height: 0,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.inOut',
        overflow: 'hidden',
        pointerEvents: 'none'
      });
    } else {
      gsap.killTweensOf(el);
      // Temporarily expand to measure full scroll height
      gsap.set(el, { height: 'auto', opacity: 1, overflow: 'hidden', pointerEvents: 'auto' });
      const height = el.scrollHeight;
      
      gsap.fromTo(el,
        { height: 0, opacity: 0 },
        {
          height,
          opacity: 1,
          duration: 0.35,
          ease: 'power2.inOut',
          clearProps: 'height',
          onComplete: () => {
            gsap.set(el, { overflow: 'visible' });
          }
        }
      );
    }
  }, [folder.collapsed]);

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

  const handleFrameDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = folder.frameIds.indexOf(active.id as string);
      const newIndex = folder.frameIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderFramesInFolder(folder.id, oldIndex, newIndex);
      }
    }
  };

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderId(folder.id);
    setRenameValue(folder.name);
  };

  const handleSaveRename = () => {
    if (renameValue.trim() && renameValue.trim() !== folder.name) {
      renameFolder(folder.id, renameValue.trim());
    }
    setEditingFolderId(null);
  };

  return (
    <div ref={setNodeRef} style={folderStyle} className={`${styles.folderSection} ${!folder.visible ? styles.folderHidden : ''}`}>
      {/* Folder Header */}
      <div 
        className={styles.folderHeader} 
        style={{ borderLeftColor: folder.color }}
        onClick={() => toggleFolderCollapse(folder.id)}
      >
        <div className={styles.folderHeaderLeft} onClick={e => e.stopPropagation()}>
          <button 
            className={styles.dragHandle} 
            title="Drag to rearrange folders"
            {...attributes} 
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
          
          <button 
            className={styles.chevronToggle} 
            onClick={() => toggleFolderCollapse(folder.id)}
            title={folder.collapsed ? 'Expand' : 'Collapse'}
          >
            {folder.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>

          <span className={styles.folderIconWrapper} style={{ color: folder.color }}>
            {folder.collapsed ? <FolderIcon size={16} /> : <FolderOpen size={16} />}
          </span>

          {isEditing ? (
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setEditingFolderId(null);
              }}
              className={styles.renameInput}
              autoFocus
            />
          ) : (
            <span 
              className={styles.folderName} 
              onDoubleClick={handleStartRename}
              title="Double click to rename"
            >
              {folder.name}
            </span>
          )}

          <span className={styles.folderCount}>
            {folderFrames.length} {folderFrames.length === 1 ? 'frame' : 'frames'}
          </span>
        </div>

        <div className={styles.folderHeaderRight} onClick={e => e.stopPropagation()}>
          <button 
            onClick={handleStartRename} 
            className={styles.headerButton}
            title="Rename Folder"
          >
            <Edit2 size={13} />
          </button>
          
          <button 
            onClick={() => toggleFolderVisibility(folder.id)} 
            className={`${styles.headerButton} ${!folder.visible ? styles.activeHide : ''}`}
            title={folder.visible ? 'Hide Folder' : 'Show Folder'}
          >
            {folder.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          <button 
            onClick={() => {
              if (confirm(`Are you sure you want to delete folder "${folder.name}" and all its frames?`)) {
                deleteFolder(folder.id);
              }
            }} 
            className={`${styles.headerButton} ${styles.deleteFolderButton}`}
            title="Delete Folder"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Folder Accordion Body */}
      <div ref={contentRef} className={styles.folderContent}>
        {folderFrames.length === 0 ? (
          <div className={styles.folderEmpty}>
            No frames in this folder.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFrameDragEnd}
          >
            <SortableContext items={folder.frameIds} strategy={rectSortingStrategy}>
              <div className={styles.grid}>
                {folderFrames.map(frame => (
                  <SortableFrame
                    key={frame.id}
                    frame={frame}
                    isSelected={selectedIds.has(frame.id)}
                    isProcessing={processingIds.has(frame.id)}
                    onClick={(e) => onFrameClick(frame.id, e)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

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
  const {
    folders,
    createFolder,
    reorderFolders,
    moveFrameToFolder,
    frameState
  } = useEditorContext();

  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // New folder creation state
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Fallback flat frames in case context is loading
  const allFrames = frameState ? frameState.frames : frames;

  const folderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleFrameClick = useCallback((frameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newSelection = new Set(selectedIds);

    if (e.shiftKey && lastClickedId) {
      // Range selection based on current visible order
      const frameIds = frames.map((f: FrameData) => f.id);
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

  const handleSelectAll = useCallback(() => {
    onSelectionChange(new Set(frames.map((f: FrameData) => f.id)));
  }, [frames, onSelectionChange]);

  const handleDeselectAll = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const handleFolderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = folders.findIndex(f => f.id === active.id);
      const newIndex = folders.findIndex(f => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderFolders(oldIndex, newIndex);
      }
    }
  };

  if (allFrames.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No frames extracted yet</p>
        <p className={styles.hint}>Load a video or image file to get started</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {selectedIds.size} / {frames.length} frames active & selected
        </span>
        <div className={styles.actions}>
          <button onClick={handleSelectAll} className={styles.button}>
            Select All
          </button>
          <button onClick={handleDeselectAll} className={styles.button}>
            Deselect
          </button>
          
          {/* Batch Move Dropdown */}
          {selectedIds.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={styles.button}>
                  Move Selected ({selectedIds.size})
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={styles.dropdownContent}>
                <DropdownMenuLabel className={styles.dropdownLabel}>Move Selected to:</DropdownMenuLabel>
                <DropdownMenuSeparator className={styles.dropdownSeparator} />
                {folders.map(fold => (
                  <DropdownMenuItem
                    key={fold.id}
                    onClick={() => {
                      selectedIds.forEach((id: string) => {
                        moveFrameToFolder(id, fold.id);
                      });
                    }}
                    className={styles.dropdownItem}
                  >
                    <span className={styles.colorIndicator} style={{ backgroundColor: fold.color }} />
                    {fold.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isCreatingFolder ? (
            <form onSubmit={handleCreateFolderSubmit} className={styles.createFolderForm}>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className={styles.folderInput}
                autoFocus
              />
              <button type="submit" className={styles.iconButton} title="Create">
                <Check size={14} />
              </button>
              <button type="button" onClick={() => setIsCreatingFolder(false)} className={styles.iconButton} title="Cancel">
                <X size={14} />
              </button>
            </form>
          ) : (
            <button onClick={() => setIsCreatingFolder(true)} className={`${styles.button} ${styles.createFolderBtn}`}>
              <FolderPlus size={14} style={{ marginRight: '4px' }} />
              New Folder
            </button>
          )}

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
            Delete Selected
          </button>
        </div>
      </div>

      {/* Folders List with Drag and Drop */}
      <div className={styles.folderList}>
        <DndContext
          sensors={folderSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleFolderDragEnd}
        >
          <SortableContext items={folders.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {folders.map(folder => (
              <FolderSection
                key={folder.id}
                folder={folder}
                frames={allFrames}
                selectedIds={selectedIds}
                processingIds={processingIds}
                editingFolderId={editingFolderId}
                renameValue={renameValue}
                setEditingFolderId={setEditingFolderId}
                setRenameValue={setRenameValue}
                onFrameClick={handleFrameClick}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
