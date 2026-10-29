import { useMemo, useRef, useState } from 'react';
import { BookOpen, ChartColumn, ChevronRight, ChevronsUpDown, FolderOpen, GitCommitHorizontal, Keyboard, Map as MapIcon, Network, RefreshCw, Table2 } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useStore, type Tab } from '@/store';
import { projectColor, rgbCss } from '@/theme/palette';

const NAV: { id: Tab; label: string; icon: typeof MapIcon; hint: string }[] = [
  { id: 'map', label: 'Map', icon: MapIcon, hint: 'M' },
  { id: 'graph', label: 'Neighbourhood', icon: Network, hint: '' },
  { id: 'tables', label: 'Tables', icon: Table2, hint: '' },
  { id: 'overview', label: 'Summary', icon: ChartColumn, hint: '' },
  { id: 'docs', label: 'Context & wiki', icon: BookOpen, hint: '' },
];

const repoName = (k: string) => k.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '');

function GenerationSwitcher() {
  const generations = useStore((s) => s.generations);
  const activeId = useStore((s) => s.activeId);
  const open = useStore((s) => s.openGeneration);
  const refresh = useStore((s) => s.refreshGenerations);
  const addLocal = useStore((s) => s.addLocalFolder);
  const file = useRef<HTMLInputElement>(null);
  const active = generations.find((g) => g.id === activeId);
  const byRepo = useMemo(() => {
    const m = new Map<string, typeof generations>();
    for (const g of generations) m.set(g.repoKey, [...(m.get(g.repoKey) ?? []), g]);
    return [...m.entries()];
  }, [generations]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg border bg-surface-3 text-foreground">
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <circle cx="9" cy="10" r="5" fill="currentColor" opacity="0.95" />
                  <circle cx="16" cy="15" r="3.2" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{active ? repoName(active.repoKey) : 'Context Viewer'}</span>
                <span className="truncate font-mono text-2xs text-subtle-foreground">{active ? `${active.commit?.slice(0, 7) ?? '?'} · ${active.folder}${active.status ? ` · ${active.status}` : ''}` : 'No generation'}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-72 rounded-lg" align="start" side="right" sideOffset={4}>
            {byRepo.map(([repo, gens]) => (
              <div key={repo}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">{repoName(repo)}</DropdownMenuLabel>
                {gens.map((g) => (
                  <DropdownMenuItem key={g.id} onClick={() => open(g.id)} className="gap-2 p-2">
                    <GitCommitHorizontal className="size-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{g.commit?.slice(0, 7) ?? '?'}</span>
                    <span className="flex-1 truncate">{g.folder}</span>
                    {g.modified ? <span className="text-2xs text-subtle-foreground">{new Date(g.modified).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> : null}
                    {g.status && (
                      <Badge variant="outline" className={g.status === 'complete' ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400'}>
                        {g.status}
                      </Badge>
                    )}
                    {g.id === activeId && <span className="size-1.5 rounded-full bg-sidebar-primary" aria-label="current" />}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onClick={() => refresh()}>
              <RefreshCw className="size-4" /> Rescan generations
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 p-2" onClick={() => file.current?.click()}>
              <FolderOpen className="size-4" /> Open folder…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={file}
          type="file"
          hidden
          // @ts-expect-error non-standard directory picker attribute
          webkitdirectory=""
          multiple
          onChange={(e) => e.target.files && addLocal(e.target.files)}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function ProjectList() {
  const model = useStore((s) => s.model);
  const layout = useStore((s) => s.mapLayout);
  const path = useStore((s) => s.mapPath);
  const navigate = useStore((s) => s.navigate);
  const set = useStore((s) => s.set);
  const [q, setQ] = useState('');
  // Services are projects with an entry point; tests are detected from paths; the rest are libraries.
  const services = useMemo(() => {
    const out = new Set<string>();
    if (!model) return out;
    for (const n of model.nodes.values()) if (n.tier === 'entity' && n.kind === 'class' && n.label === 'Program') out.add(n.root);
    return out;
  }, [model]);
  if (!model) return null;
  const roots = (layout?.roots ?? model.roots).map((id, i) => ({ n: model.nodes.get(id)!, i })).filter(({ n }) => n && n.kind === 'project');
  const match = ({ n }: { n: { label: string } }) => n.label.toLowerCase().includes(q.toLowerCase());
  const groups: { title: string; open: boolean; items: typeof roots }[] = [
    { title: 'Services', open: true, items: roots.filter(({ n }) => !n.isTest && services.has(n.id)) },
    { title: 'Libraries', open: true, items: roots.filter(({ n }) => !n.isTest && !services.has(n.id)) },
    { title: 'Tests', open: false, items: roots.filter(({ n }) => n.isTest) },
  ];
  return (
    <>
      <div className="px-3 pb-1 pt-2 group-data-[collapsible=icon]:hidden">
        <SidebarInput placeholder="Filter projects…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
      </div>
      {groups.map((g) => {
        const items = g.items.filter(match);
        if (!items.length) return null;
        return (
          <Collapsible key={g.title} defaultOpen={g.open || !!q} className="group/collapsible group-data-[collapsible=icon]:hidden">
            <SidebarGroup className="py-1">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full">
                  {g.title}
                  <span className="ml-1.5 font-mono text-2xs text-faint-foreground">{items.length}</span>
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0">
                    {items.map(({ n, i }) => (
                      <SidebarMenuItem key={n.id}>
                        <SidebarMenuButton
                          size="sm"
                          isActive={path[0] === n.id}
                          className="relative h-7 data-[active=true]:before:absolute data-[active=true]:before:-left-2 data-[active=true]:before:top-1.5 data-[active=true]:before:h-4 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-foreground"
                          onClick={() => {
                            set({ tab: 'map' });
                            navigate(n.id);
                          }}
                          title={n.fullName}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ background: rgbCss(projectColor(i)) }} />
                          <span className="truncate">{n.label}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="font-mono text-2xs font-normal text-faint-foreground">{n.descendants.toLocaleString('en-US')}</SidebarMenuBadge>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        );
      })}
    </>
  );
}

export function AppSidebar() {
  const tab = useStore((s) => s.tab);
  const model = useStore((s) => s.model);
  const data = useStore((s) => s.data);
  const set = useStore((s) => s.set);
  const warnings = data?.diagnostics.filter((d) => d.severity === 'warning' || d.severity === 'error').length ?? 0;
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <GenerationSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Explore</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton isActive={tab === item.id} disabled={!model} tooltip={item.label} onClick={() => set({ tab: item.id })}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.id === 'overview' && warnings > 0 && (
                    <SidebarMenuBadge className="rounded-md bg-warning/15 px-1.5 font-mono text-2xs text-warning" title={`${warnings} warnings`}>
                      {warnings}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <ProjectList />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Keyboard shortcuts" onClick={() => set({ shortcutsOpen: true })}>
              <Keyboard />
              <span>Keyboard shortcuts</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
