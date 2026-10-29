import { useStore } from '../store';
import { edgeColor, kindLabel, nodeColor } from '../model/kinds';
import type { Json } from '../model/types';

function Bars({ entries, color, label = (k) => k }: { entries: [string, number][]; color: (k: string) => string; label?: (k: string) => string }) {
  const max = Math.max(1, ...entries.map(([, c]) => c));
  return (
    <div className="bars">
      {entries.map(([k, c]) => (
        <div key={k} className="bar-row">
          <span className="bar-label">{label(k)}</span>
          <span className="bar-track">
            <span className="bar" style={{ width: `${(c / max) * 100}%`, background: color(k) }} />
          </span>
          <span className="bar-count">{c.toLocaleString('ro-RO')}</span>
        </div>
      ))}
    </div>
  );
}

const SUPPORTED_CAPABILITIES = new Set<string>();

export function Overview() {
  const st = useStore();
  const data = st.data!;
  const model = st.model!;
  const m = (data.manifest ?? {}) as Json;
  const repo = (m.repository as Json | undefined)?.remoteUrl as string | undefined;
  const engine = m.engine as Json | undefined;
  const roslyn = m.roslyn as Json | undefined;
  const required = (m.requiredCapabilities as string[] | undefined) ?? [];
  const unsupported = required.filter((c) => !SUPPORTED_CAPABILITIES.has(c));
  const coverage = ((m.coverage as Json | undefined)?.projects as Json[] | undefined) ?? [];
  const stages = ((data.run?.stages as { name: string; elapsedMs: number }[] | undefined) ?? []).map((s) => [s.name, s.elapsedMs] as [string, number]);
  const sorted = (mm: Map<string, number>) => [...mm.entries()].sort((a, b) => b[1] - a[1]);
  const schemaMajor = String(m.schemaVersion ?? '').split('.')[0];

  return (
    <div className="overview">
      {unsupported.length > 0 && (
        <div className="alert">
          Generația cere capabilități pe care viewer-ul nu le cunoaște: {unsupported.join(', ')}. Conform contractului, datele nu ar trebui interpretate.
        </div>
      )}
      {schemaMajor && schemaMajor !== '0' && schemaMajor !== '1' && <div className="alert">schemaVersion {String(m.schemaVersion)}: versiune majoră necunoscută.</div>}
      {data.parseErrors.length > 0 && (
        <div className="alert">
          {data.parseErrors.length} erori de parsare, ex. {data.parseErrors[0].file}:{data.parseErrors[0].line} {data.parseErrors[0].message}
        </div>
      )}
      {model.unknownKinds.length > 0 && <div className="alert info">Tipuri de relații necunoscute (păstrate, excluse din traversare): {model.unknownKinds.join(', ')}</div>}
      {model.dangling.count > 0 && (
        <div className="alert info" title={model.dangling.samples.join('\n')}>
          {model.dangling.count} relații cu capăt inexistent (ignorate în graf). Ex.: {model.dangling.samples[0]}
        </div>
      )}

      <div className="cards">
        <div className="card">
          <h3>Generație</h3>
          <table className="fields">
            <tbody>
              <tr><th>repo</th><td>{repo ?? 'necunoscut'}</td></tr>
              <tr><th>commit</th><td className="mono">{String(m.commit ?? '')}{m.dirty ? ' (dirty)' : ''}</td></tr>
              <tr><th>status</th><td><span className={`badge status-${String(m.status)}`}>{String(m.status ?? '?')}</span></td></tr>
              <tr><th>schemaVersion</th><td>{String(m.schemaVersion ?? '?')}</td></tr>
              <tr><th>engine</th><td>{engine ? `${engine.name} ${engine.version}` : '?'}</td></tr>
              <tr><th>Roslyn</th><td>{roslyn ? String(roslyn.build ?? roslyn.apiVersion) : '?'}</td></tr>
              <tr><th>SDK-uri</th><td>{((m.sdks as Json[] | undefined) ?? []).map((s) => String(s.version)).join(', ')}</td></tr>
              <tr><th>imagine</th><td className="mono">{String(m.imageDigest ?? '?')}</td></tr>
              <tr><th>soluții</th><td>{((m.solutions as Json[] | undefined) ?? []).map((s) => String(s.path)).join(', ')}</td></tr>
              <tr><th>încărcare viewer</th><td>{data.loadMs} ms</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Înregistrări</h3>
          <Bars entries={Object.entries(data.counts).filter(([, c]) => c > 0)} color={() => '#4f9cf9'} />
          {stages.length > 0 && (
            <>
              <h3>Etape (run.json, ms)</h3>
              <Bars entries={stages} color={() => '#34d399'} />
            </>
          )}
        </div>
        <div className="card">
          <h3>Relații pe tip</h3>
          <Bars entries={sorted(model.edgeKinds)} color={edgeColor} label={kindLabel} />
          <h3>Rezoluție</h3>
          <Bars entries={sorted(model.resolutions)} color={(k) => (k === 'exact' ? '#34d399' : '#f59e0b')} />
        </div>
        <div className="card">
          <h3>Entități pe tip</h3>
          <Bars entries={sorted(model.entityKinds)} color={nodeColor} />
          <h3>Origine</h3>
          <Bars entries={sorted(model.origins)} color={(k) => (k === 'source' ? '#4f9cf9' : k === 'generated' ? '#a78bfa' : '#64748b')} />
        </div>
      </div>

      <div className="card wide">
        <h3>Acoperire pe proiect ({coverage.length})</h3>
        <table className="grid-table">
          <thead>
            <tr>
              <th>proiect</th>
              <th>stare</th>
              <th>entități</th>
              <th>diagnostice</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((c) => {
              const node = model.nodes.get(String(c.project));
              const diags = data.diagnostics.filter((d) => d.scope === c.path);
              return (
                <tr key={String(c.path)}>
                  <td>
                    <button className="link" onClick={() => node && st.reveal(node.id)}>
                      {String(c.path)}
                    </button>
                  </td>
                  <td>
                    <span className={`badge state-${String(c.state)}`}>{String(c.state)}</span>
                  </td>
                  <td>{node?.descendants ?? ''}</td>
                  <td className="small">{diags.map((d) => d.code).join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card wide">
        <h3>Diagnostice ({data.diagnostics.length})</h3>
        {data.diagnostics.map((d) => (
          <div key={d.id} className={`diag sev-${d.severity}`}>
            <b>{d.code}</b> <span className="badge">{d.severity}</span> <span className="badge">{d.state}</span> <span className="muted small">{d.scope}</span>
            <div className="small">{d.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
