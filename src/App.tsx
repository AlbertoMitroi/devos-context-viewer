import { useEffect } from 'react';
import { BookOpen, ChartBar, Graph, MagnifyingGlass, MapTrifold, Table, Warning } from '@phosphor-icons/react';
import { useStore, type Tab } from './store';
import { useView } from './graph/useView';
import { GraphCanvas } from './graph/GraphCanvas';
import { MapView } from './map/MapView';
import { FocusBar, Toolbar } from './components/Toolbar';
import { Inspector } from './components/Inspector';
import { Tables } from './components/Tables';
import { Overview } from './components/Overview';
import { Docs } from './components/Docs';
import { CommandPalette } from './components/CommandPalette';
import { GenerationSwitcher } from './components/GenerationSwitcher';
import { LayersPanel } from './components/LayersPanel';

const TABS: { id: Tab; label: string; title: string; icon: React.ReactNode }[] = [
  { id: 'map', label: 'Map', title: 'Zoomable map of the whole repository (M)', icon: <MapTrifold size={16} aria-hidden /> },
  { id: 'graph', label: 'Neighbourhood', title: 'Force graph around a focused symbol: callers, callees, paths', icon: <Graph size={16} aria-hidden /> },
  { id: 'tables', label: 'Tables', title: 'Every record of the generation', icon: <Table size={16} aria-hidden /> },
  { id: 'overview', label: 'Summary', title: 'Manifest, coverage, counts and diagnostics', icon: <ChartBar size={16} aria-hidden /> },
  { id: 'docs', label: 'Context & wiki', title: 'Context packs and wiki pages', icon: <BookOpen size={16} aria-hidden /> },
];

const isTyping = () => {
  const tag = (document.activeElement?.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
};

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.set({ paletteOpen: !st.paletteOpen });
        return;
      }
      if (isTyping() || e.metaKey || e.ctrlKey || st.paletteOpen) return;
      if (e.key === '/') {
        e.preventDefault();
        st.set({ paletteOpen: true });
        return;
      }
      if (e.key === 'm') st.set({ tab: 'map' });
      else if (e.key === 'l') st.set({ layersOpen: !st.layersOpen });
      if (st.tab !== 'graph') return;
      // Neighbourhood graph shortcuts; the map handles its own.
      const sel = st.selection?.type === 'node' ? st.selection.id : null;
      const node = sel ? st.model?.nodes.get(sel) : null;
      if (e.key === 'Escape') st.set({ selection: null, pathStart: null });
      else if (e.key === 'f' && node) st.setFocus({ ids: [node.id], depth: 2, direction: 'both', label: node.label });
      else if (e.key === 'e' && node) st.toggleExpanded(node.id);
      else if (e.key === 'h' && node) st.hide(node.id);
      else if (e.key === 'z') st.set({ fitTick: st.fitTick + 1 });
      else if (e.key === 'Backspace' && st.focus) st.back();
      else if (e.key >= '1' && e.key <= '4') st.setLevel(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Browser Back and Forward replay map navigation recorded in the URL hash. */
function useHistorySync() {
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      const st = useStore.getState();
      const g = p.get('g');
      if (g && g !== st.activeId) {
        st.openGeneration(g);
        return;
      }
      const n = p.get('n');
      st.navigate(n, { push: false, select: !!n });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

export function App() {
  const st = useStore();
  const view = useView();
  useKeyboard();
  useHistorySync();

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
            if (n && target.id === wanted) useStore.getState().navigate(n, { push: false });
          });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tooBig = view && st.tab === 'graph' && view.nodes.length > 3000;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" aria-label="Context Viewer">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--accent)" strokeWidth="1.6" opacity="0.6" />
            <circle cx="9" cy="10" r="4.2" fill="var(--accent)" opacity="0.85" />
            <circle cx="15.5" cy="14.5" r="2.6" fill="#5FD4C4" opacity="0.9" />
          </svg>
          <span>Context Viewer</span>
        </div>
        <GenerationSwitcher />
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${st.tab === t.id ? 'on' : ''}`} onClick={() => st.set({ tab: t.id })} disabled={!st.model} title={t.title} aria-current={st.tab === t.id ? 'page' : undefined}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="spacer" />
        {st.loading && (
          <span className="loading" role="status">
            <span className="spinner" aria-hidden /> {st.loading}
          </span>
        )}
        <button className="search-btn" onClick={() => st.set({ paletteOpen: true })} disabled={!st.model} aria-label="Search (Command K)">
          <MagnifyingGlass size={15} aria-hidden />
          <span>Search symbols…</span>
          <kbd>⌘K</kbd>
        </button>
      </header>
      {st.error && (
        <div className="toast" role="alert" onClick={() => st.set({ error: null })}>
          <Warning size={16} aria-hidden /> {st.error} <span className="muted">(click to dismiss)</span>
        </div>
      )}
      <main className="stage">
        {!st.model && st.loading && (
          <div className="skeleton-map" aria-hidden>
            <div className="sk sk-a" />
            <div className="sk sk-b" />
            <div className="sk sk-c" />
            <div className="sk sk-d" />
          </div>
        )}
        {!st.model && !st.loading && (
          <div className="empty">
            <MapTrifold size={40} weight="duotone" aria-hidden />
            <h2>No generation open</h2>
            <p className="muted">
              Add a path to <code>viewer.config.json</code> (see README), or open a generation folder from the switcher above.
            </p>
          </div>
        )}
        {st.model && st.tab === 'map' && (
          <>
            <MapView />
            <LayersPanel />
            <Inspector />
          </>
        )}
        {st.model && st.tab === 'graph' && (
          <div className="graph-stage">
            <Toolbar view={view} />
            <FocusBar />
            {!st.focus && <div className="note">Pick a symbol on the Map, then choose Neighbourhood, Callers or Callees. Right-click nodes here for more.</div>}
            {tooBig && <div className="note">{view!.nodes.length} visible nodes: the layout may take a while. Collapse, filter or use Focus.</div>}
            {view?.stats.focusTruncated && <div className="note">Focus truncated at {st.maxFocusNodes} nodes; raise the limit or narrow the relation kinds.</div>}
            <GraphCanvas view={view} />
            <LayersPanel />
            <Inspector />
          </div>
        )}
        {st.model && st.tab === 'tables' && <Tables />}
        {st.model && st.tab === 'overview' && <Overview />}
        {st.model && st.tab === 'docs' && <Docs />}
      </main>
      <CommandPalette />
    </div>
  );
}
