// 本地静态网页服务 (纯 Node.js 原生内置模块，零任何第三方依赖)
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const ROOT_DIR = __dirname;
let currentPort = 3001;

function requestHandler(req, res) {
  // 解析路径，去除 query 和 hash
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(path.join(ROOT_DIR, reqPath));

  // 安全检查：防止目录穿越攻击
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 禁止访问');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 页面或资源未找到');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
}

function startServer(port) {
  const server = http.createServer(requestHandler);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ 提示：端口 ${port} 已被占用，正在自动切换至下一个端口 ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('服务器启动错误:', err);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log('\n======================================================');
    console.log(`📰 AI 日报已成功运行在本地服务器！`);
    console.log(`🌐 访问地址：http://localhost:${port}`);
    console.log(`💻 仅限本机访问，点击上方链接即可在浏览器中查看。`);
    console.log(`⌨️ 提示：如需停止服务，可按 Ctrl + C。`);
    console.log('======================================================\n');
  });
}

// 启动服务器
startServer(currentPort);
