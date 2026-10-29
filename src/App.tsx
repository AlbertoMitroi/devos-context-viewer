import { useEffect } from 'react';
import { useStore, type MapEdges, type Tab } from './store';
import { useView } from './graph/useView';
import { GraphCanvas } from './graph/GraphCanvas';
import { MapView } from './map/MapView';
import { FocusBar, Toolbar } from './components/Toolbar';
import { Filters, GenerationPicker } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { Tables } from './components/Tables';
import { Overview } from './components/Overview';
import { Docs } from './components/Docs';
import { MapSearch } from './components/MapSearch';

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'map', label: 'Map', title: 'Zoomable map of the whole repository' },
  { id: 'graph', label: 'Neighbourhood', title: 'Force graph around a focused symbol: callers, callees, paths' },
  { id: 'tables', label: 'Tables', title: 'Every record of the generation' },
  { id: 'overview', label: 'Summary', title: 'Manifest, coverage, counts and diagnostics' },
  { id: 'docs', label: 'Context & wiki', title: 'Context packs and wiki pages' },
];

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey) return;
      const st = useStore.getState();
      const sel = st.selection?.type === 'node' ? st.selection.id : null;
      const node = sel ? st.model?.nodes.get(sel) : null;
      if (e.key === 'Escape') st.set({ selection: null, pathStart: null });
      else if (e.key === 'f' && node) st.setFocus({ ids: [node.id], depth: 2, direction: 'both', label: node.label });
      else if (e.key === 'e' && node) st.toggleExpanded(node.id);
      else if (e.key === 'h' && node) st.hide(node.id);
      else if (e.key === 'z') st.set({ fitTick: st.fitTick + 1 });
      else if (e.key === 'l') st.set({ layoutTick: st.layoutTick + 1 });
      else if (e.key === 'Backspace' && st.focus) st.back();
      else if (e.key === 'm') st.set({ tab: 'map' });
      else if (e.key >= '1' && e.key <= '4' && st.tab === 'graph') st.setLevel(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const st = useStore();
  const view = useView();
  useKeyboard();

  useEffect(() => {
    st.refreshGenerations().then(() => {
      const p = new URLSearchParams(location.hash.slice(1));
      const gens = useStore.getState().generations;
      const wanted = p.get('g');
      const target = gens.find((g) => g.id === wanted) ?? gens[0];
      if (target)
        useStore
          .getState()
          .openGeneration(target.id)
          .then(() => {
            const n = p.get('n');
            if (n && target.id === wanted) useStore.getState().reveal(n);
          });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = st.generations.find((g) => g.id === st.activeId);
  const tooBig = view && st.tab === 'graph' && view.nodes.length > 3000;
  const sidePanel = st.model && (st.tab === 'graph' || st.tab === 'map');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Context Viewer
          {active && <span className="muted"> · {active.label}</span>}
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={st.tab === t.id ? 'on' : ''} onClick={() => st.set({ tab: t.id })} disabled={!st.model} title={t.title}>
              {t.label}
            </button>
          ))}
        </nav>
        {st.loading && <span className="loading">⏳ {st.loading}</span>}
      </header>
      {st.error && (
        <div className="alert top" onClick={() => st.set({ error: null })}>
          {st.error} <span className="muted">(click to dismiss)</span>
        </div>
      )}
      <div className="body">
        <aside className="sidebar">
          <GenerationPicker />
          {st.model && <Filters />}
        </aside>
        <main className="main">
          {!st.model && !st.loading && (
            <div className="empty">
              <h2>No generation open</h2>
              <p className="muted">
                Add paths to <code>viewer.config.json</code> (see README) or pick a generation folder with “+ folder”.
              </p>
            </div>
          )}
          {st.model && st.tab === 'map' && (
            <>
              <div className="toolbar">
                <MapSearch />
                <span className="muted small">Scroll to zoom · drag to pan · double-click a circle to fly into it · click for details</span>
                <div className="spacer" />
                <label className="chk" title="Which relations to draw">
                  edges
                  <select value={st.mapEdges} onChange={(e) => st.set({ mapEdges: e.target.value as MapEdges })}>
                    <option value="all">all</option>
                    <option value="selection">selection and hover only</option>
                    <option value="none">none</option>
                  </select>
                </label>
              </div>
              <MapView />
              <MapLegend />
            </>
          )}
          {st.model && st.tab === 'graph' && (
            <>
              <Toolbar view={view} />
              <FocusBar />
              {!st.focus && (
                <div className="alert info">
                  Tip: this view is for a neighbourhood. Select a symbol on the Map, then use Focus, Callers or Callees (right-click here).
                </div>
              )}
              {tooBig && <div className="alert info">{view!.nodes.length} visible nodes: the layout may take a while. Collapse, filter or use Focus.</div>}
              {view?.stats.focusTruncated && <div className="alert info">Focus truncated at {st.maxFocusNodes} nodes; raise the limit or narrow the relation kinds.</div>}
              <GraphCanvas view={view} />
              <Legend />
            </>
          )}
          {st.model && st.tab === 'tables' && <Tables />}
          {st.model && st.tab === 'overview' && <Overview />}
          {st.model && st.tab === 'docs' && <Docs />}
        </main>
        {sidePanel && (
          <aside className="inspector">
            <Inspector />
          </aside>
        )}
      </div>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="legend small">
      <span>circle colour = project</span>
      <span>filled circle = closed (zoom in to open)</span>
      <span>edge colour = dominant relation kind, width = count</span>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend small">
      <span><i className="lg solid" /> exact</span>
      <span><i className="lg dashed" /> candidate / ambiguous / possible target</span>
      <span><i className="lg box dashed-box" /> generated code</span>
      <span><i className="lg box dotted-box" /> metadata (package)</span>
      <span>number on node = collapsed items</span>
    </div>
  );
}
