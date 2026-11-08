// Signaling Server 진입점.
// - client/ 와 tools/ 를 정적으로 서빙한다.
// - server/certs/{cert,key}.pem 이 있으면 HTTPS, 없으면 HTTP로 뜬다.
//   (모바일 getUserMedia는 HTTPS가 필요하므로 HTTP 모드에서는 `npm run tunnel` 로 ngrok HTTPS 주소를 쓴다)
// - /ws 경로에서 WebSocket 시그널링(Room, SDP/ICE 중계)을 제공한다. → signaling.js

import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachSignaling } from './signaling.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 3000);

// URL 접두사 → 디렉터리
const MOUNTS = [
  ['/tools/', path.join(ROOT, 'tools')],
  ['/', path.join(ROOT, 'client')],
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, time: Date.now() }));
    return;
  }
  if (pathname === '/api/info') {
    // 시작 화면이 폰용 링크(LAN 주소)를 만들 때 쓴다
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ lan: lanAddresses(), port: PORT }));
    return;
  }

  const [prefix, dir] = MOUNTS.find(([p]) => pathname.startsWith(p));
  let rel = decodeURIComponent(pathname.slice(prefix.length));
  let file = path.normalize(path.join(dir, rel));
  if (file !== dir && !file.startsWith(dir + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const certDir = path.join(ROOT, 'server', 'certs');
const certFile = path.join(certDir, 'cert.pem');
const keyFile = path.join(certDir, 'key.pem');
const useHttps = existsSync(certFile) && existsSync(keyFile);

const server = useHttps
  ? createHttps({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, serveStatic)
  : createHttp(serveStatic);

attachSignaling(server, { log });

server.listen(PORT, '0.0.0.0', () => {
  const scheme = useHttps ? 'https' : 'http';
  log(`listening on ${scheme}://localhost:${PORT}`);
  for (const ip of lanAddresses()) log(`  LAN: ${scheme}://${ip}:${PORT}`);
  if (!useHttps) log('  같은 LAN 연결은 위 LAN 주소로 접속. 폰 카메라·다른 네트워크 시험은 HTTPS 필요 → `npm run tunnel`');
});

export { server };
