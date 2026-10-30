// Shape of each project role, shared by the map (shader codes) and the legend (SVG glyphs drawn to match).
import type { Role } from '@/model/roles';
import { DASHED, SHAPE } from '@/map/OrbLayer';

export const ROLE_SHAPE: Record<Role, number> = {
  service: SHAPE.circle,
  frontend: SHAPE.diamond,
  library: SHAPE.roundedSquare,
  host: SHAPE.octagon,
  test: SHAPE.circle + DASHED,
  package: SHAPE.hexagon,
};

const polygon = (n: number, r: number, start: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return `${(8 + r * Math.cos(a)).toFixed(2)},${(8 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

/** 16px outline of a role's shape. */
export function RoleGlyph({ role, className }: { role: Role; className?: string }) {
  const common = { fill: 'currentColor', fillOpacity: 0.18, stroke: 'currentColor', strokeWidth: 1.4 };
  let shape: React.ReactNode;
  switch (role) {
    case 'library':
      shape = <rect x={2} y={2} width={12} height={12} rx={3.5} {...common} />;
      break;
    case 'package':
      shape = <polygon points={polygon(6, 6.4, Math.PI / 2)} strokeLinejoin="round" {...common} />;
      break;
    case 'frontend':
      shape = <polygon points={polygon(4, 6.6, Math.PI / 2)} strokeLinejoin="round" {...common} />;
      break;
    case 'host':
      shape = <polygon points={polygon(8, 6.4, Math.PI / 8)} strokeLinejoin="round" {...common} />;
      break;
    case 'test':
      shape = <circle cx={8} cy={8} r={6} {...common} strokeDasharray="2.6 1.8" />;
      break;
    default:
      shape = <circle cx={8} cy={8} r={6} {...common} />;
  }
  return (
    <svg viewBox="0 0 16 16" className={className ?? 'size-4 shrink-0'} aria-hidden="true">
      {shape}
    </svg>
  );
}
