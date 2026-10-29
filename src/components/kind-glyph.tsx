import { cn } from '@/lib/utils';
import { KIND_GLYPH } from '@/theme/palette';

const KIND_CLASS: Record<string, string> = {
  namespace: 'bg-indigo-400/90',
  pkgnamespace: 'bg-indigo-400/70',
  class: 'bg-sky-400',
  type: 'bg-sky-400',
  record: 'bg-cyan-400',
  struct: 'bg-teal-400',
  interface: 'bg-emerald-400',
  enum: 'bg-amber-400',
  enum_member: 'bg-amber-300',
  constant: 'bg-amber-300',
  delegate: 'bg-pink-400',
  method: 'bg-violet-400',
  constructor: 'bg-violet-400',
  operator: 'bg-violet-300',
  property: 'bg-lime-400',
  field: 'bg-orange-400',
  event: 'bg-rose-400',
  project: 'bg-zinc-200',
  package: 'bg-zinc-400',
  group: 'bg-zinc-500',
};

/** IDE-style letter badge for a symbol kind. */
export function KindGlyph({ kind, className, size = 'sm' }: { kind: string; className?: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded font-mono font-bold text-zinc-950',
        size === 'sm' ? 'size-[18px] text-[10.5px]' : 'size-8 rounded-md text-sm',
        KIND_CLASS[kind] ?? 'bg-zinc-400',
        className,
      )}
    >
      {KIND_GLYPH[kind] ?? kind.slice(0, 1).toUpperCase()}
    </span>
  );
}
