// Focus mode on the map: which aggregated edges belong to the selection, in which direction, and which
// circles stay lit. Pure functions; hover never feeds into them.
import type { MapEdge, MapLayout } from '../model/mapLayout';

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

export interface Tiers {
  /** The focus, what its edges connect to, and its own children. Fully lit. */
  ends: Set<string>;
  /** Containers of the above, kept faintly for orientation. */
  containers: Set<string>;
}

export function highlightTiers(layout: MapLayout, focusId: string | null, edges: MapEdge[]): Tiers | null {
  if (!focusId) return null;
  const ends = new Set<string>([focusId]);
  for (const e of edges) {
    ends.add(e.source);
    ends.add(e.target);
  }
  for (const c of layout.nodes.get(focusId)?.children ?? []) ends.add(c);
  const containers = new Set<string>();
  for (const id of ends) for (let p = layout.nodes.get(id)?.parent ?? null; p && !containers.has(p); p = layout.nodes.get(p)?.parent ?? null) if (!ends.has(p)) containers.add(p);
  return { ends, containers };
}

/** Opacity of a circle in focus mode. */
export function tierOpacity(t: Tiers | null, id: string) {
  if (!t || t.ends.has(id)) return 1;
  return t.containers.has(id) ? 0.18 : 0.06;
}
