// Builds the navigable model of one generation: a containment hierarchy (project > namespace > type > member,
// package > namespace > type > member for metadata symbols) and a flat edge list with adjacency indexes.
import { isKnownEdgeKind, MEMBER_KINDS, TYPE_KINDS } from './kinds';
import type { Declaration, Entity, GenerationData, Json, Link, ProjectRecord, Relation } from './types';

export type NodeTier = 'group' | 'entity';

export interface HNode {
  id: string;
  parent: string | null;
  children: string[];
  label: string;
  fullName: string;
  kind: string;
  tier: NodeTier;
  depth: number;
  /** Top-level ancestor (project, package or group node). */
  root: string;
  origin: string;
  isTest: boolean;
  entity?: Entity;
  record?: Json;
  descendants: number;
  /** Ids merged into this node by namespace compaction. */
  aliases?: string[];
}

export interface Edge {
  idx: number;
  kind: string;
  from: string;
  to: string;
  resolution: string;
  usage?: string;
  synthetic: boolean;
  known: boolean;
  relation?: Relation;
  link?: Link;
}

export interface GraphModel {
  nodes: Map<string, HNode>;
  roots: string[];
  edges: Edge[];
  out: Map<string, number[]>;
  in: Map<string, number[]>;
  alias: Map<string, string>;
  edgeKinds: Map<string, number>;
  entityKinds: Map<string, number>;
  usages: Map<string, number>;
  resolutions: Map<string, number>;
  origins: Map<string, number>;
  unknownKinds: string[];
  dangling: { count: number; samples: string[] };
  declarationsByEntity: Map<string, Declaration[]>;
  projectByPath: Map<string, ProjectRecord>;
}

const PKG_RE = /^dotnet:pkg:([^@:]+)@([^:]+):([^:]*):/;

const GROUP_PACKAGES = 'group:packages';
const GROUP_UNASSIGNED = 'group:unassigned';

const KIND_ORDER = ['project', 'package', 'group', 'pkgnamespace', 'namespace', 'interface', 'class', 'record', 'struct', 'enum', 'delegate', 'type'];
const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k);
  return i < 0 ? (MEMBER_KINDS.has(k) ? 50 : 40) : i;
};

const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

function push(m: Map<string, number[]>, k: string, v: number) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function isTestProjectPath(p: string) {
  return /(^|\/)tests?\//i.test(p) || /tests?\.[a-z]+proj$/i.test(p) || /\.(unit|functional|integration)tests?\b/i.test(p);
}

function projectLabel(p: ProjectRecord) {
  const angularName = ((p.ext as Json | undefined)?.angular as Json | undefined)?.name;
  return p.assemblyName || (typeof angularName === 'string' && angularName) || p.path.split('/').pop()!.replace(/\.[a-z]+proj$/i, '');
}

function entityLabel(e: Entity, container?: Entity) {
  if (e.kind === 'constructor') return `${container?.name ?? e.name}()`;
  if (e.kind === 'method' || e.kind === 'operator') return `${e.name}()`;
  return e.name || e.id;
}

export interface BuildOptions {
  compactNamespaces?: boolean;
}

export function buildGraphModel(data: GenerationData, opts: BuildOptions = {}): GraphModel {
  const compact = opts.compactNamespaces ?? true;
  const nodes = new Map<string, HNode>();
  const entitiesById = new Map<string, Entity>();
  for (const e of data.entities) entitiesById.set(e.id, e);

  const projectByPath = new Map<string, ProjectRecord>();
  const add = (n: Omit<HNode, 'children' | 'depth' | 'root' | 'descendants'>) => {
    const node: HNode = { ...n, children: [], depth: 0, root: n.id, descendants: 0 };
    nodes.set(n.id, node);
    return node;
  };

  for (const p of data.projects) {
    projectByPath.set(p.path, p);
    add({
      id: p.id,
      parent: null,
      label: projectLabel(p),
      fullName: p.path,
      kind: 'project',
      tier: 'group',
      origin: 'source',
      isTest: isTestProjectPath(p.path),
      record: p,
    });
  }

  const ensureGroup = (id: string, label: string) =>
    nodes.get(id) ?? add({ id, parent: null, label, fullName: label, kind: 'group', tier: 'group', origin: 'group', isTest: false });

  const ensurePackage = (pkg: string, version: string) => {
    const id = `pkg:${pkg}@${version}`;
    return (
      nodes.get(id) ??
      add({ id, parent: ensureGroup(GROUP_PACKAGES, 'External packages').id, label: `${pkg} ${version}`, fullName: `${pkg}@${version}`, kind: 'package', tier: 'group', origin: 'metadata', isTest: false })
    );
  };

  const ensurePkgNamespace = (pkgNode: HNode, ns: string) => {
    const id = `pkgns:${pkgNode.fullName}:${ns}`;
    return nodes.get(id) ?? add({ id, parent: pkgNode.id, label: ns, fullName: ns, kind: 'pkgnamespace', tier: 'group', origin: 'metadata', isTest: false });
  };

  // Entities: parent is the container when known, else the project, else the package namespace.
  for (const e of data.entities) {
    const container = e.container ? entitiesById.get(e.container) : undefined;
    let parent: string | null = null;
    let isTest = false;
    const project = e.project ? projectByPath.get(e.project) : undefined;
    if (project) isTest = isTestProjectPath(project.path);
    if (container && container.id !== e.id) parent = container.id;
    else if (project) parent = project.id;
    else {
      const m = e.id.match(PKG_RE);
      if (m) {
        const pkgNode = ensurePackage(m[1], m[2]);
        parent = e.namespace ? ensurePkgNamespace(pkgNode, e.namespace).id : pkgNode.id;
      } else if (e.project) {
        parent = ensureGroup(`group:project:${e.project}`, e.project).id;
      } else {
        parent = ensureGroup(GROUP_UNASSIGNED, 'Unassigned').id;
      }
    }
    add({
      id: e.id,
      parent,
      label: entityLabel(e, container),
      fullName: (e.signature as string) || e.id,
      kind: e.kind,
      tier: 'entity',
      origin: e.origin ?? 'source',
      isTest,
      entity: e,
    });
  }

  // Break containment cycles defensively, then link children.
  for (const n of [...nodes.values()]) {
    const seen = new Set<string>([n.id]);
    let p = n.parent;
    while (p) {
      if (seen.has(p) || !nodes.has(p)) {
        n.parent = ensureGroup(GROUP_UNASSIGNED, 'Unassigned').id;
        break;
      }
      seen.add(p);
      p = nodes.get(p)!.parent;
    }
  }
  for (const n of nodes.values()) if (n.parent) nodes.get(n.parent)!.children.push(n.id);

  // Namespace compaction: A > A.B > A.B.C with single namespace children become one node "A.B.C".
  const alias = new Map<string, string>();
  if (compact) {
    for (const n of [...nodes.values()]) {
      if (!nodes.has(n.id)) continue;
      if ((n.kind !== 'namespace' && n.kind !== 'pkgnamespace') || n.children.length !== 1) continue;
      let cur = n;
      const merged: HNode[] = [];
      while ((cur.kind === 'namespace' || cur.kind === 'pkgnamespace') && cur.children.length === 1) {
        const child = nodes.get(cur.children[0])!;
        if (child.kind !== cur.kind) break;
        merged.push(cur);
        cur = child;
      }
      if (!merged.length) continue;
      const top = merged[0];
      cur.parent = top.parent;
      cur.label = [...merged.map((m) => m.label), cur.label].join('.');
      cur.aliases = [...(cur.aliases ?? []), ...merged.map((m) => m.id)];
      if (top.parent) {
        const siblings = nodes.get(top.parent)!.children;
        siblings[siblings.indexOf(top.id)] = cur.id;
      }
      for (const m of merged) {
        nodes.delete(m.id);
        alias.set(m.id, cur.id);
      }
    }
  }

  const roots: string[] = [];
  for (const n of nodes.values()) if (!n.parent) roots.push(n.id);

  const sortChildren = (ids: string[]) =>
    ids.sort((a, b) => {
      const na = nodes.get(a)!;
      const nb = nodes.get(b)!;
      return kindRank(na.kind) - kindRank(nb.kind) || na.label.localeCompare(nb.label);
    });
  sortChildren(roots);
  roots.sort((a, b) => {
    const order = (n: HNode) => (n.kind === 'project' ? (n.isTest ? 1 : 0) : n.kind === 'group' ? 3 : 2);
    const na = nodes.get(a)!;
    const nb = nodes.get(b)!;
    return order(na) - order(nb) || na.label.localeCompare(nb.label);
  });

  // Depth, root and descendant counts (iterative DFS).
  const stack: [string, number, string][] = roots.map((r) => [r, 0, r]);
  const post: string[] = [];
  while (stack.length) {
    const [id, depth, root] = stack.pop()!;
    const n = nodes.get(id)!;
    n.depth = depth;
    n.root = root;
    if (n.kind !== 'project') n.isTest = nodes.get(root)!.isTest;
    sortChildren(n.children);
    post.push(id);
    for (const c of n.children) stack.push([c, depth + 1, root]);
  }
  for (let i = post.length - 1; i >= 0; i--) {
    const n = nodes.get(post[i])!;
    if (n.parent) nodes.get(n.parent)!.descendants += n.descendants + 1;
  }

  // Edges.
  const edges: Edge[] = [];
  const out = new Map<string, number[]>();
  const inn = new Map<string, number[]>();
  const edgeKinds = new Map<string, number>();
  const usages = new Map<string, number>();
  const resolutions = new Map<string, number>();
  const dangling = { count: 0, samples: [] as string[] };
  const resolve = (id: string) => (nodes.has(id) ? id : alias.get(id) ?? null);
  const addEdge = (e: Omit<Edge, 'idx' | 'known'>) => {
    const from = resolve(e.from);
    const to = resolve(e.to);
    if (!from || !to) {
      dangling.count++;
      if (dangling.samples.length < 20) dangling.samples.push(`${e.kind}: ${!from ? e.from : e.to}`);
      return;
    }
    const edge: Edge = { ...e, from, to, idx: edges.length, known: isKnownEdgeKind(e.kind) };
    edges.push(edge);
    push(out, from, edge.idx);
    push(inn, to, edge.idx);
    bump(edgeKinds, e.kind);
    bump(resolutions, e.resolution);
    if (e.usage) bump(usages, e.usage);
  };

  for (const r of data.relations) {
    addEdge({ kind: r.kind, from: r.from, to: r.to, resolution: r.resolution ?? 'exact', usage: r.usage, synthetic: false, relation: r });
  }
  for (const p of data.projects) {
    for (const ref of p.projectReferences ?? []) {
      const target = projectByPath.get(ref);
      if (target) addEdge({ kind: 'project_reference', from: p.id, to: target.id, resolution: 'exact', synthetic: true });
    }
    for (const pkg of p.packages ?? []) {
      if (!pkg.direct) continue;
      const pkgNode = ensurePackageForEdge(nodes, pkg.id, pkg.version);
      if (pkgNode) addEdge({ kind: 'package_reference', from: p.id, to: pkgNode, resolution: 'exact', synthetic: true });
    }
  }
  for (const l of data.links) {
    const from = (l.from ?? l.source) as string | undefined;
    const to = (l.to ?? l.target) as string | undefined;
    if (typeof from === 'string' && typeof to === 'string') {
      addEdge({ kind: l.kind, from, to, resolution: l.resolution ?? 'exact', synthetic: false, link: l });
    }
  }

  const entityKinds = new Map<string, number>();
  const origins = new Map<string, number>();
  for (const n of nodes.values()) {
    if (n.tier !== 'entity') continue;
    bump(entityKinds, n.kind);
    bump(origins, n.origin);
  }

  const declarationsByEntity = new Map<string, Declaration[]>();
  for (const d of data.declarations) {
    const id = resolve(d.entity) ?? d.entity;
    const list = declarationsByEntity.get(id);
    if (list) list.push(d);
    else declarationsByEntity.set(id, [d]);
  }

  const unknownKinds = [...edgeKinds.keys()].filter((k) => !isKnownEdgeKind(k)).sort();

  return {
    nodes,
    roots,
    edges,
    out,
    in: inn,
    alias,
    edgeKinds,
    entityKinds,
    usages,
    resolutions,
    origins,
    unknownKinds,
    dangling,
    declarationsByEntity,
    projectByPath,
  };
}

/** Package nodes for direct package references exist only when the generation has symbols from that package. */
function ensurePackageForEdge(nodes: Map<string, HNode>, pkg: string, version: string): string | null {
  const id = `pkg:${pkg}@${version}`;
  return nodes.has(id) ? id : null;
}

export function ancestors(model: GraphModel, id: string): string[] {
  const out: string[] = [];
  let p = model.nodes.get(id)?.parent ?? null;
  while (p) {
    out.push(p);
    p = model.nodes.get(p)?.parent ?? null;
  }
  return out;
}

export function isTypeKind(kind: string) {
  return TYPE_KINDS.has(kind);
}

/** Case-insensitive search over label, signature, id and kind. Every token must match. */
export function searchNodes(model: GraphModel, query: string, limit = 5000): string[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const kindTokens = tokens.filter((t) => t.startsWith('kind:')).map((t) => t.slice(5));
  const textTokens = tokens.filter((t) => !t.startsWith('kind:'));
  const res: { id: string; score: number }[] = [];
  for (const n of model.nodes.values()) {
    if (kindTokens.length && !kindTokens.includes(n.kind)) continue;
    const label = n.label.toLowerCase();
    const hay = `${label} ${n.fullName.toLowerCase()} ${n.id.toLowerCase()}`;
    if (!textTokens.every((t) => hay.includes(t))) continue;
    const t0 = textTokens[0] ?? '';
    const score = label === t0 ? 0 : label.startsWith(t0) ? 1 : label.includes(t0) ? 2 : 3;
    res.push({ id: n.id, score: score * 10 + (n.tier === 'group' ? 0 : 1) + (n.origin === 'metadata' ? 5 : 0) });
  }
  res.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return res.slice(0, limit).map((r) => r.id);
}
