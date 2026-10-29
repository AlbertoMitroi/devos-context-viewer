import { useEffect } from 'react';
import { useStore, type Tab } from './store';
import { useView } from './graph/useView';
import { GraphCanvas } from './graph/GraphCanvas';
import { FocusBar, Toolbar } from './components/Toolbar';
import { Filters, GenerationPicker } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { Tables } from './components/Tables';
import { Overview } from './components/Overview';
import { Docs } from './components/Docs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'graph', label: 'Graf' },
  { id: 'tables', label: 'Tabele' },
  { id: 'overview', label: 'Rezumat' },
  { id: 'docs', label: 'Context și wiki' },
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
      else if (e.key >= '1' && e.key <= '4') st.setLevel(Number(e.key) - 1);
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
  const tooBig = view && view.nodes.length > 3000;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Context Viewer
          {active && <span className="muted"> · {active.label}</span>}
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={st.tab === t.id ? 'on' : ''} onClick={() => st.set({ tab: t.id })} disabled={!st.model}>
              {t.label}
            </button>
          ))}
        </nav>
        {st.loading && <span className="loading">⏳ {st.loading}</span>}
      </header>
      {st.error && (
        <div className="alert top" onClick={() => st.set({ error: null })}>
          {st.error} <span className="muted">(clic pentru a închide)</span>
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
              <h2>Nicio generație deschisă</h2>
              <p className="muted">
                Adaugă căi în <code>viewer.config.json</code> (vezi README) sau alege un folder de generație cu „+ folder”.
              </p>
            </div>
          )}
          {st.model && st.tab === 'graph' && (
            <>
              <Toolbar view={view} />
              <FocusBar />
              {tooBig && <div className="alert info">{view!.nodes.length} noduri vizibile: layout-ul poate dura. Restrânge, filtrează sau folosește Focus.</div>}
              {view?.stats.focusTruncated && <div className="alert info">Focus trunchiat la {st.maxFocusNodes} noduri; mărește limita sau restrânge tipurile de relații.</div>}
              <GraphCanvas view={view} />
              <Legend />
            </>
          )}
          {st.model && st.tab === 'tables' && <Tables />}
          {st.model && st.tab === 'overview' && <Overview />}
          {st.model && st.tab === 'docs' && <Docs />}
        </main>
        {st.model && st.tab === 'graph' && (
          <aside className="inspector">
            <Inspector />
          </aside>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend small">
      <span><i className="lg solid" /> exact</span>
      <span><i className="lg dashed" /> candidat / ambiguu / țintă posibilă</span>
      <span><i className="lg box dashed-box" /> cod generat</span>
      <span><i className="lg box dotted-box" /> metadata (pachet)</span>
      <span>număr pe nod = elemente restrânse</span>
    </div>
  );
}
