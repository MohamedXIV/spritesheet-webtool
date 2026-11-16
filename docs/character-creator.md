# Character Creator (LPC starter library)

The new `/tools/character-creator` workspace composes aligned 64×64 LPC artwork on a client-side Canvas. It is independent of the Sprite Editor and does not use its project database. Its editable character configuration is stored in localStorage under `spritecraft-lpc-character-v1`.

## Asset catalog

- `src/data/lpcManifest.json` defines the available body, face, hair, clothing and footwear layers. Each entry has a stable `id`, `slot`, `gender`, label and original source directory.
- `public/lpc/<id>/<animation>.png` holds the actual images. Assets are bundled at build time: no downloads from GitHub or AI model dependencies are needed when switching outfits.
- `src/data/lpcCredits.json` contains attribution for every imported animation. Exported ZIP packs include a `CREDITS.txt` with the artwork used in that character.
- `src/lib/lpcCharacter.ts` defines the available slots, draw order, body compatibility, default presets and configuration validation.
- `src/lib/lpcComposer.ts` loads layers, applies user-selected colors, composites sheets and exports PNG or ZIP.

## Adding LPC content

1. Acquire a checkout of [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) with the desired `spritesheets/` paths available locally.
2. Add a new `id`, `slot`, `gender`, label and original directory to the `definitions` array in `scripts/import-lpc.mjs`.
3. Run `node scripts/import-lpc.mjs /path/to/upstream-checkout` to import its supported animations and regenerate the attribution index and manifest.
4. Run `npm run build` to validate the asset layout and the application.

This starter catalog imports `idle`, `walk`, `run`, `slash` (2, 9, 8, and 6 frames per direction). The LPC sheet direction order is **back / left / front / right**. New actions should be added to both the import script and the typed animation list and validated for layout compatibility.

## Attribution and licensing

The application code is original to SpriteCraft. LPC artwork has its own per-file licensing: the upstream project uses combinations of OGA-BY, CC-BY-SA, GPL, CC-BY and CC0. The importer reads each file's original `CREDITS.csv` entry where available. Some expression sheets do not have their own CSV row, so the importer explicitly uses their upstream expression-family credit definitions and marks this in the exported credits. The [upstream licensing guide](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator#licensing-and-attribution-credits) explains how to comply before distributing art, particularly if recoloring or otherwise modifying it.

Inochi2D is deliberately not included: it is a 2D deformation and puppet animation SDK, not a requirement for rigid, frame-aligned LPC sheet composition. It may make sense in a separate future rig-based character workflow.
