# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0-beta] - 2026-07-06

### Added
- **Material Stylizer**: New tool — convert realistic textures and PBR materials into painterly, cel, watercolor, or sketch styles.
- **Baked Lighting**: Bake AO and soft shading into the stylized albedo, and regenerate normal and height maps from the stylized result.
- **Preview & Export**: Live 2D before/after wipe preview with 2×2 tiling, an optional 3D material preview, and ZIP export of selected maps.

---

## [0.9.0-beta] - 2026-06-28

### Added
- **Trimsheet Builder**: New tool — grid + freeform region layout on a square trimsheet canvas.
- **PBR Material Assignment**: Drop Polyhaven library materials or upload custom textures onto individual regions.
- **Per-Region Tiling**: Scale, offset, and 90° rotation controls per region.
- **Trimsheet Export**: Albedo, Normal, Roughness, Metalness, and AO maps plus a region-metadata JSON, packed into a single `.zip`.

---

## [0.8.2-beta] - 2026-05-29

### Added
- **View Menu**: Panel toggles & Reset Layout controls inside the top Menu Bar.
- **Texture Maps Panel**: Slots for AO, Normal, Emissive, Roughness, and MatCap maps.
- **Stateful Toon Bands**: Restructured pixelation controls to retain bands selection securely.
- **Lighting Tab Integration**: Registered lighting custom options inside the Dock Layout system.

### Changed
- **Emissive Colors Support**: Added `setEmissiveColor()` into `ThreePainter` engine.
- **Export Panel Redesign**: Re-engineered a highly compact layout for optimized workspace screen estate.
- **Pixelate Panel Redesign**: Streamlined dither controls and pixel presets panel structure.

---

## [0.5.0-alpha] - 2026-05-15

### Added
- **Retro Palettes Presets**: Built-in support for NES, PICO-8, Commodore 64, and GameBoy classic color matrices.
- **Dithering Algorithms**: Fully active Bayer ordered grid and Floyd-Steinberg diffusion filters.
- **Slicing Tools**: Grid slicing engine based on specific dimensions or absolute slice count.

---

## [0.2.1-alpha] - 2026-04-20

### Added
- **3D Mesh Loader**: Core canvas parser supporting GLTF, GLB, OBJ, and FBX imports.
- **WebGL UV Painting**: Direct real-time brush rasterization on texture coordinates in 3D space.
- **Retro Shaders**: Vintage hardware vertex snaps and wobbly coordinate matrices modeling retro consoles.
