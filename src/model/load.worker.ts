// Loads and parses a generation off the main thread. Evidence and snippets stay here and are served on demand.
import { GRAPH_FILES, SIDE_FILES, buildEvidenceIndex, buildGenerationData, type ParseError } from './parse';
import type { Evidence, GenerationFile } from './types';

type Handle = string | File;

export type WorkerRequest =
  | { type: 'load'; files: GenerationFile[]; handles: Record<string, Handle | null> }
  | { type: 'evidence'; requestId: number; ids: string[] };

export type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'loaded'; data: ReturnType<typeof buildGenerationData>; evidenceCount: number }
  | { type: 'evidence'; requestId: number; items: Evidence[] }
  | { type: 'error'; message: string };

let evidence = new Map<string, Evidence>();
let snippets = new Map<string, string>();

const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg);

async function read(handle: Handle | null | undefined): Promise<string | null> {
  if (!handle) return null;
  if (typeof handle === 'string') {
    const res = await fetch(handle);
    return res.ok ? res.text() : null;
  }
  return handle.text();
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'load') {
      const started = performance.now();
      const names = ['manifest.json', 'run.json', ...GRAPH_FILES, ...SIDE_FILES];
      const texts: Record<string, string | null> = {};
      await Promise.all(
        names.map(async (n) => {
          texts[n] = await read(msg.handles[n]);
          post({ type: 'progress', message: `citit ${n}` });
        }),
      );
      post({ type: 'progress', message: 'parsare' });
      const data = buildGenerationData(texts, msg.files);
      const errors: ParseError[] = [];
      const idx = buildEvidenceIndex(texts, errors);
      evidence = idx.evidence;
      snippets = idx.snippets;
      data.parseErrors.push(...errors);
      data.counts.evidence = evidence.size;
      data.counts.snippets = snippets.size;
      data.loadMs = Math.round(performance.now() - started);
      post({ type: 'loaded', data, evidenceCount: evidence.size });
    } else if (msg.type === 'evidence') {
      const items: Evidence[] = [];
      for (const id of msg.ids) {
        const e = evidence.get(id);
        if (e) items.push({ ...e, snippetText: e.snippet ? snippets.get(e.snippet) : undefined });
        else items.push({ id, path: '', missing: true });
      }
      post({ type: 'evidence', requestId: msg.requestId, items });
    }
  } catch (e) {
    post({ type: 'error', message: String((e as Error)?.message ?? e) });
  }
};
