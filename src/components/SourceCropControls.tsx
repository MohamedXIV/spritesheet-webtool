'use client';

import { useEffect, useState } from 'react';
import type { FrameData } from '@/types';
import type { SourceSheetAsset } from '@/lib/sourceSheetAssets';
import styles from './SourceCropControls.module.css';

type CropDraft = { x: number; y: number; width: number; height: number };

export function SourceCropControls({
  frame, asset, onApply,
}: {
  frame: FrameData;
  asset: SourceSheetAsset | undefined;
  onApply: (frameId: string, crop: CropDraft) => Promise<void>;
}) {
  const crop = frame.sourceCrop;
  const [draft, setDraft] = useState<CropDraft>(
    crop ? { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
      : { x: 0, y: 0, width: 1, height: 1 }
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (crop) setDraft({ x: crop.x, y: crop.y, width: crop.width, height: crop.height });
  }, [frame.id, crop?.x, crop?.y, crop?.width, crop?.height]);

  useEffect(() => {
    if (!asset) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(asset.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [asset?.blob]);

  if (!crop) return null;
  const locked = crop.baseModified === true;
  const canApply = !!asset && !locked && !applying &&
    [draft.x, draft.y, draft.width, draft.height].every(Number.isSafeInteger) &&
    draft.x >= 0 && draft.y >= 0 && draft.x < asset.width && draft.y < asset.height &&
    draft.width >= 1 && draft.height >= 1 && draft.width <= 4096 && draft.height <= 4096;

  const coordinates: Array<{ name: keyof CropDraft; label: string; max: number }> = [
    { name: 'x', label: 'X', max: asset ? asset.width - 1 : 0 },
    { name: 'y', label: 'Y', max: asset ? asset.height - 1 : 0 },
    { name: 'width', label: 'Width', max: 4096 },
    { name: 'height', label: 'Height', max: 4096 },
  ];

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        Adjust Source Crop · X:{crop.x} Y:{crop.y} · {crop.width}×{crop.height}
      </summary>
      <div className={styles.body}>
        <p className={styles.hint}>
          Crop the ORIGINAL spritesheet, not the previously clipped frame. This
          leaves the original image and all other animation frames untouched.
          Undo restores the previous region.
        </p>
        {asset && previewUrl && (
          <div className={styles.preview} aria-label="Original source with selected crop region">
            {/* Parent dimensions follow original image aspect ratio. */}
            <div className={styles.imageShell} style={{ aspectRatio: `${asset.width} / ${asset.height}` }}>
              <img src={previewUrl} alt={`Original spritesheet: ${asset.name}`} draggable={false} />
              <div className={styles.cropOutline} aria-hidden="true"
                style={{
                  left: `${(draft.x / asset.width) * 100}%`,
                  top: `${(draft.y / asset.height) * 100}%`,
                  width: `${(draft.width / asset.width) * 100}%`,
                  height: `${(draft.height / asset.height) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        <div className={styles.fields}>
          {coordinates.map(({ name, label, max }) => (
            <label className={styles.field} key={name}>
              {label}
              <input type="number" step={1} min={name === 'x' || name === 'y' ? 0 : 1}
                max={max} value={draft[name]} disabled={locked || applying || !asset}
                onChange={event => setDraft(previous => ({
                  ...previous, [name]: event.target.value === '' ? NaN : Number(event.target.value),
                }))} />
            </label>
          ))}
        </div>
        {locked && (
          <p className={styles.warning} role="status">
            This frame's source layer has already been edited or processed.
            Create a new slice variant to correct its crop without losing that work.
          </p>
        )}
        {!asset && <p className={styles.warning} role="status">Original spritesheet is unavailable.</p>}
        <div className={styles.actions}>
          <button type="button" disabled={!canApply} onClick={async () => {
            setApplying(true);
            try { await onApply(frame.id, draft); }
            finally { setApplying(false); }
          }}>
            {applying ? 'Rendering crop…' : 'Apply Crop'}
          </button>
          <button type="button" disabled={applying} onClick={() =>
            setDraft({ x: crop.x, y: crop.y, width: crop.width, height: crop.height })}>
            Reset Fields
          </button>
        </div>
      </div>
    </details>
  );
}
