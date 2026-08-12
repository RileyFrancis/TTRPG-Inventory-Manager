// =============================================================================
// SHAPES — Item shape math: rotation, cell coords, bounding boxes
// =============================================================================
'use strict';

// =============================================================================
// SHAPE UTILITIES
// =============================================================================
function shapeCellCount(shape) {
  return shape.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
}

function shapeWeight(shape) { return shapeCellCount(shape); }

function shapeDims(shape) {
  return { rows: shape.length, cols: shape[0].length };
}

function normalizeShape(shape) {
  // Remove empty border rows/cols
  let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
  }));
  if (maxR < 0) return [[0]]; // all empty → 1x1
  return shape.slice(minR, maxR + 1).map(row => row.slice(minC, maxC + 1));
}

function rotateShapeCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function getRotatedShape(baseShape, rotation) {
  let s = baseShape;
  for (let i = 0; i < rotation; i++) s = rotateShapeCW(s);
  return s;
}

// All filled cell coords of shape, absolute on grid (given gridRow, gridCol as top-left of bounding box)
function getShapeCells(shape, gridRow, gridCol) {
  const cells = [];
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) cells.push({ row: gridRow + r, col: gridCol + c });
  }));
  return cells;
}

// Rotate anchor cell through a CW rotation
function rotateAnchorCW(anchorRow, anchorCol, rows, cols) {
  return { row: anchorCol, col: rows - 1 - anchorRow };
}
