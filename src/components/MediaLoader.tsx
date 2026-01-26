'use client';

/**
 * MediaLoader - File input with drag-and-drop support for videos and images
 * Supports multiple file selection and displays loaded sources
 */

import React, { useState, useRef, useCallback } from 'react';
import styles from './MediaLoader.module.css';
import { SourceInfo } from '@/types';
import { isImageFile, isVideoFile } from '@/lib/imageLoader';
import { X, Film, Image as ImageIcon, Plus } from 'lucide-react';

interface MediaLoaderProps {
  onFilesSelected: (files: File[]) => void;
  loadedSources: SourceInfo[];
  onRemoveSource: (id: string) => void;
  disabled?: boolean;
}

export function MediaLoader({ 
  onFilesSelected, 
  loadedSources, 
  onRemoveSource,
  disabled = false 
}: MediaLoaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(f => isVideoFile(f) || isImageFile(f));
    
    if (validFiles.length === 0) {
      alert('Please select video or image files');
      return;
    }
    
    onFilesSelected(validFiles);
  }, [onFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
    // Reset input so same files can be selected again
    e.target.value = '';
  }, [handleFiles]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  }, [disabled, handleClick]);

  const totalFrames = loadedSources.reduce((sum, s) => sum + s.frameCount, 0);

  return (
    <div className={styles.container}>
      {/* Loaded sources list */}
      {loadedSources.length > 0 && (
        <div className={styles.sourcesList}>
          <div className={styles.sourcesHeader}>
            <span>Loaded Sources</span>
            <span className={styles.totalFrames}>{totalFrames} frames</span>
          </div>
          {loadedSources.map((source) => (
            <div key={source.id} className={styles.sourceItem}>
              <div 
                className={styles.sourceColor} 
                style={{ backgroundColor: source.color }}
              />
              <div className={styles.sourceIcon}>
                {source.type === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
              </div>
              <div className={styles.sourceInfo}>
                <span className={styles.sourceName}>{source.name}</span>
                <span className={styles.sourceFrames}>{source.frameCount} frames</span>
              </div>
              <button 
                className={styles.removeBtn}
                onClick={() => onRemoveSource(source.id)}
                title="Remove source"
                aria-label={`Remove ${source.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`${styles.dropzone} ${isDragOver ? styles.dragOver : ''} ${disabled ? styles.disabled : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          onChange={handleInputChange}
          className={styles.input}
          disabled={disabled}
        />
        
        <div className={styles.content}>
          <div className={styles.icon}>
            <Plus size={32} />
          </div>
          <p className={styles.title}>
            {loadedSources.length > 0 ? 'Add more files' : 'Drop files here'}
          </p>
          <p className={styles.subtitle}>
            Videos or images • Multiple selection supported
          </p>
        </div>
      </div>
    </div>
  );
}
