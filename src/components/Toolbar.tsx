import { useEffect, useRef, useState } from 'react';
import { searchNodes } from '../model/graphModel';
import { LAYOUTS } from '../graph/cytoscapeSetup';
import { exportJson, exportPng, exportSvg } from '../graph/graphRef';
import { useStore, type LayoutName } from '../store';
import type { ViewResult } from '../model/graphView';
import { nodeColor } from '../model/kinds';

const LEVELS = ['Projects', 'Namespaces', 'Types', 'Members'];

export function Toolbar({ view }: { view: ViewResult | null }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const model = st.model;
  const name = (st.generations.find((g) => g.id === st.activeId)?.label ?? 'graph').replace(/[^\w.-]+/g, '_');

  useEffect(() => {
    if (!model) return;
    const t = setTimeout(() => {
      const h = q.trim().length >= 2 ? searchNodes(model, q) : [];
      setHits(h);
      setCursor(0);
      useStore.getState().set({ searchHits: h, searchQuery: q, searchFilter: useStore.getState().searchFilter ? (h.length ? h : null) : null });
    }, 150);
    return () => clearTimeout(t);
  }, [q, model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (id: string) => {
    st.reveal(id);
    setOpen(false);
  };

  return (
    <div className="toolbar">
      <div className="search">
        <input
          ref={input}
          placeholder="Search symbol, type, project…  (/)   e.g. Basket kind:interface"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, Math.min(hits.length, 50) - 1));
            else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
            else if (e.key === 'Enter' && hits[cursor]) pick(hits[cursor]);
            else if (e.key === 'Escape') {
              setQ('');
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {q.trim().length >= 2 && <span className="search-count">{hits.length}</span>}
        {open && hits.length > 0 && model && (
          <div className="search-results">
            {hits.slice(0, 50).map((id, i) => {
              const n = model.nodes.get(id)!;
              return (
                <button key={id} className={`search-hit ${i === cursor ? 'active' : ''}`} onMouseDown={() => pick(id)}>
                  <span className="dot" style={{ background: nodeColor(n.kind) }} />
                  <span className="hit-label">{n.label}</span>
                  <span className="hit-kind">{n.kind}</span>
                  <span className="hit-full">{n.fullName}</span>
                </button>
              );
            })}
            {hits.length > 50 && <div className="search-more">+{hits.length - 50} more results; refine the search</div>}
          </div>
        )}
      </div>
      <label className="chk" title="Show only search results (with their parents)">
        <input
          type="checkbox"
          checked={!!st.searchFilter}
          disabled={!hits.length}
          onChange={(e) => st.set({ searchFilter: e.target.checked ? hits : null })}
        />
        results only
      </label>

      <div className="seg" title="Expansion level">
        {LEVELS.map((l, i) => (
          <button key={l} onClick={() => st.setLevel(i)}>
            {l}
          </button>
        ))}
      </div>

      <select value={st.layout} onChange={(e) => st.set({ layout: e.target.value as LayoutName })} title="Layout">
        {LAYOUTS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <button onClick={() => st.set({ layoutTick: st.layoutTick + 1 })} title="Run the layout again">
        ↻ Layout
      </button>
      <button onClick={() => st.set({ fitTick: st.fitTick + 1 })} title="Fit everything">
        ⤢ Fit
      </button>

      <div className="seg">
        <button disabled={!st.history.length} onClick={st.back} title="Back">
          ←
        </button>
        <button disabled={!st.future.length} onClick={st.forward} title="Forward">
          →
        </button>
      </div>

      <details className="menu">
        <summary>Export</summary>
        <div className="menu-body">
          <button onClick={() => exportPng(name)}>PNG (whole graph)</button>
          <button onClick={() => exportSvg(name)}>SVG</button>
          <button onClick={() => exportJson(name)}>JSON (visible)</button>
        </div>
      </details>

      <div className="spacer" />
      {view && (
        <span className="stats" title="visible nodes · aggregated edges · relations represented">
          {view.nodes.length} nodes · {view.edges.length} edges · {view.stats.relationsShown} relations
        </span>
      )}
    </div>
  );
}

export function FocusBar() {
  const st = useStore();
  const f = st.focus;
  if (!f && !st.pathStart && !st.searchFilter) return null;
  return (
    <div className="focusbar">
      {f && (
        <>
          <span className="pill">Focus: {f.label ?? f.ids.length + ' nodes'}</span>
          {f.depth > 0 && (
            <>
              <label>
                depth
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={f.depth}
                  onChange={(e) => st.set({ focus: { ...f, depth: Math.max(1, Math.min(6, Number(e.target.value))) } })}
                />
              </label>
              <div className="seg">
                {(['in', 'both', 'out'] as const).map((d) => (
                  <button key={d} className={f.direction === d ? 'on' : ''} onClick={() => st.set({ focus: { ...f, direction: d } })}>
                    {d === 'in' ? '← incoming' : d === 'out' ? 'outgoing →' : '↔ both'}
                  </button>
                ))}
              </div>
              <label title="Maximum nodes reached">
                max
                <input type="number" min={20} max={5000} step={50} value={st.maxFocusNodes} onChange={(e) => st.set({ maxFocusNodes: Number(e.target.value) })} />
              </label>
            </>
          )}
          {f.kinds?.length ? <span className="muted">kinds: {f.kinds.join(', ')}</span> : null}
          <button onClick={() => st.setFocus(null)}>✕ Exit focus</button>
        </>
      )}
      {st.pathStart && (
        <span className="pill warn">
          Path: pick the target node (right-click → “Path to here”) <button onClick={() => st.set({ pathStart: null })}>cancel</button>
        </span>
      )}
      {st.searchFilter && (
        <span className="pill">
          Search filter: {st.searchFilter.length} <button onClick={() => st.set({ searchFilter: null })}>✕</button>
        </span>
      )}
    </div>
  );
}
