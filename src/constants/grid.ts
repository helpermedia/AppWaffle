/**
 * Column count of the main grid, search results and folder modal grids.
 * Applied via inline gridTemplateColumns on those containers, so this
 * constant is the single source of truth; keyboard navigation uses it
 * to compute row jumps.
 */
export const GRID_COLUMNS = 7;

/**
 * Tile box height in px — must match Container's h-40 class, which is the
 * other place this dimension lives. The paged layout uses it to fit whole
 * rows to the viewport.
 */
export const TILE_HEIGHT = 160;

/**
 * Gap between grid tiles in px. Single-sourced: IconGrid applies it as an
 * inline style, and the paged layout uses it for row fitting.
 */
export const GRID_GAP = 16;
