import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { edgeColor, kindLabel, NODE_SHAPES, nodeColor, MEMBER_KINDS } from '../model/kinds';
import type { ViewResult } from '../model/graphView';
import { useStore } from '../store';
import { layoutOptions, registerExtensions, stylesheet } from './cytoscapeSetup';
import { graphRef } from './graphRef';
import { ContextMenu, type MenuTarget } from '../components/ContextMenu';

registerExtensions();

function nodeSize(kind: string, collapsedInside: number, compound: boolean) {
  if (compound) return 30;
  if (collapsedInside > 0) return Math.min(90, 26 + 7 * Math.log2(1 + collapsedInside));
  if (MEMBER_KINDS.has(kind)) return 14;
  return 22;
}

function toElements(view: ViewResult, edgeLabels: boolean): cytoscape.ElementDefinition[] {
  const els: cytoscape.ElementDefinition[] = [];
  for (const n of view.nodes) {
    const collapsedGroup = !n.compound && n.hiddenInside > 0;
    els.push({
      group: 'nodes',
      data: {
        id: n.id,
        parent: n.parent,
        label: collapsedGroup ? `${n.label} (${n.hiddenInside})` : n.label,
        kind: n.kind,
        origin: n.origin,
        color: nodeColor(n.kind),
        shape: n.compound ? 'round-rectangle' : NODE_SHAPES[n.kind] ?? 'ellipse',
        size: nodeSize(n.kind, n.hiddenInside, n.compound),
        degree: n.degree,
        collapsedGroup,
        isFocus: n.isFocus,
      },
    });
  }
  const many = view.edges.length > 4000;
  for (const e of view.edges) {
    els.push({
      group: 'edges',
      classes: many ? 'haystack' : undefined,
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind,
        count: e.count,
        weakest: e.weakest,
        color: e.kind === 'mixed' ? '#94a3b8' : edgeColor(e.kind),
        width: Math.min(9, 1 + Math.log2(e.count)),
        label: edgeLabels && !many && e.count > 1 ? String(e.count) : undefined,
      },
    });
  }
  return els;
}

export function GraphCanvas({ view }: { view: ViewResult | null }) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const layoutRef = useRef<cytoscape.Layouts | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const layout = useStore((s) => s.layout);
  const layoutTick = useStore((s) => s.layoutTick);
  const fitTick = useStore((s) => s.fitTick);
  const edgeLabels = useStore((s) => s.edgeLabels);
  const selection = useStore((s) => s.selection);
  const centerOn = useStore((s) => s.centerOn);
  const searchHits = useStore((s) => s.searchHits);
  const pathNodes = useStore((s) => s.pathNodes);
  const pathStart = useStore((s) => s.pathStart);
  const hoverHighlight = useStore((s) => s.hoverHighlight);
  const model = useStore((s) => s.model);

  // Create once.
  useEffect(() => {
    const cy = cytoscape({
      container: container.current!,
      style: stylesheet,
      wheelSensitivity: 0.25,
      minZoom: 0.02,
      maxZoom: 4,
      boxSelectionEnabled: true,
      selectionType: 'single',
    });
    cyRef.current = cy;
    graphRef.cy = cy;
    if (import.meta.env.DEV) (window as unknown as { __cv: unknown }).__cv = { cy, store: useStore };
    const st = () => useStore.getState();
    cy.on('tap', 'node', (ev) => {
      setMenu(null);
      st().set({ selection: { type: 'node', id: ev.target.id() } });
    });
    cy.on('tap', 'edge', (ev) => {
      setMenu(null);
      const d = ev.target.data();
      const v = graphRef.view?.edges.find((e) => e.id === d.id);
      if (v) st().set({ selection: { type: 'edge', id: v.id, edgeIdx: v.edgeIdx, source: v.source, target: v.target, kinds: v.kinds } });
    });
    cy.on('dbltap', 'node', (ev) => {
      st().toggleExpanded(ev.target.id());
    });
    cy.on('tap', (ev) => {
      if (ev.target === cy) {
        setMenu(null);
        st().set({ selection: null });
      }
    });
    cy.on('cxttap', 'node', (ev) => {
      const p = ev.renderedPosition;
      setMenu({ x: p.x, y: p.y, id: ev.target.id() });
    });
    cy.on('cxttap', (ev) => {
      if (ev.target === cy) setMenu(null);
    });
    cy.on('mouseover', 'node', (ev) => {
      const n = ev.target as cytoscape.NodeSingular;
      const hn = useStore.getState().model?.nodes.get(n.id());
      if (hn) {
        const p = ev.renderedPosition;
        setTooltip({ x: p.x, y: p.y, text: `${hn.kind} · ${hn.fullName}` });
      }
      if (!useStore.getState().hoverHighlight) return;
      const hood = n.closedNeighborhood().union(n.ancestors()).union(n.descendants());
      cy.batch(() => {
        cy.elements().addClass('faded');
        hood.removeClass('faded');
        hood.ancestors().removeClass('faded');
        n.connectedEdges().addClass('hl');
      });
    });
    cy.on('mouseover', 'edge', (ev) => {
      const d = ev.target.data();
      const p = ev.renderedPosition;
      const v = graphRef.view?.edges.find((e) => e.id === d.id);
      const kinds = v ? Object.entries(v.kinds).map(([k, c]) => `${kindLabel(k)}: ${c}`).join(', ') : d.kind;
      setTooltip({ x: p.x, y: p.y, text: `${d.count} relations · ${kinds}` });
    });
    cy.on('mouseout', 'node, edge', () => {
      setTooltip(null);
      cy.batch(() => {
        cy.elements().removeClass('faded');
        cy.edges().removeClass('hl');
      });
    });
    cy.on('pan zoom', () => setTooltip(null));
    return () => {
      cy.destroy();
      graphRef.cy = null;
    };
  }, []);

  const runLayout = (randomize: boolean) => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;
    layoutRef.current?.stop();
    const l = cy.layout(layoutOptions(useStore.getState().layout, cy.nodes().length, randomize));
    layoutRef.current = l;
    l.one('layoutstop', () => {
      if (layoutRef.current === l) layoutRef.current = null;
      const target = useStore.getState().centerOn;
      if (target) {
        const el = cy.getElementById(target);
        if (el.nonempty()) cy.animate({ center: { eles: el }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 300 });
        useStore.getState().set({ centerOn: null });
      }
    });
    l.run();
  };

  // Rebuild elements when the view changes, keeping positions for a stable mental map.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !view) return;
    graphRef.view = view;
    const old = new Map<string, cytoscape.Position>();
    cy.nodes().forEach((n) => {
      old.set(n.id(), { ...n.position() });
    });
    const els = toElements(view, edgeLabels);
    let inherited = 0;
    let fresh = 0;
    const nodes = model?.nodes;
    for (const el of els) {
      if (el.group !== 'nodes') continue;
      const id = el.data.id!;
      let pos = old.get(id);
      if (!pos && nodes) {
        let p = nodes.get(id)?.parent ?? null;
        while (p && !old.has(p)) p = nodes.get(p)?.parent ?? null;
        const base = p ? old.get(p) : undefined;
        if (base) pos = { x: base.x + (Math.random() - 0.5) * 60, y: base.y + (Math.random() - 0.5) * 60 };
      }
      if (pos) {
        el.position = pos;
        inherited++;
      } else fresh++;
    }
    cy.batch(() => {
      cy.elements().remove();
      cy.add(els);
    });
    runLayout(fresh > inherited || old.size === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !view) return;
    const many = view.edges.length > 4000;
    cy.batch(() => {
      cy.edges().forEach((e) => {
        const c = e.data('count') as number;
        e.data('label', edgeLabels && !many && c > 1 ? String(c) : undefined);
      });
    });
  }, [edgeLabels, view]);

  useEffect(() => {
    if (layoutTick) runLayout(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutTick, layout]);

  useEffect(() => {
    if (fitTick) cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 30 } }, { duration: 300 });
  }, [fitTick]);

  // Selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements(':selected').unselect();
    if (selection) cy.getElementById(selection.id).select();
  }, [selection, view]);

  // Center requests that do not change the view (node already visible).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !centerOn) return;
    const el = cy.getElementById(centerOn);
    if (el.nonempty() && !layoutRef.current) {
      cy.animate({ center: { eles: el } }, { duration: 300 });
    }
    const t = setTimeout(() => {
      const st = useStore.getState();
      if (st.centerOn === centerOn) {
        const e2 = cy.getElementById(centerOn);
        if (e2.nonempty()) cy.animate({ center: { eles: e2 }, zoom: Math.max(cy.zoom(), 0.9) }, { duration: 300 });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [centerOn]);

  // Search hits and path highlighting.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().removeClass('match path path-start');
      cy.edges().removeClass('path');
      for (const id of searchHits.slice(0, 2000)) cy.getElementById(id).addClass('match');
      if (pathStart) cy.getElementById(pathStart).addClass('path-start');
      if (pathNodes) {
        for (let i = 0; i < pathNodes.length; i++) {
          const n = cy.getElementById(pathNodes[i]);
          n.addClass('path');
          if (i > 0) {
            const prev = cy.getElementById(pathNodes[i - 1]);
            prev.edgesWith(n).addClass('path');
          }
        }
      }
    });
  }, [searchHits, pathNodes, pathStart, view]);

  useEffect(() => {
    if (!hoverHighlight) cyRef.current?.elements().removeClass('faded');
  }, [hoverHighlight]);

  return (
    <div className="graph-wrap">
      <div ref={container} className="graph" />
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          {tooltip.text}
        </div>
      )}
      {menu && <ContextMenu target={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
