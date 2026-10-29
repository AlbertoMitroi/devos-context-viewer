import { Stack, X } from '@phosphor-icons/react';
import { STRUCTURAL_KINDS } from '../model/kinds';
import { useStore, type MapEdges } from '../store';
import { Filters } from './Sidebar';

const PRESETS: { id: string; label: string; kinds: (all: string[]) => string[] }[] = [
  { id: 'all', label: 'Everything', kinds: (all) => all.filter((k) => !STRUCTURAL_KINDS.has(k)) },
  { id: 'arch', label: 'Architecture', kinds: () => ['project_reference', 'package_reference', 'consumes_contract', 'configured_route', 'possible_communication'] },
  { id: 'calls', label: 'Calls', kinds: () => ['calls_declared_target', 'possible_runtime_target'] },
  { id: 'types', label: 'Type hierarchy', kinds: () => ['implements', 'inherits', 'overrides'] },
];

/** Floating panel with relation presets and every filter; closed by default so the map gets the space. */
export function LayersPanel() {
  const open = useStore((s) => s.layersOpen);
  const model = useStore((s) => s.model);
  const edgeKinds = useStore((s) => s.edgeKinds);
  const mapEdges = useStore((s) => s.mapEdges);
  const tab = useStore((s) => s.tab);
  const set = useStore((s) => s.set);
  const setAll = useStore((s) => s.setAll);
  if (!model) return null;
  if (!open)
    return (
      <button className="layers-toggle panel" onClick={() => set({ layersOpen: true })} aria-label="Open layers and filters" onPointerDown={(e) => e.stopPropagation()}>
        <Stack size={16} aria-hidden /> Layers
      </button>
    );
  const all = [...model.edgeKinds.keys()];
  const activePreset = PRESETS.find((p) => {
    const want = new Set(p.kinds(all).filter((k) => model.edgeKinds.has(k)));
    return want.size === edgeKinds.size && [...want].every((k) => edgeKinds.has(k));
  })?.id;
  return (
    <aside className="layers panel" aria-label="Layers and filters" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      <header className="drawer-head">
        <span className="drawer-title">
          <Stack size={15} aria-hidden /> Layers
        </span>
        <button className="icon-btn" onClick={() => set({ layersOpen: false })} aria-label="Close layers">
          <X size={16} />
        </button>
      </header>
      <div className="layers-body">
        <div className="field-label">Relations</div>
        <div className="seg-control" role="radiogroup" aria-label="Relation preset">
          {PRESETS.map((p) => (
            <button key={p.id} role="radio" aria-checked={activePreset === p.id} className={activePreset === p.id ? 'on' : ''} onClick={() => setAll('edgeKinds', p.kinds(all).filter((k) => model.edgeKinds.has(k)))}>
              {p.label}
            </button>
          ))}
        </div>
        {tab === 'map' && (
          <>
            <div className="field-label">Draw edges</div>
            <div className="seg-control" role="radiogroup" aria-label="Edge drawing">
              {(
                [
                  ['all', 'All'],
                  ['selection', 'Selection only'],
                  ['none', 'None'],
                ] as [MapEdges, string][]
              ).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={mapEdges === id} className={mapEdges === id ? 'on' : ''} onClick={() => set({ mapEdges: id })}>
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        <Filters />
      </div>
    </aside>
  );
}
