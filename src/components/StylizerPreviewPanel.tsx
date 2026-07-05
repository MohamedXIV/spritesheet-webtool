'use client';

import React, { useEffect, useRef } from 'react';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerPreviewPanel.module.css';

export function StylizerPreviewPanel() {
  const { material, derived, wipePosition, setWipePosition, tiled, setTiled, isProcessing } = useStylizerContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const before = material.maps.albedo ?? null;
    const after = derived.stylizedAlbedo ?? before;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!before) return;

    const draw = (bmp: ImageBitmap, sx: number, sw: number) => {
      if (tiled) {
        const tw = canvas.width / 2, th = canvas.height / 2;
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
          ctx.drawImage(bmp, tx * tw, ty * th, tw, th);
        }
      } else {
        ctx.drawImage(bmp, sx, 0, sw, bmp.height, sx, 0, sw * (canvas.width / bmp.width), canvas.height);
      }
    };

    if (tiled) {
      draw(after!, 0, after!.width);
      return;
    }
    // before on left, after on right of wipe line
    const wipeX = (wipePosition / 100) * canvas.width;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, wipeX, canvas.height); ctx.clip();
    ctx.drawImage(before, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(wipeX, 0, canvas.width - wipeX, canvas.height); ctx.clip();
    if (after) ctx.drawImage(after, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    // wipe line
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wipeX, 0); ctx.lineTo(wipeX, canvas.height); ctx.stroke();
  }, [material.maps.albedo, derived.stylizedAlbedo, wipePosition, tiled]);

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <label className={styles.check}>
          <input type="checkbox" checked={tiled} onChange={(e) => setTiled(e.target.checked)} />
          Tile 2×2
        </label>
        {!tiled && (
          <input className={styles.wipe} type="range" min={0} max={100} value={wipePosition}
            onChange={(e) => setWipePosition(Number(e.target.value))} />
        )}
        {isProcessing && <span className={styles.processing}>Processing…</span>}
      </div>
      <div className={styles.canvasWrap}>
        {material.maps.albedo
          ? <canvas ref={canvasRef} width={512} height={512} className={styles.canvas} />
          : <div className={styles.placeholder}>Load an albedo map to preview.</div>}
      </div>
    </div>
  );
}
