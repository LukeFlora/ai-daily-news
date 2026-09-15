#!/usr/bin/env node

/**
 * server.js - 零依赖本地轻量静态 HTTP 预览服务
 */

import http from 'http';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = join(PUBLIC_DIR, reqPath);

  // 处理目录与无扩展名 URL
  if (existsSync(filePath)) {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
  } else if (!extname(filePath)) {
    if (existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (existsSync(join(filePath, 'index.html'))) {
      filePath = join(filePath, 'index.html');
    }
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/html; charset=utf-8';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 [本地预览服务器] 启动成功！`);
  console.log(`👉 请在浏览器中打开: http://localhost:${PORT}`);
  console.log(`👉 历史归档列表:   http://localhost:${PORT}/archive/index.html`);
  console.log(`按 Ctrl+C 停止服务。\n`);
});
