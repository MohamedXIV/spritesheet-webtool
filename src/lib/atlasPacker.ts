/**
 * 2D Shelf Packing Algorithm for Texture Atlasing
 */

export interface PackedItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackInputItem {
  id: string;
  width: number;
  height: number;
}

/**
 * Packs a list of rectangles into a square bin of targetSize.
 * Automatically downscales items iteratively until they fit.
 */
export function packRects(
  items: PackInputItem[],
  targetSize: number
): { packedItems: PackedItem[]; scale: number } {
  if (items.length === 0) {
    return { packedItems: [], scale: 1.0 };
  }

  // Sort items by height in descending order (standard shelf packing heuristic)
  const sortedItems = [...items].sort((a, b) => b.height - a.height);
  
  let scale = 1.0;
  const maxAttempts = 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let x = 0;
    let y = 0;
    let shelfHeight = 0;
    const packed: PackedItem[] = [];
    let fits = true;
    
    for (const item of sortedItems) {
      // Ensure dimensions are at least 8 pixels to prevent empty/invisible regions
      const w = Math.max(8, Math.round(item.width * scale));
      const h = Math.max(8, Math.round(item.height * scale));
      
      // If item exceeds bin width, move to next shelf
      if (x + w > targetSize) {
        x = 0;
        y += shelfHeight;
        shelfHeight = 0;
      }
      
      // If item exceeds bin height, it doesn't fit with current scale
      if (y + h > targetSize) {
        fits = false;
        break;
      }
      
      packed.push({
        id: item.id,
        x,
        y,
        width: w,
        height: h
      });
      
      x += w;
      shelfHeight = Math.max(shelfHeight, h);
    }
    
    if (fits) {
      return { packedItems: packed, scale };
    }
    
    // Scale down by 10% and try again
    scale *= 0.9;
  }
  
  // Fallback: Grid-like placement with tiny cells if it fails to converge
  const cellSize = Math.max(8, Math.floor(targetSize / Math.ceil(Math.sqrt(sortedItems.length))));
  const fallbackPacked: PackedItem[] = sortedItems.map((item, idx) => {
    const cols = Math.floor(targetSize / cellSize);
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    return {
      id: item.id,
      x: col * cellSize,
      y: row * cellSize,
      width: cellSize,
      height: cellSize
    };
  });
  
  return {
    packedItems: fallbackPacked,
    scale: cellSize / Math.max(1, sortedItems[0].width)
  };
}
