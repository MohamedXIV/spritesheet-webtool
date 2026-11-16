import { strToU8, zipSync } from 'fflate';
import upstreamCredits from '@/data/lpcCredits.json';
import {
  ACTIONS, FRAME_SIZE, SOURCE_REVISION, assetColor, assetUrl, selectedLayers,
  type Action, type CharacterConfig,
} from '@/lib/lpcCharacter';

type Credits = { filename: string; notes: string; authors: string; licenses: string; urls: string };
const credits = upstreamCredits as Record<string, Credits>;
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const tintedCache = new Map<string, HTMLCanvasElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load sprite layer ${url}`));
    image.src = url;
  });
  imageCache.set(url, loading);
  void loading.catch(() => imageCache.delete(url));
  return loading;
}

function recolor(image: HTMLImageElement, url: string, hex: string | null): CanvasImageSource {
  if (!hex) return image;
  const key = `${url}:${hex}`;
  const cached = tintedCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  let total = 0, samples = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (luminance > 32) { total += luminance; samples++; }
  }
  const reference = samples ? total / samples : 160;
  const tint = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const shade = Math.min(2.2, luminance / reference);
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(tint[c] * shade));
  }
  context.putImageData(pixels, 0, 0);
  if (tintedCache.size >= 120) tintedCache.clear();
  tintedCache.set(key, canvas);
  return canvas;
}

/** Compose each full 4-direction sheet in the LPC drawing order at native 64px resolution. */
export async function composeSheet(config: CharacterConfig, action: Action): Promise<HTMLCanvasElement> {
  const layers = selectedLayers(config);
  const images = await Promise.all(layers.map(async (asset) => {
    const url = assetUrl(asset, action);
    return { asset, url, image: await loadImage(url) };
  }));
  const base = images.find(({ asset }) => asset.slot === 'body')?.image;
  if (!base) throw new Error('The character is missing its base body');
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  for (const { asset, url, image } of images) {
    if (image.naturalWidth !== canvas.width || image.naturalHeight !== canvas.height) {
      throw new Error(`Incompatible layer dimensions: ${asset.label} (${action})`);
    }
    context.drawImage(recolor(image, url, assetColor(config, asset.slot)), 0, 0);
  }
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png');
  });
}

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadActionPng(config: CharacterConfig, action: Action): Promise<void> {
  const sheet = await composeSheet(config, action);
  saveDownload(await canvasToBlob(sheet), `spritecraft-character-${action}.png`);
}

export function characterCredits(config: CharacterConfig): string {
  const lines = [
    'SpriteCraft Character Creator — Universal LPC Artwork Credits',
    `Source: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator`,
    `Source commit: ${SOURCE_REVISION}`,
    'Art is under multiple open licenses, including CC-BY-SA and GPL. Respect the relevant terms.',
    'Full project credits: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/CREDITS.csv',
    '',
  ];
  for (const asset of selectedLayers(config)) {
    for (const action of ACTIONS) {
      const credit = credits[`${asset.id}/${action.id}`];
      if (!credit) throw new Error(`Missing credits for ${asset.id}/${action.id}`);
      lines.push(`${asset.label} — ${credit.filename}`);
      lines.push(`  Artists: ${credit.authors}`);
      lines.push(`  Licenses: ${credit.licenses}`);
      if (credit.notes) lines.push(`  Notes: ${credit.notes}`);
      lines.push(`  Sources: ${credit.urls}`, '');
    }
  }
  return lines.join('\n');
}

export async function downloadCharacterPack(config: CharacterConfig): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (const action of ACTIONS) {
    const sheet = await composeSheet(config, action.id);
    const blob = await canvasToBlob(sheet);
    files[`sprites/${action.id}.png`] = new Uint8Array(await blob.arrayBuffer());
  }
  files['character.json'] = strToU8(JSON.stringify({
    format: 'SpriteCraft-LPC-v1', sourceRevision: SOURCE_REVISION,
    character: config, frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE,
    directions: { up: 0, left: 1, down: 2, right: 3 },
    animations: ACTIONS.map(({ id, frames }) => ({ name: id, file: `sprites/${id}.png`, frames, rows: 4 })),
  }, null, 2));
  files['CREDITS.txt'] = strToU8(characterCredits(config));
  const zipped = zipSync(files, { level: 6 });
  saveDownload(new Blob([new Uint8Array(zipped)], { type: 'application/zip' }), 'spritecraft-character-pack.zip');
}
