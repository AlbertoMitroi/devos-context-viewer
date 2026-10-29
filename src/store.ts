// Application state: generations, the loaded model, view state and UI selection.
import { create } from 'zustand';
import { buildGraphModel, ancestors, type GraphModel } from './model/graphModel';
import { expandedForLevel, shortestPath, type Direction, type Focus, type ViewState } from './model/graphView';
import { STRUCTURAL_KINDS } from './model/kinds';
import { fetchServerGenerations, localSources, serverSource, type DataSource } from './model/source';
import type { Evidence, GenerationData, GenerationInfo } from './model/types';
import type { WorkerRequest, WorkerResponse } from './model/load.worker';
import type { MapLayout } from './model/mapLayout';

export type Tab = 'map' | 'graph' | 'tables' | 'overview' | 'docs';
export type MapEdges = 'all' | 'selection' | 'none';
export type LayoutName = 'fcose' | 'elk-right' | 'elk-down' | 'concentric' | 'breadthfirst' | 'grid' | 'circle';

export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string; edgeIdx: number[]; source: string; target: string; kinds: Record<string, number> } | null;

interface HistoryEntry {
  focus: Focus | null;
  expanded: Set<string>;
}

interface State extends ViewState {
  generations: GenerationInfo[];
  sources: Record<string, DataSource>;
  activeId: string | null;
  loading: string | null;
  error: string | null;
  data: GenerationData | null;
  model: GraphModel | null;
  tab: Tab;
  layout: LayoutName;
  layoutTick: number;
  fitTick: number;
  edgeLabels: boolean;
  hoverHighlight: boolean;
  mapEdges: MapEdges;
  selection: Selection;
  centerOn: string | null;
  searchQuery: string;
  searchHits: string[];
  pathStart: string | null;
  pathNodes: string[] | null;
  history: HistoryEntry[];
  future: HistoryEntry[];
  tableTab: string;
  tableFilter: string;
  docPath: string | null;
  inspectorOpen: boolean;
  layersOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** Published by the map so the header breadcrumb can show where the view is. */
  mapLayout: MapLayout | null;
  mapPath: string[];
  /** Navigate the map to a node (or to everything with null): select it, fly there, record history. */
  navigate(id: string | null, opts?: { push?: boolean; select?: boolean }): void;

  refreshGenerations(): Promise<void>;
  addLocalFolder(files: FileList): Promise<void>;
  openGeneration(id: string): Promise<void>;
  evidence(ids: string[]): Promise<Evidence[]>;
  set(partial: Partial<State>): void;
  toggleIn(key: SetKey, value: string): void;
  setAll(key: SetKey, values: string[]): void;
  toggleExpanded(id: string): void;
  expandSubtree(id: string): void;
  collapseSubtree(id: string): void;
  setLevel(level: number): void;
  reveal(id: string): void;
  setFocus(focus: Focus | null): void;
  back(): void;
  forward(): void;
  hide(id: string): void;
  isolateRoot(id: string): void;
  findPath(from: string, to: string, directed: boolean): boolean;
  resetFilters(): void;
}

type SetKey = 'edgeKinds' | 'entityKinds' | 'origins' | 'resolutions' | 'usages' | 'disabledRoots' | 'hidden';

let worker: Worker | null = null;
let requestSeq = 0;
const pending = new Map<number, (items: Evidence[]) => void>();

function defaultView(model: GraphModel): ViewState {
  return {
    expanded: new Set(),
    hidden: new Set(),
    edgeKinds: new Set([...model.edgeKinds.keys()].filter((k) => !STRUCTURAL_KINDS.has(k))),
    entityKinds: new Set(model.entityKinds.keys()),
    origins: new Set(['source', 'generated']),
    resolutions: new Set(model.resolutions.keys()),
    usages: new Set(model.usages.keys()),
    disabledRoots: new Set(),
    hideTests: false,
    hideIsolated: false,
    minWeight: 1,
    mergeKinds: true,
    focus: null,
    searchFilter: null,
    maxFocusNodes: 400,
  };
}

function writeHash(id: string | null, sel?: string | null, push = false) {
  const p = new URLSearchParams();
  if (id) p.set('g', id);
  if (sel) p.set('n', sel);
  const h = p.toString();
  if (location.hash.slice(1) === h) return;
  // Navigations push, so the browser's Back and Forward fly the map back; selection changes replace.
  if (push) history.pushState(null, '', h ? `#${h}` : location.pathname);
  else history.replaceState(null, '', h ? `#${h}` : location.pathname);
}

/** centerOn value that asks the map to show everything. */
export const ROOT = '__root';

export const useStore = create<State>((set, get) => ({
  ...({} as ViewState),
  expanded: new Set(),
  hidden: new Set(),
  edgeKinds: new Set(),
  entityKinds: new Set(),
  origins: new Set(['source', 'generated']),
  resolutions: new Set(),
  usages: new Set(),
  disabledRoots: new Set(),
  hideTests: false,
  hideIsolated: false,
  minWeight: 1,
  mergeKinds: true,
  focus: null,
  searchFilter: null,
  maxFocusNodes: 400,
  generations: [],
  sources: {},
  activeId: null,
  loading: null,
  error: null,
  data: null,
  model: null,
  tab: 'map',
  layout: 'fcose',
  layoutTick: 0,
  fitTick: 0,
  edgeLabels: true,
  hoverHighlight: true,
  mapEdges: 'selection',
  selection: null,
  centerOn: null,
  searchQuery: '',
  searchHits: [],
  pathStart: null,
  pathNodes: null,
  history: [],
  future: [],
  tableTab: 'entities',
  tableFilter: '',
  docPath: null,
  inspectorOpen: true,
  layersOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  mapLayout: null,
  mapPath: [],

  navigate(id, opts = {}) {
    const push = opts.push ?? true;
    const select = opts.select ?? true;
    if (!id) {
      set({ centerOn: ROOT, ...(select ? { selection: null } : {}) });
      writeHash(get().activeId, null, push);
      return;
    }
    const model = get().model;
    const real = model?.nodes.has(id) ? id : model?.alias.get(id);
    if (!real) return;
    set({ centerOn: real, ...(select ? { selection: { type: 'node' as const, id: real } } : {}) });
    writeHash(get().activeId, real, push);
  },

  async refreshGenerations() {
    const server = await fetchServerGenerations();
    const sources = { ...get().sources };
    for (const g of server) sources[g.id] = serverSource(g);
    const local = get().generations.filter((g) => g.local);
    set({ generations: [...server, ...local], sources });
  },

  async addLocalFolder(files) {
    const found = await localSources(files);
    if (!found.length) {
      set({ error: 'The selected folder contains no generation (manifest.json or graph/entities.ndjson).' });
      return;
    }
    const sources = { ...get().sources };
    for (const s of found) sources[s.info.id] = s;
    const others = get().generations.filter((g) => !found.some((f) => f.info.id === g.id));
    set({ sources, generations: [...others, ...found.map((f) => f.info)] });
    await get().openGeneration(found[0].info.id);
  },

  async openGeneration(id) {
    const source = get().sources[id];
    if (!source) return;
    set({ loading: 'listing files', error: null, activeId: id });
    worker?.terminate();
    worker = new Worker(new URL('./model/load.worker.ts', import.meta.url), { type: 'module' });
    const files = await source.listFiles();
    const handles: Record<string, string | File | null> = {};
    for (const f of files) handles[f.path] = source.handle(f.path);
    const data = await new Promise<GenerationData>((resolve, reject) => {
      worker!.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        if (m.type === 'progress') set({ loading: m.message });
        else if (m.type === 'loaded') resolve(m.data);
        else if (m.type === 'error') reject(new Error(m.message));
        else if (m.type === 'evidence') {
          pending.get(m.requestId)?.(m.items);
          pending.delete(m.requestId);
        }
      };
      worker!.postMessage({ type: 'load', files, handles } satisfies WorkerRequest);
    }).catch((e: Error) => {
      set({ loading: null, error: `Loading failed: ${e.message}` });
      return null;
    });
    if (!data) return;
    set({ loading: 'building graph' });
    const model = buildGraphModel(data);
    // Keep later messages flowing to pending evidence requests.
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === 'evidence') {
        pending.get(m.requestId)?.(m.items);
        pending.delete(m.requestId);
      }
    };
    const docs = data.files.filter((f) => /^(context|wiki)\/.*\.md$/.test(f.path));
    set({
      ...defaultView(model),
      data,
      model,
      loading: null,
      selection: null,
      pathNodes: null,
      pathStart: null,
      history: [],
      future: [],
      searchQuery: '',
      searchHits: [],
      docPath: docs.find((d) => /overview|index/.test(d.path))?.path ?? docs[0]?.path ?? null,
      layoutTick: get().layoutTick + 1,
    });
    writeHash(id);
  },

  evidence(ids) {
    if (!worker || !ids.length) return Promise.resolve([]);
    const requestId = ++requestSeq;
    return new Promise((resolve) => {
      pending.set(requestId, resolve);
      worker!.postMessage({ type: 'evidence', requestId, ids } satisfies WorkerRequest);
    });
  },

  set(partial) {
    set(partial);
    if ('selection' in partial) {
      const sel = partial.selection;
      writeHash(get().activeId, sel?.type === 'node' ? sel.id : null);
    }
  },

  toggleIn(key, value) {
    const next = new Set(get()[key]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    set({ [key]: next } as Partial<State>);
  },

  setAll(key, values) {
    set({ [key]: new Set(values) } as Partial<State>);
  },

  toggleExpanded(id) {
    const model = get().model;
    if (!model?.nodes.get(id)?.children.length) return;
    const next = new Set(get().expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ expanded: next });
  },

  expandSubtree(id) {
    const model = get().model;
    if (!model) return;
    const next = new Set(get().expanded);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const n = model.nodes.get(cur)!;
      if (n.children.length) next.add(cur);
      stack.push(...n.children);
    }
    set({ expanded: next });
  },

  collapseSubtree(id) {
    const model = get().model;
    if (!model) return;
    const next = new Set(get().expanded);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      next.delete(cur);
      stack.push(...model.nodes.get(cur)!.children);
    }
    set({ expanded: next });
  },

  setLevel(level) {
    const model = get().model;
    if (model) set({ expanded: expandedForLevel(model, level) });
  },

  reveal(id) {
    const model = get().model;
    if (!model) return;
    const real = model.nodes.has(id) ? id : model.alias.get(id);
    if (!real) return;
    const next = new Set(get().expanded);
    for (const a of ancestors(model, real)) next.add(a);
    const n = model.nodes.get(real)!;
    const patch: Partial<State> = { expanded: next, selection: { type: 'node', id: real }, centerOn: real, tab: get().tab === 'graph' ? 'graph' : 'map' };
    // Make sure filters do not hide what the user asked to see.
    if (n.tier === 'entity' && !get().entityKinds.has(n.kind)) patch.entityKinds = new Set([...get().entityKinds, n.kind]);
    if (n.origin !== 'group' && !get().origins.has(n.origin)) patch.origins = new Set([...get().origins, n.origin]);
    if (get().disabledRoots.has(n.root)) {
      const roots = new Set(get().disabledRoots);
      roots.delete(n.root);
      patch.disabledRoots = roots;
    }
    if (n.isTest && get().hideTests) patch.hideTests = false;
    writeHash(get().activeId, real, true);
    get().set(patch);
  },

  setFocus(focus) {
    const { history, expanded } = get();
    set({ history: [...history, { focus: get().focus, expanded }].slice(-50), future: [], focus, pathNodes: null, ...(focus ? { tab: 'graph' as Tab } : {}) });
  },

  back() {
    const { history, future } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    set({ history: history.slice(0, -1), future: [{ focus: get().focus, expanded: get().expanded }, ...future], focus: prev.focus, expanded: prev.expanded });
  },

  forward() {
    const { history, future } = get();
    const next = future[0];
    if (!next) return;
    set({ future: future.slice(1), history: [...history, { focus: get().focus, expanded: get().expanded }], focus: next.focus, expanded: next.expanded });
  },

  hide(id) {
    set({ hidden: new Set([...get().hidden, id]), selection: null });
  },

  isolateRoot(id) {
    const model = get().model;
    if (!model) return;
    const root = model.nodes.get(id)?.root ?? id;
    set({ disabledRoots: new Set(model.roots.filter((r) => r !== root)) });
  },

  findPath(from, to, directed) {
    const model = get().model;
    if (!model) return false;
    const path = shortestPath(model, get(), from, to, directed);
    if (!path) return false;
    get().setFocus({ ids: path, depth: 0, direction: 'both', label: `path: ${path.length} nodes` });
    set({ pathNodes: path, pathStart: null });
    return true;
  },

  resetFilters() {
    const model = get().model;
    if (!model) return;
    const d = defaultView(model);
    set({ ...d, expanded: get().expanded, focus: get().focus });
  },
}));

export type { Direction };
