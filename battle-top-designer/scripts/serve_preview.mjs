import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const rootArg = process.argv.indexOf('--root');
const portArg = process.argv.indexOf('--port');
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1] : '.');
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png' };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  let file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { if (statSync(file).isDirectory()) file = resolve(file, 'index.html'); }
  catch { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`NSS_PREVIEW=http://127.0.0.1:${port}/preview/`));
