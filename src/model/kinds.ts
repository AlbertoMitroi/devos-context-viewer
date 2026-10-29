// Kind catalog of contract v1 (3.4) plus the viewer's synthetic kinds, with display colors.
// Kinds outside the catalog are kept and shown, but excluded from traversal (contract 3.5).

export const RELATION_KINDS_V1 = [
  'declares',
  'contains',
  'references',
  'calls_declared_target',
  'overrides',
  'implements',
  'inherits',
  'possible_runtime_target',
  'di.registers',
  'di.consumes',
] as const;

export const OBSERVATION_KINDS_V1 = [
  'http.endpoint',
  'http.call',
  'grpc.service',
  'grpc.call',
  'messaging.publish',
  'messaging.subscribe',
  'config.key',
  'topology.resource',
  'topology.reference',
  'data.maps_to',
] as const;

export const LINK_KINDS_V1 = ['consumes_contract', 'configured_route', 'possible_communication'] as const;

/** Edges the viewer derives from project records; not part of relations.ndjson. */
export const SYNTHETIC_KINDS = ['project_reference', 'package_reference'] as const;

/** Relation kinds rendered as nesting rather than edges by default. */
export const STRUCTURAL_KINDS = new Set(['contains', 'declares']);

export const REFERENCE_USAGES = ['read', 'write', 'invocation', 'nameof', 'typeof', 'attribute', 'other'] as const;

export const RESOLUTIONS = ['exact', 'ambiguous', 'candidate', 'unresolved'] as const;

export const ORIGINS = ['source', 'generated', 'metadata'] as const;

const KNOWN = new Set<string>([...RELATION_KINDS_V1, ...LINK_KINDS_V1, ...SYNTHETIC_KINDS]);
export const isKnownEdgeKind = (k: string) => KNOWN.has(k) || k.startsWith('link:');

export const EDGE_COLORS: Record<string, string> = {
  references: '#7c8aa5',
  calls_declared_target: '#34d399',
  possible_runtime_target: '#2dd4bf',
  implements: '#a78bfa',
  inherits: '#818cf8',
  overrides: '#e879f9',
  contains: '#526077',
  declares: '#526077',
  'di.registers': '#f472b6',
  'di.consumes': '#fb7185',
  project_reference: '#e2e8f0',
  package_reference: '#94a3b8',
  consumes_contract: '#f59e0b',
  configured_route: '#fbbf24',
  possible_communication: '#fb923c',
};

export const NODE_COLORS: Record<string, string> = {
  project: '#cbd5e1',
  package: '#64748b',
  group: '#475569',
  pkgnamespace: '#7b8496',
  namespace: '#8b93a7',
  class: '#4f9cf9',
  record: '#38bdf8',
  struct: '#22d3ee',
  interface: '#a78bfa',
  enum: '#f59e0b',
  enum_member: '#fbbf24',
  delegate: '#f472b6',
  type: '#60a5fa',
  method: '#34d399',
  constructor: '#10b981',
  property: '#facc15',
  field: '#fb923c',
  constant: '#fdba74',
  event: '#f87171',
  operator: '#94a3b8',
};

const FALLBACK = ['#f97316', '#84cc16', '#06b6d4', '#ec4899', '#eab308', '#14b8a6', '#8b5cf6', '#ef4444'];

function hashColor(kind: string) {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) | 0;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
}

export const edgeColor = (kind: string) => EDGE_COLORS[kind] ?? hashColor(kind);
export const nodeColor = (kind: string) => NODE_COLORS[kind] ?? hashColor(kind);

export const NODE_SHAPES: Record<string, string> = {
  project: 'round-rectangle',
  package: 'barrel',
  group: 'round-rectangle',
  pkgnamespace: 'round-rectangle',
  namespace: 'round-rectangle',
  class: 'round-rectangle',
  record: 'round-rectangle',
  struct: 'round-rectangle',
  type: 'round-rectangle',
  interface: 'ellipse',
  enum: 'hexagon',
  enum_member: 'round-tag',
  delegate: 'vee',
  method: 'ellipse',
  constructor: 'ellipse',
  property: 'diamond',
  field: 'round-triangle',
  constant: 'round-triangle',
  event: 'star',
  operator: 'ellipse',
};

export const TYPE_KINDS = new Set(['class', 'record', 'struct', 'interface', 'enum', 'delegate', 'type']);
export const MEMBER_KINDS = new Set(['method', 'constructor', 'property', 'field', 'constant', 'event', 'operator', 'enum_member']);

export const KIND_LABELS: Record<string, string> = {
  references: 'referință',
  calls_declared_target: 'apel (țintă declarată)',
  possible_runtime_target: 'țintă posibilă la runtime',
  implements: 'implementează',
  inherits: 'moștenește',
  overrides: 'suprascrie',
  contains: 'conține',
  declares: 'declară',
  'di.registers': 'DI: înregistrează',
  'di.consumes': 'DI: consumă',
  project_reference: 'referință de proiect',
  package_reference: 'referință de pachet',
  consumes_contract: 'consumă contract',
  configured_route: 'rută configurată',
  possible_communication: 'comunicare posibilă',
};

export const kindLabel = (k: string) => KIND_LABELS[k] ?? k;
