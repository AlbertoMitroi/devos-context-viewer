// Focus mode on the map: which aggregated edges belong to the selection, and in which direction. Pure
// functions; hover never feeds into them.
import type { MapEdge } from '../model/mapLayout';

export type FocusDirection = 'out' | 'in' | 'both';

/** Relations from a to b inside an aggregated edge (the edge stores source to target, plus `back` reversed). */
function forward(e: MapEdge, from: string) {
  return e.source === from ? e.count - e.back : e.back;
}

/** Edges touching the focus, keeping only those with relations in the requested direction. */
export function focusEdges(edges: MapEdge[], focusId: string | null, direction: FocusDirection): MapEdge[] {
  if (!focusId) return [];
  return edges.filter((e) => {
    if (e.source !== focusId && e.target !== focusId) return false;
    const other = e.source === focusId ? e.target : e.source;
    if (direction === 'out') return forward(e, focusId) > 0;
    if (direction === 'in') return forward(e, other) > 0;
    return true;
  });
}
