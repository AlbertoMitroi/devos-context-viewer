// Coverage per project from the manifest. The contract does not fix the shape of coverage.projects, and the
// engines differ: dotnet-intelligence writes { path, project: <project id>, state }, angular-intelligence
// writes { project: <project path>, name, loadMode }. Both become one row type here.
import type { GenerationData, Json } from './types';

export interface CoverageRow {
  /** Project id when the entry resolves to a project record, else whatever the entry called the project. */
  id: string;
  path: string;
  state: string;
  name?: string;
}

export function coverageRows(data: GenerationData): CoverageRow[] {
  const raw = (((data.manifest?.coverage as Json | undefined)?.projects as Json[] | undefined) ?? []).filter((c) => c && typeof c === 'object');
  const byId = new Map(data.projects.map((p) => [p.id, p]));
  const byPath = new Map(data.projects.map((p) => [p.path, p]));
  return raw.map((c) => {
    const ref = c.project === undefined ? '' : String(c.project);
    const path = c.path === undefined ? undefined : String(c.path);
    const record = byId.get(ref) ?? byPath.get(path ?? ref);
    return {
      id: record?.id ?? ref,
      path: path ?? record?.path ?? ref,
      state: String(c.state ?? c.loadMode ?? 'unknown'),
      name: typeof c.name === 'string' ? c.name : undefined,
    };
  });
}
