// Where a generation's files come from: the local API server, a static site built with generations/index.json,
// or a folder the user picked in the browser.
import type { GenerationFile, GenerationInfo } from './types';

export type FileHandle = string | File; // URL for server files, File for picked folders

export interface DataSource {
  info: GenerationInfo;
  listFiles(): Promise<GenerationFile[]>;
  /** Handles the worker can read: a URL or a File. */
  handle(path: string): FileHandle | null;
  readText(path: string): Promise<string | null>;
  /** Source file for evidence; null when the store is not reachable. */
  readSource(path: string, store: string | undefined): Promise<string | null>;
  /** Why repository sources are missing, shown when readSource returns null. */
  sourceHint?: string;
}

async function textOrNull(res: Response): Promise<string | null> {
  return res.ok ? res.text() : null;
}

export async function fetchServerGenerations(): Promise<GenerationInfo[]> {
  try {
    const res = await fetch('/api/generations');
    if (!res.ok) return [];
    return (await res.json()) as GenerationInfo[];
  } catch {
    return [];
  }
}

export function serverSource(info: GenerationInfo): DataSource {
  const base = `/api/g/${info.id}`;
  const fileUrl = (p: string) => `${base}/file?path=${encodeURIComponent(p)}`;
  return {
    info,
    async listFiles() {
      const res = await fetch(`${base}/files`);
      return res.ok ? ((await res.json()) as GenerationFile[]) : [];
    },
    handle: fileUrl,
    async readText(p) {
      return textOrNull(await fetch(fileUrl(p)));
    },
    async readSource(p, store) {
      const res = await fetch(`${base}/source?path=${encodeURIComponent(p)}&store=${encodeURIComponent(store ?? 'repository')}`);
      return textOrNull(res);
    },
  };
}

/** Raw file URL on GitHub for a public repository at a commit; null for other hosts. */
export function githubRawUrl(remoteUrl: string | null, commit: string | null, path: string): string | null {
  const m = remoteUrl?.match(/^(?:https:\/\/|git@)github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!m || !commit) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Absolute URL of a file published with the site (generations/...), so the worker can fetch it too. */
function siteUrl(rel: string): string {
  return new URL(import.meta.env.BASE_URL + rel, location.href).href;
}

/** Generations published with a static build: generations/index.json, written by scripts/static-index.mjs. */
export async function fetchStaticGenerations(): Promise<GenerationInfo[]> {
  try {
    const res = await fetch(siteUrl('generations/index.json'));
    if (!res.ok) return [];
    const list = (await res.json()) as GenerationInfo[];
    return Array.isArray(list) ? list : [];
  } catch {
    return []; // absent, or the dev server answered with index.html
  }
}

export function staticSource(info: GenerationInfo): DataSource {
  const base = `generations/${encodeURIComponent(info.id)}`;
  const fileUrl = (p: string) => siteUrl(`${base}/${p.split('/').map(encodeURIComponent).join('/')}`);
  const sources = new Map<string, Promise<string | null>>();
  const at = info.commit ? `${info.repository} at ${info.commit.slice(0, 7)}` : info.repository;
  return {
    info,
    async listFiles() {
      const res = await fetch(siteUrl(`${base}.files.json`));
      return res.ok ? ((await res.json()) as GenerationFile[]) : [];
    },
    handle: fileUrl,
    async readText(p) {
      return textOrNull(await fetch(fileUrl(p)));
    },
    readSource(p, store) {
      if (store === 'generation') return fetch(fileUrl(p)).then(textOrNull);
      const url = githubRawUrl(info.repository, info.commit, p);
      if (!url) return Promise.resolve(null);
      if (!sources.has(url)) sources.set(url, fetch(url).then(textOrNull, () => null));
      return sources.get(url)!;
    },
    sourceHint: `It could not be read from GitHub (${at ?? 'no repository in the manifest'}).`,
  };
}

/** Splits files picked with a directory input into one source per generation found inside. */
export async function localSources(files: FileList | File[]): Promise<DataSource[]> {
  const all = [...files].map((f) => ({ file: f, rel: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
  const roots = new Set<string>();
  for (const { rel } of all) {
    const m = rel.match(/^(.*?)(?:^|\/)(manifest\.json|graph\/entities\.ndjson)$/);
    if (m) roots.add(m[1]);
  }
  const sources: DataSource[] = [];
  for (const root of [...roots].sort()) {
    const prefix = root ? root + '/' : '';
    const map = new Map<string, File>();
    for (const { file, rel } of all) {
      if (rel.startsWith(prefix)) map.set(rel.slice(prefix.length), file);
    }
    let manifest: Record<string, unknown> | null = null;
    try {
      const m = map.get('manifest.json');
      manifest = m ? JSON.parse(await m.text()) : null;
    } catch {
      manifest = null;
    }
    const remote = (manifest?.repository as { remoteUrl?: string } | undefined)?.remoteUrl ?? null;
    const folder = root.split('/').pop() || 'generation';
    const repoName = remote ? remote.replace(/\.git$/, '').split(/[/:]/).pop()! : folder;
    const commit = typeof manifest?.commit === 'string' ? manifest.commit : null;
    const info: GenerationInfo = {
      id: `local-${root || folder}-${map.size}`,
      label: commit ? `${repoName} @ ${commit.slice(0, 7)}` : repoName,
      repository: remote,
      repoKey: remote ?? repoName,
      commit,
      status: (manifest?.status as string) ?? null,
      schemaVersion: (manifest?.schemaVersion as string) ?? null,
      folder,
      hasSource: false,
      local: true,
    };
    sources.push({
      info,
      async listFiles() {
        return [...map.entries()].map(([path, f]) => ({ path, size: f.size })).sort((a, b) => a.path.localeCompare(b.path));
      },
      handle: (p) => map.get(p) ?? null,
      async readText(p) {
        const f = map.get(p);
        return f ? f.text() : null;
      },
      async readSource(p, store) {
        if (store !== 'generation') return null;
        const f = map.get(p);
        return f ? f.text() : null;
      },
    });
  }
  return sources;
}
