// Generation discovery and read-only file API, shared by the Vite dev server and the standalone server.
// A generation is a directory with manifest.json or graph/entities.ndjson. Nothing here writes to disk.
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const CONFIG_FILE = 'viewer.config.json';

function isGeneration(dir) {
  return existsSync(path.join(dir, 'manifest.json')) || existsSync(path.join(dir, 'graph', 'entities.ndjson'));
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Reads viewer.config.json and CV_GENERATIONS into a list of { path, label?, source? } entries. */
export function loadConfig(cwd) {
  const entries = [];
  const config = readJson(path.join(cwd, CONFIG_FILE)) ?? {};
  for (const g of config.generations ?? []) {
    entries.push(typeof g === 'string' ? { path: g } : g);
  }
  for (const root of config.roots ?? []) {
    entries.push({ path: typeof root === 'string' ? root : root.path, root: true, source: root.source });
  }
  for (const p of (process.env.CV_GENERATIONS ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    entries.push({ path: p, root: !isGeneration(path.resolve(cwd, p)) });
  }
  return entries.map((e) => ({ ...e, path: path.resolve(cwd, e.path), source: e.source ? path.resolve(cwd, e.source) : undefined }));
}

function scanRoot(root, depth) {
  const found = [];
  if (!existsSync(root)) return found;
  if (isGeneration(root)) return [root];
  if (depth === 0) return found;
  for (const name of readdirSync(root).sort()) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(root, name);
    try {
      if (statSync(full).isDirectory()) found.push(...scanRoot(full, depth - 1));
    } catch {
      // unreadable entries are skipped
    }
  }
  return found;
}

function generationId(dir) {
  return createHash('sha1').update(dir).digest('hex').slice(0, 12);
}

function describe(dir, entry) {
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const remote = manifest?.repository?.remoteUrl ?? '';
  const repoName = remote ? remote.replace(/\.git$/, '').split(/[/:]/).pop() : path.basename(dir);
  const commit = manifest?.commit ? String(manifest.commit).slice(0, 7) : '';
  let modified = 0;
  try {
    modified = statSync(path.join(dir, existsSync(path.join(dir, 'manifest.json')) ? 'manifest.json' : 'graph')).mtimeMs;
  } catch {
    // ignore
  }
  return {
    id: generationId(dir),
    label: entry.label ?? (commit ? `${repoName} @ ${commit}` : repoName),
    repository: remote || null,
    repoKey: remote || repoName,
    commit: manifest?.commit ?? null,
    status: manifest?.status ?? null,
    schemaVersion: manifest?.schemaVersion ?? null,
    path: dir,
    folder: path.basename(dir),
    hasSource: Boolean(entry.source),
    modified,
  };
}

/** Lists all generations reachable from the configuration, de-duplicated by directory. */
export function discover(cwd) {
  const seen = new Map();
  for (const entry of loadConfig(cwd)) {
    const dirs = entry.root ? scanRoot(entry.path, 3) : isGeneration(entry.path) ? [entry.path] : [];
    for (const dir of dirs) {
      if (!seen.has(dir)) seen.set(dir, { dir, entry: { ...entry, label: entry.root ? undefined : entry.label } });
    }
  }
  return [...seen.values()].map(({ dir, entry }) => ({ ...describe(dir, entry), _dir: dir, _source: entry.source }));
}

function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(path.join(dir, rel)).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      const st = statSync(path.join(dir, r));
      if (st.isDirectory()) walk(r);
      else out.push({ path: r, size: st.size });
    }
  };
  walk('');
  return out;
}

/** Resolves a relative path inside base, refusing anything that escapes it. */
function safeJoin(base, rel) {
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

const TYPES = { '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.ndjson': 'application/x-ndjson' };

function send(res, status, body, type = 'application/json') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function streamFile(res, file) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(res);
}

/** Connect-style middleware serving /api/*. Other requests fall through to next(). */
export function createApiHandler({ cwd }) {
  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/')) return next?.();
    try {
      const gens = discover(cwd);
      if (url.pathname === '/api/generations') {
        return send(res, 200, gens.map(({ _dir, _source, ...g }) => g));
      }
      const m = url.pathname.match(/^\/api\/g\/([0-9a-f]+)\/(files|file|source)$/);
      const gen = m && gens.find((g) => g.id === m[1]);
      if (!gen) return send(res, 404, { error: 'unknown generation' });
      const rel = url.searchParams.get('path') ?? '';
      if (m[2] === 'files') return send(res, 200, listFiles(gen._dir));
      if (m[2] === 'file') return streamFile(res, safeJoin(gen._dir, rel));
      const store = url.searchParams.get('store') ?? 'repository';
      if (store === 'generation') return streamFile(res, safeJoin(gen._dir, rel));
      if (!gen._source) return send(res, 404, { error: 'no source root configured for this generation' });
      return streamFile(res, safeJoin(gen._source, rel));
    } catch (err) {
      return send(res, 500, { error: String(err?.message ?? err) });
    }
  };
}
