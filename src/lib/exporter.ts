/**
 * Exporter - Handles PNG and JSON export with download functionality
 */

import { SpritesheetMetadata } from '@/types';

/**
 * Convert canvas to PNG blob
 */
export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create PNG blob'));
        }
      },
      'image/png',
      1.0
    );
  });
}

/**
 * Convert metadata to JSON blob
 */
export function metadataToJsonBlob(metadata: SpritesheetMetadata): Blob {
  const json = JSON.stringify(metadata, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Trigger download of a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export spritesheet as PNG
 */
export async function exportSpritesheetPng(
  canvas: HTMLCanvasElement,
  filename: string = 'spritesheet.png'
): Promise<void> {
  const blob = await canvasToPngBlob(canvas);
  downloadBlob(blob, filename);
}

/**
 * Export metadata as JSON
 */
export function exportMetadataJson(
  metadata: SpritesheetMetadata,
  filename: string = 'spritesheet.json'
): void {
  const blob = metadataToJsonBlob(metadata);
  downloadBlob(blob, filename);
}

/**
 * Export both spritesheet and metadata
 */
export async function exportAll(
  canvas: HTMLCanvasElement,
  metadata: SpritesheetMetadata,
  baseName: string = 'spritesheet'
): Promise<void> {
  await exportSpritesheetPng(canvas, `${baseName}.png`);
  exportMetadataJson(metadata, `${baseName}.json`);
}

/**
 * Generate a preview data URL (for display purposes)
 */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}
