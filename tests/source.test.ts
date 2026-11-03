import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStaticGenerations, githubRawUrl, staticSource } from '../src/model/source';
import type { GenerationInfo } from '../src/model/types';

const COMMIT = '67c710335c3c2be963db1b58f13ba06789798204';
const info: GenerationInfo = {
  id: 'devos-lab-web-angular',
  label: 'devos-lab-web @ 67c7103',
  repository: 'https://github.com/AlbertoMitroi/devos-lab-web',
  repoKey: 'https://github.com/AlbertoMitroi/devos-lab-web',
  commit: COMMIT,
  status: 'complete',
  schemaVersion: '1.2',
  hasSource: true,
};

function serve(routes: Record<string, string>) {
  const fetch = vi.fn(async (url: string) => (url in routes ? new Response(routes[url]) : new Response('missing', { status: 404 })));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('location', { href: 'https://albertomitroi.github.io/devos-context-viewer/#g=x' });
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('githubRawUrl', () => {
  it('builds the raw URL of a file at a commit', () => {
    expect(githubRawUrl('https://github.com/AlbertoMitroi/devos-lab-core.git', 'abc', 'src/A B.cs')).toBe(
      'https://raw.githubusercontent.com/AlbertoMitroi/devos-lab-core/abc/src/A%20B.cs',
    );
    expect(githubRawUrl('git@github.com:AlbertoMitroi/devos-lab-core.git', 'abc', 'x.cs')).toBe('https://raw.githubusercontent.com/AlbertoMitroi/devos-lab-core/abc/x.cs');
  });

  it('gives up on other hosts or without a commit', () => {
    expect(githubRawUrl('https://dev.azure.com/org/p/_git/r', 'abc', 'x.cs')).toBeNull();
    expect(githubRawUrl('https://github.com/o/r', null, 'x.cs')).toBeNull();
    expect(githubRawUrl(null, 'abc', 'x.cs')).toBeNull();
  });
});

describe('static source', () => {
  // Tests run with base '/', so files resolve from the origin.
  const site = 'https://albertomitroi.github.io/generations';

  it('lists the generations of generations/index.json', async () => {
    serve({ [`${site}/index.json`]: JSON.stringify([info]) });
    expect(await fetchStaticGenerations()).toEqual([info]);
  });

  it('returns no generations when the index is absent or not JSON', async () => {
    serve({});
    expect(await fetchStaticGenerations()).toEqual([]);
    serve({ [`${site}/index.json`]: '<!doctype html>' });
    expect(await fetchStaticGenerations()).toEqual([]);
  });

  it('reads generation files next to the site and sources from GitHub', async () => {
    const raw = `https://raw.githubusercontent.com/AlbertoMitroi/devos-lab-web/${COMMIT}/src/app/a.ts`;
    const fetch = serve({
      [`${site}/devos-lab-web-angular.files.json`]: JSON.stringify([{ path: 'manifest.json', size: 2 }]),
      [`${site}/devos-lab-web-angular/manifest.json`]: '{}',
      [`${site}/devos-lab-web-angular/generated/b.ts`]: 'generated',
      [raw]: 'export class A {}',
    });
    const s = staticSource(info);
    expect(await s.listFiles()).toEqual([{ path: 'manifest.json', size: 2 }]);
    expect(s.handle('manifest.json')).toBe(`${site}/devos-lab-web-angular/manifest.json`);
    expect(await s.readText('manifest.json')).toBe('{}');
    expect(await s.readSource('generated/b.ts', 'generation')).toBe('generated');
    expect(await s.readSource('src/app/a.ts', 'repository')).toBe('export class A {}');
    await s.readSource('src/app/a.ts', 'repository');
    expect(fetch.mock.calls.filter(([u]) => u === raw)).toHaveLength(1);
  });

  it('returns null for a source GitHub does not serve, so the snippet is shown', async () => {
    serve({});
    const s = staticSource(info);
    expect(await s.readSource('src/app/gone.ts', 'repository')).toBeNull();
    expect(s.sourceHint).toContain('GitHub');
    expect(await staticSource({ ...info, repository: null }).readSource('x.ts', 'repository')).toBeNull();
  });
});
