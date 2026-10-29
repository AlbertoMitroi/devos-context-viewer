// Standalone server for the built viewer: `npm run build && npm start -- --port 4600`.
// Serves dist/ and the read-only generation API. Generations come from viewer.config.json or CV_GENERATIONS.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './generations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || Number(process.env.PORT) || 4600;
const genIndex = args.indexOf('--gen');
if (genIndex >= 0 && args[genIndex + 1]) process.env.CV_GENERATIONS = args[genIndex + 1];

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const api = createApiHandler({ cwd: process.cwd() });

createServer((req, res) => {
  api(req, res, () => {
    const url = new URL(req.url ?? '/', 'http://local');
    let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`context-viewer on http://127.0.0.1:${port}`);
});
