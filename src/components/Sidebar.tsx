import { useMemo, useRef, useState, type ReactNode } from 'react';
import { edgeColor, isKnownEdgeKind, kindLabel, nodeColor, STRUCTURAL_KINDS } from '../model/kinds';
import { useStore } from '../store';

function Section({ title, children, defaultOpen = true, extra }: { title: string; children: ReactNode; defaultOpen?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <span className="section-title">{title}</span>
        <span className="section-extra" onClick={(e) => e.stopPropagation()}>
          {extra}
        </span>
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function AllNone({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <>
      <button className="link" onClick={onAll}>
        all
      </button>
      <button className="link" onClick={onNone}>
        none
      </button>
    </>
  );
}

function Check({ checked, onChange, color, label, count, title, badge }: { checked: boolean; onChange: () => void; color?: string; label: string; count?: number; title?: string; badge?: string }) {
  return (
    <label className="row-check" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {color && <span className="swatch" style={{ background: color }} />}
      <span className="row-label">{label}</span>
      {badge && <span className="badge">{badge}</span>}
      {count !== undefined && <span className="count">{count.toLocaleString('en-US')}</span>}
    </label>
  );
}

export function GenerationPicker() {
  const st = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const byRepo = useMemo(() => {
    const m = new Map<string, typeof st.generations>();
    for (const g of st.generations) {
      const list = m.get(g.repoKey) ?? [];
      list.push(g);
      m.set(g.repoKey, list);
    }
    return [...m.entries()];
  }, [st.generations]);
  return (
    <Section
      title="Repositories and generations"
      extra={
        <>
          <button className="link" onClick={() => st.refreshGenerations()} title="Rescan generations on the server">
            ↻
          </button>
          <button className="link" onClick={() => fileInput.current?.click()} title="Open a generation folder from this computer">
            + folder
          </button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        style={{ display: 'none' }}
        // @ts-expect-error non-standard directory picker attribute
        webkitdirectory=""
        multiple
        onChange={(e) => e.target.files && st.addLocalFolder(e.target.files)}
      />
      {!st.generations.length && <p className="muted small">No generations found. Configure viewer.config.json or pick a folder.</p>}
      {byRepo.map(([repo, gens]) => (
        <div key={repo} className="repo">
          <div className="repo-name" title={repo}>
            {repo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')}
          </div>
          {gens.map((g) => (
            <button key={g.id} className={`gen ${g.id === st.activeId ? 'active' : ''}`} onClick={() => st.openGeneration(g.id)} title={g.path ?? g.folder}>
              <span className="gen-commit">{g.commit ? g.commit.slice(0, 7) : '?'}</span>
              <span className="gen-folder">{g.folder}</span>
              {g.status && <span className={`badge status-${g.status}`}>{g.status}</span>}
              {g.local && <span className="badge">local</span>}
            </button>
          ))}
        </div>
      ))}
    </Section>
  );
}

export function Filters() {
  const st = useStore();
  const model = st.model;
  const [projQ, setProjQ] = useState('');
  if (!model) return null;
  const edgeKinds = [...model.edgeKinds.entries()].sort((a, b) => b[1] - a[1]);
  const entityKinds = [...model.entityKinds.entries()].sort((a, b) => b[1] - a[1]);
  const roots = model.roots.map((r) => model.nodes.get(r)!).filter((n) => n.label.toLowerCase().includes(projQ.toLowerCase()));

  return (
    <>
      <Section title="Relations" extra={<AllNone onAll={() => st.setAll('edgeKinds', edgeKinds.map(([k]) => k))} onNone={() => st.setAll('edgeKinds', [])} />}>
        {edgeKinds.map(([k, c]) => (
          <Check
            key={k}
            checked={st.edgeKinds.has(k)}
            onChange={() => st.toggleIn('edgeKinds', k)}
            color={edgeColor(k)}
            label={kindLabel(k)}
            count={c}
            title={k}
            badge={!isKnownEdgeKind(k) ? 'unknown' : STRUCTURAL_KINDS.has(k) ? 'structure' : undefined}
          />
        ))}
      </Section>
      {model.usages.size > 0 && (
        <Section title="Usage (references)" defaultOpen={false} extra={<AllNone onAll={() => st.setAll('usages', [...model.usages.keys()])} onNone={() => st.setAll('usages', [])} />}>
          {[...model.usages.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, c]) => (
              <Check key={k} checked={st.usages.has(k)} onChange={() => st.toggleIn('usages', k)} label={k} count={c} />
            ))}
        </Section>
      )}
      <Section title="Resolution" defaultOpen={false}>
        {[...model.resolutions.entries()].map(([k, c]) => (
          <Check key={k} checked={st.resolutions.has(k)} onChange={() => st.toggleIn('resolutions', k)} label={k} count={c} />
        ))}
      </Section>
      <Section title="Origin">
        {[...model.origins.entries()].map(([k, c]) => (
          <Check
            key={k}
            checked={st.origins.has(k)}
            onChange={() => st.toggleIn('origins', k)}
            label={k === 'source' ? 'source code' : k === 'generated' ? 'generated code' : k === 'metadata' ? 'external packages (metadata)' : k}
            count={c}
          />
        ))}
      </Section>
      <Section title="Entity kinds" defaultOpen={false} extra={<AllNone onAll={() => st.setAll('entityKinds', entityKinds.map(([k]) => k))} onNone={() => st.setAll('entityKinds', [])} />}>
        <p className="muted small">A hidden kind stays visible only as a container; its relations move to the parent.</p>
        {entityKinds.map(([k, c]) => (
          <Check key={k} checked={st.entityKinds.has(k)} onChange={() => st.toggleIn('entityKinds', k)} color={nodeColor(k)} label={k} count={c} />
        ))}
      </Section>
      <Section
        title={`Projects and packages (${model.roots.length})`}
        defaultOpen={false}
        extra={<AllNone onAll={() => st.setAll('disabledRoots', [])} onNone={() => st.setAll('disabledRoots', model.roots)} />}
      >
        <label className="row-check">
          <input type="checkbox" checked={st.hideTests} onChange={() => st.set({ hideTests: !st.hideTests })} />
          <span className="row-label">hide test projects</span>
        </label>
        <input className="mini-search" placeholder="filter…" value={projQ} onChange={(e) => setProjQ(e.target.value)} />
        {roots.map((n) => (
          <Check
            key={n.id}
            checked={!st.disabledRoots.has(n.id)}
            onChange={() => st.toggleIn('disabledRoots', n.id)}
            color={nodeColor(n.kind)}
            label={n.label}
            count={n.descendants}
            badge={n.isTest ? 'test' : n.kind === 'group' ? 'group' : undefined}
            title={n.fullName}
          />
        ))}
      </Section>
      <Section title="Display">
        <Check checked={st.mergeKinds} onChange={() => st.set({ mergeKinds: !st.mergeKinds })} label="one edge per pair (merge kinds)" />
        <Check checked={st.edgeLabels} onChange={() => st.set({ edgeLabels: !st.edgeLabels })} label="relation count labels" />
        <Check checked={st.hideIsolated} onChange={() => st.set({ hideIsolated: !st.hideIsolated })} label="hide nodes without edges" />
        <Check checked={st.hoverHighlight} onChange={() => st.set({ hoverHighlight: !st.hoverHighlight })} label="highlight neighbours on hover" />
        <label className="range">
          <span>minimum edge weight: {st.minWeight}</span>
          <input type="range" min={1} max={50} value={st.minWeight} onChange={(e) => st.set({ minWeight: Number(e.target.value) })} />
        </label>
      </Section>
      {st.hidden.size > 0 && (
        <Section title={`Hidden (${st.hidden.size})`} extra={<button className="link" onClick={() => st.setAll('hidden', [])}>show all</button>}>
          {[...st.hidden].map((id) => (
            <div key={id} className="hidden-row">
              <span title={id}>{model.nodes.get(id)?.label ?? id}</span>
              <button className="link" onClick={() => st.toggleIn('hidden', id)}>
                show
              </button>
            </div>
          ))}
        </Section>
      )}
      <div className="section-actions">
        <button onClick={st.resetFilters}>Reset filters</button>
      </div>
    </>
  );
}
