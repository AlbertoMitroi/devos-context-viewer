// Hierarchical edge bundling (Holten 2006) over the circle-packing layout: an edge follows the centres of its
// endpoints' ancestors up to their lowest common ancestor, smoothed as a B-spline and straightened by beta.
import type { MapLayout } from '../model/mapLayout';

export type Point = [number, number];

function chain(layout: MapLayout, id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur) {
    out.push(cur);
    cur = layout.nodes.get(cur)?.parent ?? null;
  }
  return out;
}

/**
 * Control points: the endpoints plus at most one ancestor on each side, below the lowest common ancestor.
 * Routing through big ancestors (or the map centre) made long white fans across the map; one level of
 * bundling keeps sibling groups together while lines stay short and direct.
 */
export function controlPoints(layout: MapLayout, a: string, b: string): Point[] {
  const ca = chain(layout, a);
  const cb = chain(layout, b);
  const inB = new Set(cb);
  const lcaIndex = ca.findIndex((id) => inB.has(id));
  const lca = lcaIndex < 0 ? null : ca[lcaIndex];
  const pt = (id: string) => {
    const n = layout.nodes.get(id)!;
    return [n.x, n.y] as Point;
  };
  const pts: Point[] = [pt(a)];
  if (ca[1] && ca[1] !== lca) pts.push(pt(ca[1]));
  if (cb[1] && cb[1] !== lca) pts.push(pt(cb[1]));
  pts.push(pt(b));
  return pts;
}

/** Uniform cubic B-spline through straightened control points, clamped to the endpoints. */
export function bundle(points: Point[], beta = 0.7, perSegment = 8): Point[] {
  const n = points.length;
  if (n <= 2) return points;
  const [x0, y0] = points[0];
  const [x1, y1] = points[n - 1];
  const p = points.map(([x, y], i) => {
    const t = i / (n - 1);
    return [beta * x + (1 - beta) * (x0 + t * (x1 - x0)), beta * y + (1 - beta) * (y0 + t * (y1 - y0))] as Point;
  });
  const q = [p[0], p[0], ...p, p[n - 1], p[n - 1]];
  const out: Point[] = [];
  for (let i = 0; i < q.length - 3; i++) {
    const [a, b, c, d] = [q[i], q[i + 1], q[i + 2], q[i + 3]];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const w0 = (1 - 3 * t + 3 * t2 - t3) / 6;
      const w1 = (4 - 6 * t2 + 3 * t3) / 6;
      const w2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
      const w3 = t3 / 6;
      out.push([w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0], w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1]]);
    }
  }
  out.push(p[n - 1]);
  return out;
}

/** A direct pair (siblings) gets a gentle arc instead of a straight line. */
function arc(a: Point, b: Point, bend = 0.16, samples = 16): Point[] {
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend;
  const my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
  const out: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * my + t * t * b[1]]);
  }
  return out;
}

/** Path cache per layout. Keys are ordered pairs so direction is preserved. */
export function createEdgeRouter(layout: MapLayout) {
  const cache = new Map<string, Point[]>();
  return (a: string, b: string): Point[] => {
    const key = `${a}\u0000${b}`;
    let path = cache.get(key);
    if (!path) {
      const cps = controlPoints(layout, a, b);
      path = cps.length <= 2 ? arc(cps[0], cps[cps.length - 1]) : bundle(cps);
      cache.set(key, path);
    }
    return path;
  };
}

/** Point at fraction t along a polyline, by arc length. */
export function pointAt(path: Point[], t: number): Point {
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    seg.push(l);
    total += l;
  }
  let target = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, target / seg[i]) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    target -= seg[i];
  }
  return path[path.length - 1];
}
