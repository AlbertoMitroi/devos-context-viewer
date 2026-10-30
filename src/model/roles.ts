// Role of each project on the map (service, front end, library, ...), derived from what the engines already
// emit: entry points, UI base types, Aspire hosting, test frameworks and the Angular project type. The
// contract has no role field yet, so this is a reading of the generation, not part of it.
import { isTestProjectPath } from './graphModel';
import type { GenerationData, Json, ProjectRecord } from './types';

export type Role = 'service' | 'frontend' | 'library' | 'host' | 'test' | 'package';

/** Display order in the legend. */
export const ROLES: Role[] = ['service', 'frontend', 'library', 'host', 'test', 'package'];

export const ROLE_LABEL: Record<Role, string> = {
  service: 'Service',
  frontend: 'Front end',
  library: 'Library',
  host: 'Orchestration',
  test: 'Tests',
  package: 'External package',
};

export const ROLE_HINT: Record<Role, string> = {
  service: 'Has an entry point (API, worker, gateway)',
  frontend: 'Angular application, MAUI app, or a host with Blazor or Razor UI',
  library: 'No entry point',
  host: 'Aspire AppHost',
  test: 'Test project',
  package: 'NuGet or npm dependency',
};

const TEST_PACKAGE = /^(xunit|mstest\.|nunit|microsoft\.net\.test\.sdk$)/i;
const HOST_PACKAGE = /^aspire\.hosting\.apphost$/i;
const ENTRY_METHODS = new Set(['Main', '<Main>$']);
// Base types of UI code: Blazor components and Razor Pages. Matched as a suffix so framework and app bases
// count too (AbpComponentBase, AbpPageModel, a project's own FooPageModel).
const UI_BASE = /(ComponentBase|PageModel)$/;

const angularOf = (p: ProjectRecord) => ((p.ext as Json | undefined)?.angular as Json | undefined) ?? undefined;

/** Roles of every project record, keyed by project id. */
export function projectRoles(data: GenerationData): Map<string, Role> {
  const byPath = new Map(data.projects.map((p) => [p.path, p]));
  const entityProject = new Map<string, string>();
  const entry = new Set<string>();
  const maui = new Set<string>();
  for (const e of data.entities) {
    if (!e.project || !byPath.has(e.project)) continue;
    entityProject.set(e.id, e.project);
    if ((e.origin ?? 'source') !== 'source') continue;
    if (e.kind === 'method' && ENTRY_METHODS.has(e.name)) entry.add(e.project);
    if (e.kind === 'class' && e.name === 'MauiProgram') maui.add(e.project);
  }
  const ui = new Set<string>();
  for (const r of data.relations) {
    if (r.kind !== 'inherits' || !UI_BASE.test(r.to)) continue;
    const p = entityProject.get(r.from);
    if (p) ui.add(p);
  }

  const roles = new Map<string, Role>();
  for (const p of data.projects) {
    const direct = (p.packages ?? []).filter((k) => k.direct).map((k) => k.id);
    const angular = angularOf(p);
    let role: Role;
    if (isTestProjectPath(p.path) || direct.some((id) => TEST_PACKAGE.test(id))) role = 'test';
    else if (angular) role = angular.projectType === 'application' ? 'frontend' : 'library';
    else if (maui.has(p.path)) role = 'frontend';
    else if (entry.has(p.path) && direct.some((id) => HOST_PACKAGE.test(id))) role = 'host';
    else if (entry.has(p.path)) role = ui.has(p.path) ? 'frontend' : 'service';
    else role = 'library';
    roles.set(p.id, role);
  }
  return roles;
}

/** Role of a map node: projects by their record, packages as external packages, everything else none. */
export function roleOfNode(roles: Map<string, Role>, id: string, kind: string): Role | null {
  if (kind === 'package') return 'package';
  if (kind === 'project') return roles.get(id) ?? 'library';
  return null;
}
