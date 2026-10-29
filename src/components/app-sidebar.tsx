import { useMemo, useRef } from 'react';
import { BookOpen, ChartColumn, ChevronsUpDown, FolderOpen, GitCommitHorizontal, Keyboard, Map as MapIcon, Network, RefreshCw, Table2 } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
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
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <circle cx="9" cy="10" r="5" fill="currentColor" opacity="0.95" />
                  <circle cx="16" cy="15" r="3.2" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{active ? repoName(active.repoKey) : 'Context Viewer'}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{active ? `${active.commit?.slice(0, 7) ?? '?'} · ${active.folder}` : 'No generation'}</span>
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
  if (!model) return null;
  // Same order and colours as the map: colour i belongs to the i-th laid-out root.
  const roots = layout?.roots ?? model.roots;
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {roots.map((id, i) => {
            const n = model.nodes.get(id);
            if (!n) return null;
            return (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  size="sm"
                  isActive={path[0] === id}
                  onClick={() => {
                    set({ tab: 'map' });
                    navigate(id);
                  }}
                  tooltip={n.fullName}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: rgbCss(projectColor(i)) }} />
                  <span className="truncate">{n.label}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="font-mono text-[10.5px] text-muted-foreground">{n.descendants.toLocaleString('en-US')}</SidebarMenuBadge>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const tab = useStore((s) => s.tab);
  const model = useStore((s) => s.model);
  const set = useStore((s) => s.set);
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
