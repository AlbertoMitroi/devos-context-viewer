// Computes the visible graph from the model and the view state: filtering, collapse/expand, edge aggregation
// between collapsed groups, focus neighbourhoods and isolated-node pruning. Pure, so it is unit-tested.
import { STRUCTURAL_KINDS } from './kinds';
import type { Edge, GraphModel, HNode } from './graphModel';

export type Direction = 'out' | 'in' | 'both';

export interface Focus {
  ids: string[];
  depth: number;
  direction: Direction;
  /** Restrict traversal to these kinds; empty means the enabled edge kinds. */
  kinds?: string[];
  label?: string;
}

export interface ViewState {
  expanded: Set<string>;
  hidden: Set<string>;
  edgeKinds: Set<string>;
  entityKinds: Set<string>;
  origins: Set<string>;
  resolutions: Set<string>;
  usages: Set<string>;
  disabledRoots: Set<string>;
  hideTests: boolean;
  hideIsolated: boolean;
  minWeight: number;
  mergeKinds: boolean;
  focus: Focus | null;
  searchFilter: string[] | null;
  maxFocusNodes: number;
}

export interface VNode {
  id: string;
  parent?: string;
  label: string;
  kind: string;
  tier: HNode['tier'];
  origin: string;
  compound: boolean;
  hiddenInside: number;
  degree: number;
  isFocus: boolean;
}

export interface VEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  count: number;
  kinds: Record<string, number>;
  weakest: string;
  edgeIdx: number[];
}

export interface ViewResult {
  nodes: VNode[];
  edges: VEdge[];
  stats: {
    relationsShown: number;
    internal: number;
    focusTruncated: boolean;
    focusSize: number;
  };
}

const RESOLUTION_RANK: Record<string, number> = { exact: 0, ambiguous: 1, candidate: 2, unresolved: 3 };
const EDGE_IDX_CAP = 5000;

export function edgePasses(e: Edge, s: ViewState) {
  if (!s.edgeKinds.has(e.kind)) return false;
  if (!s.resolutions.has(e.resolution)) return false;
  if (e.usage && !s.usages.has(e.usage)) return false;
  return true;
}

/** Nodes excluded outright (their edges disappear); kind filters only hide nodes, never edges. */
export function makeExcluded(model: GraphModel, s: ViewState) {
  const memo = new Map<string, boolean>();
  const excluded = (id: string): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const n = model.nodes.get(id);
    let res = !n;
    if (n) {
      const root = model.nodes.get(n.root)!;
      res =
        s.disabledRoots.has(n.root) ||
        (s.hideTests && root.isTest) ||
        (n.origin !== 'group' && !s.origins.has(n.origin)) ||
        s.hidden.has(id) ||
        (n.parent ? excluded(n.parent) : false);
    }
    memo.set(id, res);
    return res;
  };
  return excluded;
}

/** Breadth-first neighbourhood over passing edges. Unknown kinds are never traversed (contract 3.5). */
export function neighbourhood(model: GraphModel, s: ViewState, focus: Focus, excluded: (id: string) => boolean) {
  const kinds = focus.kinds?.length ? new Set(focus.kinds) : null;
  const ok = (e: Edge) => e.known && !STRUCTURAL_KINDS.has(e.kind) && (kinds ? kinds.has(e.kind) && s.resolutions.has(e.resolution) : edgePasses(e, s));
  const seen = new Set<string>();
  let frontier: string[] = [];
  for (const id of focus.ids) {
    const real = model.nodes.has(id) ? id : model.alias.get(id);
    if (real && !seen.has(real)) {
      seen.add(real);
      frontier.push(real);
    }
  }
  // A group seed (project, namespace, type) stands for all of its descendants.
  const expandSeed = (id: string): string[] => {
    const out: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      stack.push(...model.nodes.get(cur)!.children);
    }
    return out;
  };
  let truncated = false;
  const seeds = new Set(frontier.flatMap(expandSeed));
  frontier = [...seeds];
  const reached = new Set<string>(focus.ids.filter((id) => model.nodes.has(id)));
  const visitedFrom = new Set<string>(seeds);
  for (let d = 0; d < focus.depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const lists: number[][] = [];
      if (focus.direction !== 'in') lists.push(model.out.get(id) ?? []);
      if (focus.direction !== 'out') lists.push(model.in.get(id) ?? []);
      for (const list of lists) {
        for (const idx of list) {
          const e = model.edges[idx];
          if (!ok(e)) continue;
          const other = e.from === id ? e.to : e.from;
          if (excluded(other)) continue;
          reached.add(other);
          if (!visitedFrom.has(other)) {
            visitedFrom.add(other);
            next.push(other);
          }
          if (reached.size >= s.maxFocusNodes) {
            truncated = true;
            break;
          }
        }
        if (truncated) break;
      }
      if (truncated) break;
    }
    if (truncated) break;
    frontier = next;
  }
  return { reached, seeds, truncated };
}

export function computeView(model: GraphModel, s: ViewState): ViewResult {
  const excluded = makeExcluded(model, s);

  // Optional restriction to a node set (focus or search filter), always with ancestors.
  let allowed: Set<string> | null = null;
  const forcedExpanded = new Set<string>();
  const focusIds = new Set<string>();
  let focusTruncated = false;
  let focusSize = 0;
  const restrictTo = (ids: Iterable<string>, expandAncestors: boolean) => {
    allowed ??= new Set<string>();
    for (const id of ids) {
      allowed.add(id);
      let p = model.nodes.get(id)?.parent ?? null;
      while (p) {
        allowed.add(p);
        if (expandAncestors) forcedExpanded.add(p);
        p = model.nodes.get(p)?.parent ?? null;
      }
    }
  };
  if (s.focus) {
    const { reached, truncated } = neighbourhood(model, s, s.focus, excluded);
    focusTruncated = truncated;
    focusSize = reached.size;
    for (const id of s.focus.ids) focusIds.add(model.nodes.has(id) ? id : model.alias.get(id) ?? id);
    // Seeds that are groups keep their own expand state; reached nodes are made visible individually.
    restrictTo(reached, true);
  }
  if (s.searchFilter) {
    const prev: Set<string> | null = allowed;
    allowed = null;
    restrictTo(s.searchFilter, true);
    if (prev) {
      const searchSet: Set<string> = allowed!;
      allowed = new Set([...prev].filter((id) => searchSet.has(id)));
    }
  }

  // Alive = not excluded, allowed, and either its kind is enabled or it contains something alive.
  const alive = new Map<string, boolean>();
  const isAlive = (id: string): boolean => {
    const cached = alive.get(id);
    if (cached !== undefined) return cached;
    const n = model.nodes.get(id)!;
    let res = false;
    if (!excluded(id) && (!allowed || allowed.has(id))) {
      let childAlive = false;
      for (const c of n.children) if (isAlive(c)) childAlive = true;
      if (n.tier === 'entity') res = s.entityKinds.has(n.kind) || childAlive;
      else if (n.kind === 'group' || n.kind === 'pkgnamespace') res = childAlive;
      else res = true; // projects and packages stand on their own
    }
    alive.set(id, res);
    return res;
  };

  // Visible frontier: expanded alive nodes with alive children become compounds.
  const visible = new Map<string, VNode>();
  const stack: { id: string; parent?: string }[] = [];
  for (let i = model.roots.length - 1; i >= 0; i--) stack.push({ id: model.roots[i] });
  while (stack.length) {
    const { id, parent } = stack.pop()!;
    if (!isAlive(id)) continue;
    const n = model.nodes.get(id)!;
    const aliveChildren = n.children.filter((c) => isAlive(c));
    const open = (s.expanded.has(id) || forcedExpanded.has(id)) && aliveChildren.length > 0;
    visible.set(id, {
      id,
      parent,
      label: n.label,
      kind: n.kind,
      tier: n.tier,
      origin: n.origin,
      compound: open,
      hiddenInside: open ? 0 : n.descendants,
      degree: 0,
      isFocus: focusIds.has(id),
    });
    if (open) for (let i = aliveChildren.length - 1; i >= 0; i--) stack.push({ id: aliveChildren[i], parent: id });
  }

  // Representative of any node: nearest visible ancestor-or-self.
  const repMemo = new Map<string, string | null>();
  const rep = (id: string): string | null => {
    const cached = repMemo.get(id);
    if (cached !== undefined) return cached;
    let res: string | null = null;
    if (!excluded(id) && (!allowed || allowed.has(id) || allowedByAncestor(id))) {
      if (visible.has(id)) res = id;
      else {
        const p = model.nodes.get(id)?.parent;
        res = p ? rep(p) : null;
      }
    }
    repMemo.set(id, res);
    return res;
  };
  // With a restriction, a descendant of an allowed node is represented by it only if that node is collapsed.
  function allowedByAncestor(id: string) {
    let p = model.nodes.get(id)?.parent ?? null;
    while (p) {
      if (allowed!.has(p)) return !(visible.get(p)?.compound ?? true);
      p = model.nodes.get(p)?.parent ?? null;
    }
    return false;
  }
  const isAncestor = (a: string, b: string) => {
    let p = visible.get(b)?.parent;
    while (p) {
      if (p === a) return true;
      p = visible.get(p)?.parent;
    }
    return false;
  };

  const agg = new Map<string, VEdge>();
  let relationsShown = 0;
  let internal = 0;
  for (const e of model.edges) {
    if (!edgePasses(e, s)) continue;
    const a = rep(e.from);
    const b = rep(e.to);
    if (!a || !b) continue;
    if (a === b || isAncestor(a, b) || isAncestor(b, a)) {
      internal++;
      continue;
    }
    const kindKey = s.mergeKinds ? '*' : e.kind;
    const key = `${a}\u0000${b}\u0000${kindKey}`;
    let v = agg.get(key);
    if (!v) {
      v = { id: `e${agg.size}`, source: a, target: b, kind: e.kind, count: 0, kinds: {}, weakest: e.resolution, edgeIdx: [] };
      agg.set(key, v);
    }
    v.count++;
    v.kinds[e.kind] = (v.kinds[e.kind] ?? 0) + 1;
    if ((RESOLUTION_RANK[e.resolution] ?? 4) > (RESOLUTION_RANK[v.weakest] ?? 4)) v.weakest = e.resolution;
    if (v.edgeIdx.length < EDGE_IDX_CAP) v.edgeIdx.push(e.idx);
    relationsShown++;
  }

  let edges = [...agg.values()];
  if (s.mergeKinds) {
    for (const v of edges) {
      // The dominant kind gives the colour; the inspector lists the full breakdown.
      v.kind = Object.entries(v.kinds).sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  if (s.minWeight > 1) edges = edges.filter((v) => v.count >= s.minWeight);
  for (const v of edges) {
    visible.get(v.source)!.degree += v.count;
    visible.get(v.target)!.degree += v.count;
  }

  let nodes = [...visible.values()];
  if (s.hideIsolated && !s.focus) {
    const childCount = new Map<string, number>();
    for (const n of nodes) if (n.parent) childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
    const removed = new Set<string>();
    // Deepest first, so emptied compounds are reconsidered after their children.
    const byDepth = [...nodes].sort((a, b) => model.nodes.get(b.id)!.depth - model.nodes.get(a.id)!.depth);
    for (const n of byDepth) {
      if (n.degree === 0 && !(childCount.get(n.id) ?? 0)) {
        removed.add(n.id);
        if (n.parent) childCount.set(n.parent, childCount.get(n.parent)! - 1);
      }
    }
    nodes = nodes.filter((n) => !removed.has(n.id));
  }

  return { nodes, edges, stats: { relationsShown, internal, focusTruncated, focusSize } };
}

/** Shortest path over passing, known, non-structural edges. Returns node ids, or null. */
export function shortestPath(model: GraphModel, s: ViewState, from: string, to: string, directed: boolean): string[] | null {
  const excluded = makeExcluded(model, s);
  const prev = new Map<string, string | null>([[from, null]]);
  let frontier = [from];
  while (frontier.length && !prev.has(to)) {
    const next: string[] = [];
    for (const id of frontier) {
      const lists = [model.out.get(id) ?? []];
      if (!directed) lists.push(model.in.get(id) ?? []);
      for (const list of lists) {
        for (const idx of list) {
          const e = model.edges[idx];
          if (!e.known || STRUCTURAL_KINDS.has(e.kind) || !edgePasses(e, s)) continue;
          const other = e.from === id ? e.to : e.from;
          if (prev.has(other) || excluded(other)) continue;
          prev.set(other, id);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  for (let cur: string | null = to; cur; cur = prev.get(cur) ?? null) path.unshift(cur);
  return path;
}

/** Expanded set for a semantic level: 0 roots, 1 namespaces, 2 types, 3 members. */
export function expandedForLevel(model: GraphModel, level: number): Set<string> {
  const out = new Set<string>();
  for (const n of model.nodes.values()) {
    if (!n.children.length) continue;
    const isRootish = n.tier === 'group' && (n.kind === 'project' || n.kind === 'package' || n.kind === 'group');
    const isNs = n.kind === 'namespace' || n.kind === 'pkgnamespace';
    if (level >= 1 && isRootish) out.add(n.id);
    if (level >= 2 && isNs) out.add(n.id);
    if (level >= 3 && !isRootish && !isNs) out.add(n.id);
  }
  return out;
}
