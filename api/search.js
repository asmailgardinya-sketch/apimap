const cache = new Map();
let queue = Promise.resolve();
let lastRequest = 0;
let pending = 0;
let blockedUntil = 0;
const upstream = 'https://nominatim.openstreetmap.org/search';

export default async function search(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, data) => { res.statusCode = code; res.end(JSON.stringify(data)); };
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(405, { error: 'GET 요청만 지원합니다.' });
  }
  const query = new URL(req.url, 'http://localhost').searchParams.get('q')?.trim();
  if (!query || query.length < 2 || query.length > 120) return send(400, { error: '검색어를 2~120자로 입력해주세요.' });
  const key = query.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return send(200, cached.data);
  if (blockedUntil > Date.now()) {
    const seconds = Math.ceil((blockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(seconds));
    return send(429, { error: `장소 검색 서비스의 요청 제한 중입니다. ${seconds}초 후 다시 검색해주세요.` });
  }
  if (pending >= 5) return send(429, { error: '검색 요청이 많습니다. 잠시 후 다시 시도해주세요.' });
  pending++;
  const task = queue.then(async () => {
    // This queue limits a single runtime; separate Vercel instances do not share it.
    const wait = 1100 - (Date.now() - lastRequest);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequest = Date.now();
    const url = new URL(upstream);
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': 'ko', addressdetails: '1' });
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SaiDistance/1.0 (user-initiated place search)', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      if (response.status === 429) {
        blockedUntil = Date.now() + Math.max(30, Number(response.headers.get('retry-after')) || 0) * 1000;
        const error = new Error('장소 검색 서비스의 요청 제한 중입니다. 30초 이상 기다린 뒤 다시 검색해주세요.');
        error.status = 429;
        throw error;
      }
      const error = new Error('검색 서비스가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
      error.status = response.status === 429 ? 429 : 502;
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('검색 서비스 응답이 올바르지 않습니다.');
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { data: rows, expires: Date.now() + 86400000 });
    return rows;
  });
  queue = task.catch(() => {});
  try { send(200, await task); }
  catch (error) {
    if (error.status === 429) res.setHeader('Retry-After', String(Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000))));
    send(error.status || 502, { error: error.status ? error.message : '검색 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' });
  } finally { pending--; }
}
