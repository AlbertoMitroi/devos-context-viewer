import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '../store';
import type { GenerationData, Json } from '../model/types';
import { Fields } from './Inspector';
import { EvidenceList } from './Evidence';

type TableId = 'entities' | 'relations' | 'declarations' | 'observations' | 'links' | 'diagnostics' | 'projects' | 'contexts' | 'files';

const TABLES: { id: TableId; label: string; priority: string[] }[] = [
  { id: 'entities', label: 'Entities', priority: ['kind', 'name', 'signature', 'origin', 'accessibility', 'project', 'assembly', 'id'] },
  { id: 'relations', label: 'Relations', priority: ['kind', 'from', 'to', 'usage', 'resolution', 'context'] },
  { id: 'declarations', label: 'Declarations', priority: ['entity', 'path', 'store', 'generator', 'context'] },
  { id: 'observations', label: 'Observations', priority: ['kind'] },
  { id: 'links', label: 'Links', priority: ['kind', 'resolution'] },
  { id: 'diagnostics', label: 'Diagnostics', priority: ['severity', 'state', 'code', 'scope', 'message'] },
  { id: 'projects', label: 'Projects', priority: ['assemblyName', 'path', 'targetFrameworks', 'resolvedSdk'] },
  { id: 'contexts', label: 'Contexts', priority: ['project', 'loadMode', 'reason', 'targetFramework', 'configuration'] },
  { id: 'files', label: 'Files', priority: ['path', 'size'] },
];

function rowsFor(data: GenerationData, id: TableId): Json[] {
  switch (id) {
    case 'files':
      return data.files as unknown as Json[];
    default:
      return (data[id] as unknown as Json[]) ?? [];
  }
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function Tables() {
  const st = useStore();
  const data = st.data!;
  const tab = (st.tableTab as TableId) || 'entities';
  const def = TABLES.find((t) => t.id === tab)!;
  const rows = rowsFor(data, tab);
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [picked, setPicked] = useState<Json | null>(null);
  const parent = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows.slice(0, 1000)) for (const k of Object.keys(r)) keys.add(k);
    const pri = def.priority.filter((k) => keys.has(k));
    const rest = [...keys].filter((k) => !pri.includes(k) && k !== 'evidence' && k !== 'preprocessorSymbols' && k !== 'packages').sort();
    return [...pri, ...rest].slice(0, 12);
  }, [rows, def]);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (typeof r.kind === 'string') m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = st.tableFilter.toLowerCase().trim();
    let out = rows;
    if (kind) out = out.filter((r) => r.kind === kind);
    if (q) {
      const tokens = q.split(/\s+/);
      out = out.filter((r) => {
        const s = JSON.stringify(r).toLowerCase();
        return tokens.every((t) => s.includes(t));
      });
    }
    if (sort) out = [...out].sort((a, b) => cell(a[sort.col]).localeCompare(cell(b[sort.col]), 'en', { numeric: true }) * sort.dir);
    return out;
  }, [rows, kind, st.tableFilter, sort]);

  const virt = useVirtualizer({ count: filtered.length, getScrollElement: () => parent.current, estimateSize: () => 26, overscan: 20 });
  const model = st.model;
  const labelOf = (v: string) => model?.nodes.get(v)?.label;

  const onRow = (r: Json) => {
    setPicked(r);
  };
  const reveal = (r: Json) => {
    const target = (tab === 'relations' ? r.from : tab === 'declarations' ? r.entity : r.id) as string;
    if (target && model?.nodes.has(target)) st.reveal(target);
    else if (typeof r.id === 'string' && model?.nodes.has(r.id)) st.reveal(r.id);
    else if (tab === 'files' && /^(context|wiki)\/.*\.md$/.test(String(r.path))) st.set({ tab: 'docs', docPath: String(r.path) });
  };

  return (
    <div className="tables">
      <div className="table-tabs">
        {TABLES.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'on' : ''}
            onClick={() => {
              st.set({ tableTab: t.id });
              setKind('');
              setSort(null);
              setPicked(null);
            }}
          >
            {t.label} <span className="count">{rowsFor(data, t.id).length.toLocaleString('en-US')}</span>
          </button>
        ))}
      </div>
      <div className="table-filters">
        <input placeholder="Text filter (all fields)…" value={st.tableFilter} onChange={(e) => st.set({ tableFilter: e.target.value })} />
        {kinds.length > 0 && (
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">all kinds</option>
            {kinds.map(([k, c]) => (
              <option key={k} value={k}>
                {k} ({c})
              </option>
            ))}
          </select>
        )}
        <span className="muted small">{filtered.length.toLocaleString('en-US')} rows</span>
      </div>
      <div className="table-main">
        <div className="table-scroll" ref={parent}>
          <div className="trow thead" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
            {columns.map((c) => (
              <div key={c} className="th" onClick={() => setSort(sort?.col === c ? { col: c, dir: sort.dir === 1 ? -1 : 1 } : { col: c, dir: 1 })}>
                {c} {sort?.col === c ? (sort.dir === 1 ? '▲' : '▼') : ''}
              </div>
            ))}
          </div>
          {!rows.length && <div className="muted empty">This file is empty in this generation.</div>}
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vi) => {
              const r = filtered[vi.index];
              return (
                <div
                  key={vi.key}
                  className={`trow ${picked === r ? 'picked' : ''}`}
                  style={{ position: 'absolute', top: 0, transform: `translateY(${vi.start}px)`, gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}
                  onClick={() => onRow(r)}
                  onDoubleClick={() => reveal(r)}
                >
                  {columns.map((c) => {
                    const v = r[c];
                    const lbl = (c === 'from' || c === 'to' || c === 'entity') && typeof v === 'string' ? labelOf(v) : undefined;
                    return (
                      <div key={c} className="td" title={cell(v)}>
                        {lbl ? (
                          <>
                            <b>{lbl}</b> <span className="muted">{cell(v)}</span>
                          </>
                        ) : (
                          cell(v)
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {picked && (
          <aside className="table-detail">
            <div className="actions">
              <button onClick={() => reveal(picked)}>Show on map</button>
              <button onClick={() => setPicked(null)}>Close</button>
            </div>
            <Fields rec={picked} skip={['evidence']} />
            {Array.isArray(picked.evidence) && <EvidenceList ids={picked.evidence as string[]} limit={10} />}
          </aside>
        )}
      </div>
    </div>
  );
}
