import { describe, expect, it } from 'vitest';
import { buildGenerationData } from '../src/model/parse';
import { projectRoles, roleOfNode } from '../src/model/roles';
import { coverageRows } from '../src/model/coverage';

const ndjson = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n');
const project = (id: string, path: string, extra: object = {}) => ({ recordType: 'project', id, path, packages: [], projectReferences: [], ...extra });
const entity = (id: string, project: string, kind: string, name: string, extra: object = {}) => ({ id, project, kind, name, origin: 'source', ...extra });

function generation(projects: object[], entities: object[] = [], relations: object[] = [], manifest: object = {}) {
  return buildGenerationData(
    {
      'manifest.json': JSON.stringify(manifest),
      'graph/projects.ndjson': ndjson(projects),
      'graph/entities.ndjson': ndjson(entities),
      'graph/relations.ndjson': ndjson(relations),
    },
    [],
  );
}

describe('project roles', () => {
  const data = generation(
    [
      project('prj:api', 'src/Api/Api.csproj'),
      project('prj:lib', 'src/Domain/Domain.csproj'),
      project('prj:web', 'src/Web/Web.csproj'),
      project('prj:maui', 'src/ClientApp/ClientApp.csproj'),
      project('prj:pages', 'src/PublicWeb/PublicWeb.csproj'),
      project('prj:host', 'src/AppHost/AppHost.csproj', { packages: [{ id: 'Aspire.Hosting.AppHost', version: '9.0.0', direct: true }] }),
      project('prj:ft', 'src/Api.FunctionalTests/Api.FunctionalTests.csproj', { packages: [{ id: 'Aspire.Hosting.AppHost', version: '9.0.0', direct: true }] }),
      project('prj:xunit', 'src/Checks/Checks.csproj', { packages: [{ id: 'xunit.v3', version: '1.0.0', direct: true }] }),
      project('prj:ngapp', 'apps/angular', { ext: { angular: { projectType: 'application', name: 'Shop' } } }),
      project('prj:nglib', 'apps/angular/projects/catalog', { ext: { angular: { projectType: 'library', name: 'catalog' } } }),
    ],
    [
      entity('api:main', 'src/Api/Api.csproj', 'method', '<Main>$'),
      entity('web:main', 'src/Web/Web.csproj', 'method', '<Main>$'),
      entity('web:page', 'src/Web/Web.csproj', 'class', 'Index'),
      entity('maui:prog', 'src/ClientApp/ClientApp.csproj', 'class', 'MauiProgram'),
      entity('pages:main', 'src/PublicWeb/PublicWeb.csproj', 'method', 'Main'),
      entity('pages:index', 'src/PublicWeb/PublicWeb.csproj', 'class', 'IndexModel'),
      entity('host:main', 'src/AppHost/AppHost.csproj', 'method', '<Main>$'),
      entity('ft:main', 'src/Api.FunctionalTests/Api.FunctionalTests.csproj', 'method', 'Main'),
      // A Main from package metadata does not make a project a service.
      entity('lib:meta', 'src/Domain/Domain.csproj', 'method', 'Main', { origin: 'metadata' }),
    ],
    [
      { id: 'r1', kind: 'inherits', from: 'web:page', to: 'dotnet:pkg:Microsoft.AspNetCore.Components@9.0.0:Microsoft.AspNetCore.Components:T:Microsoft.AspNetCore.Components.ComponentBase' },
      // Razor Pages through the app's own base type, as in ABP: IndexModel : PublicWebPageModel.
      { id: 'r2', kind: 'inherits', from: 'pages:index', to: 'dotnet:src/PublicWeb/PublicWeb.csproj:T:Shop.PublicWeb.Pages.PublicWebPageModel' },
    ],
  );
  const roles = projectRoles(data);

  it('reads services, libraries, front ends, orchestration and tests from the generation', () => {
    expect(Object.fromEntries(roles)).toEqual({
      'prj:api': 'service',
      'prj:lib': 'library',
      'prj:web': 'frontend',
      'prj:maui': 'frontend',
      'prj:pages': 'frontend',
      'prj:host': 'host',
      'prj:ft': 'test',
      'prj:xunit': 'test',
      'prj:ngapp': 'frontend',
      'prj:nglib': 'library',
    });
  });

  it('gives packages their own role and other nodes none', () => {
    expect(roleOfNode(roles, 'pkg:Lib@1.0.0', 'package')).toBe('package');
    expect(roleOfNode(roles, 'prj:api', 'project')).toBe('service');
    expect(roleOfNode(roles, 'prj:unknown', 'project')).toBe('library');
    expect(roleOfNode(roles, 'group:packages', 'group')).toBeNull();
    expect(roleOfNode(roles, 'api:main', 'method')).toBeNull();
  });
});

describe('coverage rows', () => {
  const projects = [project('prj:a', 'src/A/A.csproj'), project('prj:ng', 'apps/angular')];

  it('reads the dotnet shape: path, project id, state', () => {
    const data = generation(projects, [], [], { coverage: { projects: [{ path: 'src/A/A.csproj', project: 'prj:a', state: 'semantic' }] } });
    expect(coverageRows(data)).toEqual([{ id: 'prj:a', path: 'src/A/A.csproj', state: 'semantic', name: undefined }]);
  });

  it('reads the angular shape: project path, name, loadMode', () => {
    const data = generation(projects, [], [], { coverage: { projects: [{ project: 'apps/angular', name: 'Shop', loadMode: 'semantic', files: 12 }] } });
    expect(coverageRows(data)).toEqual([{ id: 'prj:ng', path: 'apps/angular', state: 'semantic', name: 'Shop' }]);
  });

  it('keeps entries that match no project record, and survives a missing coverage block', () => {
    const data = generation(projects, [], [], { coverage: { projects: [{ project: 'elsewhere' }] } });
    expect(coverageRows(data)).toEqual([{ id: 'elsewhere', path: 'elsewhere', state: 'unknown', name: undefined }]);
    expect(coverageRows(generation(projects))).toEqual([]);
  });
});
