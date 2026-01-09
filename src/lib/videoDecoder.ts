/**
 * Video Decoder - Extracts frames from video files
 * Uses WebCodecs API when available, falls back to <video> + canvas
 */

import { FrameData, ExtractionProgress, DecoderType, VideoInfo } from '@/types';

// Generate unique IDs for frames
let frameIdCounter = 0;
function generateFrameId(): string {
  return `frame-${Date.now()}-${frameIdCounter++}`;
}

/**
 * Check if WebCodecs API is available
 */
export function isWebCodecsSupported(): boolean {
  return typeof window !== 'undefined' && 'VideoDecoder' in window;
}

/**
 * Get video metadata using HTML5 video element
 */
export async function getVideoInfo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      
      // Estimate FPS (common values: 24, 30, 60)
      // We'll refine this during extraction
      const estimatedFps = 30;
      const frameCount = Math.floor(duration * estimatedFps);
      
      URL.revokeObjectURL(video.src);
      resolve({
        width,
        height,
        duration,
        frameCount,
        fps: estimatedFps
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Extract frames using the fallback method (video + canvas)
 * Works in all browsers but is slower
 */
export async function extractFramesFallback(
  file: File,
  targetFps: number = 12,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<FrameData[]> {
  const videoInfo = await getVideoInfo(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  
  const frames: FrameData[] = [];
  const frameInterval = 1 / targetFps;
  const totalFrames = Math.floor(videoInfo.duration * targetFps);
  
  return new Promise((resolve, reject) => {
    video.onloadeddata = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = videoInfo.width;
      canvas.height = videoInfo.height;
      const ctx = canvas.getContext('2d')!;
      
      try {
        for (let i = 0; i < totalFrames; i++) {
          const timestamp = i * frameInterval;
          
          // Seek to timestamp
          await seekVideo(video, timestamp);
          
          // Draw frame to canvas
          ctx.drawImage(video, 0, 0);
          
          // Create ImageBitmap from canvas
          const bitmap = await createImageBitmap(canvas);
          
          frames.push({
            id: generateFrameId(),
            index: i,
            timestamp,
            bitmap
          });
          
          onProgress?.({
            current: i + 1,
            total: totalFrames,
            percentage: Math.round(((i + 1) / totalFrames) * 100)
          });
        }
        
        URL.revokeObjectURL(video.src);
        resolve(frames);
      } catch (error) {
        URL.revokeObjectURL(video.src);
        reject(error);
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
    
    video.src = URL.createObjectURL(file);
    video.load();
  });
}

/**
 * Seek video to specific timestamp
 */
function seekVideo(video: HTMLVideoElement, timestamp: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = timestamp;
  });
}

/**
 * Extract frames using WebCodecs API (faster, but not universally supported)
 */
export async function extractFramesWebCodecs(
  file: File,
  targetFps: number = 12,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<FrameData[]> {
  if (!isWebCodecsSupported()) {
    throw new Error('WebCodecs not supported');
  }
  
  const videoInfo = await getVideoInfo(file);
  const frames: FrameData[] = [];
  const frameInterval = 1 / targetFps;
  const totalFrames = Math.floor(videoInfo.duration * targetFps);
  
  // For WebCodecs, we need to demux the video first
  // This is complex and requires additional libraries like mp4box.js
  // For MVP, we'll use a simplified approach with video element seeking
  // but process with OffscreenCanvas if available
  
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  
  return new Promise((resolve, reject) => {
    video.onloadeddata = async () => {
      // Use OffscreenCanvas if available for better performance
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(videoInfo.width, videoInfo.height);
        ctx = canvas.getContext('2d')!;
      } else {
        canvas = document.createElement('canvas');
        canvas.width = videoInfo.width;
        canvas.height = videoInfo.height;
        ctx = canvas.getContext('2d')!;
      }
      
      try {
        for (let i = 0; i < totalFrames; i++) {
          const timestamp = i * frameInterval;
          
          await seekVideo(video, timestamp);
          ctx.drawImage(video, 0, 0);
          
          const bitmap = await createImageBitmap(canvas as ImageBitmapSource);
          
          frames.push({
            id: generateFrameId(),
            index: i,
            timestamp,
            bitmap
          });
          
          onProgress?.({
            current: i + 1,
            total: totalFrames,
            percentage: Math.round(((i + 1) / totalFrames) * 100)
          });
        }
        
        URL.revokeObjectURL(video.src);
        resolve(frames);
      } catch (error) {
        URL.revokeObjectURL(video.src);
        reject(error);
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
    
    video.src = URL.createObjectURL(file);
    video.load();
  });
}

/**
 * Main extraction function - automatically chooses best method
 */
export async function extractFrames(
  file: File,
  targetFps: number = 12,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<{ frames: FrameData[]; decoderType: DecoderType }> {
  const decoderType: DecoderType = isWebCodecsSupported() ? 'webcodecs' : 'fallback';
  
  const frames = decoderType === 'webcodecs'
    ? await extractFramesWebCodecs(file, targetFps, onProgress)
    : await extractFramesFallback(file, targetFps, onProgress);
  
  return { frames, decoderType };
}
