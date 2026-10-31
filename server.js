import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import search from './api/search.js';

const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/distance.js': ['distance.js', 'text/javascript'], '/config.json': ['config.json', 'application/json'] };
createServer(async (req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/api/search') return search(req, res);
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(await readFile(new URL(file[0], import.meta.url))); }
  catch { res.writeHead(500); res.end('Unable to read file'); }
}).listen(3000, () => console.log('http://localhost:3000'));
