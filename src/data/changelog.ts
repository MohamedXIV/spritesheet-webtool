export interface ChangelogItem {
  category: 'Added' | 'Changed' | 'Fixed' | 'Security';
  detail: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  toolScope: 'All' | 'spritesheet' | 'pixelator' | '3d-painter';
  toolName: string;
  items: ChangelogItem[];
}

export const changelogData: ChangelogVersion[] = [
  {
    version: '0.8.2-beta',
    date: '2026-05-29',
    toolScope: 'spritesheet',
    toolName: 'Video to Spritesheet',
    items: [
      { category: 'Added', detail: 'View Menu: Panel toggles & Reset Layout controls inside the top Menu Bar.' },
      { category: 'Added', detail: 'Texture Maps Panel: Slots for AO, Normal, Emissive, Roughness, and MatCap maps.' },
      { category: 'Added', detail: 'Stateful Toon Bands: Restructured pixelation controls to retain bands selection securely.' },
      { category: 'Added', detail: 'Lighting Tab Integration: Registered lighting custom options inside the Dock Layout system.' },
      { category: 'Changed', detail: 'Emissive Colors Support: Added setEmissiveColor() into ThreePainter engine.' },
      { category: 'Changed', detail: 'Export Panel Redesign: Re-engineered a highly compact layout for optimized workspace screen estate.' },
      { category: 'Changed', detail: 'Pixelate Panel Redesign: Streamlined dither controls and pixel presets panel structure.' }
    ]
  },
  {
    version: '0.5.0-alpha',
    date: '2026-05-15',
    toolScope: 'pixelator',
    toolName: 'Sprite Pixelator',
    items: [
      { category: 'Added', detail: 'Retro Palettes Presets: Built-in support for NES, PICO-8, Commodore 64, and GameBoy classic color matrices.' },
      { category: 'Added', detail: 'Dithering Algorithms: Fully active Bayer ordered grid and Floyd-Steinberg diffusion filters.' },
      { category: 'Added', detail: 'Slicing Tools: Grid slicing engine based on specific dimensions or absolute slice count.' }
    ]
  },
  {
    version: '0.2.1-alpha',
    date: '2026-04-20',
    toolScope: '3d-painter',
    toolName: '3D Pixel-Painter',
    items: [
      { category: 'Added', detail: '3D Mesh Loader: Core canvas parser supporting GLTF, GLB, OBJ, and FBX imports.' },
      { category: 'Added', detail: 'WebGL UV Painting: Direct real-time brush rasterization on texture coordinates in 3D space.' },
      { category: 'Added', detail: 'Retro Shaders: Vintage hardware vertex snaps and wobbly coordinate matrices modeling retro consoles.' }
    ]
  }
];
