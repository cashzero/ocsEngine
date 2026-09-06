import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const explicitPort = process.env.OCS_UI_PORT !== undefined;
let port = Number(process.env.OCS_UI_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('OCS_UI_PORT must be an integer between 1 and 65535.\n');
  process.exit(1);
}
const lastPort = explicitPort ? port : port + 20;
const types = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
]);

const server = createServer((request, response) => {
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
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port < lastPort) {
    process.stdout.write(`Port ${port} is in use; trying ${port + 1}.\n`);
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  process.stderr.write(`Unable to start OCS UI on port ${port}: ${error.message}\nSet OCS_UI_PORT to an available port and retry.\n`);
  process.exitCode = 1;
});
server.on('listening', () => {
  process.stdout.write(`OCS UI: http://127.0.0.1:${port}\n`);
});
server.listen(port, '127.0.0.1');
