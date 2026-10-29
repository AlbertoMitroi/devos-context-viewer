// Zoomable map of a generation: a stable nested circle-packing layout (projects > namespaces > types > members)
// and the level-of-detail logic that decides, for a given zoom and viewport, which circles are open, which are
// visible and how relations aggregate between them. Pure, so it is unit-tested.
import { hierarchy, pack } from 'd3-hierarchy';
import type { GraphModel } from './graphModel';
import { edgePasses, makeExcluded, type ViewState } from './graphView';

export interface MapNode {
  id: string;
  parent: string | null;
  x: number;
  y: number;
  r: number;
  depth: number;
  kind: string;
  label: string;
  root: string;
  children: string[];
  /** Descendants that are part of the map. */
  size: number;
}

export interface MapLayout {
  nodes: Map<string, MapNode>;
  roots: string[];
  /** Nodes ordered parents first, for drawing. */
  order: MapNode[];
  extent: number;
}

export const MAP_EXTENT = 10000;

/** Lays out every included node once. Filters that change membership rebuild it; zooming never does. */
export function buildMapLayout(model: GraphModel, s: ViewState): MapLayout {
  const excluded = makeExcluded(model, s);
  const included = new Map<string, boolean>();
  const isIncluded = (id: string): boolean => {
    const cached = included.get(id);
    if (cached !== undefined) return cached;
    const n = model.nodes.get(id)!;
    let res = false;
    if (!excluded(id)) {
      let child = false;
      for (const c of n.children) if (isIncluded(c)) child = true;
      if (n.tier === 'entity') res = s.entityKinds.has(n.kind) || child;
      else if (n.kind === 'group' || n.kind === 'pkgnamespace') res = child;
      else res = true;
    }
    included.set(id, res);
    return res;
  };

  type Datum = { id: string; children?: Datum[] };
  const build = (id: string): Datum => {
    const kids = model.nodes.get(id)!.children.filter(isIncluded);
    return kids.length ? { id, children: kids.map(build) } : { id };
  };
  const rootData: Datum = { id: '__root', children: model.roots.filter(isIncluded).map(build) };
  const h = hierarchy(rootData)
    .sum((d) => (d.children ? 0 : 1))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  // Padding leaves room between siblings and a margin inside each parent for its label.
  const laid = pack<Datum>()
    .size([MAP_EXTENT, MAP_EXTENT])
    .padding((d) => (d.depth === 0 ? 60 : Math.max(1.5, d.r * 0.04)))(h);

  const nodes = new Map<string, MapNode>();
  const order: MapNode[] = [];
  laid.each((d) => {
    if (d.depth === 0) return;
    const n = model.nodes.get(d.data.id)!;
    const m: MapNode = {
      id: n.id,
      parent: d.depth === 1 ? null : d.parent!.data.id,
      x: d.x - MAP_EXTENT / 2,
      y: d.y - MAP_EXTENT / 2,
      r: d.r,
      depth: d.depth - 1,
      kind: n.kind,
      label: n.label,
      root: n.root,
      children: (d.children ?? []).map((c) => c.data.id),
      size: (d.value ?? 1) - (d.children ? 0 : 1),
    };
    nodes.set(m.id, m);
    order.push(m);
  });
  order.sort((a, b) => a.depth - b.depth);
  return { nodes, roots: (laid.children ?? []).map((c) => c.data.id), order, extent: MAP_EXTENT };
}

export interface Viewport {
  /** Pixels per layout unit (2^zoom). */
  scale: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapEdge {
  source: string;
  target: string;
  count: number;
  kinds: Record<string, number>;
  kind: string;
  weakest: string;
  edgeIdx: number[];
  /** Relations running target to source; the rest run source to target. */
  back: number;
}

export interface MapFrame {
  /** Nodes to draw (visible and inside the viewport), parents first. */
  drawn: MapNode[];
  open: Set<string>;
  /** How far each open circle is into its opening transition, 0 to 1. Children fade in with it. */
  openness: Map<string, number>;
  /** Opacity of each visible node: 1 for roots, the parent's openness for children. */
  fade: Map<string, number>;
  edges: MapEdge[];
}

/** A circle is fully open (children at full opacity) at this radius on screen, in pixels. */
export const OPEN_PX = 240;
/** Children start fading in at this radius, so opening never pops. */
export const OPEN_START_PX = OPEN_PX * 0.75;

const RESOLUTION_RANK: Record<string, number> = { exact: 0, ambiguous: 1, candidate: 2, unresolved: 3 };

export function computeFrame(model: GraphModel, layout: MapLayout, s: ViewState, vp: Viewport, maxEdgeIdx = 2000): MapFrame {
  const open = new Set<string>();
  const openness = new Map<string, number>();
  const fade = new Map<string, number>();
  const visible = new Set<string>();
  const drawn: MapNode[] = [];
  const inView = (n: MapNode) => n.x + n.r >= vp.minX && n.x - n.r <= vp.maxX && n.y + n.r >= vp.minY && n.y - n.r <= vp.maxY;
  const stack = [...layout.roots];
  while (stack.length) {
    const id = stack.pop()!;
    const n = layout.nodes.get(id)!;
    visible.add(id);
    if (!fade.has(id)) fade.set(id, 1);
    const shown = inView(n);
    if (shown) drawn.push(n);
    const px = n.r * vp.scale;
    if (n.children.length && px >= OPEN_START_PX) {
      open.add(id);
      const t = Math.min(1, (px - OPEN_START_PX) / (OPEN_PX - OPEN_START_PX));
      openness.set(id, t);
      const childFade = t * (fade.get(id) ?? 1);
      for (const c of n.children) fade.set(c, childFade);
      // Children of an off-screen parent are still visible for edge routing, but not drawn.
      for (const c of n.children) stack.push(c);
    }
  }
  drawn.sort((a, b) => a.depth - b.depth);

  // Representative of a model node: its deepest visible ancestor-or-self. Nodes hidden only by a kind filter
  // or by zoom lift their edges to their container; nodes excluded by origin, project, test or hide filters drop them.
  const excluded = makeExcluded(model, s);
  const repMemo = new Map<string, string | null>();
  const rep = (id: string): string | null => {
    const cached = repMemo.get(id);
    if (cached !== undefined) return cached;
    let res: string | null = null;
    if (visible.has(id)) res = id;
    else if (model.nodes.has(id) && !excluded(id)) {
      const p = model.nodes.get(id)!.parent;
      res = p ? rep(p) : null;
    }
    repMemo.set(id, res);
    return res;
  };
  const isAncestor = (a: string, b: string) => {
    let p = layout.nodes.get(b)?.parent ?? null;
    while (p) {
      if (p === a) return true;
      p = layout.nodes.get(p)?.parent ?? null;
    }
    return false;
  };

  const agg = new Map<string, MapEdge>();
  for (const e of model.edges) {
    if (!edgePasses(e, s)) continue;
    const a = rep(e.from);
    const b = rep(e.to);
    if (!a || !b || a === b || isAncestor(a, b) || isAncestor(b, a)) continue;
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    let v = agg.get(key);
    if (!v) {
      v = { source: a, target: b, count: 0, kinds: {}, kind: e.kind, weakest: e.resolution, edgeIdx: [], back: 0 };
      agg.set(key, v);
    }
    if (a !== v.source) v.back++;
    v.count++;
    v.kinds[e.kind] = (v.kinds[e.kind] ?? 0) + 1;
    if ((RESOLUTION_RANK[e.resolution] ?? 4) > (RESOLUTION_RANK[v.weakest] ?? 4)) v.weakest = e.resolution;
    if (v.edgeIdx.length < maxEdgeIdx) v.edgeIdx.push(e.idx);
  }
  const edges = [...agg.values()];
  for (const v of edges) v.kind = Object.entries(v.kinds).sort((x, y) => y[1] - x[1])[0][0];
  if (s.minWeight > 1) return { drawn, open, openness, fade, edges: edges.filter((v) => v.count >= s.minWeight) };
  return { drawn, open, openness, fade, edges };
}

/** Zoom (log2 scale) at which a node fills about `fraction` of the smaller viewport side. */
export function zoomToFit(n: MapNode, width: number, height: number, fraction = 0.8) {
  return Math.log2((Math.min(width, height) * fraction) / (2 * n.r));
}

/** Deepest open node whose circle contains the point: "where am I" for the breadcrumb. */
export function locate(layout: MapLayout, open: Set<string>, x: number, y: number): string[] {
  const path: string[] = [];
  let level = layout.roots;
  for (;;) {
    const hit = level.find((id) => {
      const n = layout.nodes.get(id)!;
      return open.has(id) && (n.x - x) ** 2 + (n.y - y) ** 2 <= n.r * n.r;
    });
    if (!hit) return path;
    path.push(hit);
    level = layout.nodes.get(hit)!.children;
  }
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** Nearest sibling of a node in a screen direction (y grows downwards), for arrow-key navigation. */
export function nearestSibling(layout: MapLayout, id: string, dir: Direction): string | null {
  const n = layout.nodes.get(id);
  if (!n) return null;
  const siblings = n.parent ? layout.nodes.get(n.parent)!.children : layout.roots;
  const [ux, uy] = dir === 'left' ? [-1, 0] : dir === 'right' ? [1, 0] : dir === 'up' ? [0, -1] : [0, 1];
  let best: string | null = null;
  let bestScore = Infinity;
  for (const sid of siblings) {
    if (sid === id) continue;
    const m = layout.nodes.get(sid)!;
    const dx = m.x - n.x;
    const dy = m.y - n.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const along = (dx * ux + dy * uy) / dist;
    if (along < 0.35) continue;
    // Prefer siblings straight ahead: distance grows with the angle off the requested direction.
    const score = dist * (1 + 2 * (1 - along));
    if (score < bestScore) {
      bestScore = score;
      best = sid;
    }
  }
  return best;
}
