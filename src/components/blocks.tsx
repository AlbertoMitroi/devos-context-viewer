// Building blocks of the design system (docs/DESIGN.md). Pages compose these instead of ad hoc markup.
import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Json } from '@/model/types';

/** Shortens long text in the middle, keeping the start and the meaningful end (file names, symbols). */
export function middleTruncate(text: string, max: number) {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.45);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}

export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-[72ch] text-sm text-muted-foreground">{description}</p>}
        {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-subtle-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, count, action, children, className }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.08em] text-subtle-foreground">
          {title}
          {count !== undefined && <span className="rounded bg-surface-3 px-1.5 py-px font-mono text-2xs normal-case tracking-normal text-muted-foreground">{count.toLocaleString('en-US')}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, delta, icon }: { label: string; value: string; hint?: ReactNode; delta?: number | null; icon?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-subtle-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {delta !== undefined && delta !== null && delta !== 0 && (
          <span className={cn('font-mono text-xs tabular-nums', delta > 0 ? 'text-success' : 'text-destructive')}>
            {delta > 0 ? '+' : ''}
            {delta.toLocaleString('en-US')}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-subtle-foreground">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-full border bg-surface-1 text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <span className="text-faint-foreground">none</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-faint-foreground">none</span>;
    if (v.every((x) => typeof x !== 'object')) return <span>{v.join(', ')}</span>;
    return <pre className="whitespace-pre-wrap font-mono text-2xs text-muted-foreground">{JSON.stringify(v, null, 1)}</pre>;
  }
  if (typeof v === 'object') return <pre className="whitespace-pre-wrap font-mono text-2xs text-muted-foreground">{JSON.stringify(v, null, 1)}</pre>;
  if (typeof v === 'boolean') return <span>{v ? 'yes' : 'no'}</span>;
  return <span>{String(v)}</span>;
}

/** Two-column key/value list of a record; unknown fields and ext.* are shown as they are. */
export function KeyValue({ rec, skip = [], mono = [] }: { rec: Json; skip?: string[]; mono?: string[] }) {
  return (
    <dl className="grid grid-cols-[minmax(104px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {Object.entries(rec)
        .filter(([k]) => !skip.includes(k))
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={cn('truncate text-subtle-foreground', k.startsWith('ext.') && 'text-violet-300/80')} title={k}>
              {k}
            </dt>
            <dd className={cn('min-w-0 [overflow-wrap:anywhere]', (mono.includes(k) || k === 'id' || k === 'path') && 'font-mono text-xs')}>
              <Value v={v} />
            </dd>
          </div>
        ))}
    </dl>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          aria-label={label}
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          }}
        >
          {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{done ? 'Copied' : label}</TooltipContent>
    </Tooltip>
  );
}

/** A long path or id: truncated in the middle, full text on hover, copy button. */
export function PathText({ text, max = 56, className }: { text: string; max?: number; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <code className="truncate font-mono text-xs text-muted-foreground" title={text}>
        {middleTruncate(text, max)}
      </code>
      <CopyButton text={text} label="Copy path" />
    </span>
  );
}

/** Source excerpt with line numbers and highlighted lines. */
export function CodeBlock({ lines, start, highlight }: { lines: string[]; start: number; highlight?: [number, number] }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-canvas py-2 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => {
        const n = start + i;
        const hit = highlight && n >= highlight[0] && n <= highlight[1];
        return (
          <div key={n} className={cn('whitespace-pre px-3', hit && 'bg-white/[0.06] shadow-[inset_2px_0_0_hsl(var(--foreground))]')}>
            <span className="mr-4 inline-block w-8 select-none text-right text-faint-foreground">{n}</span>
            {l || ' '}
          </div>
        );
      })}
    </pre>
  );
}
