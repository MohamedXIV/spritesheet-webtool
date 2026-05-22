'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useEditorContext } from '@/contexts/EditorContext';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  x: number;
  y: number;
  targetType: 'frame' | 'folder' | 'grid';
  targetId: string; // frameId, folderId, or empty
  onClose: () => void;
}

export function ContextMenu({ x, y, targetType, targetId, onClose }: ContextMenuProps) {
  const {
    folders,
    frameState,
    createFolder,
    deleteFolder,
    renameFolder,
    toggleFolderVisibility,
    toggleFolderCollapse,
    moveFrameToFolder,
    moveFramesToFolder,
    copyFramesToFolder,
    handleSelectionChange,
    handleDeleteSelected: handleDeleteSelectedContext,
  } = useEditorContext();

  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  // Safeguard coordinates against viewport overflow
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    // Adjust left if overflowing right
    if (x + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 8;
    }
    // Adjust top if overflowing bottom
    if (y + rect.height > viewportHeight) {
      top = viewportHeight - rect.height - 8;
    }

    // Keep within safe minimum limits
    left = Math.max(8, left);
    top = Math.max(8, top);

    setCoords({ left, top });
  }, [x, y]);

  // Click outside and escape listeners
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Folder helper info
  const targetFolder = targetType === 'folder' 
    ? folders.find(f => f.id === targetId) 
    : targetType === 'grid' 
      ? folders.find(f => f.id === targetId)
      : null;

  // Selected frames info
  const selectedIds = frameState ? Array.from(frameState.selectedIds) : [];
  const selectedCount = selectedIds.length;
  const isTargetSelected = targetType === 'frame' && frameState?.selectedIds.has(targetId);

  // Active folder for single frame target
  const frameFolder = targetType === 'frame'
    ? folders.find(f => f.frameIds.includes(targetId))
    : null;

  // Operation Handlers
  const handleRename = () => {
    if (!targetFolder) return;
    const newName = prompt('Enter a new folder name:', targetFolder.name);
    if (newName && newName.trim()) {
      renameFolder(targetFolder.id, newName.trim());
    }
    onClose();
  };

  const handleDeleteFolderClick = () => {
    if (!targetFolder) return;
    const frameCount = targetFolder.frameIds.length;
    const message = frameCount > 0
      ? `Are you sure you want to delete "${targetFolder.name}" and all its ${frameCount} frames?`
      : `Are you sure you want to delete the folder "${targetFolder.name}"?`;
      
    if (confirm(message)) {
      deleteFolder(targetFolder.id);
    }
    onClose();
  };

  const handleCreateNewFolder = () => {
    const name = prompt('Enter a folder name:');
    if (name && name.trim()) {
      createFolder(name.trim());
    }
    onClose();
  };

  const handleSingleMove = (destFolderId: string) => {
    moveFrameToFolder(targetId, destFolderId);
    onClose();
  };

  const handleBatchMove = (destFolderId: string) => {
    moveFramesToFolder(selectedIds, destFolderId);
    onClose();
  };

  const handleSingleCopy = async (destFolderId: string) => {
    await copyFramesToFolder([targetId], destFolderId);
    onClose();
  };

  const handleBatchCopy = async (destFolderId: string) => {
    await copyFramesToFolder(selectedIds, destFolderId);
    onClose();
  };

  const handleDeleteSelected = () => {
    if (frameState) {
      const { selectedIds: currentSelected } = frameState;
      if (currentSelected.has(targetId)) {
        if (confirm(`Are you sure you want to delete the ${currentSelected.size} selected frames?`)) {
          handleDeleteSelectedContext();
        }
      } else {
        if (confirm('Are you sure you want to delete this frame?')) {
          handleSelectionChange(new Set([targetId]));
          // Wait for state updates to settle, then call delete
          setTimeout(() => {
            handleDeleteSelectedContext();
          }, 0);
        }
      }
    }
    onClose();
  };

  return (
    <div 
      className={styles.menu} 
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      ref={menuRef}
      role="menu"
    >
      {/* 1. FRAME TARGET ACTIONS */}
      {targetType === 'frame' && (
        <>
          {/* Submenus for single frame move/copy */}
          <div 
            className={styles.item}
            onMouseEnter={() => setActiveSubmenu('move-to')}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            <span>📦 Move to folder</span>
            <span className={styles.arrow}>▶</span>
            {activeSubmenu === 'move-to' && (
              <div className={styles.submenu}>
                {folders.map(f => (
                  <button 
                    key={f.id}
                    className={styles.submenuItem}
                    disabled={f.id === frameFolder?.id}
                    onClick={() => handleSingleMove(f.id)}
                  >
                    <span className={styles.colorIndicator} style={{ backgroundColor: f.color }} />
                    <span className={styles.folderName}>{f.name}</span>
                    {f.id === frameFolder?.id && <span className={styles.currentBadge}>current</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div 
            className={styles.item}
            onMouseEnter={() => setActiveSubmenu('copy-to')}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            <span>👥 Copy to folder</span>
            <span className={styles.arrow}>▶</span>
            {activeSubmenu === 'copy-to' && (
              <div className={styles.submenu}>
                {folders.map(f => (
                  <button 
                    key={f.id}
                    className={styles.submenuItem}
                    onClick={() => handleSingleCopy(f.id)}
                  >
                    <span className={styles.colorIndicator} style={{ backgroundColor: f.color }} />
                    <span className={styles.folderName}>{f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Batch operations if frame clicked is part of selection */}
          {selectedCount > 1 && isTargetSelected && (
            <>
              <div className={styles.divider} />
              
              <div 
                className={styles.item}
                onMouseEnter={() => setActiveSubmenu('move-selected')}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <span className={styles.accentText}>📦 Move Selected ({selectedCount})</span>
                <span className={styles.arrow}>▶</span>
                {activeSubmenu === 'move-selected' && (
                  <div className={styles.submenu}>
                    {folders.map(f => (
                      <button 
                        key={f.id}
                        className={styles.submenuItem}
                        onClick={() => handleBatchMove(f.id)}
                      >
                        <span className={styles.colorIndicator} style={{ backgroundColor: f.color }} />
                        <span className={styles.folderName}>{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div 
                className={styles.item}
                onMouseEnter={() => setActiveSubmenu('copy-selected')}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <span className={styles.accentText}>👥 Copy Selected ({selectedCount})</span>
                <span className={styles.arrow}>▶</span>
                {activeSubmenu === 'copy-selected' && (
                  <div className={styles.submenu}>
                    {folders.map(f => (
                      <button 
                        key={f.id}
                        className={styles.submenuItem}
                        onClick={() => handleBatchCopy(f.id)}
                      >
                        <span className={styles.colorIndicator} style={{ backgroundColor: f.color }} />
                        <span className={styles.folderName}>{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className={styles.divider} />
          
          <button className={`${styles.item} ${styles.dangerItem}`} onClick={handleDeleteSelected}>
            <span>🗑️ {selectedCount > 1 && isTargetSelected ? `Delete Selected (${selectedCount})` : 'Delete Frame'}</span>
          </button>
        </>
      )}

      {/* 2. FOLDER HEADER TARGET ACTIONS */}
      {targetType === 'folder' && targetFolder && (
        <>
          <div className={styles.headerInfo}>
            <span className={styles.colorIndicator} style={{ backgroundColor: targetFolder.color }} />
            <span className={styles.targetTitle}>{targetFolder.name}</span>
          </div>
          <div className={styles.divider} />

          <button className={styles.item} onClick={() => { toggleFolderCollapse(targetFolder.id); onClose(); }}>
            <span>{targetFolder.collapsed ? '📂 Expand Folder' : '📁 Collapse Folder'}</span>
          </button>
          
          <button className={styles.item} onClick={() => { toggleFolderVisibility(targetFolder.id); onClose(); }}>
            <span>{targetFolder.visible ? '👁️ Hide Folder' : '👁️ Show Folder'}</span>
          </button>

          <button className={styles.item} onClick={handleRename}>
            <span>✏️ Rename Folder</span>
          </button>

          <div className={styles.divider} />

          <button className={styles.item} onClick={handleCreateNewFolder}>
            <span>➕ Create New Folder</span>
          </button>

          <div className={styles.divider} />

          <button 
            className={`${styles.item} ${styles.dangerItem}`} 
            onClick={handleDeleteFolderClick}
            disabled={folders.length <= 1}
            title={folders.length <= 1 ? "Cannot delete the last remaining folder" : ""}
          >
            <span>🗑️ Delete Folder</span>
          </button>
        </>
      )}

      {/* 3. GRID EMPTY SPACE TARGET ACTIONS */}
      {targetType === 'grid' && targetFolder && (
        <>
          <div className={styles.headerInfo}>
            <span className={styles.targetTitle}>Folder: {targetFolder.name}</span>
          </div>
          <div className={styles.divider} />

          {selectedCount > 0 && (
            <>
              <button className={styles.item} onClick={() => handleBatchMove(targetFolder.id)}>
                <span>📦 Move Selected ({selectedCount}) Here</span>
              </button>
              
              <button className={styles.item} onClick={() => handleBatchCopy(targetFolder.id)}>
                <span>👥 Copy Selected ({selectedCount}) Here</span>
              </button>

              <div className={styles.divider} />
            </>
          )}

          <button className={styles.item} onClick={handleCreateNewFolder}>
            <span>➕ Create New Folder</span>
          </button>
        </>
      )}
    </div>
  );
}
