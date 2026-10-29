import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsOutSimple, Graph, MagnifyingGlass, Stack, Table } from '@phosphor-icons/react';
import { ancestors, searchNodes } from '../model/graphModel';
import { useStore } from '../store';
import { KIND_GLYPH } from '../theme/palette';

interface Item {
  key: string;
  label: string;
  hint?: string;
  glyph?: { kind: string; text: string };
  icon?: React.ReactNode;
  run: () => void;
}

/** ⌘K: jump to any symbol, project or action. */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const model = useStore((s) => s.model);
  const st = useStore.getState;
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const close = () => useStore.getState().set({ paletteOpen: false });

  const items: Item[] = useMemo(() => {
    if (!model) return [];
    const query = q.trim();
    if (query.length < 2) {
      const actions: Item[] = [
        { key: 'fit', label: 'Show all projects', icon: <ArrowsOutSimple size={16} />, run: () => st().navigate(null, { select: false }) },
        { key: 'layers', label: 'Open layers and filters', icon: <Stack size={16} />, run: () => st().set({ layersOpen: true }) },
        { key: 'tables', label: 'Open tables', icon: <Table size={16} />, run: () => st().set({ tab: 'tables' }) },
      ];
      const sel = st().selection;
      if (sel?.type === 'node') {
        const n = model.nodes.get(sel.id);
        if (n) actions.push({ key: 'nb', label: `Neighbourhood of ${n.label}`, icon: <Graph size={16} />, run: () => st().setFocus({ ids: [n.id], depth: 2, direction: 'both', label: n.label }) });
      }
      const projects: Item[] = model.roots.map((r) => {
        const n = model.nodes.get(r)!;
        return { key: r, label: n.label, hint: n.kind === 'project' ? `${n.descendants.toLocaleString('en-US')} symbols` : n.kind, glyph: { kind: n.kind, text: KIND_GLYPH[n.kind] ?? '·' }, run: () => st().navigate(r) };
      });
      return [...actions, ...projects];
    }
    return searchNodes(model, query, 60).map((id) => {
      const n = model.nodes.get(id)!;
      const path = ancestors(model, id)
        .reverse()
        .map((a) => model.nodes.get(a)!.label)
        .join(' › ');
      return { key: id, label: n.label, hint: path || n.kind, glyph: { kind: n.kind, text: KIND_GLYPH[n.kind] ?? '·' }, run: () => st().reveal(id) };
    });
  }, [q, model, st]);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;
  const pick = (it: Item | undefined) => {
    if (!it) return;
    close();
    it.run();
  };
  return (
    <div className="palette-scrim" onPointerDown={close}>
      <div className="palette panel" role="dialog" aria-label="Command palette" onPointerDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <MagnifyingGlass size={18} aria-hidden />
          <input
            ref={input}
            value={q}
            placeholder="Search symbols, types, projects…  try: Basket kind:interface"
            aria-label="Search"
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') pick(items[cursor]);
              else if (e.key === 'Escape') close();
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {q.trim().length < 2 && <div className="palette-section">Actions and projects</div>}
          {items.length === 0 && <div className="empty-note">No matches. Try a shorter name or kind:class.</div>}
          {items.map((it, i) => (
            <button
              key={it.key}
              role="option"
              aria-selected={i === cursor}
              data-active={i === cursor}
              className={`palette-item ${i === cursor ? 'on' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(it)}
            >
              {it.glyph ? (
                <span className="glyph" data-kind={it.glyph.kind}>
                  {it.glyph.text}
                </span>
              ) : (
                <span className="palette-icon">{it.icon}</span>
              )}
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> go
          </span>
          <span>
            on the map: <kbd>←→↑↓</kbd> siblings · <kbd>↵</kbd> enter · <kbd>⌫</kbd> up · <kbd>F</kbd> all
          </span>
        </div>
      </div>
    </div>
  );
}
