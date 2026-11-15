'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FrameData } from '@/types';
import { removeBackgroundByColor, autoDetectBackgroundColor } from '@/lib/chromaKey';
import { removeBackgroundAI, probeWebGPU, AI_MODEL_ESTIMATES, type AiProgress } from '@/lib/aiBackgroundRemoval';
import { addOutline } from '@/lib/outlineGenerator';
import type { EdgeStyle } from '@/lib/backgroundMask';
import styles from './BackgroundRemovalPanel.module.css';

interface Props {
  frames: FrameData[];
  selectedIds: Set<string>;
  onFramesProcessed: (processedFrames: Map<string, ImageBitmap>) => void;
  onProcessingChange?: (processingIds: Set<string>) => void;
}

type Method = 'color' | 'ai';
type PreviewBatch = {
  results: Map<string, ImageBitmap>;
  originals: Map<string, ImageBitmap>;
  elapsedMs: number;
  frameMs: number[];
};

function imageUrl(bitmap: ImageBitmap): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas preview is not supported.'));
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) reject(new Error('Could not create preview.'));
    else resolve(URL.createObjectURL(blob));
  }, 'image/png'));
}

const waitForPaint = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const stageLabels: Record<AiProgress['stage'], string> = {
  download: 'Downloading AI resources',
  initializing: 'Loading AI engine',
  inference: 'Removing background',
  compositing: 'Finishing the sprite',
};

export function BackgroundRemovalPanel({ frames, selectedIds, onFramesProcessed, onProcessingChange }: Props) {
  const [method, setMethod] = useState<Method>('color');
  const [targetColor, setTargetColor] = useState({ r: 0, g: 255, b: 0 });
  const [tolerance, setTolerance] = useState(30);
  const [edgeSoftness, setEdgeSoftness] = useState(5);
  const [spillSuppression, setSpillSuppression] = useState(true);
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>('soft');
  const [erosion, setErosion] = useState(0);
  const [decontaminate, setDecontaminate] = useState(false);
  const [forceCpu, setForceCpu] = useState(false);
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [outlineEnabled, setOutlineEnabled] = useState(false);
  const [outlineThickness, setOutlineThickness] = useState(2);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stage, setStage] = useState('');
  const [resourceProgress, setResourceProgress] = useState<number | undefined>();
  const [error, setError] = useState('');
  const [gpuFailed, setGpuFailed] = useState(false);
  const [previewBatch, setPreviewBatch] = useState<PreviewBatch | null>(null);
  const [previewId, setPreviewId] = useState('');
  const [previewUrls, setPreviewUrls] = useState<{ before: string; after: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const batchRef = useRef<PreviewBatch | null>(null);

  const chosenFrames = useMemo(
    () => frames.filter(frame => selectedIds.size === 0 || selectedIds.has(frame.id)),
    [frames, selectedIds],
  );

  useEffect(() => {
    let live = true;
    void probeWebGPU().then(available => { if (live) setGpuAvailable(available); });
    return () => { live = false; };
  }, []);
  useEffect(() => () => {
    abortRef.current?.abort();
    batchRef.current?.results.forEach(bitmap => bitmap.close());
  }, []);

  useEffect(() => {
    const frame = frames.find(item => item.id === previewId);
    const result = previewBatch?.results.get(previewId);
    if (!frame || !result) return;
    let cancelled = false;
    let urls: string[] = [];
    void Promise.all([imageUrl(frame.bitmap), imageUrl(result)]).then(([before, after]) => {
      urls = [before, after];
      if (!cancelled) setPreviewUrls({ before, after });
      else urls.forEach(URL.revokeObjectURL);
    }).catch(() => { if (!cancelled) setError('Could not render the preview.'); });
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
      setPreviewUrls(null);
    };
  }, [frames, previewBatch, previewId]);

  const discard = useCallback(() => {
    batchRef.current?.results.forEach(bitmap => bitmap.close());
    batchRef.current = null;
    setPreviewBatch(null);
    setPreviewId('');
  }, []);

  const autoDetect = async () => {
    if (!chosenFrames.length) return;
    try { setTargetColor(await autoDetectBackgroundColor(chosenFrames[0].bitmap)); }
    catch { setError('Could not detect a background color from this frame.'); }
  };

  const start = async () => {
    if (busy || !chosenFrames.length) return;
    discard();
    setError('');
    setGpuFailed(false);
    setBusy(true);
    setDoneCount(0);
    setTotalCount(chosenFrames.length);
    setResourceProgress(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    const results = new Map<string, ImageBitmap>();
    const originals = new Map<string, ImageBitmap>();
    const frameMs: number[] = [];
    const batchStart = performance.now();
    const backend = gpuAvailable && !forceCpu ? 'gpu' : 'cpu';

    try {
      for (const [index, frame] of chosenFrames.entries()) {
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        originals.set(frame.id, frame.bitmap);
        onProcessingChange?.(new Set([frame.id]));
        setStage(`Frame ${index + 1}/${chosenFrames.length}`);
        setResourceProgress(undefined);
        await waitForPaint();
        const frameStart = performance.now();

        let output: ImageBitmap;
        if (method === 'color') {
          output = await removeBackgroundByColor(frame.bitmap, {
            targetColor, tolerance, edgeSoftness, spillSuppression,
            spillMethod: 'cap', spillAmount: 80,
          });
        } else {
          output = await removeBackgroundAI(frame.bitmap, {
            signal: controller.signal,
            backend,
            refinement: { edgeStyle, erosion, decontaminate },
            progress: ({ stage: aiStage, fraction }) => {
              setStage(`${stageLabels[aiStage]}${aiStage === 'download' && fraction !== undefined ? ` (${Math.round(fraction * 100)}% of current file)` : ''} · Frame ${index + 1}/${chosenFrames.length}`);
              setResourceProgress(aiStage === 'download' ? fraction : undefined);
            },
          });
        }

        if (controller.signal.aborted) {
          output.close();
          throw new DOMException('Cancelled', 'AbortError');
        }
        if (outlineEnabled) {
          try {
            const outlined = await addOutline(output, {
              enabled: true, thickness: outlineThickness, color: outlineColor, position: 'outside',
            });
            output.close();
            output = outlined;
          } catch (cause) {
            output.close();
            throw cause;
          }
        }
        results.set(frame.id, output);
        frameMs.push(performance.now() - frameStart);
        setDoneCount(index + 1);
        onProcessingChange?.(new Set());
      }

      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const batch = { results, originals, elapsedMs: performance.now() - batchStart, frameMs };
      batchRef.current = batch;
      setPreviewBatch(batch);
      setPreviewId(chosenFrames[0].id);
      setStage('Preview ready. No project frames have changed.');
    } catch (cause) {
      results.forEach(bitmap => bitmap.close());
      if (controller.signal.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) {
        setStage('Cancelled. Original frames are unchanged.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Background removal failed.');
        if (method === 'ai' && backend === 'gpu') setGpuFailed(true);
        setStage('Processing stopped. Original frames are unchanged.');
      }
    } finally {
      onProcessingChange?.(new Set());
      abortRef.current = null;
      setBusy(false);
      setResourceProgress(undefined);
    }
  };

  const apply = () => {
    const batch = batchRef.current;
    if (!batch) return;
    // A long-running preview must never overwrite a project edited since it began.
    if (Array.from(batch.originals).some(([id, bitmap]) => !frames.some(f => f.id === id && f.bitmap === bitmap))) {
      setError('Frames changed after processing. Discard this preview and run again.');
      return;
    }
    batchRef.current = null;
    setPreviewBatch(null);
    setPreviewId('');
    onFramesProcessed(batch.results);
    setStage(`${batch.results.size} frame(s) applied. Use Undo to restore them.`);
  };

  const colorHex = `#${[targetColor.r, targetColor.g, targetColor.b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  const backend = gpuAvailable && !forceCpu ? 'gpu' : 'cpu';

  return (
    <section className={styles.container} aria-label="Background removal">
      <h3 className={styles.title}>Background Removal</h3>
      <div className={styles.methodTabs} role="group" aria-label="Removal method">
        <button type="button" className={`${styles.tab} ${method === 'color' ? styles.active : ''}`} aria-pressed={method === 'color'} disabled={busy} onClick={() => { discard(); setMethod('color'); }}>Color Key</button>
        <button type="button" className={`${styles.tab} ${method === 'ai' ? styles.active : ''}`} aria-pressed={method === 'ai'} disabled={busy} onClick={() => { discard(); setMethod('ai'); }}>AI Background Removal</button>
      </div>

      {method === 'color' ? (
        <div className={styles.settings}>
          <p className={styles.help}>Instant, offline removal for solid-color backgrounds. No model download.</p>
          <div className={styles.field}>
            <label htmlFor="background-color">Background color</label>
            <div className={styles.colorRow}>
              <input id="background-color" type="color" value={colorHex} disabled={busy} onChange={event => {
                const value = event.target.value;
                setTargetColor({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) });
              }} />
              <button type="button" className={styles.secondaryButton} onClick={autoDetect} disabled={busy || !chosenFrames.length}>Detect from corners</button>
            </div>
          </div>
          <label className={styles.field} htmlFor="key-tolerance">Tolerance: {tolerance}%
            <input id="key-tolerance" type="range" min="0" max="100" value={tolerance} disabled={busy} onChange={e => setTolerance(Number(e.target.value))} />
          </label>
          <label className={styles.field} htmlFor="key-softness">Edge softness: {edgeSoftness}
            <input id="key-softness" type="range" min="0" max="20" value={edgeSoftness} disabled={busy} onChange={e => setEdgeSoftness(Number(e.target.value))} />
          </label>
          <label className={styles.checkbox}><input type="checkbox" checked={spillSuppression} disabled={busy} onChange={e => setSpillSuppression(e.target.checked)} /> Suppress background-color spill</label>
        </div>
      ) : (
        <div className={styles.settings}>
          <p className={styles.help}>For illustrated characters, photographs, and complex backgrounds. Processing stays in your browser.</p>
          <div className={styles.infoBox}>
            <strong>{backend === 'gpu' ? 'WebGPU acceleration' : 'CPU / WebAssembly fallback'}</strong>
            <span>First use downloads {AI_MODEL_ESTIMATES[backend]}; browser caching usually avoids downloading it again.</span>
            {!gpuAvailable && <span>WebGPU is not available in this browser or context.</span>}
          </div>
          {gpuAvailable && <label className={styles.checkbox}><input type="checkbox" checked={forceCpu} disabled={busy} onChange={e => { discard(); setForceCpu(e.target.checked); }} /> Use CPU fallback (smaller download, usually slower)</label>}
          <label className={styles.field} htmlFor="edge-style">Edges
            <select id="edge-style" disabled={busy} value={edgeStyle} onChange={e => setEdgeStyle(e.target.value as EdgeStyle)}>
              <option value="soft">Soft (illustrations, hair, photos)</option>
              <option value="pixel">Crisp (pixel art)</option>
            </select>
          </label>
          <details className={styles.details}>
            <summary>Optional edge cleanup</summary>
            <label className={styles.field} htmlFor="mask-erosion">Erosion: {erosion}px
              <input id="mask-erosion" type="range" min="0" max="3" value={erosion} disabled={busy} onChange={e => setErosion(Number(e.target.value))} />
            </label>
            <label className={styles.checkbox}><input type="checkbox" checked={decontaminate} disabled={busy || edgeStyle === 'pixel'} onChange={e => setDecontaminate(e.target.checked)} /> Color cleanup for translucent edges</label>
          </details>
        </div>
      )}

      <details className={styles.details}>
        <summary>Optional sprite outline</summary>
        <label className={styles.checkbox}><input type="checkbox" checked={outlineEnabled} disabled={busy} onChange={e => setOutlineEnabled(e.target.checked)} /> Add outer outline</label>
        {outlineEnabled && <div className={styles.settings}>
          <label className={styles.field} htmlFor="outline-thickness">Thickness: {outlineThickness}px
            <input id="outline-thickness" type="range" min="1" max="8" value={outlineThickness} disabled={busy} onChange={e => setOutlineThickness(Number(e.target.value))} />
          </label>
          <label className={styles.field} htmlFor="outline-color">Outline color
            <input id="outline-color" type="color" value={outlineColor} disabled={busy} onChange={e => setOutlineColor(e.target.value)} />
          </label>
        </div>}
      </details>

      {(busy || stage) && <div className={styles.progressSection} role="status" aria-live="polite">
        <div className={styles.progressText}>{stage}</div>
        {busy && <progress aria-label="Completed frames" max={totalCount} value={doneCount} className={styles.progressBar} />}
        {busy && resourceProgress !== undefined && <progress aria-label="Current AI resource download" max={1} value={resourceProgress} className={styles.progressBar} />}
        {busy && <button type="button" className={styles.secondaryButton} onClick={() => { abortRef.current?.abort(); setStage('Cancelling after the current frame…'); }}>Cancel batch</button>}
      </div>}
      {error && <div className={styles.error} role="alert">{error}
        {gpuFailed && <button type="button" className={styles.secondaryButton} onClick={() => { setForceCpu(true); setGpuFailed(false); setError(''); }}>Try CPU fallback (~40 MB)</button>}
      </div>}

      {previewBatch && <div className={styles.previewSection}>
        <div className={styles.previewHeading}>Review before applying</div>
        <p className={styles.help}>
          {`Batch ${(previewBatch.elapsedMs / 1000).toFixed(2)}s · First frame ${(previewBatch.frameMs[0] / 1000).toFixed(2)}s`}
          {previewBatch.frameMs.length > 1 && ` · Subsequent avg ${(previewBatch.frameMs.slice(1).reduce((sum, ms) => sum + ms, 0) / (previewBatch.frameMs.length - 1) / 1000).toFixed(2)}s`}
        </p>
        <label className={styles.field} htmlFor="preview-frame">Preview frame
          <select id="preview-frame" value={previewId} onChange={e => { setPreviewUrls(null); setPreviewId(e.target.value); }}>
            {Array.from(previewBatch.results.keys()).map((id, index) => <option key={id} value={id}>Frame {index + 1}</option>)}
          </select>
        </label>
        <div className={styles.previewGrid}>
          <figure><figcaption>Original</figcaption><div className={styles.checker}>{previewUrls && <img alt="Original frame" src={previewUrls.before} />}</div></figure>
          <figure><figcaption>Background removed</figcaption><div className={styles.checker}>{previewUrls && <img alt="Processed frame preview" src={previewUrls.after} />}</div></figure>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={apply}>Apply {previewBatch.results.size} frame(s)</button>
          <button type="button" className={styles.secondaryButton} onClick={() => { discard(); setStage('Preview discarded. Original frames are unchanged.'); }}>Discard</button>
        </div>
      </div>}

      {!previewBatch && <button type="button" className={styles.primaryButton} onClick={start} disabled={busy || chosenFrames.length === 0}>
        {busy ? `Processing ${doneCount}/${totalCount} frames` : `Preview ${chosenFrames.length} frame(s)`}
      </button>}
      <p className={styles.hint}>{selectedIds.size ? `${chosenFrames.length} selected frame(s)` : 'All frames'} · Changes apply only after confirmation. Undo remains available.</p>
    </section>
  );
}
