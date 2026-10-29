import { useEffect, useRef, useState } from 'react';
import { CaretDown, CaretRight, GlobeHemisphereWest } from '@phosphor-icons/react';
import type { MapLayout } from '../model/mapLayout';
import { KIND_GLYPH } from '../theme/palette';

/** Path bar: where the view is, with a sibling menu on every level (like an IDE breadcrumb). */
export function Breadcrumbs({ layout, path, onPick }: { layout: MapLayout; path: string[]; onPick: (id: string | null) => void }) {
  const [menu, setMenu] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu === null) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  // Menu i lists the children of level i-1 (the siblings of path[i]); the last menu lists what is inside.
  const optionsFor = (i: number) => {
    const parent = i === 0 ? null : path[i - 1];
    const ids = parent ? layout.nodes.get(parent)!.children : layout.roots;
    return [...ids].sort((a, b) => layout.nodes.get(a)!.label.localeCompare(layout.nodes.get(b)!.label));
  };

  return (
    <nav className="crumbs-bar panel" ref={ref} aria-label="Map location" onPointerDown={(e) => e.stopPropagation()}>
      <button className="crumb" onClick={() => onPick(null)} title="Show all projects">
        <GlobeHemisphereWest size={15} weight="duotone" aria-hidden />
        <span>All projects</span>
      </button>
      {[...path, null].map((id, i) => {
        const options = optionsFor(i);
        if (!id && !options.length) return null;
        const n = id ? layout.nodes.get(id) : null;
        return (
          <span key={id ?? 'next'} className="crumb-group">
            <button className="crumb-sep" onClick={() => setMenu(menu === i ? null : i)} aria-label={id ? `Siblings of ${n?.label}` : 'Go inside'} aria-expanded={menu === i}>
              {menu === i ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
            </button>
            {n && (
              <button className={`crumb ${i === path.length - 1 ? 'current' : ''}`} onClick={() => onPick(n.id)} title={n.label}>
                {n.label}
              </button>
            )}
            {menu === i && (
              <div className="menu-pop" role="menu">
                {options.map((oid) => {
                  const o = layout.nodes.get(oid)!;
                  return (
                    <button
                      key={oid}
                      role="menuitem"
                      className={`menu-item ${oid === id ? 'on' : ''}`}
                      onClick={() => {
                        setMenu(null);
                        onPick(oid);
                      }}
                    >
                      <span className="glyph" data-kind={o.kind}>
                        {KIND_GLYPH[o.kind] ?? '·'}
                      </span>
                      <span className="menu-label">{o.label}</span>
                      {o.size > 0 && <span className="menu-meta">{o.size.toLocaleString('en-US')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </span>
        );
      })}
    </nav>
  );
}
