// Builds the navigable model of one generation: a containment hierarchy (project > namespace > type > member,
// package > namespace > type > member for metadata symbols) and a flat edge list with adjacency indexes.
// A system generation adds one level on top: each input repository holds its projects and packages, and the
// system links between repositories become edges.
import { isKnownEdgeKind, MEMBER_KINDS, TYPE_KINDS } from './kinds';
import { isSystem } from './parse';
import type { Declaration, Entity, GenerationData, Json, Link, ProjectRecord, Relation, SystemInput } from './types';

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
  /** Project-level ancestor (project, package or group node); a repository of a system is not one. */
  root: string;
  /** Top-level ancestor: the repository in a system generation, else the same as root. */
  top: string;
  /** Input repository of a system generation. */
  input?: string;
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
  /** Where the map draws a side whose node is filtered out: the consumer of a package entity (system links). */
  fromAlt?: string;
  toAlt?: string;
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
  /** Keyed by projectKey(input, path): the path alone for one repository. */
  projectByPath: Map<string, ProjectRecord>;
  /** System generations: the input repositories by id; empty for one repository. */
  inputs: Map<string, SystemInput>;
}

/** Key of a project path in a generation; paths repeat across the repositories of a system. */
export const projectKey = (input: unknown, path: string) => (typeof input === 'string' && input ? `${input}/${path}` : path);

/** Map node id of an input repository. */
export const repositoryId = (input: string) => `repo:${input}`;

/** Repository name of an input: the remote's last segment (devos-lab-core), else the input id. */
export function inputName(input: SystemInput): string {
  const remote = input.repository?.remoteUrl;
  return remote ? remote.replace(/\.git$/, '').replace(/\/$/, '').split(/[/:]/).pop()! : input.id;
}

/** Inputs of a system generation: inputs.ndjson, else the manifest's inputs list. */
export function systemInputs(data: GenerationData): SystemInput[] {
  if (data.inputs.length) return data.inputs;
  const listed = (data.manifest?.inputs as Json[] | undefined) ?? [];
  return listed.map((i) => ({ ...i, id: String(i.id ?? i.name) }) as SystemInput);
}

/** A record's id without its input prefix: `leasing/dotnet:pkg:...` is `dotnet:pkg:...` of input leasing. */
const localId = (id: string, input: string | undefined) => (input && id.startsWith(`${input}/`) ? id.slice(input.length + 1) : id);

const PKG_RE = /^dotnet:pkg:([^@:]+)@([^:]+):([^:]*):/;
const REPOSITORY = 'repository';

const GROUP_PACKAGES = 'group:packages';
const GROUP_UNASSIGNED = 'group:unassigned';

const KIND_ORDER = ['repository', 'project', 'package', 'group', 'pkgnamespace', 'namespace', 'interface', 'class', 'record', 'struct', 'enum', 'delegate', 'type'];
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
  // A repository-level project of a system input ('.') is named after the input.
  if (p.path === '.' && !p.assemblyName && !angularName && typeof p.input === 'string') return p.input;
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
  const add = (n: Omit<HNode, 'children' | 'depth' | 'root' | 'top' | 'descendants'>) => {
    const node: HNode = { ...n, children: [], depth: 0, root: n.id, top: n.id, descendants: 0 };
    nodes.set(n.id, node);
    return node;
  };

  // System generations: one top-level node per input repository.
  const inputs = new Map<string, SystemInput>();
  if (isSystem(data)) {
    for (const i of systemInputs(data)) {
      if (i.included === false || inputs.has(i.id)) continue;
      inputs.set(i.id, i);
      add({ id: repositoryId(i.id), parent: null, label: inputName(i), fullName: i.repository?.remoteUrl ?? i.id, kind: REPOSITORY, tier: 'group', origin: 'group', isTest: false, record: i, input: i.id });
    }
  }
  const inputOf = (r: Json): string | undefined => (typeof r.input === 'string' && inputs.has(r.input) ? r.input : undefined);
  const inRepository = (input: string | undefined) => (input ? repositoryId(input) : null);
  const scoped = (input: string | undefined, id: string) => (input ? `${input}/${id}` : id);

  for (const p of data.projects) {
    const input = inputOf(p);
    projectByPath.set(projectKey(input, p.path), p);
    add({
      id: p.id,
      parent: inRepository(input),
      input,
      label: projectLabel(p),
      fullName: p.path,
      kind: 'project',
      tier: 'group',
      origin: 'source',
      isTest: isTestProjectPath(p.path),
      record: p,
    });
  }

  // Groups and packages of a system input stay inside its repository, with ids scoped by the input.
  const ensureGroup = (id: string, label: string, input?: string) => {
    const gid = scoped(input, id);
    return nodes.get(gid) ?? add({ id: gid, parent: inRepository(input), label, fullName: label, kind: 'group', tier: 'group', origin: 'group', isTest: false, input });
  };

  const ensurePackage = (pkg: string, version: string, input?: string) => {
    const id = scoped(input, `pkg:${pkg}@${version}`);
    return (
      nodes.get(id) ??
      add({ id, parent: ensureGroup(GROUP_PACKAGES, 'External packages', input).id, label: `${pkg} ${version}`, fullName: `${pkg}@${version}`, kind: 'package', tier: 'group', origin: 'metadata', isTest: false, input })
    );
  };

  const ensurePkgNamespace = (pkgNode: HNode, ns: string) => {
    const id = scoped(pkgNode.input, `pkgns:${pkgNode.fullName}:${ns}`);
    return nodes.get(id) ?? add({ id, parent: pkgNode.id, label: ns, fullName: ns, kind: 'pkgnamespace', tier: 'group', origin: 'metadata', isTest: false, input: pkgNode.input });
  };

  // Entities: parent is the container when known, else the project, else the package namespace.
  for (const e of data.entities) {
    const input = inputOf(e);
    const container = e.container ? entitiesById.get(e.container) : undefined;
    let parent: string | null = null;
    let isTest = false;
    const project = e.project ? projectByPath.get(projectKey(input, e.project)) : undefined;
    if (project) isTest = isTestProjectPath(project.path);
    if (container && container.id !== e.id) parent = container.id;
    else if (project) parent = project.id;
    else {
      const m = localId(e.id, input).match(PKG_RE);
      if (m) {
        const pkgNode = ensurePackage(m[1], m[2], input);
        parent = e.namespace ? ensurePkgNamespace(pkgNode, e.namespace).id : pkgNode.id;
      } else if (e.project) {
        parent = ensureGroup(`group:project:${e.project}`, e.project, input).id;
      } else {
        parent = ensureGroup(GROUP_UNASSIGNED, 'Unassigned', input).id;
      }
    }
    add({
      input,
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
    const order = (n: HNode) => (n.kind === 'project' || n.kind === REPOSITORY ? (n.isTest ? 1 : 0) : n.kind === 'group' ? 3 : 2);
    const na = nodes.get(a)!;
    const nb = nodes.get(b)!;
    return order(na) - order(nb) || na.label.localeCompare(nb.label);
  });

  // Depth, root and descendant counts (iterative DFS). Children of a repository are roots of their own.
  const stack: [string, number, string, string][] = roots.map((r) => [r, 0, r, r]);
  const post: string[] = [];
  while (stack.length) {
    const [id, depth, root, top] = stack.pop()!;
    const n = nodes.get(id)!;
    n.depth = depth;
    n.root = root;
    n.top = top;
    if (n.kind !== 'project') n.isTest = nodes.get(root)!.isTest;
    sortChildren(n.children);
    post.push(id);
    for (const c of n.children) stack.push([c, depth + 1, n.kind === REPOSITORY ? c : root, top]);
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
    const input = inputOf(p);
    for (const ref of p.projectReferences ?? []) {
      const target = projectByPath.get(projectKey(input, ref));
      if (target) addEdge({ kind: 'project_reference', from: p.id, to: target.id, resolution: 'exact', synthetic: true });
    }
    for (const pkg of p.packages ?? []) {
      if (!pkg.direct) continue;
      const pkgNode = ensurePackageForEdge(nodes, scoped(input, `pkg:${pkg.id}@${pkg.version}`));
      if (pkgNode) addEdge({ kind: 'package_reference', from: p.id, to: pkgNode, resolution: 'exact', synthetic: true });
    }
  }
  // A package entity of a system link is metadata, hidden by default: the map then draws that side at the
  // project of its input that references the package directly, or at the input's repository.
  const directUsers = new Map<string, string[]>();
  for (const p of data.projects) {
    const input = inputOf(p);
    if (!input) continue;
    for (const pkg of p.packages ?? []) if (pkg.direct) directUsers.set(`${input}/pkg:${pkg.id}@${pkg.version}`, [...(directUsers.get(`${input}/pkg:${pkg.id}@${pkg.version}`) ?? []), p.id]);
  }
  const consumerOf = (id: string): string | undefined => {
    const n = nodes.get(id);
    if (!n || n.origin !== 'metadata' || !n.input) return undefined;
    let pkg: HNode | undefined = n;
    while (pkg && pkg.kind !== 'package') pkg = pkg.parent ? nodes.get(pkg.parent) : undefined;
    const users = pkg ? directUsers.get(pkg.id) ?? [] : [];
    return users.length === 1 ? users[0] : repositoryId(n.input);
  };
  // A side of a system link is an entity, else the project it names; unresolved sides (to: null) stay off the map.
  const sideNode = (side: unknown): string | null => {
    if (!side || typeof side !== 'object') return null;
    const s = side as Json;
    if (typeof s.entity === 'string' && resolve(s.entity)) return s.entity;
    const input = typeof s.input === 'string' ? s.input : undefined;
    const project = typeof s.project === 'string' ? projectByPath.get(projectKey(input, s.project)) : undefined;
    return project?.id ?? null;
  };
  for (const l of data.links) {
    const from = (l.from ?? l.source) as unknown;
    const to = (l.to ?? l.target) as unknown;
    if (typeof from === 'string' && typeof to === 'string') {
      addEdge({ kind: l.kind, from, to, resolution: l.resolution ?? 'exact', synthetic: false, link: l });
    } else if (l.scope === 'system') {
      const a = sideNode(from);
      const b = sideNode(to);
      if (a && b) addEdge({ kind: l.kind, from: a, to: b, resolution: l.resolution ?? 'exact', synthetic: false, link: l, fromAlt: consumerOf(resolve(a)!), toAlt: consumerOf(resolve(b)!) });
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
    inputs,
  };
}

/** Package nodes for direct package references exist only when the generation has symbols from that package. */
function ensurePackageForEdge(nodes: Map<string, HNode>, id: string): string | null {
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
