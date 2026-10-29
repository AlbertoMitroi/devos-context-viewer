import { useStore } from '../store';

export interface MenuTarget {
  x: number;
  y: number;
  id: string;
}

const CALL_KINDS = ['calls_declared_target', 'possible_runtime_target'];

export function ContextMenu({ target, onClose }: { target: MenuTarget; onClose: () => void }) {
  const st = useStore.getState();
  const node = st.model?.nodes.get(target.id);
  if (!node) return null;
  const expanded = st.expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const items: ({ label: string; run: () => void; hint?: string } | 'sep')[] = [];
  if (hasChildren) {
    items.push({ label: expanded ? 'Restrânge' : 'Expandează', hint: 'dublu clic', run: () => st.toggleExpanded(node.id) });
    items.push({ label: 'Expandează tot sub-arborele', run: () => st.expandSubtree(node.id) });
    items.push({ label: 'Restrânge tot sub-arborele', run: () => st.collapseSubtree(node.id) });
    items.push('sep');
  }
  items.push({ label: 'Focus: vecinătate (2 pași)', hint: 'F', run: () => st.setFocus({ ids: [node.id], depth: 2, direction: 'both', label: node.label }) });
  items.push({ label: 'Cine folosește (intrări)', run: () => st.setFocus({ ids: [node.id], depth: 2, direction: 'in', label: `← ${node.label}` }) });
  items.push({ label: 'Ce folosește (ieșiri)', run: () => st.setFocus({ ids: [node.id], depth: 2, direction: 'out', label: `${node.label} →` }) });
  items.push({ label: 'Apelanți', run: () => st.setFocus({ ids: [node.id], depth: 3, direction: 'in', kinds: CALL_KINDS, label: `apelanți ${node.label}` }) });
  items.push({ label: 'Apelați', run: () => st.setFocus({ ids: [node.id], depth: 3, direction: 'out', kinds: CALL_KINDS, label: `apelați de ${node.label}` }) });
  items.push({ label: 'Ierarhie de tipuri', run: () => st.setFocus({ ids: [node.id], depth: 4, direction: 'both', kinds: ['implements', 'inherits', 'overrides'], label: `ierarhie ${node.label}` }) });
  items.push('sep');
  if (st.pathStart && st.pathStart !== node.id) {
    items.push({
      label: 'Cale până aici',
      run: () => {
        if (!st.findPath(st.pathStart!, node.id, false)) st.set({ error: 'Nu există cale între cele două noduri cu filtrele curente.', pathStart: null });
      },
    });
  }
  items.push({ label: st.pathStart === node.id ? 'Anulează începutul căii' : 'Cale de aici…', run: () => st.set({ pathStart: st.pathStart === node.id ? null : node.id }) });
  items.push('sep');
  items.push({ label: 'Ascunde', hint: 'H', run: () => st.hide(node.id) });
  items.push({ label: 'Doar acest proiect / pachet', run: () => st.isolateRoot(node.id) });
  items.push({ label: 'Copiază id', run: () => navigator.clipboard?.writeText(node.id) });
  return (
    <div className="ctx-menu" style={{ left: target.x, top: target.y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-title" title={node.fullName}>
        {node.kind} · {node.label}
      </div>
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button key={i} className="ctx-item" onClick={act(it.run)}>
            <span>{it.label}</span>
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
