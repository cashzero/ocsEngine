import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.OCS_UI_PORT ?? 4173);
const types = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
]);

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const relative = pathname === '/' ? 'web/index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const resolved = normalize(join(root, relative));
  if (!resolved.startsWith(root) || !existsSync(resolved) || !statSync(resolved).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': types.get(extname(resolved)) ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(resolved).pipe(response);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`OCS UI: http://127.0.0.1:${port}\n`);
});
