// Pure parsing of generation files into GenerationData. Used by the worker and by tests.
import type {
  AnalysisContext,
  Declaration,
  Diagnostic,
  Entity,
  Evidence,
  GenerationData,
  GenerationFile,
  Json,
  Link,
  Observation,
  ProjectRecord,
  Relation,
} from './types';

export const GRAPH_FILES = [
  'graph/projects.ndjson',
  'graph/entities.ndjson',
  'graph/declarations.ndjson',
  'graph/relations.ndjson',
  'graph/observations.ndjson',
  'graph/links.ndjson',
  'graph/diagnostics.ndjson',
] as const;

export const SIDE_FILES = ['graph/evidence.ndjson', 'snippets.ndjson'] as const;

export interface ParseError {
  file: string;
  line: number;
  message: string;
}

export function parseNdjson<T = Json>(text: string | null, file: string, errors: ParseError[]): T[] {
  if (!text) return [];
  const out: T[] = [];
  let start = 0;
  let lineNo = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    lineNo++;
    const line = text.slice(start, end).trim();
    if (line) {
      try {
        out.push(JSON.parse(line) as T);
      } catch (e) {
        if (errors.length < 50) errors.push({ file, line: lineNo, message: String((e as Error).message) });
      }
    }
    start = end + 1;
  }
  return out;
}

export function parseJson(text: string | null, file: string, errors: ParseError[]): Json | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as Json;
  } catch (e) {
    errors.push({ file, line: 0, message: String((e as Error).message) });
    return null;
  }
}

export function buildGenerationData(texts: Record<string, string | null>, files: GenerationFile[], loadMs = 0): GenerationData {
  const errors: ParseError[] = [];
  const projectsFile = parseNdjson<Json>(texts['graph/projects.ndjson'], 'graph/projects.ndjson', errors);
  const projects: ProjectRecord[] = [];
  const contexts: AnalysisContext[] = [];
  const otherProjectRecords: Json[] = [];
  for (const r of projectsFile) {
    if (r.recordType === 'project') projects.push(r as ProjectRecord);
    else if (r.recordType === 'analysisContext') contexts.push(r as AnalysisContext);
    else otherProjectRecords.push(r);
  }
  const data: GenerationData = {
    manifest: parseJson(texts['manifest.json'], 'manifest.json', errors),
    run: parseJson(texts['run.json'], 'run.json', errors),
    projects,
    contexts,
    otherProjectRecords,
    entities: parseNdjson<Entity>(texts['graph/entities.ndjson'], 'graph/entities.ndjson', errors),
    declarations: parseNdjson<Declaration>(texts['graph/declarations.ndjson'], 'graph/declarations.ndjson', errors),
    relations: parseNdjson<Relation>(texts['graph/relations.ndjson'], 'graph/relations.ndjson', errors),
    observations: parseNdjson<Observation>(texts['graph/observations.ndjson'], 'graph/observations.ndjson', errors),
    links: parseNdjson<Link>(texts['graph/links.ndjson'], 'graph/links.ndjson', errors),
    diagnostics: parseNdjson<Diagnostic>(texts['graph/diagnostics.ndjson'], 'graph/diagnostics.ndjson', errors),
    files,
    counts: {},
    parseErrors: errors,
    loadMs,
  };
  data.counts = {
    projects: projects.length,
    contexts: contexts.length,
    entities: data.entities.length,
    declarations: data.declarations.length,
    relations: data.relations.length,
    observations: data.observations.length,
    links: data.links.length,
    diagnostics: data.diagnostics.length,
  };
  return data;
}

export function buildEvidenceIndex(texts: Record<string, string | null>, errors: ParseError[]) {
  const snippets = new Map<string, string>();
  for (const s of parseNdjson<{ id: string; text?: string }>(texts['snippets.ndjson'], 'snippets.ndjson', errors)) {
    if (s.text !== undefined) snippets.set(s.id, s.text);
  }
  const evidence = new Map<string, Evidence>();
  for (const e of parseNdjson<Evidence>(texts['graph/evidence.ndjson'], 'graph/evidence.ndjson', errors)) {
    evidence.set(e.id, e);
  }
  return { evidence, snippets };
}
