/**
 * slicerGuides.ts - Pure geometry & two-way guide-sync math for interactive spritesheet slicing.
 * Zero React/DOM dependencies so it is deterministic and directly unit-testable.
 */

export type SliceMode = 'grid' | 'dimensions' | 'custom';

export interface SheetSliceSettings {
  sliceType: SliceMode;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
  innerPadding: number;
  customColGuides?: number[]; // Sorted X boundary coordinates (length >= 2)
  customRowGuides?: number[]; // Sorted Y boundary coordinates (length >= 2)
  sliceAsMasks: boolean;
}

export const DEFAULT_SLICE_SETTINGS: SheetSliceSettings = {
  sliceType: 'grid',
  cols: 4,
  rows: 4,
  cellWidth: 64,
  cellHeight: 64,
  offsetX: 0,
  offsetY: 0,
  spacingX: 0,
  spacingY: 0,
  innerPadding: 0,
  sliceAsMasks: false,
};

export interface SliceRect {
  index: number;
  row: number;
  col: number;
  /** Source rectangle X on spritesheet */
  x: number;
  /** Source rectangle Y on spritesheet */
  y: number;
  /** Source rectangle width on spritesheet */
  w: number;
  /** Source rectangle height on spritesheet */
  h: number;
  /** Active inner region inset by innerPadding (relative to cell 0,0) */
  innerX: number;
  innerY: number;
  innerW: number;
  innerH: number;
}

export interface SliceGuideLine {
  axis: 'x' | 'y';
  pos: number;
  kind: 'offset' | 'cell-end' | 'cell-start' | 'custom';
  index: number; // column or row index associated with this line
}

export interface SliceLayoutResult {
  rects: SliceRect[];
  colEdges: Array<{ start: number; end: number }>;
  rowEdges: Array<{ start: number; end: number }>;
  guides: SliceGuideLine[];
  effectiveCellWidth: number;
  effectiveCellHeight: number;
  cols: number;
  rows: number;
}

export type GuideDragHandle =
  | { kind: 'offset-x' }
  | { kind: 'offset-y' }
  | { kind: 'step-x' }      // Uniform cell width drag (first cell right edge)
  | { kind: 'step-y' }      // Uniform cell height drag (first cell bottom edge)
  | { kind: 'spacing-x' }   // Uniform horizontal spacing drag (second col left edge)
  | { kind: 'spacing-y' }   // Uniform vertical spacing drag (second row top edge)
  | { kind: 'custom-x'; index: number }
  | { kind: 'custom-y'; index: number };

export function normalizeSliceSettings(
  partial: Partial<SheetSliceSettings> | undefined,
  sheetW = 256,
  sheetH = 256
): SheetSliceSettings {
  const sliceType: SliceMode =
    partial?.sliceType === 'dimensions' || partial?.sliceType === 'custom'
      ? partial.sliceType
      : 'grid';
  const offsetX = Math.max(0, Math.min(sheetW - 1, Math.round(partial?.offsetX ?? 0)));
  const offsetY = Math.max(0, Math.min(sheetH - 1, Math.round(partial?.offsetY ?? 0)));
  const spacingX = Math.max(0, Math.round(partial?.spacingX ?? 0));
  const spacingY = Math.max(0, Math.round(partial?.spacingY ?? 0));
  const cols = Math.max(1, Math.min(128, Math.round(partial?.cols ?? 4)));
  const rows = Math.max(1, Math.min(128, Math.round(partial?.rows ?? 4)));
  const cellWidth = Math.max(1, Math.round(partial?.cellWidth ?? Math.max(1, Math.floor((sheetW - offsetX) / cols))));
  const cellHeight = Math.max(1, Math.round(partial?.cellHeight ?? Math.max(1, Math.floor((sheetH - offsetY) / rows))));
  const innerPadding = Math.max(0, Math.round(partial?.innerPadding ?? 0));

  return {
    sliceType,
    cols,
    rows,
    cellWidth,
    cellHeight,
    offsetX,
    offsetY,
    spacingX,
    spacingY,
    innerPadding,
    customColGuides: Array.isArray(partial?.customColGuides)
      ? [...partial!.customColGuides].map(v => Math.round(v)).sort((a, b) => a - b)
      : undefined,
    customRowGuides: Array.isArray(partial?.customRowGuides)
      ? [...partial!.customRowGuides].map(v => Math.round(v)).sort((a, b) => a - b)
      : undefined,
    sliceAsMasks: Boolean(partial?.sliceAsMasks),
  };
}

/**
 * Compute uniform column/row edges or custom guide intervals from settings.
 */
export function computeSliceLayout(
  sheetW: number,
  sheetH: number,
  rawSettings: Partial<SheetSliceSettings>
): SliceLayoutResult {
  const s = normalizeSliceSettings(rawSettings, sheetW, sheetH);
  const colEdges: Array<{ start: number; end: number }> = [];
  const rowEdges: Array<{ start: number; end: number }> = [];
  const guides: SliceGuideLine[] = [];

  let effectiveCellWidth = s.cellWidth;
  let effectiveCellHeight = s.cellHeight;

  if (s.sliceType === 'custom' && s.customColGuides && s.customColGuides.length >= 2) {
    const sorted = sanitizeGuideArray(s.customColGuides, sheetW);
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (end - start >= 1) {
        colEdges.push({ start, end });
      }
    }
    sorted.forEach((pos, index) => {
      guides.push({ axis: 'x', pos, kind: 'custom', index });
    });
    if (colEdges.length > 0) {
      effectiveCellWidth = Math.max(...colEdges.map(e => e.end - e.start));
    }
  } else if (s.sliceType === 'grid') {
    const availW = Math.max(1, sheetW - s.offsetX - s.spacingX * Math.max(0, s.cols - 1));
    effectiveCellWidth = Math.max(1, Math.floor(availW / s.cols));
    for (let c = 0; c < s.cols; c++) {
      const start = s.offsetX + c * (effectiveCellWidth + s.spacingX);
      const end = Math.min(sheetW, start + effectiveCellWidth);
      if (end > start) {
        colEdges.push({ start, end });
      }
    }
  } else {
    // dimensions mode
    effectiveCellWidth = Math.max(1, s.cellWidth);
    const stepX = effectiveCellWidth + s.spacingX;
    for (let x = s.offsetX; x + 1 <= sheetW; x += stepX) {
      const end = Math.min(sheetW, x + effectiveCellWidth);
      if (end - x >= 1 && (end - x === effectiveCellWidth || x === s.offsetX)) {
        // Include full cells fitting inside sheet
        if (x + effectiveCellWidth <= sheetW) {
          colEdges.push({ start: x, end: x + effectiveCellWidth });
        }
      }
    }
  }

  if (s.sliceType === 'custom' && s.customRowGuides && s.customRowGuides.length >= 2) {
    const sorted = sanitizeGuideArray(s.customRowGuides, sheetH);
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (end - start >= 1) {
        rowEdges.push({ start, end });
      }
    }
    sorted.forEach((pos, index) => {
      guides.push({ axis: 'y', pos, kind: 'custom', index });
    });
    if (rowEdges.length > 0) {
      effectiveCellHeight = Math.max(...rowEdges.map(e => e.end - e.start));
    }
  } else if (s.sliceType === 'grid') {
    const availH = Math.max(1, sheetH - s.offsetY - s.spacingY * Math.max(0, s.rows - 1));
    effectiveCellHeight = Math.max(1, Math.floor(availH / s.rows));
    for (let r = 0; r < s.rows; r++) {
      const start = s.offsetY + r * (effectiveCellHeight + s.spacingY);
      const end = Math.min(sheetH, start + effectiveCellHeight);
      if (end > start) {
        rowEdges.push({ start, end });
      }
    }
  } else {
    // dimensions mode
    effectiveCellHeight = Math.max(1, s.cellHeight);
    const stepY = effectiveCellHeight + s.spacingY;
    for (let y = s.offsetY; y + effectiveCellHeight <= sheetH; y += stepY) {
      rowEdges.push({ start: y, end: y + effectiveCellHeight });
    }
  }

  if (s.sliceType !== 'custom') {
    colEdges.forEach((edge, index) => {
      guides.push({
        axis: 'x',
        pos: edge.start,
        kind: index === 0 ? 'offset' : 'cell-start',
        index,
      });
      guides.push({
        axis: 'x',
        pos: edge.end,
        kind: 'cell-end',
        index,
      });
    });
    rowEdges.forEach((edge, index) => {
      guides.push({
        axis: 'y',
        pos: edge.start,
        kind: index === 0 ? 'offset' : 'cell-start',
        index,
      });
      guides.push({
        axis: 'y',
        pos: edge.end,
        kind: 'cell-end',
        index,
      });
    });
  }

  const rects: SliceRect[] = [];
  let idx = 0;
  for (let r = 0; r < rowEdges.length; r++) {
    for (let c = 0; c < colEdges.length; c++) {
      const colEdge = colEdges[c];
      const rowEdge = rowEdges[r];
      const w = colEdge.end - colEdge.start;
      const h = rowEdge.end - rowEdge.start;
      const padX = Math.min(s.innerPadding, Math.floor((w - 1) / 2));
      const padY = Math.min(s.innerPadding, Math.floor((h - 1) / 2));
      rects.push({
        index: idx++,
        row: r,
        col: c,
        x: colEdge.start,
        y: rowEdge.start,
        w,
        h,
        innerX: padX,
        innerY: padY,
        innerW: Math.max(1, w - padX * 2),
        innerH: Math.max(1, h - padY * 2),
      });
    }
  }

  return {
    rects,
    colEdges,
    rowEdges,
    guides,
    effectiveCellWidth,
    effectiveCellHeight,
    cols: colEdges.length,
    rows: rowEdges.length,
  };
}

/**
 * Convert current uniform layout into explicit custom guide arrays (one boundary per cut).
 */
export function convertLayoutToCustomGuides(
  sheetW: number,
  sheetH: number,
  settings: SheetSliceSettings
): { colGuides: number[]; rowGuides: number[] } {
  const layout = computeSliceLayout(sheetW, sheetH, { ...settings, sliceType: settings.sliceType === 'custom' ? 'grid' : settings.sliceType });
  const colSet = new Set<number>();
  layout.colEdges.forEach(e => {
    colSet.add(e.start);
    colSet.add(e.end);
  });
  const rowSet = new Set<number>();
  layout.rowEdges.forEach(e => {
    rowSet.add(e.start);
    rowSet.add(e.end);
  });

  const colGuides = Array.from(colSet).sort((a, b) => a - b);
  const rowGuides = Array.from(rowSet).sort((a, b) => a - b);
  return {
    colGuides: colGuides.length >= 2 ? colGuides : [0, sheetW],
    rowGuides: rowGuides.length >= 2 ? rowGuides : [0, sheetH],
  };
}

/**
 * Two-way sync: Given a dragged guide handle and new pixel coordinate,
 * return the updated SheetSliceSettings so numeric controls update in lockstep.
 */
export function updateSettingsFromGuideDrag(
  current: SheetSliceSettings,
  sheetW: number,
  sheetH: number,
  handle: GuideDragHandle,
  rawTargetPx: number
): SheetSliceSettings {
  const targetPx = Math.round(rawTargetPx);
  const layout = computeSliceLayout(sheetW, sheetH, current);

  switch (handle.kind) {
    case 'offset-x': {
      const nextOffsetX = Math.max(0, Math.min(sheetW - 2, targetPx));
      return { ...current, offsetX: nextOffsetX };
    }
    case 'offset-y': {
      const nextOffsetY = Math.max(0, Math.min(sheetH - 2, targetPx));
      return { ...current, offsetY: nextOffsetY };
    }
    case 'step-x': {
      const firstStart = layout.colEdges[0]?.start ?? current.offsetX;
      const nextW = Math.max(2, Math.min(sheetW - firstStart, targetPx - firstStart));
      const nextCols = Math.max(1, Math.floor((sheetW - current.offsetX + current.spacingX) / Math.max(1, nextW + current.spacingX)));
      return {
        ...current,
        sliceType: 'dimensions',
        cellWidth: nextW,
        cellHeight: layout.effectiveCellHeight,
        cols: nextCols,
      };
    }
    case 'step-y': {
      const firstStart = layout.rowEdges[0]?.start ?? current.offsetY;
      const nextH = Math.max(2, Math.min(sheetH - firstStart, targetPx - firstStart));
      const nextRows = Math.max(1, Math.floor((sheetH - current.offsetY + current.spacingY) / Math.max(1, nextH + current.spacingY)));
      return {
        ...current,
        sliceType: 'dimensions',
        cellWidth: layout.effectiveCellWidth,
        cellHeight: nextH,
        rows: nextRows,
      };
    }
    case 'spacing-x': {
      const firstEnd = layout.colEdges[0]?.end ?? (current.offsetX + layout.effectiveCellWidth);
      const nextSpacingX = Math.max(0, Math.min(sheetW - firstEnd - 1, targetPx - firstEnd));
      return { ...current, spacingX: nextSpacingX };
    }
    case 'spacing-y': {
      const firstEnd = layout.rowEdges[0]?.end ?? (current.offsetY + layout.effectiveCellHeight);
      const nextSpacingY = Math.max(0, Math.min(sheetH - firstEnd - 1, targetPx - firstEnd));
      return { ...current, spacingY: nextSpacingY };
    }
    case 'custom-x': {
      const base = current.sliceType === 'custom' && current.customColGuides?.length
        ? [...current.customColGuides]
        : convertLayoutToCustomGuides(sheetW, sheetH, current).colGuides;
      const rowBase = current.sliceType === 'custom' && current.customRowGuides?.length
        ? [...current.customRowGuides]
        : convertLayoutToCustomGuides(sheetW, sheetH, current).rowGuides;

      if (handle.index >= 0 && handle.index < base.length) {
        const minBound = handle.index > 0 ? base[handle.index - 1] + 2 : 0;
        const maxBound = handle.index < base.length - 1 ? base[handle.index + 1] - 2 : sheetW;
        base[handle.index] = Math.max(minBound, Math.min(maxBound, targetPx));
      }
      return {
        ...current,
        sliceType: 'custom',
        customColGuides: sanitizeGuideArray(base, sheetW),
        customRowGuides: sanitizeGuideArray(rowBase, sheetH),
      };
    }
    case 'custom-y': {
      const base = current.sliceType === 'custom' && current.customRowGuides?.length
        ? [...current.customRowGuides]
        : convertLayoutToCustomGuides(sheetW, sheetH, current).rowGuides;
      const colBase = current.sliceType === 'custom' && current.customColGuides?.length
        ? [...current.customColGuides]
        : convertLayoutToCustomGuides(sheetW, sheetH, current).colGuides;

      if (handle.index >= 0 && handle.index < base.length) {
        const minBound = handle.index > 0 ? base[handle.index - 1] + 2 : 0;
        const maxBound = handle.index < base.length - 1 ? base[handle.index + 1] - 2 : sheetH;
        base[handle.index] = Math.max(minBound, Math.min(maxBound, targetPx));
      }
      return {
        ...current,
        sliceType: 'custom',
        customColGuides: sanitizeGuideArray(colBase, sheetW),
        customRowGuides: sanitizeGuideArray(base, sheetH),
      };
    }
  }
}

function sanitizeGuideArray(guides: number[], maxExtent: number): number[] {
  const unique = Array.from(
    new Set(guides.map(v => Math.max(0, Math.min(maxExtent, Math.round(v)))))
  ).sort((a, b) => a - b);
  return unique;
}
