import test from 'node:test';
import assert from 'node:assert/strict';
import search from './api/search.js';

test('search proxy validates, caches results and reports upstream rate limits', async () => {
  const originalFetch = globalThis.fetch;
  const invoke = async (url, method = 'GET') => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, end: body => { res.body = JSON.parse(body); } };
    await search({ url, method }, res);
    return { status: res.statusCode, body: res.body, headers };
  };
  try {
    assert.equal((await invoke('/api/search?q=x')).status, 400);
    assert.equal((await invoke('/api/search?q=Seoul', 'POST')).status, 405);
    let calls = 0;
    const rows = [{ lat: '37.55', lon: '126.97', display_name: 'Seoul Station' }];
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(new URL(url).hostname, 'nominatim.openstreetmap.org');
      assert.ok(options.headers['User-Agent'].startsWith('SaiDistance/'));
      return Response.json(rows);
    };
    assert.deepEqual((await invoke('/api/search?q=Seoul')).body, rows);
    assert.deepEqual((await invoke('/api/search?q=Seoul')).body, rows);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('limited', { status: 429 });
    const limited = await invoke('/api/search?q=Busan');
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers['Retry-After']) >= 1);
    globalThis.fetch = async () => { throw new Error('Must not fetch during cooldown'); };
    assert.equal((await invoke('/api/search?q=Daegu')).status, 429);
    assert.deepEqual((await invoke('/api/search?q=Seoul')).body, rows);
  } finally { globalThis.fetch = originalFetch; }
});
