// Where a generation's files come from: the local API server, or a folder the user picked in the browser.
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
