// How the map starts: the camera that shows the whole layout in a viewport, and when to apply it. Pure, so the
// first view of a generation is unit-tested.
import { MAP_EXTENT } from '../model/mapLayout';
import type { Cam } from './camera';

export interface Size {
  width: number;
  height: number;
}

/** Camera that shows every circle of the map, with a small margin. */
export function fitCamera(size: Size): Cam {
  return { x: 0, y: 0, zoom: Math.log2(Math.min(size.width, size.height) / (MAP_EXTENT * 1.04)) };
}

/**
 * Whether the map should jump to the overview: once a viewport is measured, for every generation it has not
 * shown yet (a system and a single repository both start at the overview, whichever was open before), and
 * again when the viewport resizes while the camera still sits at the overview it was given: the first size is
 * often provisional while the panels settle. `lastFit` is null once the camera was sent elsewhere.
 */
export function needsFit<T>(shown: T | null, current: T, size: Size, cam: Cam, lastFit: Cam | null): boolean {
  if (!(size.width > 0 && size.height > 0)) return false;
  if (shown !== current) return true;
  // No overview to keep: the camera was sent somewhere (a deep link, the breadcrumb).
  if (!lastFit) return false;
  const fit = fitCamera(size);
  const untouched = cam.x === lastFit.x && cam.y === lastFit.y && cam.zoom === lastFit.zoom;
  return untouched && fit.zoom !== lastFit.zoom;
}
