import { cn } from '@/lib/utils';
import { KIND_GLYPH, rgbCss, symbolColor } from '@/theme/palette';

/** IDE-style letter badge for a symbol kind. */
export function KindGlyph({ kind, className, size = 'sm' }: { kind: string; className?: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded font-mono font-bold text-zinc-950',
        size === 'sm' ? 'size-[18px] text-[10.5px]' : 'size-8 rounded-md text-sm',
        className,
      )}
      style={{ background: rgbCss(symbolColor(kind)) }}
    >
      {KIND_GLYPH[kind] ?? kind.slice(0, 1).toUpperCase()}
    </span>
  );
}
