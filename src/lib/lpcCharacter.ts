import manifest from '@/data/lpcManifest.json';

export type Gender = 'male' | 'female';
export type Slot = 'body' | 'bottom' | 'shoes' | 'top' | 'head' | 'eyes' | 'beard' | 'hair';
export type ColorSlot = 'skin' | 'hair' | 'top' | 'bottom' | 'shoes';
export type Action = (typeof ACTIONS)[number]['id'];

export const FRAME_SIZE = 64;
export const DIRECTIONS = [
  { id: 'up', label: 'Back', row: 0 },
  { id: 'left', label: 'Left', row: 1 },
  { id: 'down', label: 'Front', row: 2 },
  { id: 'right', label: 'Right', row: 3 },
] as const;

export const ACTIONS = [
  { id: 'idle', label: 'Idle', frames: 2 },
  { id: 'walk', label: 'Walk', frames: 9 },
  { id: 'run', label: 'Run', frames: 8 },
  { id: 'slash', label: 'Slash', frames: 6 },
] as const;

export const SLOT_ORDER: Slot[] = ['body', 'bottom', 'shoes', 'top', 'head', 'eyes', 'beard', 'hair'];

export type CharacterAsset = Omit<(typeof manifest.assets)[number], 'slot' | 'gender'> & {
  slot: Slot;
  gender: Gender | 'all';
};

export const ASSETS: CharacterAsset[] = manifest.assets as CharacterAsset[];
export const SOURCE_REVISION = manifest.sourceRevision;

export interface CharacterConfig {
  gender: Gender;
  selected: Record<Slot, string | null>;
  colors: Record<ColorSlot, string>;
}

export const DEFAULT_COLORS: Record<ColorSlot, string> = {
  skin: '#e6b094', hair: '#86533c', top: '#6785b9', bottom: '#45536d', shoes: '#684d40',
};

export const COLOR_PRESETS: Record<ColorSlot, string[]> = {
  skin: ['#f4d1b2', '#e6b094', '#c78c69', '#9b644a', '#613e30'],
  hair: ['#29262b', '#86533c', '#d29b53', '#b7483b', '#ebe0bf'],
  top: ['#6785b9', '#d65c5c', '#63a383', '#debf74', '#eee9dc'],
  bottom: ['#45536d', '#9a7562', '#596d52', '#b8a78c', '#252a36'],
  shoes: ['#684d40', '#34333b', '#af8a5b', '#c6c3be', '#7e6570'],
};

const DEFAULT_SELECTION: Record<Gender, Record<Slot, string | null>> = {
  male: {
    body: 'body-male', head: 'head-male', eyes: 'eyes-neutral', beard: null,
    hair: 'hair-buzzcut', top: 'top-tee-male', bottom: 'bottom-pants', shoes: 'shoes-male',
  },
  female: {
    body: 'body-female', head: 'head-female', eyes: 'eyes-neutral', beard: null,
    hair: 'hair-bob', top: 'top-tee-female', bottom: 'bottom-leggings', shoes: 'shoes-female',
  },
};

export function createCharacter(gender: Gender = 'male'): CharacterConfig {
  return { gender, selected: { ...DEFAULT_SELECTION[gender] }, colors: { ...DEFAULT_COLORS } };
}

export function getAsset(id: string | null): CharacterAsset | undefined {
  return ASSETS.find((asset) => asset.id === id);
}

export function getOptions(slot: Slot, gender: Gender): CharacterAsset[] {
  return ASSETS.filter((asset) => asset.slot === slot && (asset.gender === 'all' || asset.gender === gender));
}

export function selectGender(config: CharacterConfig, gender: Gender): CharacterConfig {
  const defaults = DEFAULT_SELECTION[gender];
  const selected = { ...config.selected };
  for (const slot of SLOT_ORDER) {
    const asset = getAsset(selected[slot]);
    if (!asset || (asset.gender !== 'all' && asset.gender !== gender)) selected[slot] = defaults[slot];
  }
  // Body and head must always match the new base.
  selected.body = defaults.body;
  selected.head = defaults.head;
  return { ...config, gender, selected };
}

export function sanitizeCharacter(value: unknown): CharacterConfig {
  if (!value || typeof value !== 'object') return createCharacter();
  const data = value as Partial<CharacterConfig>;
  const gender: Gender = data.gender === 'female' ? 'female' : 'male';
  const initial = createCharacter(gender);
  for (const slot of SLOT_ORDER) {
    if (slot === 'body' || slot === 'head') continue;
    const id = data.selected?.[slot];
    if (id === null && slot !== 'eyes') initial.selected[slot] = null;
    else if (typeof id === 'string' && getOptions(slot, gender).some((asset) => asset.id === id)) initial.selected[slot] = id;
  }
  for (const color of Object.keys(DEFAULT_COLORS) as ColorSlot[]) {
    const candidate = data.colors?.[color];
    if (typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate)) initial.colors[color] = candidate;
  }
  return initial;
}

export function selectedLayers(config: CharacterConfig): CharacterAsset[] {
  return SLOT_ORDER.flatMap((slot) => {
    const asset = getAsset(config.selected[slot]);
    return asset ? [asset] : [];
  });
}

export function assetUrl(asset: CharacterAsset, action: Action): string {
  return `/lpc/${asset.id}/${action}.png`;
}

export function assetColor(config: CharacterConfig, slot: Slot): string | null {
  if (slot === 'body' || slot === 'head') return config.colors.skin;
  if (slot === 'hair' || slot === 'beard') return config.colors.hair;
  if (slot === 'eyes') return null;
  return config.colors[slot];
}
