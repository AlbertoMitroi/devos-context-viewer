import { relationColor, rgbCss, symbolColor } from '../theme/palette';
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

// Colours come from the shared perceptual palette, so the map, lists and charts agree.
export const edgeColor = (kind: string) => rgbCss(relationColor(kind));
export const nodeColor = (kind: string) => rgbCss(symbolColor(kind));

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
  references: 'references',
  calls_declared_target: 'calls (declared target)',
  possible_runtime_target: 'possible runtime target',
  implements: 'implements',
  inherits: 'inherits',
  overrides: 'overrides',
  contains: 'contains',
  declares: 'declares',
  'di.registers': 'DI registers',
  'di.consumes': 'DI consumes',
  project_reference: 'project reference',
  package_reference: 'package reference',
  consumes_contract: 'consumes contract',
  configured_route: 'configured route',
  possible_communication: 'possible communication',
};

export const kindLabel = (k: string) => KIND_LABELS[k] ?? k;
