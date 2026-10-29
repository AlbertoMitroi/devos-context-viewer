import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChartColumn, Expand, Layers, Network, Table2 } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';
import { KindGlyph } from '@/components/kind-glyph';
import { ancestors, searchNodes } from '@/model/graphModel';
import { useStore } from '@/store';

/** ⌘K: jump to any symbol or project, or run an action. Our own ranking, so cmdk filtering is off. */
export function CommandMenu() {
  const open = useStore((s) => s.paletteOpen);
  const model = useStore((s) => s.model);
  const selection = useStore((s) => s.selection);
  const set = useStore((s) => s.set);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (open) setQ('');
  }, [open]);

  const results = useMemo(() => (model && q.trim().length >= 2 ? searchNodes(model, q, 60) : []), [model, q]);
  const run = (fn: () => void) => {
    set({ paletteOpen: false });
    fn();
  };
  const st = useStore.getState;
  const selected = selection?.type === 'node' ? model?.nodes.get(selection.id) : null;

  return (
    <CommandDialog open={open} onOpenChange={(v) => set({ paletteOpen: v })} shouldFilter={false}>
      <CommandInput placeholder="Search symbols, types, projects…  try: Basket kind:interface" value={q} onValueChange={setQ} />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No matches. Try a shorter name, or kind:class.</CommandEmpty>
        {results.length > 0 && model && (
          <CommandGroup heading="Symbols">
            {results.map((id) => {
              const n = model.nodes.get(id)!;
              const path = ancestors(model, id)
                .reverse()
                .map((a) => model.nodes.get(a)!.label)
                .join(' › ');
              return (
                <CommandItem key={id} value={id} onSelect={() => run(() => st().reveal(id))} className="gap-3">
                  <KindGlyph kind={n.kind} />
                  <span className="font-medium">{n.label}</span>
                  <span className="ml-auto max-w-[55%] truncate text-xs text-muted-foreground">{path || n.kind}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {q.trim().length < 2 && model && (
          <>
            <CommandGroup heading="Actions">
              <CommandItem value="fit" onSelect={() => run(() => (st().set({ tab: 'map' }), st().navigate(null, { select: false })))}>
                <Expand /> Show all projects <CommandShortcut>F</CommandShortcut>
              </CommandItem>
              <CommandItem value="layers" onSelect={() => run(() => st().set({ layersOpen: true }))}>
                <Layers /> Layers and filters <CommandShortcut>L</CommandShortcut>
              </CommandItem>
              {selected && (
                <CommandItem value="nb" onSelect={() => run(() => st().setFocus({ ids: [selected.id], depth: 2, direction: 'both', label: selected.label }))}>
                  <Network /> Neighbourhood of {selected.label}
                </CommandItem>
              )}
              <CommandItem value="tables" onSelect={() => run(() => st().set({ tab: 'tables' }))}>
                <Table2 /> Open tables
              </CommandItem>
              <CommandItem value="summary" onSelect={() => run(() => st().set({ tab: 'overview' }))}>
                <ChartColumn /> Open summary
              </CommandItem>
              <CommandItem value="docs" onSelect={() => run(() => st().set({ tab: 'docs' }))}>
                <BookOpen /> Open context and wiki
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {model.roots.map((r) => {
                const n = model.nodes.get(r)!;
                return (
                  <CommandItem key={r} value={r} onSelect={() => run(() => (st().set({ tab: 'map' }), st().navigate(r)))} className="gap-3">
                    <KindGlyph kind={n.kind} />
                    <span>{n.label}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{n.descendants.toLocaleString('en-US')}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
