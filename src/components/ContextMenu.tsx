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
    items.push({ label: expanded ? 'Collapse' : 'Expand', hint: 'double-click', run: () => st.toggleExpanded(node.id) });
    items.push({ label: 'Expand whole subtree', run: () => st.expandSubtree(node.id) });
    items.push({ label: 'Collapse whole subtree', run: () => st.collapseSubtree(node.id) });
    items.push('sep');
  }
  items.push({ label: 'Focus: neighbourhood (2 hops)', hint: 'F', run: () => st.setFocus({ ids: [node.id], depth: 2, direction: 'both', label: node.label }) });
  items.push({ label: 'Used by (incoming)', run: () => st.setFocus({ ids: [node.id], depth: 2, direction: 'in', label: `← ${node.label}` }) });
  items.push({ label: 'Uses (outgoing)', run: () => st.setFocus({ ids: [node.id], depth: 2, direction: 'out', label: `${node.label} →` }) });
  items.push({ label: 'Callers', run: () => st.setFocus({ ids: [node.id], depth: 3, direction: 'in', kinds: CALL_KINDS, label: `callers of ${node.label}` }) });
  items.push({ label: 'Callees', run: () => st.setFocus({ ids: [node.id], depth: 3, direction: 'out', kinds: CALL_KINDS, label: `called by ${node.label}` }) });
  items.push({ label: 'Type hierarchy', run: () => st.setFocus({ ids: [node.id], depth: 4, direction: 'both', kinds: ['implements', 'inherits', 'overrides'], label: `hierarchy of ${node.label}` }) });
  items.push('sep');
  if (st.pathStart && st.pathStart !== node.id) {
    items.push({
      label: 'Path to here',
      run: () => {
        if (!st.findPath(st.pathStart!, node.id, false)) st.set({ error: 'No path between these two nodes with the current filters.', pathStart: null });
      },
    });
  }
  items.push({ label: st.pathStart === node.id ? 'Cancel path start' : 'Path from here…', run: () => st.set({ pathStart: st.pathStart === node.id ? null : node.id }) });
  items.push('sep');
  items.push({ label: 'Hide', hint: 'H', run: () => st.hide(node.id) });
  items.push({ label: 'Only this project / package', run: () => st.isolateRoot(node.id) });
  items.push({ label: 'Copy id', run: () => navigator.clipboard?.writeText(node.id) });
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
