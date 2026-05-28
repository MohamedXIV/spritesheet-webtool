// src/lib/palettes.ts

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  isBuiltIn: boolean;
}

const STORAGE_KEY = 'three-painter-custom-palettes';

export const BUILT_IN_PALETTES: ColorPalette[] = [
  {
    id: 'basic',
    name: 'Basic',
    isBuiltIn: true,
    colors: [
      '#ffffff', '#d4d4d8', '#a1a1aa', '#71717a', '#3f3f46', '#27272a', '#18181b', '#000000',
      '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
      '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    ],
  },
  {
    id: 'anime',
    name: 'Anime',
    isBuiltIn: true,
    colors: [
      // Skin tones (light → dark)
      '#fde8d8', '#f9c9a8', '#f5aa7a', '#e8845c', '#c96a3e', '#9e4e28',
      // Hair (black/brown/blonde)
      '#2c1810', '#5c3317', '#8b6355', '#c4956a', '#f0c98e', '#f7e4b8',
      // Shadow tones (blue-shifted)
      '#d4c8e0', '#b0a0c8', '#8878ac', '#605090', '#3c3068',
      // Eye colors
      '#2e4a7c', '#4a7cbf', '#7cbf4a', '#bf4a4a', '#7c2e4a', '#2e7c6a',
      // Specular / rim highlights
      '#ffffff', '#fff0f8', '#ffe8f0', '#ffd0e8',
      // Outfit neutrals
      '#e8e8f0', '#c8c8e0', '#9898c0', '#606090', '#404070', '#202050',
    ],
  },
  {
    id: 'psx',
    name: 'PSX Tones',
    isBuiltIn: true,
    colors: [
      // Greyscale ramp (5-bit precision)
      '#000000', '#101010', '#202020', '#303030', '#404040', '#505050',
      '#606060', '#707070', '#808080', '#909090', '#a0a0a0', '#b0b0b0',
      '#c0c0c0', '#d0d0d0', '#e0e0e0', '#f0f0f0',
      // Reds
      '#300000', '#600000', '#900000', '#c00000', '#f00000', '#f84040',
      // Greens
      '#003000', '#006000', '#009000', '#00c000', '#00f000', '#40f840',
      // Blues
      '#000030', '#000060', '#000090', '#0000c0', '#0000f0', '#4040f8',
      // Magentas / PSX UI purples
      '#300030', '#600060', '#900090', '#c000c0',
      // Ambers / browns
      '#303000', '#606000', '#909000', '#b08000',
    ],
  },
  {
    id: 'gameboy',
    name: 'Game Boy',
    isBuiltIn: true,
    colors: [
      // Original GB (green LCD)
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f',
      // GB Pocket (greyscale)
      '#000000', '#555555', '#aaaaaa', '#ffffff',
      // GBC palette 1 (blue dusk)
      '#081820', '#346856', '#88c070', '#e0f8d0',
      // GBC palette 2 (warm sunset)
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
      '#ffcd75', '#a7f070', '#38b764', '#257179',
      // GBC palette 3 (candy)
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
      '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
  },
  {
    id: 'warm',
    name: 'Warm',
    isBuiltIn: true,
    colors: [
      '#fff8f0', '#ffecd8', '#ffd5b0', '#ffbc80', '#ff9c50', '#ff7520',
      '#e85c00', '#c44800', '#9c3800', '#742c00', '#4c1c00', '#280c00',
      '#fff4e8', '#ffe8c8', '#ffce98', '#ffb060', '#ff8c28', '#e06800',
      '#bc5000', '#943c00', '#6c2c00', '#480000',
      '#fffbe8', '#fff0c0', '#ffe080', '#ffcc40', '#f0a800', '#c88000',
    ],
  },
  {
    id: 'cool',
    name: 'Cool',
    isBuiltIn: true,
    colors: [
      '#f0f8ff', '#d8eeff', '#b0d8ff', '#80bcff', '#50a0ff', '#2080ff',
      '#0060e8', '#0048c4', '#00349c', '#002474', '#001450', '#000830',
      '#e8f8f0', '#c8eedd', '#98dcc0', '#60c8a0', '#28b080', '#009860',
      '#007848', '#005c34', '#004024', '#002818',
      '#f0f0ff', '#d8d8ff', '#b0b0ff', '#8080ff', '#5050ff', '#2828e8',
    ],
  },
  {
    id: 'handpainted',
    name: 'Hand-Painted',
    isBuiltIn: true,
    colors: [
      // Warm light side
      '#fff8e8', '#ffecc8', '#ffd898', '#ffc068', '#ffa038',
      // Cool shadow side
      '#d0d8f0', '#a8b8e0', '#7890c8', '#506898', '#304870',
      // Earthy mid-tones
      '#e8d8c0', '#d0b898', '#b89068', '#907040', '#705020',
      // Foliage
      '#d8e8c0', '#b0d090', '#88b860', '#608040', '#405820',
      // Sky / ambient
      '#c8e0f8', '#a0c8f0', '#78b0e0', '#5098c8', '#2878a8',
      // Flesh / organic
      '#f8e0d0', '#f0c0a0', '#e09878', '#c07050', '#a05030',
    ],
  },
];

export function loadCustomPalettes(): ColorPalette[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ColorPalette[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomPalettes(palettes: ColorPalette[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(palettes));
  } catch {
    // Storage quota or private mode — fail silently
  }
}

export function createCustomPalette(name: string): ColorPalette {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    colors: [],
    isBuiltIn: false,
  };
}
