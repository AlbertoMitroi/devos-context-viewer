import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, CaretDown, FolderOpen, GitCommit } from '@phosphor-icons/react';
import { useStore } from '../store';

/** Repository and generation picker in the top bar, grouped per repository. */
export function GenerationSwitcher() {
  const generations = useStore((s) => s.generations);
  const activeId = useStore((s) => s.activeId);
  const open = useStore((s) => s.openGeneration);
  const refresh = useStore((s) => s.refreshGenerations);
  const addLocal = useStore((s) => s.addLocalFolder);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const active = generations.find((g) => g.id === activeId);

  useEffect(() => {
    if (!show) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setShow(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [show]);

  const byRepo = useMemo(() => {
    const m = new Map<string, typeof generations>();
    for (const g of generations) m.set(g.repoKey, [...(m.get(g.repoKey) ?? []), g]);
    return [...m.entries()];
  }, [generations]);
  const repoName = (k: string) => k.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '');

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn" onClick={() => setShow(!show)} aria-expanded={show} aria-haspopup="listbox">
        <span className="switcher-repo">{active ? repoName(active.repoKey) : 'No generation'}</span>
        {active && (
          <span className="switcher-gen">
            <GitCommit size={13} aria-hidden /> {active.commit?.slice(0, 7) ?? '?'} · {active.folder}
          </span>
        )}
        <CaretDown size={12} weight="bold" aria-hidden />
      </button>
      {show && (
        <div className="menu-pop switcher-pop panel" role="listbox">
          {byRepo.map(([repo, gens]) => (
            <div key={repo}>
              <div className="palette-section">{repoName(repo)}</div>
              {gens.map((g) => (
                <button
                  key={g.id}
                  role="option"
                  aria-selected={g.id === activeId}
                  className={`menu-item ${g.id === activeId ? 'on' : ''}`}
                  onClick={() => {
                    setShow(false);
                    open(g.id);
                  }}
                  title={g.path ?? g.folder}
                >
                  <GitCommit size={14} aria-hidden />
                  <span className="mono">{g.commit?.slice(0, 7) ?? '?'}</span>
                  <span className="menu-label">{g.folder}</span>
                  {g.status && <span className={`badge status-${g.status}`}>{g.status}</span>}
                  {g.local && <span className="badge">local</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="menu-actions">
            <button className="btn ghost" onClick={() => refresh()}>
              <ArrowClockwise size={14} aria-hidden /> Rescan
            </button>
            <button className="btn ghost" onClick={() => file.current?.click()}>
              <FolderOpen size={14} aria-hidden /> Open folder…
            </button>
          </div>
          <input
            ref={file}
            type="file"
            hidden
            // @ts-expect-error non-standard directory picker attribute
            webkitdirectory=""
            multiple
            onChange={(e) => {
              setShow(false);
              if (e.target.files) addLocal(e.target.files);
            }}
          />
        </div>
      )}
    </div>
  );
}
