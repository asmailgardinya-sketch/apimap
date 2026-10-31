import { distanceMeters } from './distance.js';

const selected = { origin: null, destination: null };
const status = document.querySelector('#status');
let busy = false;
const config = fetch('/config.json', { cache: 'no-cache' }).then(r => {
  if (!r.ok) throw new Error('검색 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  return r.json();
});
// Attach a handler immediately, even if configuration fails before the first search.
config.catch(() => {});
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } };

function renderDistance() {
  const result = document.querySelector('#result');
  result.hidden = !selected.origin || !selected.destination;
  if (result.hidden) return;
  const a = selected.origin, b = selected.destination;
  const meters = distanceMeters(a, b);
  document.querySelector('#distance').textContent = (meters < 1000 ? Math.round(meters) : meters / 1000).toLocaleString('ko-KR', { maximumFractionDigits: meters < 1000 ? 0 : 2 });
  document.querySelector('#unit').textContent = meters < 1000 ? 'm' : 'km';
  document.querySelector('#route-label').textContent = `${a.name} → ${b.name}`;
  const url = new URL('https://www.openstreetmap.org/');
  url.searchParams.set('route', `${a.lat},${a.lon};${b.lat},${b.lon}`);
  document.querySelector('#map-link').href = url.href;
  status.textContent = '두 장소 사이의 직선거리를 계산했습니다.';
}

async function lookup(query) {
  const { searchEndpoint } = await config;
  const key = `sai-search-v1:${searchEndpoint}:${query.toLocaleLowerCase()}`;
  const cached = read(key);
  if (cached && Date.now() - cached.time < 86400000 && Array.isArray(cached.data)) return cached.data;
  const run = async () => {
    const remaining = 1100 - (Date.now() - Number(read('sai-last-request') || 0));
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    write('sai-last-request', Date.now());
    const url = new URL(searchEndpoint, window.location.href);
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', 'accept-language': 'ko', addressdetails: '1' });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || (response.status === 429 ? '검색 요청이 많습니다. 잠시 후 다시 검색해주세요.' : '장소 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'));
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('장소 검색 응답이 올바르지 않습니다.');
    const data = rows.map(row => ({ lat: Number(row.lat), lon: Number(row.lon), name: row.name || row.display_name.split(',')[0], address: row.display_name })).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon) && Math.abs(row.lat) <= 90 && Math.abs(row.lon) <= 180);
    write(key, { time: Date.now(), data });
    return data;
  };
  // Coordinate requests across tabs in browsers that support Web Locks.
  return navigator.locks ? navigator.locks.request('sai-nominatim', run) : run();
}

for (const side of ['origin', 'destination']) {
  const input = document.querySelector(`#${side}`);
  const list = document.querySelector(`#${side}-results`);
  const description = document.querySelector(`#${side}-selection`);
  let revision = 0;
  input.addEventListener('input', () => {
    revision++;
    selected[side] = null;
    list.replaceChildren();
    description.textContent = '장소를 검색하고 결과에서 선택해주세요.';
    description.classList.remove('chosen');
    renderDistance();
  });
  document.querySelector(`form[data-side="${side}"]`).addEventListener('submit', async event => {
    event.preventDefault();
    const query = input.value.trim();
    if (busy || query.length < 2) return;
    busy = true;
    const currentRevision = ++revision;
    document.querySelectorAll('form button').forEach(button => { button.disabled = true; });
    list.replaceChildren();
    status.textContent = '장소를 검색하고 있습니다…';
    try {
      const places = await lookup(query);
      if (revision !== currentRevision) { status.textContent = '입력한 장소를 다시 검색해주세요.'; return; }
      status.textContent = places.length ? '검색 결과에서 정확한 장소를 선택해주세요.' : '검색 결과가 없습니다. 지역명이나 주소를 함께 입력해보세요.';
      for (const place of places) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = place.address;
        button.addEventListener('click', () => {
          selected[side] = place;
          input.value = place.name;
          description.textContent = `선택됨 · ${place.address}`;
          description.classList.add('chosen');
          list.replaceChildren();
          status.textContent = '다른 장소도 검색 결과에서 선택해주세요.';
          renderDistance();
        });
        item.append(button);
        list.append(item);
      }
    } catch (error) {
      status.textContent = ['TimeoutError', 'AbortError'].includes(error.name) ? '검색 응답이 지연되고 있습니다. 다시 시도해주세요.' : error instanceof TypeError ? '네트워크 연결 또는 검색 서비스 상태를 확인해주세요.' : error.message;
    } finally {
      busy = false;
      document.querySelectorAll('form button').forEach(button => { button.disabled = false; });
    }
  });
}
