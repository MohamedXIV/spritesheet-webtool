export interface ChangelogItem {
  category: 'Added' | 'Changed' | 'Fixed' | 'Security';
  detail: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  toolScope: 'All' | 'spritesheet' | 'pixelator' | '3d-painter' | 'trimsheet' | 'stylizer';
  toolName: string;
  items: ChangelogItem[];
}

export const changelogData: ChangelogVersion[] = [
  {
    version: '0.11.0-beta',
    date: '2026-11-18',
    toolScope: 'spritesheet',
    toolName: 'Sprite Editor',
    items: [
      { category: 'Changed', detail: 'Unified Preview & Edit Canvas: replaced the standalone Frame Editor tab with an in-place Preview | Edit workspace featuring Move/Transform, Marquee, Lasso, Magic Wand, Brush (with Pixel-Crisp mode), Eraser, Clone Stamp, Bucket, Gradient, Eyedropper, Shapes, Text, Hand, Zoom, Pixel Grid, Onion Skinning, and 30-step Undo/Redo.' },
      { category: 'Added', detail: 'Photoshop-Grade Layer & Mask Stack: added Raster, Solid/Gradient Fill, Non-destructive Adjustment, and Group layers; per-frame vs shared layer scope; Raster Masks with Alt+Click solo view; Clipping Masks; Alpha Lock; 16 blend modes; Duplicate, Merge Down, Merge Visible, and Flatten.' },
      { category: 'Added', detail: 'Non-Destructive Background Removal: BackgroundRemovalPanel defaults to outputting editable grayscale layer masks.' },
      { category: 'Added', detail: 'Interactive Spritesheet Slicer: spacious zoom/pan modal with Offset, Spacing, Inner Padding, two-way linked draggable guides (Grid, Cell Size, Custom), and a Slice as Masks toggle with Copy-on-Write editing.' }
    ]
  },
  {
    version: '0.10.0-beta',
    date: '2026-07-06',
    toolScope: 'stylizer',
    toolName: 'Material Stylizer',
    items: [
      { category: 'Added', detail: 'New Material Stylizer tool: convert realistic textures and PBR materials into painterly, cel, watercolor, or sketch styles.' },
      { category: 'Added', detail: 'Bake AO and soft shading into the stylized albedo; regenerate normal and height maps from the stylized result.' },
      { category: 'Added', detail: 'Live 2D before/after wipe preview with 2x2 tiling, an optional 3D material preview, and ZIP export of selected maps.' }
    ]
  },
  {
    version: '0.9.0-beta',
    date: '2026-06-28',
    toolScope: 'trimsheet',
    toolName: 'Trimsheet Builder',
    items: [
      { category: 'Added', detail: 'New Trimsheet Builder tool: grid + freeform region layout on a square canvas.' },
      { category: 'Added', detail: 'PBR material assignment per region from Polyhaven library or custom texture upload.' },
      { category: 'Added', detail: 'Per-region tiling controls: scale, offset, and 90-degree rotation.' },
      { category: 'Added', detail: 'Export of albedo, normal, roughness, metalness, and AO maps plus a region JSON, bundled as a .zip.' }
    ]
  },
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
