import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useStore } from '@/store';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Everywhere',
    items: [
      [['⌘', 'K'], 'Search symbols and actions'],
      [['/'], 'Search'],
      [['M'], 'Go to the map'],
      [['L'], 'Layers and filters'],
      [['?'], 'This list'],
    ],
  },
  {
    title: 'Map',
    items: [
      [['Scroll'], 'Zoom towards the cursor'],
      [['Drag'], 'Pan'],
      [['Click'], 'Go into a circle'],
      [['←', '→', '↑', '↓'], 'Move between siblings'],
      [['Enter'], 'Go into the selection'],
      [['Backspace'], 'Go up'],
      [['F'], 'Show all projects'],
      [['I'], 'Toggle the details panel'],
      [['Esc'], 'Close details, then go up'],
    ],
  },
  {
    title: 'Neighbourhood',
    items: [
      [['F'], 'Focus on the selection'],
      [['E'], 'Expand or collapse'],
      [['H'], 'Hide the selection'],
      [['1', '4'], 'Expansion level'],
      [['Backspace'], 'Previous focus'],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useStore((s) => s.shortcutsOpen);
  const set = useStore((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(v) => set({ shortcutsOpen: v })}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything on the map can be done from the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} className={g.title === 'Map' ? 'sm:row-span-2' : ''}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.items.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-sm">
                    <dt>{label}</dt>
                    <dd className="flex gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
