// Map view: a zoomable map of the repository. Projects are planets; zooming in opens them into namespaces,
// types and members. Click to enter a circle, click its background to go up, arrows move between siblings.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL, { type DeckGLRef } from '@deck.gl/react';
import { OrthographicView, type PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { CollisionFilterExtension } from '@deck.gl/extensions';
import { useShallow } from 'zustand/react/shallow';
import { ROOT, useStore } from '../store';
import { buildMapLayout, computeFrame, locate, MAP_EXTENT, nearestSibling, zoomToFit, type Direction, type MapEdge, type MapNode } from '../model/mapLayout';
import { ancestors } from '../model/graphModel';
import { projectColor, relationColor, symbolColor, type RGB } from '../theme/palette';
import { Camera, prefersReducedMotion, wheelZoomDelta, type Cam } from './camera';
import { OrbLayer, RegionLayer } from './OrbLayer';
import { createEdgeRouter, pointAt, type Point } from './edges';
import { Minimap } from './Minimap';
import { HoverCard } from './HoverCard';
import { MapControls } from './MapControls';
import { Legend } from './Legend';
import { fitLabel } from './labels';

type RGBA = [number, number, number, number];

const GROUP_KINDS = new Set(['project', 'package', 'group', 'namespace', 'pkgnamespace']);
const VIEW = new OrthographicView({ id: 'map', flipY: true });
const collision = new CollisionFilterExtension();
const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

const CANVAS: RGB = [9, 9, 11];
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k].map(Math.round) as RGB;
const lighten = ([r, g, b]: RGB, k: number): RGB => [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k].map(Math.round) as RGB;
const a8 = (x: number) => Math.max(0, Math.min(255, Math.round(x)));

interface EdgeHalf {
  edge: MapEdge;
  path: Point[];
  head: boolean;
}

export function MapView() {
  const model = useStore((s) => s.model)!;
  const filters = useStore(
    useShallow((s) => ({
      hidden: s.hidden,
      edgeKinds: s.edgeKinds,
      entityKinds: s.entityKinds,
      origins: s.origins,
      resolutions: s.resolutions,
      usages: s.usages,
      disabledRoots: s.disabledRoots,
      hideTests: s.hideTests,
      minWeight: s.minWeight,
      expanded: s.expanded,
      hideIsolated: s.hideIsolated,
      mergeKinds: s.mergeKinds,
      focus: s.focus,
      searchFilter: s.searchFilter,
      maxFocusNodes: s.maxFocusNodes,
    })),
  );
  const selection = useStore((s) => s.selection);
  const centerOn = useStore((s) => s.centerOn);
  const searchHits = useStore((s) => s.searchHits);
  const searchQuery = useStore((s) => s.searchQuery);
  const edgeMode = useStore((s) => s.mapEdges);
  const fitTick = useStore((s) => s.fitTick);
  const set = useStore((s) => s.set);
  const navigate = useStore((s) => s.navigate);

  const wrap = useRef<HTMLDivElement>(null);
  const deck = useRef<DeckGLRef>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, zoom: -3 });
  const camera = useMemo(() => new Camera(setCam), []);
  const [hover, setHover] = useState<{ x: number; y: number; node?: MapNode; edge?: MapEdge } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [time, setTime] = useState(0);
  const fitted = useRef(false);

  useEffect(() => () => camera.dispose(), [camera]);
  useEffect(() => {
    Promise.all([document.fonts.load(`600 13px ${FONT}`), document.fonts.load(`500 11px ${FONT}`)]).finally(() => setFontsReady(true));
  }, []);

  const layout = useMemo(() => buildMapLayout(model, filters), [model, filters.hidden, filters.entityKinds, filters.origins, filters.disabledRoots, filters.hideTests]); // eslint-disable-line react-hooks/exhaustive-deps
  const route = useMemo(() => createEdgeRouter(layout), [layout]);
  const rootColor = useMemo(() => {
    const m = new Map<string, RGB>();
    layout.roots.forEach((r, i) => m.set(r, projectColor(i)));
    return m;
  }, [layout]);
  const colorOf = useCallback((n: MapNode): RGB => (GROUP_KINDS.has(n.kind) ? rootColor.get(n.root) ?? [120, 130, 150] : symbolColor(n.kind)), [rootColor]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = { width: el.clientWidth, height: el.clientHeight };
      camera.size = s;
      setSize(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [camera]);

  const fitZoom = useCallback(() => Math.log2(Math.min(size.width, size.height) / (MAP_EXTENT * 1.04)), [size]);
  const fitAll = useCallback(() => camera.flyTo({ x: 0, y: 0, zoom: fitZoom() }), [camera, fitZoom]);
  const flyInto = useCallback(
    (n: MapNode) => {
      const leaf = n.children.length === 0;
      camera.flyTo({ x: n.x, y: n.y, zoom: zoomToFit(n, size.width, size.height, leaf ? 0.16 : 0.86) });
    },
    [camera, size],
  );

  // First fit happens without animation; later layout changes fly.
  useEffect(() => {
    if (!size.width) return;
    if (!fitted.current) {
      camera.set({ x: 0, y: 0, zoom: fitZoom() });
      fitted.current = true;
    }
  }, [size, camera, fitZoom]);
  useEffect(() => {
    if (fitTick) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick]);

  const layoutNodeFor = useCallback(
    (id: string) => {
      const found = [id, ...ancestors(model, id)].find((x) => layout.nodes.has(x));
      return found ? layout.nodes.get(found)! : null;
    },
    [model, layout],
  );

  // Search, inspector links, breadcrumbs and browser history all arrive as centerOn.
  useEffect(() => {
    if (!centerOn || !size.width) return;
    if (centerOn === ROOT) fitAll();
    else {
      const n = layoutNodeFor(centerOn);
      if (n) flyInto(n);
    }
    set({ centerOn: null });
  }, [centerOn, size.width, fitAll, flyInto, layoutNodeFor, set]);

  // Level of detail: recomputed per quantised zoom and coarse pan bucket.
  const scale = Math.pow(2, cam.zoom);
  const halfW = size.width / 2 / scale || 1;
  const halfH = size.height / 2 / scale || 1;
  const zq = Math.round(cam.zoom * 16) / 16;
  const bx = Math.round(cam.x / (halfW * 0.25));
  const by = Math.round(cam.y / (halfH * 0.25));
  const frame = useMemo(
    () => computeFrame(model, layout, filters, { scale: Math.pow(2, zq), minX: cam.x - halfW * 1.3, maxX: cam.x + halfW * 1.3, minY: cam.y - halfH * 1.3, maxY: cam.y + halfH * 1.3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, layout, filters, zq, bx, by],
  );

  const crumbs = locate(layout, frame.open, cam.x, cam.y).filter((id) => (frame.openness.get(id) ?? 0) > 0.5);
  const crumbKey = crumbs.join('|');
  // Publish the layout and the current path for the header breadcrumb and the sidebar.
  useEffect(() => {
    set({ mapLayout: layout });
  }, [layout, set]);
  useEffect(() => {
    set({ mapPath: crumbKey ? crumbKey.split('|') : [] });
  }, [crumbKey, set]);
  const selectedId = selection?.type === 'node' ? selection.id : null;
  const selectedOnMap = useMemo(() => (selectedId ? layoutNodeFor(selectedId)?.id ?? null : null), [selectedId, layoutNodeFor]);
  const hoverId = hover?.node?.id ?? null;
  const active = useMemo(() => new Set([hoverId, selectedOnMap].filter(Boolean) as string[]), [hoverId, selectedOnMap]);
  const hits = useMemo(() => {
    const token = searchQuery.toLowerCase().split(/\s+/).find((t) => t && !t.startsWith('kind:')) ?? '';
    return new Set(searchHits.filter((id) => !token || (model.nodes.get(id)?.label.toLowerCase().includes(token) ?? false)));
  }, [searchHits, searchQuery, model]);

  const drawnIds = useMemo(() => new Set(frame.drawn.map((n) => n.id)), [frame]);
  const edgeFade = useCallback((e: MapEdge) => Math.min(frame.fade.get(e.source) ?? 1, frame.fade.get(e.target) ?? 1), [frame]);
  const focusRootId = crumbs[0] ?? null;
  const edges = useMemo(() => {
    if (edgeMode === 'none') return [];
    let list = frame.edges.filter((e) => drawnIds.has(e.source) || drawnIds.has(e.target));
    if (edgeMode === 'selection') return list.filter((e) => active.has(e.source) || active.has(e.target));
    // "All": between projects at the overview, or touching the project you are in.
    const rootOf = (id: string) => layout.nodes.get(id)?.root;
    list = focusRootId ? list.filter((e) => rootOf(e.source) === focusRootId || rootOf(e.target) === focusRootId) : list.filter((e) => !layout.nodes.get(e.source)?.parent && !layout.nodes.get(e.target)?.parent);
    return list;
  }, [frame, drawnIds, edgeMode, active, layout, focusRootId]);
  const activeEdges = useMemo(() => (active.size ? edges.filter((e) => active.has(e.source) || active.has(e.target)) : []), [edges, active]);

  // Edges drawn in two halves: the tail fainter than the head, so direction reads at a glance.
  const halves = useMemo(() => {
    const out: EdgeHalf[] = [];
    for (const e of edges) {
      if (active.has(e.source) || active.has(e.target)) continue;
      const path = route(e.source, e.target);
      const mid = Math.floor(path.length / 2);
      out.push({ edge: e, path: path.slice(0, mid + 1), head: false }, { edge: e, path: path.slice(mid), head: true });
    }
    return out;
  }, [edges, route, active]);

  // Particles flow along active edges while something is hovered or selected.
  useEffect(() => {
    if (!activeEdges.length || prefersReducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setTime((now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeEdges]);
  const particles = useMemo(() => {
    const out: { p: Point; c: RGB }[] = [];
    for (const e of activeEdges.slice(0, 300)) {
      const path = route(e.source, e.target);
      const c = lighten(relationColor(e.kind), 0.35);
      const n = Math.min(4, 1 + Math.floor(Math.log2(e.count + 1)));
      const forward = e.count - e.back;
      for (let k = 0; k < n; k++) {
        const t = (time * 0.35 + k / n) % 1;
        if (forward > 0) out.push({ p: pointAt(path, t), c });
        if (e.back > 0) out.push({ p: pointAt(path, 1 - t), c });
      }
    }
    return out;
  }, [activeEdges, route, time]);

  // Up from the current node (the selection, else the deepest breadcrumb) to the nearest ancestor that is
  // visibly larger, so namespaces with a single child never make Up feel stuck.
  const upFrom = useCallback(
    (id: string | null) => {
      const base = id ? layout.nodes.get(id) : null;
      if (!base) return navigate(null, { select: false });
      let p = base.parent ? layout.nodes.get(base.parent) : null;
      while (p && p.r < base.r * 1.35 && p.parent) p = layout.nodes.get(p.parent)!;
      navigate(p && p.r >= base.r * 1.35 ? p.id : null, p && p.r >= base.r * 1.35 ? {} : { select: false });
    },
    [layout, navigate],
  );
  const goUp = useCallback(() => upFrom(selectedOnMap ?? crumbs[crumbs.length - 1] ?? null), [upFrom, selectedOnMap, crumbs]);

  // Pointer: drag pans with momentum; a click without movement picks.
  const drag = useRef<{ x: number; y: number; moved: boolean; vx: number; vy: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, vx: 0, vy: 0, t: performance.now() };
    camera.stop();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.vx = 0.7 * d.vx + 0.3 * (dx / dt);
    d.vy = 0.7 * d.vy + 0.3 * (dy / dt);
    d.t = now;
    d.x = e.clientX;
    d.y = e.clientY;
    camera.panBy(dx, dy);
    setHover(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      if (performance.now() - d.t < 80) camera.release(d.vx, d.vy);
      return;
    }
    const rect = wrap.current!.getBoundingClientRect();
    const info = deck.current?.pickObject({ x: e.clientX - rect.left, y: e.clientY - rect.top, radius: 3, layerIds: ['orbs', 'regions', 'edges-active'] });
    onPick(info ?? null);
  };

  const onPick = (info: PickingInfo | null) => {
    const obj = info?.object as MapNode | EdgeHalf | MapEdge | undefined;
    // Empty canvas: deselect only. Going up stays on the background of the circle you are in, Backspace and the breadcrumb.
    if (!obj) {
      set({ selection: null });
      return;
    }
    if ('edge' in obj || 'edgeIdx' in obj) {
      const e = 'edge' in obj ? obj.edge : obj;
      set({ selection: { type: 'edge', id: `${e.source}|${e.target}`, edgeIdx: e.edgeIdx, source: e.source, target: e.target, kinds: e.kinds } });
      const a = layout.nodes.get(e.source)!;
      const b = layout.nodes.get(e.target)!;
      const span = Math.max(Math.abs(a.x - b.x) + a.r + b.r, Math.abs(a.y - b.y) + a.r + b.r);
      camera.flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, zoom: Math.min(cam.zoom, Math.log2((Math.min(size.width, size.height) * 0.85) / span)) });
      return;
    }
    // Clicking the background of the circle you are in goes up; clicking anything else goes into it.
    // Background of the circle you are in: first click deselects, the next one goes up.
    if (crumbs.includes(obj.id) && frame.open.has(obj.id)) {
      if (selection) set({ selection: null });
      else upFrom(obj.id);
      return;
    }
    // First click selects (and centres if needed), a second click on the selection goes in.
    if (obj.id === selectedOnMap) {
      navigate(obj.id);
      return;
    }
    set({ selection: { type: 'node', id: obj.id } });
    const px = (obj.x - cam.x) * scale + size.width / 2;
    const py = (obj.y - cam.y) * scale + size.height / 2;
    const margin = Math.min(size.width, size.height) * 0.15;
    if (px < margin || py < margin || px > size.width - margin || py > size.height - margin) camera.flyTo({ x: obj.x, y: obj.y, zoom: cam.zoom }, { maxDuration: 450 });
  };

  // Wheel zooms towards the cursor (pinch arrives as ctrl+wheel).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, wheelZoomDelta(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [camera]);

  // Keyboard: arrows between siblings, Enter goes in, Backspace goes up, Esc closes the inspector or goes up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useStore.getState();
      if (st.tab !== 'map' || st.paletteOpen) return;
      const dirs: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const current = selectedOnMap ?? crumbs[crumbs.length - 1] ?? null;
      if (dirs[e.key]) {
        e.preventDefault();
        const start = current ?? layout.roots[0];
        const next = current ? nearestSibling(layout, start, dirs[e.key]) : start;
        if (!next) return;
        const n = layout.nodes.get(next)!;
        st.set({ selection: { type: 'node', id: next } });
        // Keep the zoom unless the sibling would be too small to see.
        const minZoom = Math.log2(18 / n.r);
        camera.flyTo({ x: n.x, y: n.y, zoom: Math.max(cam.zoom, minZoom) }, { maxDuration: 450 });
      } else if (e.key === 'Enter' && current) {
        e.preventDefault();
        navigate(current);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
      } else if (e.key === 'Escape') {
        if (st.inspectorOpen) st.set({ inspectorOpen: false });
        else goUp();
      } else if (e.key === 'i') {
        st.set({ inspectorOpen: !st.inspectorOpen });
      } else if (e.key === 'f' || e.key === '0') {
        navigate(null, { select: false });
      } else if (e.key === '=' || e.key === '+') {
        camera.zoomAt(size.width / 2, size.height / 2, 0.75);
      } else if (e.key === '-') {
        camera.zoomAt(size.width / 2, size.height / 2, -0.75);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedOnMap, crumbs, layout, camera, cam.zoom, navigate, goUp, size]);

  // Layers.
  // Focus and context: inside a project, everything outside it recedes and loses its labels.
  const focusRoot = crumbs[0] ?? null;
  const ctxOf = (n: MapNode) => (!focusRoot || n.root === focusRoot ? 1 : 0.22);
  // Hover or selection: only the active node, what its drawn edges connect to, and their containers stay lit.
  const lit = useMemo(() => {
    if (!active.size) return null;
    const out = new Set<string>();
    const add = (id: string) => {
      for (let cur: string | null = id; cur && !out.has(cur); cur = layout.nodes.get(cur)?.parent ?? null) out.add(cur);
    };
    for (const id of active) add(id);
    for (const e of activeEdges) {
      add(e.source);
      add(e.target);
    }
    for (const id of active) for (const d of layout.nodes.get(id)?.children ?? []) out.add(d);
    return out;
  }, [active, activeEdges, layout]);
  const litKey = lit ? [...active].join('|') + activeEdges.length : '';
  const hlOf = (n: MapNode) => (!lit || lit.has(n.id) ? 1 : 0.22);
  const fadeOf = (n: MapNode) => (frame.fade.get(n.id) ?? 1) * ctxOf(n) * hlOf(n);
  const openOf = (n: MapNode) => frame.openness.get(n.id) ?? 0;
  const regions = frame.drawn.filter((n) => openOf(n) > 0);
  const orbs = frame.drawn.filter((n) => openOf(n) < 1);
  const lineOf = (n: MapNode): RGB => (GROUP_KINDS.has(n.kind) ? lighten(colorOf(n), 0.12) : colorOf(n));
  // Closed circles: the hue mixed towards the canvas, so labels on top stay readable.
  const fillOf = (n: MapNode): RGB => mix(colorOf(n), CANVAS, GROUP_KINDS.has(n.kind) ? 0.5 : 0.42);

  const labelSize = (n: MapNode) => Math.max(12, Math.min(18, (n.r * scale) / 4));
  const closedLabels = orbs.filter((n) => openOf(n) < 0.05 && n.r * scale >= 22 && ctxOf(n) === 1);
  const truncate = (n: MapNode) => fitLabel(n.label, Math.max(3, Math.floor((1.7 * n.r * scale) / (labelSize(n) * 0.56))), n.r * scale > 34);
  // A region whose only child fills it would stack two pills; the child speaks for both (the breadcrumb has the parent).
  const swallowed = (n: MapNode) => n.children.length === 1 && (layout.nodes.get(n.children[0])?.r ?? 0) > n.r * 0.8 && frame.open.has(n.children[0]);
  const pills = regions.filter((n) => openOf(n) > 0.35 && ctxOf(n) === 1 && !swallowed(n));
  const symbolsText = (n: MapNode) => `${n.size.toLocaleString('en-US')} symbols`;
  const pillAlpha = (n: MapNode) => Math.min(1, (openOf(n) - 0.35) / 0.4) * fadeOf(n);
  const selectedEdgeKey = selection?.type === 'edge' ? selection.id : null;
  const edgeKey = (e: MapEdge) => `${e.source}|${e.target}`;
  const selectedNode = selectedOnMap ? layout.nodes.get(selectedOnMap) : undefined;

  const layers = [
    new RegionLayer<MapNode>({
      id: 'regions',
      data: regions,
      getPosition: (n) => [n.x, n.y],
      getRadius: (n) => n.r,
      radiusUnits: 'common',
      stroked: true,
      filled: true,
      getFillColor: (n) => [...colorOf(n), a8(30 * openOf(n) * fadeOf(n))] as RGBA,
      getLineColor: (n) => [...lineOf(n), a8(120 * openOf(n) * fadeOf(n))] as RGBA,
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: { getFillColor: [frame, focusRoot, litKey], getLineColor: [frame, focusRoot, litKey] },
      transitions: { getFillColor: 160, getLineColor: 160 },
    }),
    new PathLayer<EdgeHalf>({
      id: 'edges',
      data: halves,
      getPath: (h) => h.path as never,
      getColor: (h) => [...relationColor(h.edge.kind), a8((h.head ? 110 : 60) * edgeFade(h.edge))] as RGBA,
      getWidth: (h) => Math.min(6, 1 + Math.log2(h.edge.count) * 0.8),
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      pickable: false,
      updateTriggers: { getColor: [frame] },
    }),
    new OrbLayer<MapNode>({
      id: 'orbs',
      data: orbs,
      getPosition: (n) => [n.x, n.y],
      getRadius: (n) => n.r,
      radiusUnits: 'common',
      filled: true,
      stroked: true,
      getFillColor: (n) => [...fillOf(n), a8(255 * (1 - openOf(n)) * fadeOf(n))] as RGBA,
      getLineColor: (n) => {
        const a = (1 - openOf(n)) * fadeOf(n);
        if (n.id === selectedOnMap) return [250, 250, 250, a8(255 * a)];
        if (hits.has(n.id)) return [250, 204, 21, a8(255 * a)];
        if (n.id === hoverId) return [...lighten(lineOf(n), 0.45), a8(255 * a)] as RGBA;
        return [...lineOf(n), a8(200 * a)] as RGBA;
      },
      getLineWidth: (n) => (n.id === selectedOnMap || hits.has(n.id) ? 2 : n.id === hoverId ? 1.5 : 1),
      lineWidthUnits: 'pixels',
      pickable: true,
      updateTriggers: { getFillColor: [frame, rootColor, focusRoot, litKey], getLineColor: [frame, selectedOnMap, hits, hoverId, focusRoot, litKey], getLineWidth: [selectedOnMap, hits, hoverId] },
      transitions: { getFillColor: 160, getLineColor: 160 },
    }),
    // Soft white halo around the selection (neutral accent).
    new ScatterplotLayer<MapNode>({
      id: 'selection-halo',
      data: selectedNode && drawnIds.has(selectedNode.id) ? [selectedNode] : [],
      getPosition: (n) => [n.x, n.y],
      getRadius: (n) => n.r,
      radiusUnits: 'common',
      filled: false,
      stroked: true,
      getLineColor: [250, 250, 250, 46],
      getLineWidth: 7,
      lineWidthUnits: 'pixels',
    }),
    new PathLayer<MapEdge>({
      id: 'edges-active',
      data: activeEdges,
      getPath: (e) => route(e.source, e.target) as never,
      getColor: (e) => (edgeKey(e) === selectedEdgeKey ? [250, 250, 250, 255] : ([...lighten(relationColor(e.kind), 0.1), a8(215 * Math.max(0.35, edgeFade(e)))] as RGBA)),
      getWidth: (e) => Math.min(8, 1.5 + Math.log2(e.count) * 1.1),
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
      pickable: true,
      updateTriggers: { getColor: [frame, selectedEdgeKey] },
    }),
    new ScatterplotLayer<{ p: Point; c: RGB }>({
      id: 'particles',
      data: particles,
      getPosition: (d) => d.p,
      getRadius: 2.4,
      radiusUnits: 'pixels',
      getFillColor: (d) => [...d.c, 255] as RGBA,
    }),
    new TextLayer<MapNode>({
      id: 'region-pills',
      data: pills,
      getText: (n: MapNode) => n.label,
      getPosition: (n: MapNode) => [n.x, n.y - n.r],
      getPixelOffset: [0, 16],
      getSize: (n: MapNode) => (n.depth === 0 ? 14 : 12.5),
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [250, 250, 250, a8(255 * pillAlpha(n))],
      background: true,
      getBackgroundColor: (n: MapNode) => [17, 17, 20, a8(235 * pillAlpha(n))],
      getBorderColor: (n: MapNode) => [...lineOf(n), a8(150 * pillAlpha(n))] as RGBA,
      getBorderWidth: 1,
      backgroundPadding: [10, 5, 10, 5],
      fontFamily: FONT,
      fontWeight: 600,
      fontSettings: { sdf: true, buffer: 8 },
      characterSet: 'auto',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getColor: [frame, focusRoot, litKey], getBackgroundColor: [frame, focusRoot, litKey], getBorderColor: [frame, focusRoot, litKey] },
    }),
    new TextLayer<MapNode>({
      id: 'region-subtitles',
      data: pills.filter((n) => n.r * scale > 160),
      getText: symbolsText,
      getPosition: (n: MapNode) => [n.x, n.y - n.r],
      getPixelOffset: [0, 38],
      getSize: 11,
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [161, 161, 170, a8(230 * pillAlpha(n))],
      fontFamily: FONT,
      fontWeight: 500,
      outlineWidth: 2,
      outlineColor: [9, 9, 11, 255],
      fontSettings: { sdf: true, buffer: 6 },
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getColor: [frame, focusRoot, litKey] },
    }),
    new TextLayer<MapNode>({
      id: 'labels',
      data: closedLabels,
      getText: truncate,
      getPosition: (n: MapNode) => [n.x, n.y],
      getSize: labelSize,
      sizeUnits: 'pixels',
      getColor: (n: MapNode) => [250, 250, 250, a8(255 * fadeOf(n))],
      fontFamily: FONT,
      fontWeight: 600,
      outlineWidth: 2.5,
      outlineColor: [9, 9, 11, 220],
      fontSettings: { sdf: true, buffer: 8 },
      characterSet: 'auto',
      lineHeight: 1.15,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      extensions: [collision],
      collisionEnabled: true,
      getCollisionPriority: (n: MapNode) => n.r * scale,
      collisionTestProps: { sizeScale: 1.2 },
      updateTriggers: { getText: [zq], getSize: [zq], getColor: [frame, focusRoot, litKey], getCollisionPriority: [zq] },
    } as never),
  ];

  if (import.meta.env.DEV) (window as unknown as { __mapDebug: unknown }).__mapDebug = { deck, cam, size, frame };
  // Dot grid that moves and scales with the map, snapped to powers of two so it never jumps in density.
  const gridWorld = Math.pow(2, Math.ceil(Math.log2(26 / scale)));
  const step = gridWorld * scale;
  const ox = (((size.width / 2 - cam.x * scale) % step) + step) % step;
  const oy = (((size.height / 2 - cam.y * scale) % step) + step) % step;
  const gridAlpha = Math.min(1, (step - 26) / 26) * 0.5 + 0.5;

  return (
    <div
      className="map-wrap relative h-full w-full touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      ref={wrap}
      style={{ backgroundSize: `${step}px ${step}px`, backgroundPosition: `${ox}px ${oy}px`, ['--grid-alpha' as string]: gridAlpha }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={() => {
        // Double-click always goes in, whatever is selected.
        const n = hover?.node;
        if (n && n.children.length) navigate(n.id);
      }}
      tabIndex={0}
      aria-label="Repository map. Arrow keys move between siblings, Enter goes in, Backspace goes up."
    >
      {size.width > 0 && fontsReady && (
        <DeckGL
          ref={deck}
          views={VIEW}
          viewState={{ target: [cam.x, cam.y, 0], zoom: cam.zoom }}
          controller={false}
          layers={layers}
          onHover={(info) => {
            if (drag.current?.moved) return;
            const obj = info.object as MapNode | EdgeHalf | MapEdge | undefined;
            if (!obj) setHover(null);
            else if ('edge' in obj) setHover({ x: info.x, y: info.y, edge: obj.edge });
            else if ('edgeIdx' in obj) setHover((h) => ({ x: info.x, y: info.y, edge: obj, node: h?.node }));
            else setHover({ x: info.x, y: info.y, node: obj });
          }}
          getCursor={({ isHovering }) => (drag.current?.moved ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        />
      )}
      <div className="map-vignette" />
      <Minimap layout={layout} colors={rootColor} cam={cam} size={size} onJump={(x, y) => camera.flyTo({ x, y, zoom: cam.zoom }, { maxDuration: 500 })} />
      <MapControls
        onZoomIn={() => camera.zoomAt(size.width / 2, size.height / 2, 1)}
        onZoomOut={() => camera.zoomAt(size.width / 2, size.height / 2, -1)}
        onFit={() => navigate(null, { select: false })}
      />
      <Legend drawn={frame.drawn} edges={activeEdges.length ? activeEdges : edges} />
      {hover && (
        <HoverCard
          hover={hover}
          layout={layout}
          model={model}
          open={hover.node ? frame.open.has(hover.node.id) && crumbs.includes(hover.node.id) : false}
          selected={!!hover.node && hover.node.id === selectedOnMap}
        />
      )}
    </div>
  );
}
