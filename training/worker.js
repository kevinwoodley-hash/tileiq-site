export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    const type = response.headers.get('content-type') || '';
    if (url.pathname !== '/' || !type.includes('text/html')) return response;

    let html = await response.text();
    const script = `<script>
(() => {
  const oldSearch = document.getElementById('course-search');
  const grid = document.getElementById('provider-grid');
  if (!oldSearch || !grid) return;

  const search = oldSearch.cloneNode(true);
  oldSearch.replaceWith(search);
  search.placeholder = 'Enter your town or postcode…';
  search.setAttribute('aria-label', 'Find nearest tiling training centres');

  const status = document.createElement('div');
  status.id = 'nearest-status';
  status.style.cssText = 'margin-top:10px;color:#a8b2b7;font-size:13px;min-height:20px';
  search.parentNode.appendChild(status);

  const centres = {
    'New Beginnings Tiling Academy': [53.4539, -2.7360],
    'Preston College': [53.7632, -2.7031],
    'Leeds College of Building': [53.8008, -1.5491],
    'Cardiff and Vale College': [51.4816, -3.1791],
    'Construction Skills College': [53.0027, -2.1794],
    'Specialist Trade Courses': [51.5920, 0.2330],
    'The Growth Company': [53.4808, -2.2426],
    'Norfolk Adult Learning and Skills': [52.6309, 1.2974]
  };

  const cards = [...grid.querySelectorAll('.provider')];
  cards.forEach(card => {
    const name = card.querySelector('h3')?.textContent.trim();
    if (centres[name]) {
      card.dataset.lat = centres[name][0];
      card.dataset.lon = centres[name][1];
    }
  });

  const miles = (lat1, lon1, lat2, lon2) => {
    const r = 3958.8, rad = Math.PI / 180;
    const dLat = (lat2-lat1)*rad, dLon = (lon2-lon1)*rad;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  async function geocode(q) {
    const cleaned = q.trim();
    const postcode = cleaned.replace(/\\s+/g,'');
    try {
      const p = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode));
      if (p.ok) {
        const j = await p.json();
        if (j.result) return {lat:j.result.latitude, lon:j.result.longitude, label:j.result.postcode};
      }
    } catch (_) {}
    const r = await fetch('https://api.postcodes.io/places?q=' + encodeURIComponent(cleaned));
    if (!r.ok) throw new Error('place lookup failed');
    const j = await r.json();
    if (!j.result || !j.result.length) throw new Error('place not found');
    const best = j.result[0];
    return {lat:best.latitude, lon:best.longitude, label:best.name_1 || best.local_type || cleaned};
  }

  let timer;
  async function findNearest() {
    const q = search.value.trim();
    if (q.length < 2) {
      status.textContent = '';
      cards.forEach(c => { c.style.display='flex'; c.querySelector('.distance')?.remove(); grid.appendChild(c); });
      return;
    }
    status.textContent = 'Finding nearest training centres…';
    try {
      const point = await geocode(q);
      const ranked = cards.map(card => ({
        card,
        distance: miles(point.lat, point.lon, Number(card.dataset.lat), Number(card.dataset.lon))
      })).sort((a,b) => a.distance-b.distance);
      ranked.forEach(({card,distance}, index) => {
        card.style.display='flex';
        card.querySelector('.distance')?.remove();
        const badge=document.createElement('div');
        badge.className='distance';
        badge.style.cssText='margin:0 0 12px;color:#27d3c3;font-weight:700;font-size:14px';
        badge.textContent=(index===0?'Nearest · ':'') + Math.round(distance) + ' miles away';
        const loc=card.querySelector('.location');
        loc.insertAdjacentElement('afterend',badge);
        grid.appendChild(card);
      });
      status.textContent = 'Showing centres nearest to ' + point.label + '.';
    } catch (_) {
      const ql=q.toLowerCase();
      cards.forEach(card => card.style.display = card.dataset.search.includes(ql) ? 'flex' : 'none');
      status.textContent = 'Town not recognised. Try a UK postcode, or a larger nearby town.';
    }
  }

  search.addEventListener('input', () => { clearTimeout(timer); timer=setTimeout(findNearest, 550); });
  search.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); clearTimeout(timer); findNearest(); } });
})();
</script>`;
    html = html.replace('</body>', script + '</body>');
    return new Response(html, { status: response.status, headers: response.headers });
  }
};
