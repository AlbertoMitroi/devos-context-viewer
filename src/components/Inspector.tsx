import { useMemo, useState, type ReactNode } from 'react';
import { Crosshair, EyeSlash, Graph, X } from '@phosphor-icons/react';
import { KIND_GLYPH } from '../theme/palette';
import { ancestors, type Edge, type GraphModel, type HNode } from '../model/graphModel';
import { edgeColor, kindLabel, nodeColor } from '../model/kinds';
import { useStore } from '../store';
import type { Json } from '../model/types';
import { EvidenceList, SourceContext } from './Evidence';

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="muted">null</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="muted">[]</span>;
    if (v.every((x) => typeof x !== 'object')) return <span>{v.join(', ')}</span>;
    return <pre className="json">{JSON.stringify(v, null, 1)}</pre>;
  }
  if (typeof v === 'object') return <pre className="json">{JSON.stringify(v, null, 1)}</pre>;
  return <span>{String(v)}</span>;
}

export function Fields({ rec, skip = [] }: { rec: Json; skip?: string[] }) {
  return (
    <table className="fields">
      <tbody>
        {Object.entries(rec)
          .filter(([k]) => !skip.includes(k))
          .map(([k, v]) => (
            <tr key={k}>
              <th className={k.startsWith('ext.') ? 'ext' : undefined}>{k}</th>
              <td>
                <Value v={v} />
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function Block({ title, children, open = true, count }: { title: string; children: ReactNode; open?: boolean; count?: number }) {
  return (
    <details className="block" open={open}>
      <summary>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </summary>
      {children}
    </details>
  );
}

function NodeLink({ id, model }: { id: string; model: GraphModel }) {
  const reveal = useStore((s) => s.reveal);
  const n = model.nodes.get(id);
  if (!n) return <span className="mono small">{id}</span>;
  return (
    <button className="node-link" onClick={() => reveal(id)} title={n.fullName}>
      <span className="dot" style={{ background: nodeColor(n.kind) }} />
      {n.label}
      <span className="muted small"> {n.kind}</span>
    </button>
  );
}

function RelationRow({ e, other, model }: { e: Edge; other: string; model: GraphModel }) {
  const [open, setOpen] = useState(false);
  const ev = e.relation?.evidence ?? e.link?.evidence ?? [];
  return (
    <div className="rel-row">
      <div className="rel-line">
        <button className="link caret-btn" onClick={() => setOpen(!open)} title="Evidence and fields">
          {open ? '▾' : '▸'}
        </button>
        <NodeLink id={other} model={model} />
        {e.usage && <span className="badge">{e.usage}</span>}
        {e.resolution !== 'exact' && <span className="badge warn">{e.resolution}</span>}
        {e.synthetic && <span className="badge">derived</span>}
        {ev.length > 1 && <span className="muted small">{ev.length} evidence</span>}
      </div>
      {open && (
        <div className="rel-detail">
          {e.relation && <Fields rec={e.relation} skip={['evidence', 'from', 'to']} />}
          <EvidenceList ids={ev} limit={5} />
        </div>
      )}
    </div>
  );
}

function RelationGroups({ node, model, dir }: { node: HNode; model: GraphModel; dir: 'out' | 'in' }) {
  const groups = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const idx of (dir === 'out' ? model.out : model.in).get(node.id) ?? []) {
      const e = model.edges[idx];
      const list = m.get(e.kind) ?? [];
      list.push(e);
      m.set(e.kind, list);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [node, model, dir]);
  const [limit, setLimit] = useState<Record<string, number>>({});
  if (!groups.length) return <div className="muted small">none</div>;
  return (
    <>
      {groups.map(([kind, list]) => {
        const max = limit[kind] ?? 30;
        return (
          <details key={kind} className="rel-group">
            <summary>
              <span className="swatch" style={{ background: edgeColor(kind) }} />
              {kindLabel(kind)}
              <span className="count">{list.length}</span>
            </summary>
            {list.slice(0, max).map((e) => (
              <RelationRow key={e.idx} e={e} other={dir === 'out' ? e.to : e.from} model={model} />
            ))}
            {list.length > max && (
              <button className="link" onClick={() => setLimit({ ...limit, [kind]: max + 100 })}>
                {Math.min(100, list.length - max)} more of {list.length - max}
              </button>
            )}
          </details>
        );
      })}
    </>
  );
}

function NodeInspector({ node, model }: { node: HNode; model: GraphModel }) {
  const st = useStore();
  const data = st.data!;
  const decls = model.declarationsByEntity.get(node.id) ?? [];
  const [openDecl, setOpenDecl] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'relations' | 'source' | 'raw'>('overview');
  const crumbs = ancestors(model, node.id).reverse();
  const childKinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of node.children) {
      const k = model.nodes.get(c)!.kind;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [node, model]);
  const project = node.kind === 'project' ? node.record : null;
  const contexts = project ? data.contexts.filter((c) => c.projectId === node.id || c.project === node.fullName) : [];
  const diags = data.diagnostics.filter((d) => d.scope === node.fullName || (project && d.scope === project.path));
  const coverage = project
    ? ((data.manifest?.coverage as { projects?: Json[] } | undefined)?.projects ?? []).find((p) => p.project === node.id || p.path === node.fullName)
    : null;
  const card = project ? data.files.find((f) => f.path.startsWith('context/projects/') && f.path.includes(`/${node.label}-`)) : null;
  const expanded = st.expanded.has(node.id);
  return (
    <div className="inspector-body">
      <div className="insp-head">
        <span className="glyph big" data-kind={node.kind}>
          {KIND_GLYPH[node.kind] ?? '·'}
        </span>
        <div>
          <div className="insp-title">{node.label}</div>
          <div className="muted small">
            {node.kind} · {node.origin}
            {node.isTest ? ' · test' : ''}
          </div>
        </div>
      </div>
      <div className="crumbs">
        {crumbs.map((c) => (
          <span key={c}>
            <button className="link" onClick={() => st.reveal(c)}>
              {model.nodes.get(c)!.label}
            </button>
            <span className="muted"> › </span>
          </span>
        ))}
      </div>
      <div className="mono small wrap">{node.fullName}</div>
      <div className="mono small wrap muted">
        {node.id}{' '}
        <button className="link" onClick={() => navigator.clipboard?.writeText(node.id)}>
          copy
        </button>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => st.navigate(node.id)}>
          <Crosshair size={14} aria-hidden /> Show on map
        </button>
        <button className="btn" onClick={() => st.setFocus({ ids: [node.id], depth: 2, direction: 'both', label: node.label })}>
          <Graph size={14} aria-hidden /> Neighbourhood
        </button>
        <button className="btn" onClick={() => st.setFocus({ ids: [node.id], depth: 3, direction: 'in', kinds: ['calls_declared_target', 'possible_runtime_target'], label: `callers of ${node.label}` })}>
          Callers
        </button>
        <button className="btn" onClick={() => st.setFocus({ ids: [node.id], depth: 3, direction: 'out', kinds: ['calls_declared_target', 'possible_runtime_target'], label: `called by ${node.label}` })}>
          Callees
        </button>
        {st.tab === 'graph' && node.children.length > 0 && (
          <button className="btn" onClick={() => st.toggleExpanded(node.id)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
        <button className="btn ghost" onClick={() => st.hide(node.id)} title="Hide from map and graph">
          <EyeSlash size={14} aria-hidden /> Hide
        </button>
      </div>
      <div className="insp-tabs" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['relations', `Relations ${(model.out.get(node.id)?.length ?? 0) + (model.in.get(node.id)?.length ?? 0)}`],
            ['source', `Source ${decls.length}`],
            ['raw', 'Raw'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'raw' && (
        <Block title={node.entity ? 'Entity record' : 'Record'}>
          <Fields rec={node.entity ?? node.record ?? { id: node.id, kind: node.kind }} />
        </Block>
      )}
      {tab === 'overview' && node.entity && (
        <Block title="Summary">
          <Fields rec={Object.fromEntries(Object.entries(node.entity).filter(([k]) => ['kind', 'accessibility', 'modifiers', 'origin', 'project', 'assembly', 'namespace'].includes(k)))} />
        </Block>
      )}
      {tab === 'overview' && project && (
        <>
          <Block title="Project">
            <Fields rec={project} skip={['packages', 'projectReferences', 'id']} />
            {coverage && <Fields rec={{ 'coverage.state': coverage.state }} />}
            {card && (
              <button className="link" onClick={() => st.set({ tab: 'docs', docPath: card.path })}>
                open context card ({card.path.split('/').pop()})
              </button>
            )}
          </Block>
          <Block title="Project references" count={(project.projectReferences as string[] | undefined)?.length ?? 0}>
            {((project.projectReferences as string[]) ?? []).map((p) => {
              const target = model.projectByPath.get(p);
              return <div key={p}>{target ? <NodeLink id={target.id} model={model} /> : <span className="mono small">{p}</span>}</div>;
            })}
          </Block>
          <Block title="Packages" open={false} count={(project.packages as unknown[] | undefined)?.length ?? 0}>
            <table className="fields">
              <tbody>
                {((project.packages as { id: string; version: string; direct?: boolean }[]) ?? []).map((p) => (
                  <tr key={p.id}>
                    <th>{p.id}</th>
                    <td>
                      {p.version} {p.direct ? <span className="badge">direct</span> : <span className="muted small">transitive</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
          {contexts.length > 0 && (
            <Block title="Analysis contexts" open={false} count={contexts.length}>
              {contexts.map((c) => (
                <Fields key={c.id} rec={c} skip={['preprocessorSymbols']} />
              ))}
            </Block>
          )}
        </>
      )}
      {tab === 'overview' && diags.length > 0 && (
        <Block title="Diagnostics" count={diags.length}>
          {diags.map((d) => (
            <div key={d.id} className={`diag sev-${d.severity}`}>
              <b>{d.code}</b> <span className="badge">{d.state}</span>
              <div className="small">{d.message}</div>
            </div>
          ))}
        </Block>
      )}
      {tab === 'source' && decls.length === 0 && <div className="empty-note">No declarations in this generation (metadata or group).</div>}
      {tab === 'source' &&
        decls.map((d, i) => (
          <div key={d.id} className="decl">
            <button className="link mono" onClick={() => setOpenDecl(openDecl === d.id ? null : d.id)}>
              {d.path}:{d.span?.startLine}
            </button>
            {d.generator && <span className="badge">gen: {d.generator}</span>}
            {(openDecl === d.id || (openDecl === null && i === 0)) && <SourceContext path={d.path} store={d.store} span={d.extent ?? d.span} radius={2} />}
          </div>
        ))}
      {tab === 'overview' && childKinds.length > 0 && (
        <Block title="Contains" count={node.children.length} open={false}>
          {childKinds.map(([k, c]) => (
            <div key={k} className="small">
              <span className="swatch" style={{ background: nodeColor(k) }} /> {k}: {c}
            </div>
          ))}
          <div className="child-list">
            {node.children.slice(0, 200).map((c) => (
              <NodeLink key={c} id={c} model={model} />
            ))}
          </div>
        </Block>
      )}
      {tab === 'relations' && (
        <>
          <Block title="Uses (outgoing)" count={model.out.get(node.id)?.length ?? 0}>
            <RelationGroups node={node} model={model} dir="out" />
          </Block>
          <Block title="Used by (incoming)" count={model.in.get(node.id)?.length ?? 0}>
            <RelationGroups node={node} model={model} dir="in" />
          </Block>
        </>
      )}
    </div>
  );
}

function EdgeInspector({ sel, model }: { sel: { edgeIdx: number[]; source: string; target: string; kinds: Record<string, number> }; model: GraphModel }) {
  const [max, setMax] = useState(100);
  const [open, setOpen] = useState<number | null>(null);
  const total = Object.values(sel.kinds).reduce((a, b) => a + b, 0);
  const label = (id: string) => model.nodes.get(id)?.label ?? id;
  return (
    <div className="inspector-body">
      <div className="insp-title">
        <NodeLink id={sel.source} model={model} /> → <NodeLink id={sel.target} model={model} />
      </div>
      <div className="muted small">{total} aggregated relations</div>
      <div className="kinds">
        {Object.entries(sel.kinds).map(([k, c]) => (
          <span key={k} className="kind-chip">
            <span className="swatch" style={{ background: edgeColor(k) }} />
            {kindLabel(k)} {c}
          </span>
        ))}
      </div>
      {sel.edgeIdx.length < total && <div className="muted small">showing the first {sel.edgeIdx.length}</div>}
      {sel.edgeIdx.slice(0, max).map((idx) => {
        const e = model.edges[idx];
        return (
          <div key={idx} className="rel-row">
            <div className="rel-line">
              <button className="link caret-btn" onClick={() => setOpen(open === idx ? null : idx)}>
                {open === idx ? '▾' : '▸'}
              </button>
              <span className="swatch" style={{ background: edgeColor(e.kind) }} />
              <span className="small" title={e.from}>
                {label(e.from)}
              </span>
              <span className="muted"> → </span>
              <span className="small" title={e.to}>
                {label(e.to)}
              </span>
              {e.usage && <span className="badge">{e.usage}</span>}
              {e.resolution !== 'exact' && <span className="badge warn">{e.resolution}</span>}
            </div>
            {open === idx && (
              <div className="rel-detail">
                <div className="actions">
                  <NodeLink id={e.from} model={model} />
                  <NodeLink id={e.to} model={model} />
                </div>
                {e.relation && <Fields rec={e.relation} skip={['evidence']} />}
                <EvidenceList ids={e.relation?.evidence ?? e.link?.evidence ?? []} limit={5} />
              </div>
            )}
          </div>
        );
      })}
      {sel.edgeIdx.length > max && (
        <button className="link" onClick={() => setMax(max + 200)}>
          {Math.min(200, sel.edgeIdx.length - max)} more
        </button>
      )}
    </div>
  );
}

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const model = useStore((s) => s.model);
  const open = useStore((s) => s.inspectorOpen);
  const set = useStore((s) => s.set);
  if (!model || !selection || !open) return null;
  const node = selection.type === 'node' ? model.nodes.get(selection.id) : null;
  return (
    <aside className="drawer panel" aria-label="Inspector" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <header className="drawer-head">
        <span className="drawer-title">{selection.type === 'edge' ? 'Relations' : 'Symbol'}</span>
        <button className="icon-btn" onClick={() => set({ inspectorOpen: false })} aria-label="Close inspector" title="Close (Esc)">
          <X size={16} />
        </button>
      </header>
      <div className="drawer-body">
        {selection.type === 'edge' ? <EdgeInspector key={selection.id} sel={selection} model={model} /> : node ? <NodeInspector key={node.id} node={node} model={model} /> : null}
      </div>
    </aside>
  );
}
