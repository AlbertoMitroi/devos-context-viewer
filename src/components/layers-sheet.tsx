import { useState, type ReactNode } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { KindGlyph } from '@/components/kind-glyph';
import { edgeColor, isKnownEdgeKind, kindLabel, STRUCTURAL_KINDS } from '@/model/kinds';
import { useStore, type MapEdges } from '@/store';

const PRESETS: { id: string; label: string; kinds: (all: string[]) => string[] }[] = [
  { id: 'all', label: 'Everything', kinds: (all) => all.filter((k) => !STRUCTURAL_KINDS.has(k)) },
  { id: 'arch', label: 'Architecture', kinds: () => ['project_reference', 'package_reference', 'consumes_contract', 'configured_route', 'possible_communication'] },
  { id: 'calls', label: 'Calls', kinds: () => ['calls_declared_target', 'possible_runtime_target'] },
  { id: 'types', label: 'Type hierarchy', kinds: () => ['implements', 'inherits', 'overrides'] },
];

function Section({ title, children, defaultOpen = true, action }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-3">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger className="flex items-center gap-1.5 rounded-sm text-xs font-medium uppercase tracking-wider text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
          {title}
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent className="mt-2 space-y-0.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function AllNone({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onAll}>
        All
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onNone}>
        None
      </Button>
    </div>
  );
}

function CheckRow({ id, checked, onChange, label, count, swatch, glyph, badge, title }: { id: string; checked: boolean; onChange: () => void; label: string; count?: number; swatch?: string; glyph?: string; badge?: string; title?: string }) {
  return (
    <div className="flex h-8 items-center gap-2.5 rounded-md px-2 hover:bg-accent/50" title={title}>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      {swatch && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: swatch }} />}
      {glyph && <KindGlyph kind={glyph} />}
      <Label htmlFor={id} className="flex-1 cursor-pointer truncate font-normal">
        {label}
      </Label>
      {badge && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
          {badge}
        </Badge>
      )}
      {count !== undefined && <span className="font-mono text-xs tabular-nums text-muted-foreground">{count.toLocaleString('en-US')}</span>}
    </div>
  );
}

export function LayersSheet() {
  const st = useStore();
  const model = st.model;
  const [projQ, setProjQ] = useState('');
  if (!model) return null;
  const all = [...model.edgeKinds.keys()];
  const edgeKinds = [...model.edgeKinds.entries()].sort((a, b) => b[1] - a[1]);
  const entityKinds = [...model.entityKinds.entries()].sort((a, b) => b[1] - a[1]);
  const activePreset = PRESETS.find((p) => {
    const want = new Set(p.kinds(all).filter((k) => model.edgeKinds.has(k)));
    return want.size === st.edgeKinds.size && [...want].every((k) => st.edgeKinds.has(k));
  })?.id;
  const roots = model.roots.map((r) => model.nodes.get(r)!).filter((n) => n.label.toLowerCase().includes(projQ.toLowerCase()));

  return (
    <Sheet open={st.layersOpen} onOpenChange={(v) => st.set({ layersOpen: v })}>
      <SheetContent side="right" className="flex w-[380px] flex-col gap-0 p-0 sm:max-w-[380px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Layers and filters</SheetTitle>
          <SheetDescription>Choose which relations and symbols the map and the graph show.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="px-5 pb-6">
            <div className="space-y-2 pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Relation preset</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={activePreset ?? ''}
                onValueChange={(v) => {
                  const p = PRESETS.find((x) => x.id === v);
                  if (p) st.setAll('edgeKinds', p.kinds(all).filter((k) => model.edgeKinds.has(k)));
                }}
                className="grid grid-cols-2 gap-1.5"
              >
                {PRESETS.map((p) => (
                  <ToggleGroupItem key={p.id} value={p.id} className="h-8 text-xs">
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {st.tab === 'map' && (
              <div className="space-y-2 pt-4">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Draw edges on the map</Label>
                <ToggleGroup type="single" variant="outline" value={st.mapEdges} onValueChange={(v) => v && st.set({ mapEdges: v as MapEdges })} className="grid grid-cols-3 gap-1.5">
                  <ToggleGroupItem value="all" className="h-8 text-xs">
                    All
                  </ToggleGroupItem>
                  <ToggleGroupItem value="selection" className="h-8 text-xs">
                    Selection
                  </ToggleGroupItem>
                  <ToggleGroupItem value="none" className="h-8 text-xs">
                    None
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
            <Separator className="mt-4" />
            <Section title="Relations" action={<AllNone onAll={() => st.setAll('edgeKinds', all)} onNone={() => st.setAll('edgeKinds', [])} />}>
              {edgeKinds.map(([k, c]) => (
                <CheckRow
                  key={k}
                  id={`rel-${k}`}
                  checked={st.edgeKinds.has(k)}
                  onChange={() => st.toggleIn('edgeKinds', k)}
                  swatch={edgeColor(k)}
                  label={kindLabel(k)}
                  count={c}
                  title={k}
                  badge={!isKnownEdgeKind(k) ? 'unknown' : STRUCTURAL_KINDS.has(k) ? 'structure' : undefined}
                />
              ))}
            </Section>
            <Separator />
            <Section title="Origin">
              {[...model.origins.entries()].map(([k, c]) => (
                <CheckRow
                  key={k}
                  id={`origin-${k}`}
                  checked={st.origins.has(k)}
                  onChange={() => st.toggleIn('origins', k)}
                  label={k === 'source' ? 'Source code' : k === 'generated' ? 'Generated code' : k === 'metadata' ? 'External packages' : k}
                  count={c}
                />
              ))}
            </Section>
            <Separator />
            <Section title="Symbol kinds" defaultOpen={false} action={<AllNone onAll={() => st.setAll('entityKinds', entityKinds.map(([k]) => k))} onNone={() => st.setAll('entityKinds', [])} />}>
              <p className="px-2 pb-1 text-xs text-muted-foreground">A hidden kind stays only as a container; its relations move to the parent.</p>
              {entityKinds.map(([k, c]) => (
                <CheckRow key={k} id={`kind-${k}`} checked={st.entityKinds.has(k)} onChange={() => st.toggleIn('entityKinds', k)} glyph={k} label={k} count={c} />
              ))}
            </Section>
            {model.usages.size > 0 && (
              <>
                <Separator />
                <Section title="Reference usage" defaultOpen={false} action={<AllNone onAll={() => st.setAll('usages', [...model.usages.keys()])} onNone={() => st.setAll('usages', [])} />}>
                  {[...model.usages.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, c]) => (
                      <CheckRow key={k} id={`usage-${k}`} checked={st.usages.has(k)} onChange={() => st.toggleIn('usages', k)} label={k} count={c} />
                    ))}
                </Section>
              </>
            )}
            <Separator />
            <Section title="Resolution" defaultOpen={false}>
              {[...model.resolutions.entries()].map(([k, c]) => (
                <CheckRow key={k} id={`res-${k}`} checked={st.resolutions.has(k)} onChange={() => st.toggleIn('resolutions', k)} label={k} count={c} />
              ))}
            </Section>
            <Separator />
            <Section title={`Projects and packages (${model.roots.length})`} defaultOpen={false} action={<AllNone onAll={() => st.setAll('disabledRoots', [])} onNone={() => st.setAll('disabledRoots', model.roots)} />}>
              <div className="flex items-center justify-between px-2 py-1.5">
                <Label htmlFor="hide-tests" className="font-normal">
                  Hide test projects
                </Label>
                <Switch id="hide-tests" checked={st.hideTests} onCheckedChange={(v) => st.set({ hideTests: v })} />
              </div>
              <Input className="my-1 h-8" placeholder="Filter projects…" value={projQ} onChange={(e) => setProjQ(e.target.value)} />
              {roots.map((n) => (
                <CheckRow
                  key={n.id}
                  id={`root-${n.id}`}
                  checked={!st.disabledRoots.has(n.id)}
                  onChange={() => st.toggleIn('disabledRoots', n.id)}
                  glyph={n.kind}
                  label={n.label}
                  count={n.descendants}
                  badge={n.isTest ? 'test' : undefined}
                  title={n.fullName}
                />
              ))}
            </Section>
            <Separator />
            <Section title="Display">
              <div className="space-y-3 px-2 pt-1">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Minimum edge weight</Label>
                    <span className="font-mono text-xs text-muted-foreground">{st.minWeight}</span>
                  </div>
                  <Slider min={1} max={50} step={1} value={[st.minWeight]} onValueChange={([v]) => st.set({ minWeight: v })} />
                </div>
                {st.tab === 'graph' && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="merge" className="font-normal">
                        One edge per pair
                      </Label>
                      <Switch id="merge" checked={st.mergeKinds} onCheckedChange={(v) => st.set({ mergeKinds: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="labels" className="font-normal">
                        Relation count labels
                      </Label>
                      <Switch id="labels" checked={st.edgeLabels} onCheckedChange={(v) => st.set({ edgeLabels: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="isolated" className="font-normal">
                        Hide nodes without edges
                      </Label>
                      <Switch id="isolated" checked={st.hideIsolated} onCheckedChange={(v) => st.set({ hideIsolated: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="hover" className="font-normal">
                        Highlight neighbours on hover
                      </Label>
                      <Switch id="hover" checked={st.hoverHighlight} onCheckedChange={(v) => st.set({ hoverHighlight: v })} />
                    </div>
                  </>
                )}
              </div>
            </Section>
            {st.hidden.size > 0 && (
              <>
                <Separator />
                <Section
                  title={`Hidden (${st.hidden.size})`}
                  action={
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => st.setAll('hidden', [])}>
                      Show all
                    </Button>
                  }
                >
                  {[...st.hidden].map((id) => (
                    <div key={id} className="flex h-8 items-center justify-between gap-2 px-2 text-sm">
                      <span className="truncate" title={id}>
                        {model.nodes.get(id)?.label ?? id}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => st.toggleIn('hidden', id)}>
                        Show
                      </Button>
                    </div>
                  ))}
                </Section>
              </>
            )}
          </div>
        </ScrollArea>
        <div className="border-t px-5 py-3">
          <Button variant="outline" className="w-full gap-2" onClick={st.resetFilters}>
            <RotateCcw className="size-4" /> Reset filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
