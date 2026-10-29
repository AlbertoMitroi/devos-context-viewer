// Records of a generation (contract v1, schemaVersion 0.x). Every record keeps unknown fields: the viewer
// preserves and shows them without interpreting them (contract 3.5).

export type Json = Record<string, unknown>;

export interface Span {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface Entity extends Json {
  id: string;
  kind: string;
  name: string;
  container?: string | null;
  signature?: string;
  accessibility?: string;
  modifiers?: string[];
  origin?: string;
  project?: string;
  namespace?: string;
  assembly?: string;
  documentationId?: string | null;
}

export interface Relation extends Json {
  id: string;
  kind: string;
  from: string;
  to: string;
  context?: string;
  resolution?: string;
  usage?: string;
  evidence?: string[];
}

export interface ProjectRecord extends Json {
  id: string;
  recordType: 'project';
  path: string;
  assemblyName?: string;
  targetFrameworks?: string[];
  projectReferences?: string[];
  packages?: { id: string; version: string; direct?: boolean }[];
}

export interface AnalysisContext extends Json {
  id: string;
  recordType: 'analysisContext';
  project: string;
  projectId?: string;
  loadMode?: string;
  reason?: string;
  targetFramework?: string;
}

export interface Declaration extends Json {
  id: string;
  entity: string;
  context?: string;
  path: string;
  blobId?: string;
  span?: Span;
  extent?: Span;
  store?: string;
  generator?: string;
}

export interface Evidence extends Json {
  id: string;
  path: string;
  blobId?: string;
  span?: Span;
  extractor?: string;
  method?: string;
  context?: string;
  store?: string;
  snippet?: string;
  snippetText?: string;
}

export interface Observation extends Json {
  id: string;
  kind: string;
  evidence?: string[];
}

export interface Link extends Json {
  id: string;
  kind: string;
  resolution?: string;
  evidence?: string[];
}

export interface Diagnostic extends Json {
  id: string;
  severity?: string;
  code?: string;
  scope?: string;
  state?: string;
  message?: string;
}

export interface GenerationFile {
  path: string;
  size?: number;
}

/** Everything the main thread holds for one generation. Evidence and snippets stay in the worker. */
export interface GenerationData {
  manifest: Json | null;
  run: Json | null;
  projects: ProjectRecord[];
  contexts: AnalysisContext[];
  entities: Entity[];
  declarations: Declaration[];
  relations: Relation[];
  observations: Observation[];
  links: Link[];
  diagnostics: Diagnostic[];
  otherProjectRecords: Json[];
  files: GenerationFile[];
  counts: Record<string, number>;
  parseErrors: { file: string; line: number; message: string }[];
  loadMs: number;
}

export interface GenerationInfo {
  id: string;
  label: string;
  repository: string | null;
  repoKey: string;
  commit: string | null;
  status: string | null;
  schemaVersion: string | null;
  path?: string;
  folder?: string;
  hasSource: boolean;
  modified?: number;
  local?: boolean;
}
