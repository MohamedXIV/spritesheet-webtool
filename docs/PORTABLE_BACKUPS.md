# Portable Spritecraft project backups (.spritecraft)

A `.spritecraft` file is a **versioned ZIP archive** containing one saved
Spritecraft project, its metadata and all Blobs that were actually saved to
IndexedDB. Backups are created and restored entirely in the browser.

## Export a backup

1. Save the current project (**Ctrl+S**) in its editor.
2. Open the Spritecraft **Dashboard**.
3. In Recent Local Operations, click the **Download backup** icon next to the
   project.
4. Store the downloaded `.spritecraft` file somewhere outside the browser.

A backup preserves persisted frames and their PNG data, paint layers,
per-frame timing, folder order, project/tool type, pixelation and rendering
settings, GIF timings, original source sheets saved since source persistence was
introduced, and embedded material/texture Blobs where present in project data.

Only the **last saved** project state is exported. Unsaved edits, history stacks,
temporary video files that weren't persisted, and browser/GPU-only state aren't
reconstructed. Pre-existing projects whose original source images were never
persisted still keep their extracted frames but cannot regenerate those
original images.

## Import on another browser, origin or device

1. Open Spritecraft Dashboard on the target browser.
2. Choose **Import Project Backup** and select a `.spritecraft` file.
3. The imported project appears in Recent Local Operations with `(Imported)`
   appended to the title.
4. Open it to restore the editor workspace.

Import **always creates a new local project ID**. It does not replace/delete a
project with the original ID, even when importing back into the same browser.
The archive is validated (format version, project type, binary sizes, paths,
SHA-256 digests and structural checks) before writing to IndexedDB.

### File format v1

- `manifest.json`: `{ format: 'spritecraft-project', version: 1, exportedAt, project }`.
- `blobs/000001.bin`, etc.: original binary attachments, without
  recompression. The manifest references each Blob with its ZIP path, MIME type,
  byte size and SHA-256 digest.
- Archives have up to 256 MiB compressed data, 512 MiB expanded data and 5000
  referenced attachments. An oversized or malformed archive is rejected.

This is a local transfer/backup feature, **not cloud sync or encryption**.
Backups may contain private artwork or embedded source assets; protect them as
you would any original project file.
