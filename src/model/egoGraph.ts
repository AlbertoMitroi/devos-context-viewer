// Ego graph for the Neighbourhood view: the focused symbol in the middle, what uses it in columns to the left,
// what it uses in columns to the right. No nesting; crowded columns collapse into one card per project.
import { STRUCTURAL_KINDS } from './kinds';
import type { Edge, GraphModel } from './graphModel';
import { edgePasses, makeExcluded, type Direction, type ViewState } from './graphView';

export interface EgoOptions {
  direction: Direction;
  depth: number;
  /** Relation kinds to follow; null follows every enabled kind. */
  kinds: string[] | null;
  /** A column with more items than this groups them per project. */
  groupThreshold: number;
  /** Group ids the user expanded. */
  expanded: Set<string>;
  /** Hard cap on reached symbols, to keep huge hubs responsive. */
  maxNodes: number;
}

export interface EgoItem {
  id: string;
  type: 'center' | 'symbol' | 'group';
  column: number;
  root: string;
  label: string;
  symbolKind: string;
  /** Model node for symbols and the centre. */
  nodeId?: string;
  /** Members of a group. */
  members?: string[];
  /** Relations of this item drawn in the view. */
  degree: number;
}

export interface EgoLink {
  id: string;
  source: string;
  target: string;
  count: number;
  kinds: Record<string, number>;
  edgeIdx: number[];
}

export interface EgoGraph {
  items: EgoItem[];
  links: EgoLink[];
  truncated: boolean;
  reached: number;
}

export const CENTER = 'center';

export function buildEgo(model: GraphModel, s: ViewState, centerId: string, o: EgoOptions): EgoGraph {
  const center = model.nodes.get(centerId) ?? model.nodes.get(model.alias.get(centerId) ?? '');
  if (!center) return { items: [], links: [], truncated: false, reached: 0 };
  const excluded = makeExcluded(model, s);
  const kinds = o.kinds ? new Set(o.kinds) : null;
  const follow = (e: Edge) => e.known && !STRUCTURAL_KINDS.has(e.kind) && (kinds ? kinds.has(e.kind) && s.resolutions.has(e.resolution) : edgePasses(e, s));

  // A container in focus stands for everything inside it.
  const inside = new Set<string>();
  const stack = [center.id];
  while (stack.length) {
    const id = stack.pop()!;
    inside.add(id);
    stack.push(...model.nodes.get(id)!.children);
  }

  // Signed column per reached symbol: negative uses the centre, positive is used by it. Nearest wins.
  const column = new Map<string, number>();
  let truncated = false;
  const walk = (dir: 1 | -1) => {
    let frontier = [...inside];
    const seen = new Set<string>(inside);
    for (let d = 1; d <= o.depth && frontier.length; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const idx of (dir === 1 ? model.out : model.in).get(id) ?? []) {
          const e = model.edges[idx];
          if (!follow(e)) continue;
          const other = dir === 1 ? e.to : e.from;
          if (seen.has(other) || inside.has(other) || excluded(other)) continue;
          seen.add(other);
          const prev = column.get(other);
          if (prev === undefined || Math.abs(prev) > d) column.set(other, dir * d);
          next.push(other);
          if (column.size >= o.maxNodes) {
            truncated = true;
            return;
          }
        }
      }
      frontier = next;
    }
  };
  if (o.direction !== 'in') walk(1);
  if (o.direction !== 'out' && !truncated) walk(-1);

  // Columns, grouped per project when crowded.
  const byColumn = new Map<number, string[]>();
  for (const [id, c] of column) byColumn.set(c, [...(byColumn.get(c) ?? []), id]);
  const items: EgoItem[] = [{ id: CENTER, type: 'center', column: 0, root: center.root, label: center.label, symbolKind: center.kind, nodeId: center.id, degree: 0 }];
  const displayOf = new Map<string, string>();
  for (const id of inside) displayOf.set(id, CENTER);
  const label = (id: string) => model.nodes.get(id)!.label;
  for (const [c, ids] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    const roots = new Map<string, string[]>();
    for (const id of ids) {
      const r = model.nodes.get(id)!.root;
      roots.set(r, [...(roots.get(r) ?? []), id]);
    }
    const crowded = ids.length > o.groupThreshold;
    for (const [r, members] of [...roots.entries()].sort((a, b) => label(a[0]).localeCompare(label(b[0])))) {
      const gid = `g:${c}:${r}`;
      if (crowded && members.length > 1 && !o.expanded.has(gid)) {
        items.push({ id: gid, type: 'group', column: c, root: r, label: label(r), symbolKind: model.nodes.get(r)!.kind, members, degree: 0 });
        for (const m of members) displayOf.set(m, gid);
      } else {
        for (const m of members.sort((a, b) => label(a).localeCompare(label(b)))) {
          const n = model.nodes.get(m)!;
          items.push({ id: m, type: 'symbol', column: c, root: r, label: n.label, symbolKind: n.kind, nodeId: m, degree: 0 });
          displayOf.set(m, m);
        }
      }
    }
  }

    const colOf = new Map(items.map((i) => [i.id, i.column]));
  const links = new Map<string, EgoLink>();
  for (const e of model.edges) {
    if (!follow(e)) continue;
    const a = displayOf.get(e.from);
    const b = displayOf.get(e.to);
    if (!a || !b || a === b) continue;
    // Only edges that read left to right between neighbouring columns; the rest would loop back.
    if (colOf.get(b)! - colOf.get(a)! !== 1) continue;
    const key = `${a}\u0000${b}`;
    let l = links.get(key);
    if (!l) {
      l = { id: `l${links.size}`, source: a, target: b, count: 0, kinds: {}, edgeIdx: [] };
      links.set(key, l);
    }
    l.count++;
    l.kinds[e.kind] = (l.kinds[e.kind] ?? 0) + 1;
    if (l.edgeIdx.length < 2000) l.edgeIdx.push(e.idx);
  }
  const degree = new Map<string, number>();
  for (const l of links.values()) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + l.count);
    degree.set(l.target, (degree.get(l.target) ?? 0) + l.count);
  }
  for (const i of items) i.degree = degree.get(i.id) ?? 0;
  return { items, links: [...links.values()], truncated, reached: column.size };
}

/** Item positions for the columns layout (left to right) and the radial layout (rings by distance). */
export function layoutEgo(items: EgoItem[], mode: 'columns' | 'radial') {
  const pos = new Map<string, { x: number; y: number }>();
  const byCol = new Map<number, EgoItem[]>();
  for (const i of items) byCol.set(i.column, [...(byCol.get(i.column) ?? []), i]);
  for (const [c, list] of byCol) {
    if (mode === 'columns' || c === 0) {
      const gap = 72;
      list.forEach((it, k) => pos.set(it.id, { x: c * 360, y: (k - (list.length - 1) / 2) * gap }));
    } else {
      // Users of the centre on the left half, what it uses on the right half.
      const r = Math.abs(c) * 320 + Math.max(0, list.length - 8) * 9;
      const [a0, a1] = c < 0 ? [Math.PI * 0.6, Math.PI * 1.4] : [-Math.PI * 0.4, Math.PI * 0.4];
      list.forEach((it, k) => {
        const t = list.length === 1 ? 0.5 : k / (list.length - 1);
        const a = a0 + (a1 - a0) * t;
        pos.set(it.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
      });
    }
  }
  return pos;
}
