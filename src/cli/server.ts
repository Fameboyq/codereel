import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeckConfig } from '../core/types.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export interface StudioServerOptions {
  port: number;
  deck?: DeckConfig | null;
  open?: boolean;
}

function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Headless environment: user can open URL manually
  }
}

export function resolveWebDistDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '../web');
}

export async function startStudioServer(
  options: StudioServerOptions,
): Promise<{ url: string; server: http.Server }> {
  const webRoot = resolveWebDistDir();
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
    throw new Error(
      `Built Web Studio assets not found at ${webRoot}. Run "npm run build" first.`,
    );
  }

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (reqUrl.pathname === '/api/deck') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(options.deck ?? null));
      return;
    }

    const cleanRel = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');
    const candidate = path.resolve(webRoot, cleanRel);

    if (!candidate.startsWith(webRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let fileToServe = candidate;
    if (!fs.existsSync(fileToServe) || fs.statSync(fileToServe).isDirectory()) {
      fileToServe = path.join(webRoot, 'index.html');
    }

    const ext = path.extname(fileToServe).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(fileToServe).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : options.port;
  const url = `http://127.0.0.1:${actualPort}`;

  if (options.open !== false) {
    openBrowser(url);
  }

  return { url, server };
}
