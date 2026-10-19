/* Our Trip - Munich to Athens. Home-screen web app. */
(function () {
  const T = window.TRIP, K = window.CONTENT;
  const DAYS = T.days, WEEKS = T.weeks, HL = T.highlights, NIGHTS = T.nights, RESTS = T.rests, FERRIES = T.ferries;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const short = (s) => String(s).replace(/ \(.*\)$/, '').replace(' / Domince', '').replace(' / Krk bridge', '');

  const WEEK_COLORS = { 1: '#2B5A8C', 2: '#7A4A8E', 3: '#B83A2E', 4: '#D07A1E', 5: '#2E7D62', 6: '#B24C74', 7: '#7E5530', 8: '#24849A', 9: '#B38B12', 10: '#5F8A2A', 11: '#8C2447' };
  const lighten = (hex, f = 0.38) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = (c) => Math.round(c + (255 - c) * f); return `rgb(${m(r)},${m(g)},${m(b)})`; };
  const EFFORT = { Easy: '#3F7A4A', Moderate: '#B7841C', Hard: '#C8641E', 'Big climb': '#A82A20' };
  const CAT = {
    'Swim & beach': ['🏖️', '#2B7BA8'], 'Lake': ['🌊', '#2D5C9E'], 'Hot springs & springs': ['♨️', '#C0452E'],
    'Mountain pass & view': ['⛰️', '#6B5136'], 'Gorge, river & canyon': ['🏞️', '#2E7D6A'], 'Food & wine': ['🍷', '#8C2447'],
    'Old town & history': ['🏰', '#6E4E8E'], 'Ferry port': ['⛴️', '#24649A'], 'Border crossing': ['🛂', '#555'], 'Start & finish': ['🏁', '#B8341F'],
  };
  const FLAG = Object.fromEntries(K.COUNTRIES.map((c) => [c.name, c.flag]));
  const LANG = { Germany: 'de-DE', Austria: 'de-AT', Italy: 'it-IT', Slovenia: 'sl-SI', Croatia: 'hr-HR', Bosnia: 'bs-BA', Montenegro: 'sr-ME', Albania: 'sq-AL', 'North Macedonia': 'mk-MK', Greece: 'el-GR' };
  const COUNTRY_OF_STOP = {};
  HL.forEach((h) => { COUNTRY_OF_STOP[h.name] = h.country; });

  // ---------------------------------------------------------------- state
  const KEY = 'ourtrip.v1';
  const DEF = { names: ['', ''], ridden: [], journal: {}, packed: {}, extra: [], quizBest: 0, theme: 'auto', mapStyle: 'terrain',
    expenses: [], rates: { EUR: 1, CAD: 1.55, ALL: 98, MKD: 61.5, BAM: 1.956 }, sosNotes: '' };
  let S = { ...DEF };
  try { S = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* fresh */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } };
  const applyTheme = () => { if (S.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', S.theme); };
  applyTheme();

  // photos in IndexedDB (blobs, resized)
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('ourtrip', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true }).createIndex('day', 'day');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }));
  const photosFor = async (day) => {
    try {
      const d = await db();
      return await new Promise((res) => { const q = d.transaction('photos').objectStore('photos').index('day').getAll(day); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    } catch (e) { return []; }
  };
  const addPhotoBlob = async (day, blob) => { const d = await db(); return new Promise((res) => { const tx = d.transaction('photos', 'readwrite'); tx.objectStore('photos').add({ day, blob, at: Date.now() }); tx.oncomplete = res; tx.onerror = res; }); };
  const delPhoto = async (id) => { const d = await db(); return new Promise((res) => { const tx = d.transaction('photos', 'readwrite'); tx.objectStore('photos').delete(id); tx.oncomplete = res; tx.onerror = res; }); };
  const shrink = (file) => new Promise((res) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const m = 1400, k = Math.min(1, m / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      cv.toBlob((b) => res(b || file), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });

  // ---------------------------------------------------------------- trip helpers
  const START = new Date(2027, 5, 1), END = new Date(2027, 7, 13);
  const TOTAL_KM = DAYS.reduce((a, d) => a + d.km, 0), TOTAL_UP = DAYS.reduce((a, d) => a + d.up, 0);
  const day = (n) => DAYS.find((d) => d.day === n);
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };
  function status() {
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (today < START) return { phase: 'before', toGo: Math.round((START - today) / 864e5) };
    if (today > END) return { phase: 'after' };
    const iso = isoOf(today);
    return { phase: 'during', tripDay: Math.round((today - START) / 864e5) + 1, ride: DAYS.find((d) => d.iso === iso), rest: RESTS.find((r) => r.iso === iso) };
  }
  const story = (name) => K.STORIES[name] || K.STORIES[Object.keys(K.STORIES).find((k) => short(k) === short(name))] || '';
  const couple = () => `${S.names[0] || 'You'} & ${S.names[1] || 'Me'}`;
  function searchPlace(name) {
    const near = /\(near ([^)]+)\)/.exec(name);
    if (near) return near[1];
    const paren = /^(.*?) \(([^)]+)\)$/.exec(name);
    if (paren) return /area|valley|mountains|road|springs|beach|Kurvelesh|Gigovici|Krk bridge|Kolpa/i.test(paren[2]) ? paren[1] : `${paren[1]}, ${paren[2]}`;
    return short(name.replace(' area', ''));
  }
  function stayLinks(d) {
    const nights = d.restNext ? 2 : 1, ci = d.iso, co = addDays(ci, nights);
    const country = d.countries[d.countries.length - 1] || '';
    const q = encodeURIComponent(`${searchPlace(d.end)}, ${country}`);
    const qPlain = encodeURIComponent(searchPlace(d.end) + ' ' + country);
    return [
      ['Booking.com', 'hotels & guesthouses', `https://www.booking.com/searchresults.html?ss=${q}&checkin=${ci}&checkout=${co}&group_adults=2&no_rooms=1&group_children=0`],
      ['Agoda', 'often cheaper in the Balkans', `https://www.agoda.com/search?textToSearch=${q}&checkIn=${ci}&los=${nights}&adults=2&rooms=1`],
      ['Airbnb', 'rooms & apartments', `https://www.airbnb.com/s/${q}/homes?checkin=${ci}&checkout=${co}&adults=2`],
      ['Campsites', 'on Google Maps', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('camping near ' + searchPlace(d.end) + ' ' + country)}`],
      ['Hostelworld', 'hostels', `https://www.hostelworld.com/search?search_keywords=${qPlain}&date_from=${ci}&date_to=${co}&number_of_guests=2`],
      ['Weather', `forecast for ${searchPlace(d.end)}`, `https://www.google.com/search?q=${encodeURIComponent('weather ' + searchPlace(d.end) + ' ' + country)}`],
    ];
  }
  function rideLinks(d) {
    const a = d.line[0][0], seg = d.line[d.line.length - 1], b = seg[seg.length - 1];
    return [
      ['Google Maps', 'bike directions', `https://www.google.com/maps/dir/?api=1&origin=${a[0]},${a[1]}&destination=${b[0]},${b[1]}&travelmode=bicycling`],
      ['Food nearby', 'groceries at the end', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('supermarket ' + searchPlace(d.end))}`],
    ];
  }
  const FERRY_LINKS = {
    'Valbiska (Krk) - Lopar (Rab)': 'https://www.jadrolinija.hr/en',
    'Split - Stari Grad (Hvar)': 'https://www.jadrolinija.hr/en',
    'Hvar town - Vela Luka (Korcula)': 'https://www.jadrolinija.hr/en',
  };
  const ferryLink = (name) => FERRY_LINKS[name] || `https://www.google.com/search?q=${encodeURIComponent(name + ' ferry timetable 2027')}`;

  // ---------------------------------------------------------------- icons
  const ICON = {
    us: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    days: '<svg viewBox="0 0 24 24"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7M9 6h3"/></svg>',
    explore: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/></svg>',
    kit: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a3 3 0 016 0v2M4 12h16"/></svg>',
  };
  const TABS = [['home', 'Us', ICON.us], ['map', 'Map', ICON.map], ['days', 'Days', ICON.days], ['explore', 'Explore', ICON.explore], ['kit', 'Toolkit', ICON.kit]];

  // ---------------------------------------------------------------- router
  let tab = 'home';
  try { tab = sessionStorage.getItem('ourtrip.tab') || 'home'; } catch (e) { /* ignore */ }
  const stack = [];
  let mapInst = null, mapState = { week: null, sel: null, sights: true, place: null, me: null };
  const view = $('#view');

  function toast(msg) {
    document.querySelectorAll('.toast').forEach((x) => x.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
  function go(tabName) { stack.length = 0; tab = tabName; try { sessionStorage.setItem('ourtrip.tab', tab); } catch (e) { /* ignore */ } render(); }
  function push(route) { stack.push(route); render(); }
  function back() { stack.pop(); render(); }
  window.addEventListener('popstate', () => { if (stack.length) back(); });

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([k, label, icon]) =>
      `<button data-tab="${k}" ${!stack.length && tab === k ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('');
  }

  function render() {
    if (mapInst && (stack.length || tab !== 'map')) { mapInst.destroy(); mapInst = null; }
    if (!S.names[0] || !S.names[1]) { $('#tabs').hidden = true; view.innerHTML = welcome(); return; }
    $('#tabs').hidden = false;
    renderTabs();
    const top = stack[stack.length - 1];
    if (top) {
      const html = { day: dayPage, country: countryPage, place: placePage, quiz: quizPage, settings: settingsPage, week: weekRedirect }[top.name](top);
      view.innerHTML = `<div class="scroll" id="sc"><div class="wrap">${html}</div></div>`;
      if (top.name === 'day') hydrateDay(top.day);
      $('#sc').scrollTop = 0;
      return;
    }
    if (tab === 'map') { view.innerHTML = mapView(); mountMap(); return; }
    const html = { home: homePage, days: daysPage, explore: explorePage, kit: kitPage }[tab]();
    view.innerHTML = `<div class="scroll" id="sc"><div class="wrap">${html}</div></div>`;
  }

  // ---------------------------------------------------------------- welcome
  function welcome() {
    return `<div class="scroll"><div class="wrap" style="padding-top:24px">
      ${routeArt(260, 'margin:0 auto')}
      <div style="text-align:center;display:flex;flex-direction:column;gap:6px">
        <div class="eyebrow">Summer 2027 · 74 days · 10 countries</div>
        <h1 style="font-size:44px">Munich<br><span class="lede" style="font-size:22px">to</span><br>Athens</h1>
        <p class="lede">A bicycle voyage across the Alps, the Adriatic isles and the Balkans.</p>
      </div>
      <form class="card" id="nameForm">
        <h2>Who's riding?</h2>
        <label class="field" for="n1">Rider one<input type="text" id="n1" autocomplete="off" placeholder="Your name" value="${esc(S.names[0])}"></label>
        <label class="field" for="n2">Rider two<input type="text" id="n2" autocomplete="off" placeholder="Their name" value="${esc(S.names[1])}"></label>
        <button class="btn" type="submit">Start our trip</button>
        <p class="small muted">Everything you add stays on this phone. Use Toolkit → Backup to copy it to the other phone.</p>
      </form>
    </div></div>`;
  }

  function routeArt(w, style = '') {
    // the real route outline, drawn small
    const pts = DAYS.flatMap((d) => d.line.flat());
    const xs = pts.map((p) => p[1]), ys = pts.map((p) => p[0]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const h = w * (maxy - miny) / (maxx - minx) * 1.3;
    const sx = (lon) => ((lon - minx) / (maxx - minx)) * (w - 20) + 10, sy = (lat) => ((maxy - lat) / (maxy - miny)) * (h - 20) + 10;
    const paths = DAYS.map((d) => d.line.map((seg) => `<path d="${seg.filter((_, i) => i % 3 === 0 || i === seg.length - 1).map((p, i) => `${i ? 'L' : 'M'}${sx(p[1]).toFixed(1)},${sy(p[0]).toFixed(1)}`).join('')}" stroke="${WEEK_COLORS[d.week]}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`).join('')).join('');
    const a = pts[0], b = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h.toFixed(0)}" width="${w}" style="max-width:100%;display:block;${style}" aria-hidden="true">${paths}
      <circle cx="${sx(a[1])}" cy="${sy(a[0])}" r="5" fill="var(--signal)"/><circle cx="${sx(b[1])}" cy="${sy(b[0])}" r="5" fill="var(--signal)"/></svg>`;
  }

  // ---------------------------------------------------------------- home
  function homePage() {
    const st = status();
    const ridden = DAYS.filter((d) => S.ridden.includes(d.day));
    const kmDone = ridden.reduce((a, d) => a + d.km, 0), upDone = ridden.reduce((a, d) => a + d.up, 0);
    const stamped = new Set(ridden.flatMap((d) => d.countries));
    const next = DAYS.find((d) => !S.ridden.includes(d.day));
    const facts = allFacts();
    const fact = facts[Math.floor(Math.random() * facts.length)];
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    let heroHtml;
    if (st.phase === 'before') {
      heroHtml = `<div class="hero"><div class="eyebrow">Wheels roll in Munich</div>
        <div class="big num">${fmt(st.toGo)}</div><div>days to go · Tuesday, June 1, 2027</div>
        <div class="route-art" style="opacity:.35">${routeArt(170)}</div></div>`;
    } else if (st.phase === 'during') {
      heroHtml = st.ride
        ? `<div class="hero tap" data-go-day="${st.ride.day}" style="cursor:pointer"><div class="eyebrow">Trip day ${st.tripDay} of 74 · today</div>
            <h2 style="color:inherit">${esc(short(st.ride.start))} → ${esc(short(st.ride.end))}</h2>
            <div class="num">${st.ride.km} km · ${fmt(st.ride.up)} m up · ${st.ride.effort}</div>
            <div class="small" style="opacity:.8">${esc(st.ride.note)} · tap for the day</div></div>`
        : `<div class="hero"><div class="eyebrow">Trip day ${st.tripDay} of 74</div><h2 style="color:inherit">Rest day in ${esc(short(st.rest ? st.rest.place : ''))}</h2><div>Swim, eat, nap, repeat.</div></div>`;
    } else {
      heroHtml = `<div class="hero"><div class="eyebrow">August 13, 2027</div><h2 style="color:inherit">We made it to Athens.</h2><div class="num">${fmt(TOTAL_KM)} km · ${fmt(TOTAL_UP)} m up · together</div></div>`;
    }
    return `
      <div class="row between"><div class="eyebrow">${esc(couple())}</div><button class="chip" data-push="settings" aria-label="Settings">Settings</button></div>
      <h1>Munich → Athens</h1>
      ${heroHtml}
      ${!standalone && /iPhone|iPad/.test(navigator.userAgent) ? `<div class="card" style="border-style:dashed"><h3>Put it on your home screen</h3><p class="small">In Safari tap the Share button, then <b>Add to Home Screen</b>. It opens full screen like an app and works offline.</p></div>` : ''}
      <div class="card">
        <div class="row between"><h2>Our progress</h2><span class="num small muted">${Math.round(100 * kmDone / TOTAL_KM)}%</span></div>
        <div class="bar"><i style="width:${(100 * kmDone / TOTAL_KM).toFixed(1)}%"></i></div>
        <div class="grid3"><div class="stat"><b>${ridden.length}/${DAYS.length}</b><span>days ridden</span></div>
          <div class="stat"><b>${fmt(kmDone)}</b><span>of ${fmt(TOTAL_KM)} km</span></div><div class="stat"><b>${fmt(upDone)}</b><span>m climbed</span></div></div>
        ${next ? `<button class="btn" data-go-day="${next.day}" style="background:${WEEK_COLORS[next.week]}">Next: Day ${next.day} · ${esc(short(next.start))} → ${esc(short(next.end))}</button>` : ''}
      </div>
      <div class="card"><h2>Passport stamps</h2><p class="small muted">A stamp lands the first time you ride a day in each country.</p>
        <div class="stamps">${K.COUNTRIES.map((c) => `<button class="stamp ${stamped.has(c.name) ? 'got' : ''}" data-country="${esc(c.name)}"><span class="seal">${c.flag}</span><small>${esc(c.name === 'North Macedonia' ? 'N. Macedonia' : c.name)}</small></button>`).join('')}</div>
      </div>
      <div class="card"><div class="eyebrow">Did you know?</div><p id="fact" style="font-family:var(--f-display);font-size:17.5px">${esc(fact)}</p>
        <div class="row between"><button class="chip" data-act="fact">Another one</button><button class="chip" data-act="share-fact">Share</button></div></div>
      <div class="card tap" data-push="quiz"><h2>Trip trivia</h2><p>Twenty questions about the places on the route.</p><p class="small muted">Best score <span class="num">${S.quizBest}/20</span> · tap to play</p></div>
      <div class="card"><h2>The big numbers</h2>
        <div class="grid3"><div class="stat"><b>74</b><span>days</span></div><div class="stat"><b>${fmt(TOTAL_KM)}</b><span>km</span></div><div class="stat"><b>${fmt(TOTAL_UP)}</b><span>m of climbing</span></div>
        <div class="stat"><b>10</b><span>countries</span></div><div class="stat"><b>11</b><span>ferries & boats</span></div><div class="stat"><b>${fmt(Math.max(...DAYS.map((d) => d.hi)))}</b><span>m highest point</span></div></div></div>`;
  }
  let FACTS = null;
  function allFacts() {
    if (!FACTS) {
      FACTS = [];
      K.COUNTRIES.forEach((c) => c.facts.forEach((f) => FACTS.push(`${c.flag} ${f}`)));
      Object.entries(K.STORIES).forEach(([k, v]) => FACTS.push(`${short(k)}: ${v}`));
    }
    return FACTS;
  }

  // ---------------------------------------------------------------- map
  function mapView() {
    const w = mapState.week ? WEEKS[mapState.week - 1] : null;
    return `<div id="mapwrap"><canvas id="map" aria-label="Route map. Drag to move, pinch or scroll to zoom, tap a day."></canvas>
      <div class="map-top">
        <div class="chips">
          <button class="chip" data-week="" aria-pressed="${!mapState.week}">All weeks</button>
          ${WEEKS.map((x) => `<button class="chip" data-week="${x.week}" aria-pressed="${mapState.week === x.week}" style="${mapState.week === x.week ? `background:${WEEK_COLORS[x.week]};border-color:${WEEK_COLORS[x.week]};color:#fff` : `border-color:${WEEK_COLORS[x.week]}`}">Wk ${x.week}</button>`).join('')}
        </div>
        ${w ? `<div class="week-card"><b style="color:${WEEK_COLORS[w.week]}">Week ${w.week} · ${esc(w.name)}</b><div class="small muted num">${esc(w.dates)} · ${w.km} km · ${fmt(w.up)} m up</div></div>` : ''}
      </div>
      <button class="fab" style="top:calc(env(safe-area-inset-top,0px) + 110px)" data-act="style" aria-label="Change map style" title="Map style">${S.mapStyle === 'terrain' ? '⛰️' : '🗺️'}</button>
      <button class="fab" style="top:calc(env(safe-area-inset-top,0px) + 162px)" data-act="sights" aria-label="Show or hide sights" title="Sights" aria-pressed="${mapState.sights}">${mapState.sights ? '✨' : '·'}</button>
      <button class="fab" style="top:calc(env(safe-area-inset-top,0px) + 214px)" data-act="locate" aria-label="Show where we are" title="Where are we?">📍</button>
      <button class="fab" style="top:calc(env(safe-area-inset-top,0px) + 266px)" data-act="fit" aria-label="Show whole route" title="Whole route">⤢</button>
      <div id="sheet">${sheetHtml()}</div>
      <div class="attrib">${TripMap.PROVIDERS[S.mapStyle].attrib}</div>
    </div>`;
  }
  function sheetHtml() {
    if (mapState.sel) {
      const d = day(mapState.sel);
      return `<div class="sheet" style="border-color:${WEEK_COLORS[d.week]}">
        <div class="eyebrow">Day ${d.day} · ${esc(d.date)} ${d.countries.map((c) => FLAG[c] || '').join(' ')}</div>
        <h3>${esc(short(d.start))} → ${esc(short(d.end))}</h3>
        <div class="num small">${d.km} km · ${fmt(d.up)} m up · ${d.gravel}% gravel · <span class="pill" style="background:${EFFORT[d.effort]}">${d.effort}</span></div>
        <div class="small muted">${esc(d.note)}</div>
        <div class="row" style="margin-top:6px"><button class="btn small" data-go-day="${d.day}">Open day</button><button class="btn small ghost" data-act="close-sheet">Close</button></div></div>`;
    }
    if (mapState.place) {
      const p = HL.find((h) => h.name === mapState.place);
      const s = story(p.name) || p.note;
      return `<div class="sheet"><div class="eyebrow">${(CAT[p.cat] || ['📍'])[0]} ${esc(p.cat)} · ${esc(p.country)} · day ${p.day}</div>
        <h3>${esc(short(p.name))}</h3><p class="small">${esc(s.length > 220 ? s.slice(0, 220) + '…' : s)}</p>
        <div class="row" style="margin-top:6px"><button class="btn small" data-place="${esc(p.name)}">Read more</button><button class="btn small ghost" data-go-day="${p.day}">Day ${p.day}</button><button class="btn small ghost" data-act="close-sheet">Close</button></div></div>`;
    }
    return '';
  }
  const PROJ = DAYS.map((d) => ({ day: d.day, week: d.week, segs: d.line.map((seg) => seg.map(([la, lo]) => [TripMap.lonX(lo), TripMap.latY(la)])) }));
  function boundsOf(days) {
    let a = 90, b = 180, c = -90, e = -180;
    days.forEach((d) => d.line.forEach((s) => s.forEach(([la, lo]) => { a = Math.min(a, la); c = Math.max(c, la); b = Math.min(b, lo); e = Math.max(e, lo); })));
    return [a, b, c, e];
  }
  function mountMap() {
    if (mapInst) { mapInst.destroy(); mapInst = null; }
    const cv = $('#map');
    const css = getComputedStyle(document.documentElement);
    const dark = () => (S.theme === 'dark') || (S.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    mapInst = new TripMap(cv, {
      style: S.mapStyle,
      tint: () => (dark() ? 'rgba(120,135,175,.85)' : 'rgba(240,226,192,.55)'),
      getLayers: () => {
        const shown = mapState.week ? PROJ.filter((p) => p.week === mapState.week) : PROJ;
        const dayset = new Set(shown.map((p) => p.day));
        return {
          days: shown.map((p) => ({ ...p, color: S.ridden.includes(p.day) ? WEEK_COLORS[p.week] : (p.day % 2 ? WEEK_COLORS[p.week] : lighten(WEEK_COLORS[p.week])) })),
          selected: mapState.sel,
          casing: 'rgba(255,255,255,.75)',
          ferries: FERRIES.map((f) => ({ pts: f.line.map(([la, lo]) => [TripMap.lonX(lo), TripMap.latY(la)]) })),
          seaColor: '#2B6A8A',
          ink: '#1E2638',
          nights: NIGHTS.filter((n) => !mapState.week || dayset.has(n.day) || n.type !== 'Overnight').map((n) => ({ day: n.day, kind: n.type, x: TripMap.lonX(n.lon), y: TripMap.latY(n.lat), label: `${n.day} ${short(n.name)}` })),
          sights: HL.filter((h) => !mapState.week || dayset.has(h.day)).map((h) => ({ name: h.name, emoji: (CAT[h.cat] || ['📍'])[0], color: (CAT[h.cat] || [0, '#555'])[1], x: TripMap.lonX(h.lon), y: TripMap.latY(h.lat) })),
          showSights: mapState.sights,
          weekBadges: mapState.week ? [] : WEEKS.map((w) => { const d = DAYS.find((x) => x.week === w.week); const p = d.line[0][0]; return { week: w.week, color: WEEK_COLORS[w.week], x: TripMap.lonX(p[1]), y: TripMap.latY(p[0]) }; }),
          me: mapState.me,
        };
      },
      onTap: (hit) => {
        if (!hit) { if (mapState.sel || mapState.place) { mapState.sel = null; mapState.place = null; refreshSheet(); } return; }
        if (hit.kind === 'sight') { mapState.place = hit.name; mapState.sel = null; }
        else if (hit.kind === 'week') { setWeek(hit.week); return; }
        else if (hit.day) { mapState.sel = hit.day; mapState.place = null; }
        refreshSheet();
      },
    });
    void css;
    if (mapState.view) { Object.assign(mapInst, mapState.view); mapInst.draw(); }
    else mapInst.fitBounds(boundsOf(mapState.week ? DAYS.filter((d) => d.week === mapState.week) : DAYS), false, 24);
  }
  function refreshSheet() { const sh = $('#sheet'); if (sh) sh.innerHTML = sheetHtml(); if (mapInst) mapInst.draw(); }
  function rememberView() { if (mapInst) mapState.view = { cx: mapInst.cx, cy: mapInst.cy, z: mapInst.z }; }
  function setWeek(w) {
    mapState.week = w; mapState.sel = null; mapState.place = null; mapState.view = null;
    const keep = mapInst ? { cx: mapInst.cx, cy: mapInst.cy, z: mapInst.z } : null;
    view.innerHTML = mapView(); mountMap();
    if (keep) { Object.assign(mapInst, keep); }
    mapInst.fitBounds(boundsOf(w ? DAYS.filter((d) => d.week === w) : DAYS), true, 24);
  }

  // ---------------------------------------------------------------- days list
  function daysPage() {
    return `<h1>The days</h1><p class="lede">64 riding days and 10 rest days. Tap a day for its route, profile, stories and places to sleep.</p>
      ${WEEKS.map((w) => {
        const ds = DAYS.filter((d) => d.week === w.week);
        return `<section class="card">
          <div class="week-head" style="border-color:${WEEK_COLORS[w.week]}"><div class="eyebrow" style="color:${WEEK_COLORS[w.week]}">Week ${w.week} · ${esc(w.dates)}</div>
          <h2>${esc(w.name)}</h2><div class="small muted num">${w.km} km · ${fmt(w.up)} m up</div></div>
          <div>${ds.map((d) => {
            const done = S.ridden.includes(d.day);
            const rest = d.restNext ? RESTS.find((r) => r.day === d.day + 1) : null;
            return `<div class="day-row" data-go-day="${d.day}" role="button" tabindex="0">
                <span class="dot" style="background:${done ? 'var(--ok)' : WEEK_COLORS[w.week]}">${done ? '✓' : d.day}</span>
                <div class="t"><div>${esc(short(d.start))} → ${esc(short(d.end))}${d.ferry ? ' ⛴️' : ''}</div>
                <div class="small muted num">${esc(d.date)} · ${d.km} km · ${fmt(d.up)} m</div></div>
                <span class="pill" style="background:${EFFORT[d.effort]}">${d.effort}</span></div>
              ${rest ? `<div class="day-row" style="cursor:default"><span class="dot" style="background:var(--gold)">☾</span><div class="t"><div style="font-weight:400;font-style:italic">Day ${rest.day}: rest day in ${esc(short(rest.place))}</div></div></div>` : ''}`;
          }).join('')}</div></section>`;
      }).join('')}`;
  }
  function weekRedirect() { return ''; }

  // ---------------------------------------------------------------- day page
  function profileSvg(d, color) {
    const P = d.profile, W = 600, H = 230, L = 62, B = 30, Tp = 26;
    const maxX = P[P.length - 1][0] || 1;
    const els = P.map((p) => p[1]);
    const lo = Math.max(0, Math.floor(Math.min(...els) / 100) * 100), hi = Math.ceil(Math.max(...els) / 100) * 100 || 100;
    const x = (k) => L + (k / maxX) * (W - L - 8), y = (e) => Tp + (1 - (e - lo) / (hi - lo || 1)) * (H - Tp - B);
    const line = P.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    const ticks = [lo, Math.round((lo + hi) / 2 / 50) * 50, hi];
    const top = P.reduce((a, p) => (p[1] > a[1] ? p : a));
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Elevation profile, ${lo} to ${hi} metres over ${Math.round(maxX)} km">
      <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".5"/><stop offset="1" stop-color="${color}" stop-opacity=".05"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${L}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" font-size="19" text-anchor="end" fill="var(--ink-soft)" font-family="IBM Plex Mono, monospace">${t}</text>`).join('')}
      <path d="${line}L${x(maxX)},${y(lo)}L${x(0)},${y(lo)}Z" fill="url(#pg)"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="${x(top[0])}" cy="${y(top[1])}" r="4" fill="${color}"/><text x="${Math.min(x(top[0]) - 30, W - 100)}" y="${Math.max(y(top[1]) - 10, 20)}" font-size="19" fill="var(--ink)" font-family="IBM Plex Mono, monospace">${fmt(top[1])} m</text>
      <text x="${L}" y="${H - 4}" font-size="19" fill="var(--ink-soft)" font-family="IBM Plex Mono, monospace">0 km</text>
      <text x="${W - 8}" y="${H - 4}" font-size="19" fill="var(--ink-soft)" text-anchor="end" font-family="IBM Plex Mono, monospace">${Math.round(maxX)} km</text></svg>`;
  }
  function dayPage({ day: n }) {
    const d = day(n), color = WEEK_COLORS[d.week], w = WEEKS[d.week - 1];
    const idx = DAYS.indexOf(d), prev = DAYS[idx - 1], next = DAYS[idx + 1];
    const places = HL.filter((h) => h.day === d.day);
    const endStory = story(d.end);
    const rest = d.restNext ? RESTS.find((r) => r.day === d.day + 1) : null;
    const done = S.ridden.includes(d.day);
    const j = S.journal[d.day] || {};
    const stays = stayLinks(d), rides = rideLinks(d);
    return `<div class="detail-head"><button class="back" data-act="back">‹ Back</button></div>
      <div class="banner" style="background:${color}">
        <div class="eyebrow">Week ${d.week} · ${esc(w.name)}</div>
        <h1>${esc(short(d.start))} → ${esc(short(d.end))}</h1>
        <div>Day ${d.day} · ${esc(d.date)}, 2027 ${d.countries.map((c) => FLAG[c] || '').join(' ')}</div></div>
      <div class="card"><div class="grid3">
        <div class="stat"><b>${d.km}</b><span>km</span></div><div class="stat"><b>${fmt(d.up)}</b><span>m climbing</span></div><div class="stat"><b>${fmt(d.hi)}</b><span>m high point</span></div>
        <div class="stat"><b>${d.gravel}%</b><span>gravel</span></div><div class="stat"><b style="color:${EFFORT[d.effort]};font-family:var(--f-body)">${d.effort}</b><span>effort</span></div><div class="stat"><b>${d.ferry ? '⛴️' : '—'}</b><span>${d.ferry ? 'ferry day' : 'no ferry'}</span></div>
      </div></div>
      <div class="card"><h3>Elevation</h3>${profileSvg(d, color)}
        <button class="btn ghost small" data-map-day="${d.day}">Show on the map</button></div>
      <div class="card"><h3>Today's highlights</h3><p style="font-family:var(--f-display);font-style:italic">${esc(d.note || 'Quiet roads and small villages.')}</p>
        ${d.ferry ? `<p class="small">⛴️ <b>Ferry:</b> ${esc(d.ferry)} · <a href="${ferryLink(d.ferry.split(';')[0].trim())}" target="_blank" rel="noopener">timetable & tickets</a></p>` : ''}
        ${rest ? `<p class="small" style="color:var(--ok)"><b>Tomorrow is a rest day in ${esc(short(rest.place))}.</b> Book two nights.</p>` : ''}</div>
      ${(places.length || endStory) ? `<div class="card"><h3>Stories along the way</h3>
        ${places.map((p) => `<div class="story" data-place="${esc(p.name)}" role="button" tabindex="0"><b>${(CAT[p.cat] || ['📍'])[0]} ${esc(short(p.name))}</b><span class="small">${esc(story(p.name) || p.note)}</span></div>`).join('')}
        ${endStory && !places.some((p) => short(p.name) === short(d.end)) ? `<div class="story"><b>🏕️ Tonight: ${esc(short(d.end))}</b><span class="small">${esc(endStory)}</span></div>` : ''}</div>` : ''}
      <div class="card"><h3>Sleep in ${esc(searchPlace(d.end))}</h3><p class="small muted">Dates and 2 adults are filled in. ${rest ? 'Two nights because of the rest day.' : ''}</p>
        <div class="links">${stays.map(([a, b, u]) => `<a href="${u}" target="_blank" rel="noopener"><b>${a}</b><span>${esc(b)}</span></a>`).join('')}</div></div>
      <div class="card"><h3>Ride tools</h3><div class="links">${rides.map(([a, b, u]) => `<a href="${u}" target="_blank" rel="noopener"><b>${a}</b><span>${esc(b)}</span></a>`).join('')}</div>
        <p class="small muted">Navigate with your GPX in Komoot or the bike computer; Google's bike directions are a backup.</p></div>
      <div class="card" id="journal" style="${done ? 'border-color:var(--ok);border-width:2px' : ''}">
        <h3>${esc(couple())}'s journal</h3>
        <div class="moods">${['😍', '😄', '🙂', '😮‍💨', '🥵', '🌧️'].map((m) => `<button data-mood="${m}" aria-pressed="${j.mood === m}">${m}</button>`).join('')}</div>
        <label class="field" for="jt">What happened today?<textarea id="jt" placeholder="Best snack, best view, funniest moment...">${esc(j.text || '')}</textarea></label>
        <div class="photos" id="photos"></div>
        <div class="row between"><label class="btn ghost small" for="pf" style="cursor:pointer">Add photos</label><input type="file" id="pf" accept="image/*" multiple hidden>
          <button class="btn ghost small" data-act="share-day">Share the day</button></div>
        <button class="btn ${done ? 'ok' : ''}" data-act="toggle-done">${done ? '✓ We rode it!' : 'Mark as ridden'}</button>
      </div>
      <div class="row between">${prev ? `<button class="chip" data-go-day="${prev.day}">‹ Day ${prev.day}</button>` : '<span></span>'}${next ? `<button class="chip" data-go-day="${next.day}">Day ${next.day} ›</button>` : '<span></span>'}</div>`;
  }
  async function hydrateDay(n) {
    const box = $('#photos'); if (!box) return;
    const ps = await photosFor(n);
    box.innerHTML = ps.map((p) => `<img src="${URL.createObjectURL(p.blob)}" alt="Trip photo" data-photo="${p.id}" title="Long-press or double-click to remove">`).join('');
  }

  // ---------------------------------------------------------------- explore
  let exploreCat = null;
  function explorePage() {
    const cats = [...new Set(HL.map((h) => h.cat))];
    const list = HL.filter((h) => !exploreCat || h.cat === exploreCat);
    return `<h1>Explore</h1><p class="lede">History, phrases, food and stories for every stop.</p>
      <div class="card tap" data-push="quiz" style="background:var(--ink);color:var(--paper);border-color:var(--ink)"><h2 style="color:inherit">Play trip trivia</h2><p class="small" style="opacity:.85">20 questions about the places you'll ride through</p></div>
      <h2>Ten countries</h2>
      <div class="grid2">${K.COUNTRIES.map((c) => {
        const n = DAYS.filter((d) => d.countries.includes(c.name)).length;
        return `<div class="card tap" data-country="${esc(c.name)}" style="align-items:center;text-align:center;gap:4px"><span style="font-size:36px">${c.flag}</span><b>${esc(c.name)}</b><span class="small muted">${n} riding day${n === 1 ? '' : 's'} · “${esc(c.phrases[c.phrases.length > 1 ? 1 : 0].local.split(' (')[0])}”</span></div>`;
      }).join('')}</div>
      <h2>Places and stories</h2>
      <div class="chips" style="flex-wrap:wrap"><button class="chip" data-cat="" aria-pressed="${!exploreCat}">All</button>${cats.map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${exploreCat === c}">${CAT[c] ? CAT[c][0] : ''} ${esc(c)}</button>`).join('')}</div>
      ${list.map((p) => { const s = story(p.name) || p.note; return `<div class="card tap" data-place="${esc(p.name)}"><div class="row between"><b>${(CAT[p.cat] || ['📍'])[0]} ${esc(short(p.name))}</b><span class="small muted">${FLAG[p.country.split('/')[0].trim()] || ''} day ${p.day}</span></div><p class="small">${esc(s.length > 150 ? s.slice(0, 150) + '…' : s)}</p></div>`; }).join('')}`;
  }
  function countryPage({ country }) {
    const c = K.COUNTRIES.find((x) => x.name === country);
    const ds = DAYS.filter((d) => d.countries.includes(country));
    const speak = 'speechSynthesis' in window;
    return `<div class="detail-head"><button class="back" data-act="back">‹ Back</button></div>
      <div style="text-align:center"><div style="font-size:72px;line-height:1.1">${c.flag}</div><h1>${esc(c.name)}</h1><p class="muted small">Capital: ${esc(c.capital)}</p></div>
      <div class="card"><div class="eyebrow">Money</div><p>${esc(c.money)}</p><div class="eyebrow">Language</div><p>${esc(c.language)}</p></div>
      <div class="card"><h3>Say it like a local</h3><div>${c.phrases.map((p) => `<div class="phr"><span class="small muted">${esc(p.en)}</span><span><b>${esc(p.local)}</b>${p.say ? `<br><i class="small muted">${esc(p.say)}</i>` : ''}</span>${speak ? `<button class="speak" data-say="${esc(p.local.split(' (')[0].split(' / ')[0])}" data-lang="${LANG[c.name]}" aria-label="Hear it">🔊</button>` : '<span></span>'}</div>`).join('')}</div></div>
      <div class="card"><h3>Must eat</h3>${c.eat.map((e) => `<p>• ${esc(e)}</p>`).join('')}</div>
      <div class="card"><h3>A little history</h3><p>${esc(c.history)}</p></div>
      <div class="card"><h3>Fun facts</h3>${c.facts.map((f) => `<p>• ${esc(f)}</p>`).join('')}</div>
      <div class="card"><h3>Our days here</h3>${ds.map((d) => `<div class="day-row" data-go-day="${d.day}" role="button" tabindex="0"><span class="dot" style="background:${WEEK_COLORS[d.week]}">${d.day}</span><div class="t"><div>${esc(short(d.start))} → ${esc(short(d.end))}</div><div class="small muted">${esc(d.date)}</div></div></div>`).join('')}</div>`;
  }
  function placePage({ place }) {
    const p = HL.find((h) => h.name === place);
    const s = story(p.name);
    return `<div class="detail-head"><button class="back" data-act="back">‹ Back</button></div>
      <div style="text-align:center"><div style="font-size:60px">${(CAT[p.cat] || ['📍'])[0]}</div><h1>${esc(short(p.name))}</h1>
      <p class="muted small">${esc(p.cat)} · ${FLAG[p.country.split('/')[0].trim()] || ''} ${esc(p.country)}</p></div>
      <div class="card"><p style="font-family:var(--f-display);font-size:18px">${esc(s || p.note)}</p>${s && p.note && !s.includes(p.note) ? `<p class="small muted">Note: ${esc(p.note)}</p>` : ''}</div>
      <div class="links"><a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank" rel="noopener"><b>Open in Maps</b><span>${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</span></a>
        <a href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(short(p.name))}" target="_blank" rel="noopener"><b>Wikipedia</b><span>read more</span></a></div>
      <button class="btn" data-go-day="${p.day}">We pass here on day ${p.day}</button>`;
  }

  // ---------------------------------------------------------------- quiz
  let Q = null;
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  function quizPage() {
    if (!Q) Q = { qs: shuffle(K.QUIZ), i: 0, score: 0, picked: null };
    const head = `<div class="detail-head"><button class="back" data-act="back">‹ Back</button></div>`;
    if (Q.i >= Q.qs.length) {
      const sc = Q.score, msg = sc >= 18 ? 'Trip legends.' : sc >= 13 ? 'Ready to ride.' : sc >= 8 ? 'Getting there.' : 'Time to read the Explore tab.';
      return `${head}<div class="card" style="align-items:center;text-align:center"><div class="eyebrow">Final score</div><div class="num" style="font-size:56px;font-weight:700;color:var(--signal)">${sc}/20</div><h2>${msg}</h2><p class="small muted">Best: ${Math.max(sc, S.quizBest)}/20</p><button class="btn" data-act="quiz-again">Play again</button></div>`;
    }
    const q = Q.qs[Q.i];
    return `${head}<div class="eyebrow">Question ${Q.i + 1} of 20 · score <span class="num">${Q.score}</span></div>
      <div class="bar"><i style="width:${(Q.i / 20) * 100}%;background:var(--signal)"></i></div>
      <div class="card"><h2>${esc(q.q)}</h2>${q.options.map((o, k) => {
        const cls = Q.picked === null ? '' : k === q.answer ? 'right' : Q.picked === k ? 'wrong' : '';
        return `<button class="opt ${cls}" data-opt="${k}">${esc(o)}</button>`;
      }).join('')}</div>
      ${Q.picked !== null ? `<div class="card"><p><b>${Q.picked === q.answer ? 'Correct.' : 'Not quite.'}</b> ${esc(q.why)}</p><button class="btn" data-act="quiz-next">${Q.i + 1 >= 20 ? 'See score' : 'Next question'}</button></div>` : ''}`;
  }

  // ---------------------------------------------------------------- toolkit
  let kitTab = 'pack';
  function kitPage() {
    const sub = { pack: packHtml, money: moneyHtml, sos: sosHtml, backup: backupHtml }[kitTab]();
    return `<h1>Toolkit</h1>
      <div class="chips"><button class="chip" data-kit="pack" aria-pressed="${kitTab === 'pack'}">Packing</button><button class="chip" data-kit="money" aria-pressed="${kitTab === 'money'}">Money split</button>
      <button class="chip" data-kit="sos" aria-pressed="${kitTab === 'sos'}">Emergency</button><button class="chip" data-kit="backup" aria-pressed="${kitTab === 'backup'}">Backup & sync</button></div>${sub}`;
  }
  function packHtml() {
    const groups = [...K.PACKING, { group: 'Our extras', items: S.extra }];
    const all = groups.flatMap((g) => g.items);
    const ini = S.names.map((n) => (n || '?').slice(0, 1).toUpperCase());
    const cnt = (w) => all.filter((i) => (S.packed[i] || [])[w]).length;
    return `<div class="card"><div class="grid2"><div class="stat"><b>${cnt(0)}/${all.length}</b><span>${esc(S.names[0])} packed</span></div><div class="stat"><b>${cnt(1)}/${all.length}</b><span>${esc(S.names[1])} packed</span></div></div>
      <p class="small muted">Tap your letter when you've packed it. Shared gear only needs one tick.</p></div>
      ${groups.filter((g) => g.items.length).map((g) => `<div class="card"><h3>${esc(g.group)}</h3><div>${g.items.map((it) => {
        const p = S.packed[it] || [false, false];
        return `<div class="pk ${p[0] || p[1] ? 'done' : ''}"><span>${esc(it)}</span>
          ${[0, 1].map((w) => `<button class="who" data-pack="${esc(it)}" data-w="${w}" aria-pressed="${!!p[w]}" style="border-color:${w ? 'var(--sea)' : 'var(--signal)'};${p[w] ? `background:${w ? 'var(--sea)' : 'var(--signal)'};color:#fff` : `color:${w ? 'var(--sea)' : 'var(--signal)'}`}">${ini[w]}</button>`).join('')}
          ${g.group === 'Our extras' ? `<button class="chip" data-unextra="${esc(it)}" aria-label="Remove">✕</button>` : ''}</div>`;
      }).join('')}</div></div>`).join('')}
      <form class="card" id="extraForm"><h3>Add something</h3><input type="text" id="extraIn" placeholder="Playing cards, knitting project..."><button class="btn" type="submit">Add to the list</button></form>`;
  }
  function moneyHtml() {
    const R = S.rates, toEur = (e) => e.amount / (R[e.cur] || 1);
    const paid = [0, 0]; S.expenses.forEach((e) => { paid[e.who] += toEur(e); });
    const total = paid[0] + paid[1], half = total / 2, diff = paid[0] - half;
    const owe = Math.abs(diff) < 0.5 ? 'You are even.' : diff > 0 ? `${esc(S.names[1])} owes ${esc(S.names[0])} €${Math.abs(diff).toFixed(2)}` : `${esc(S.names[0])} owes ${esc(S.names[1])} €${Math.abs(diff).toFixed(2)}`;
    const daysIn = Math.max(1, Math.min(74, Math.round((new Date() - START) / 864e5) + 1));
    return `<div class="card"><div class="grid3"><div class="stat"><b>€${fmt(Math.round(total))}</b><span>spent together</span></div>
        <div class="stat"><b>€${fmt(Math.round(paid[0]))}</b><span>${esc(S.names[0])} paid</span></div><div class="stat"><b>€${fmt(Math.round(paid[1]))}</b><span>${esc(S.names[1])} paid</span></div></div>
        <p style="text-align:center;font-weight:700">${owe}</p>${status().phase === 'during' ? `<p class="small muted" style="text-align:center">About €${Math.round(total / daysIn)} a day so far</p>` : ''}</div>
      <form class="card" id="expForm"><h3>Add an expense</h3>
        <label class="field" for="exWhat">What<input type="text" id="exWhat" placeholder="Burek and coffee" required></label>
        <div class="grid2"><label class="field" for="exAmt">Amount<input type="number" id="exAmt" inputmode="decimal" step="0.01" min="0" required></label>
        <label class="field" for="exCur">Currency<select id="exCur">${Object.keys(R).map((c) => `<option ${c === 'EUR' ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
        <label class="field" for="exWho">Paid by<select id="exWho"><option value="0">${esc(S.names[0])}</option><option value="1">${esc(S.names[1])}</option></select></label>
        <button class="btn" type="submit">Add</button></form>
      ${S.expenses.length ? `<div class="card"><h3>Spending log</h3>${S.expenses.slice().reverse().map((e) => `<div class="pk"><span>${esc(e.what)}<br><small class="muted">${esc(e.date)} · ${esc(S.names[e.who])}</small></span><b class="num">${e.amount.toFixed(2)} ${e.cur}</b><button class="chip" data-unexp="${e.id}" aria-label="Delete">✕</button></div>`).join('')}</div>` : ''}
      <div class="card"><h3>Exchange rates</h3><p class="small muted">Units per €1. These are rough guesses; update them before you go.</p>
        <div class="grid2">${Object.keys(R).filter((c) => c !== 'EUR').map((c) => `<label class="field" for="rate${c}">${c}<input type="number" step="0.01" id="rate${c}" data-rate="${c}" value="${R[c]}"></label>`).join('')}</div></div>`;
  }
  function sosHtml() {
    return `<div class="card" style="border-color:var(--signal);border-width:2px"><div class="eyebrow">Emergency, every country on the route</div>
        <div class="row between"><span style="font:700 44px var(--f-mono)">112</span><a class="btn" href="tel:112">Call 112</a></div>
        <p class="small">Police, ambulance and fire. Works from any phone, even without a local SIM.</p></div>
      <div class="card"><h3>Canadians abroad</h3><p>Global Affairs Canada Emergency Watch and Response Centre, 24/7:</p>
        <div class="row between"><b class="num">+1 613 996 8885</b><a class="btn small" href="tel:+16139968885">Call</a></div>
        <a href="https://travel.gc.ca/assistance/emergency-info/consular" target="_blank" rel="noopener">Consular help</a></div>
      <div class="card"><h3>Our emergency notes</h3><p class="small muted">Insurance policy, blood types, allergies, who to call at home. Saved on this phone only.</p>
        <textarea id="sosNotes" placeholder="Insurance: ...&#10;Policy #: ...&#10;Emergency contact: ...">${esc(S.sosNotes)}</textarea></div>
      <div class="card"><h3>Heat and remote days</h3><p class="small">July in Albania and Greece regularly hits the mid-30s °C. Start at sunrise, carry 3 litres each through Kurvelesh, the Gramoz mountains and the Drin valley, and rest from 1 to 4 pm.</p></div>`;
  }
  function backupHtml() {
    return `<div class="card"><h3>Copy everything to the other phone</h3>
        <p class="small">Each phone keeps its own copy. Export here, send the file to the other phone (AirDrop, Messages), then import it there. Imports merge: nothing gets deleted.</p>
        <label class="field" for="incPhotos"><span><input type="checkbox" id="incPhotos"> Include photos (bigger file)</span></label>
        <button class="btn" data-act="export">Export our trip</button>
        <label class="btn ghost" for="importFile" style="cursor:pointer">Import from the other phone</label><input type="file" id="importFile" accept="application/json,.json" hidden></div>
      <div class="card"><h3>Offline maps</h3><p class="small">Map tiles you've looked at are saved for offline use. Before you leave, open the map on Wi-Fi and zoom through each week once. The route, stops and all the stories always work offline.</p></div>`;
  }
  function settingsPage() {
    return `<div class="detail-head"><button class="back" data-act="back">‹ Back</button></div><h1>Settings</h1>
      <form class="card" id="setForm"><h3>Riders</h3>
        <label class="field" for="s1">Rider one<input type="text" id="s1" value="${esc(S.names[0])}"></label>
        <label class="field" for="s2">Rider two<input type="text" id="s2" value="${esc(S.names[1])}"></label>
        <label class="field" for="sTheme">Look<select id="sTheme"><option value="auto" ${S.theme === 'auto' ? 'selected' : ''}>Match my phone</option><option value="light" ${S.theme === 'light' ? 'selected' : ''}>Paper (light)</option><option value="dark" ${S.theme === 'dark' ? 'selected' : ''}>Night (dark)</option></select></label>
        <button class="btn" type="submit">Save</button></form>
      <div class="card"><h3>Start over</h3><p class="small muted">Un-ticks ridden days and packing. Journals and photos stay.</p>
        <button class="btn ghost" data-act="reset-ask">Reset progress</button><div id="resetConfirm"></div></div>`;
  }

  // ---------------------------------------------------------------- export / import
  async function exportTrip() {
    const data = { app: 'ourtrip', v: 1, at: new Date().toISOString(), state: S, photos: [] };
    if ($('#incPhotos') && $('#incPhotos').checked) {
      for (const d of DAYS) {
        for (const p of await photosFor(d.day)) {
          data.photos.push({ day: p.day, at: p.at, data: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(p.blob); }) });
        }
      }
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `our-trip-${isoOf(new Date())}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Our trip backup' }); return; } catch (e) { /* fall back */ }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('Backup saved');
  }
  async function importTrip(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'ourtrip') throw new Error('not ours');
      const o = data.state || {};
      S.ridden = [...new Set([...(S.ridden || []), ...(o.ridden || [])])];
      Object.entries(o.journal || {}).forEach(([k, v]) => {
        const mine = S.journal[k];
        if (!mine || !mine.text) S.journal[k] = v;
        else if (v.text && !mine.text.includes(v.text)) S.journal[k] = { ...mine, text: `${mine.text}\n\n${v.text}`, mood: mine.mood || v.mood };
      });
      Object.entries(o.packed || {}).forEach(([k, v]) => { const m = S.packed[k] || [false, false]; S.packed[k] = [m[0] || v[0], m[1] || v[1]]; });
      S.extra = [...new Set([...(S.extra || []), ...(o.extra || [])])];
      const ids = new Set(S.expenses.map((e) => e.id)); (o.expenses || []).forEach((e) => { if (!ids.has(e.id)) S.expenses.push(e); });
      S.quizBest = Math.max(S.quizBest, o.quizBest || 0);
      if (!S.sosNotes && o.sosNotes) S.sosNotes = o.sosNotes;
      for (const p of data.photos || []) { const b = await (await fetch(p.data)).blob(); await addPhotoBlob(p.day, b); }
      save(); render(); toast('Imported and merged');
    } catch (e) { toast("That file isn't an Our Trip backup"); }
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-push],[data-go-day],[data-country],[data-place],[data-act],[data-week],[data-opt],[data-kit],[data-pack],[data-unextra],[data-unexp],[data-mood],[data-cat],[data-say],[data-map-day]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.tab) { if (tab === 'map') rememberView(); return go(ds.tab); }
    if (ds.push) { if (ds.push === 'quiz') Q = null; return push({ name: ds.push }); }
    if (ds.goDay) { if (tab === 'map' && !stack.length) rememberView(); if (stack.length && stack[stack.length - 1].name === 'day') stack.pop(); return push({ name: 'day', day: +ds.goDay }); }
    if (ds.country) return push({ name: 'country', country: ds.country });
    if (ds.place) { if (tab === 'map' && !stack.length) rememberView(); return push({ name: 'place', place: ds.place }); }
    if (ds.mapDay) { const d = day(+ds.mapDay); mapState.week = d.week; mapState.sel = d.day; mapState.place = null; mapState.view = null; stack.length = 0; tab = 'map'; render(); mapInst.fitBounds(boundsOf([d]), false, 40); return; }
    if (ds.week !== undefined) { return setWeek(ds.week ? +ds.week : null); }
    if (ds.cat !== undefined) { exploreCat = ds.cat || null; return render(); }
    if (ds.kit) { kitTab = ds.kit; return render(); }
    if (ds.opt !== undefined) { if (Q.picked === null) { Q.picked = +ds.opt; if (Q.picked === Q.qs[Q.i].answer) Q.score++; render(); } return; }
    if (ds.pack) { const w = +ds.w, cur = S.packed[ds.pack] || [false, false]; cur[w] = !cur[w]; S.packed[ds.pack] = cur; save(); return render(); }
    if (ds.unextra) { S.extra = S.extra.filter((x) => x !== ds.unextra); save(); return render(); }
    if (ds.unexp) { S.expenses = S.expenses.filter((x) => String(x.id) !== ds.unexp); save(); return render(); }
    if (ds.mood) { const n = stack[stack.length - 1].day; S.journal[n] = { ...(S.journal[n] || {}), mood: ds.mood }; save(); document.querySelectorAll('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mood === ds.mood)); return; }
    if (ds.say) { try { const u = new SpeechSynthesisUtterance(ds.say); u.lang = ds.lang; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (err) { /* no voice */ } return; }
    switch (ds.act) {
      case 'back': return back();
      case 'fact': { const f = allFacts(); $('#fact').textContent = f[Math.floor(Math.random() * f.length)]; return; }
      case 'share-fact': { const msg = $('#fact').textContent + '\n\nfrom our Munich → Athens bike trip'; if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(msg).then(() => toast('Copied'), () => {}); } return; }
      case 'toggle-done': { const n = stack[stack.length - 1].day; S.ridden = S.ridden.includes(n) ? S.ridden.filter((x) => x !== n) : [...S.ridden, n]; save(); render(); if (S.ridden.includes(n)) toast(`Day ${n} done!`); return; }
      case 'share-day': { const d = day(stack[stack.length - 1].day); const msg = `Day ${d.day} of our Munich → Athens ride: ${short(d.start)} to ${short(d.end)}, ${d.km} km and ${fmt(d.up)} m of climbing.${$('#jt').value ? '\n\n' + $('#jt').value : ''}`; if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else navigator.clipboard && navigator.clipboard.writeText(msg).then(() => toast('Copied'), () => {}); return; }
      case 'quiz-next': { if (Q.i + 1 >= Q.qs.length && Q.score > S.quizBest) { S.quizBest = Q.score; save(); } Q.i++; Q.picked = null; return render(); }
      case 'quiz-again': Q = null; return render();
      case 'close-sheet': mapState.sel = null; mapState.place = null; return refreshSheet();
      case 'style': S.mapStyle = S.mapStyle === 'terrain' ? 'clean' : 'terrain'; save(); rememberView(); view.innerHTML = mapView(); mountMap(); toast(S.mapStyle === 'terrain' ? 'Terrain map' : 'Clean map'); return;
      case 'sights': mapState.sights = !mapState.sights; t.textContent = mapState.sights ? '✨' : '·'; t.setAttribute('aria-pressed', mapState.sights); mapInst.draw(); return;
      case 'fit': mapState.sel = null; mapState.place = null; refreshSheet(); mapInst.fitBounds(boundsOf(mapState.week ? DAYS.filter((d) => d.week === mapState.week) : DAYS), true, 24); return;
      case 'locate':
        if (!navigator.geolocation) return toast('Location is not available');
        navigator.geolocation.getCurrentPosition((p) => { mapState.me = { lat: p.coords.latitude, lon: p.coords.longitude }; if (mapInst) mapInst.centerOn(mapState.me.lat, mapState.me.lon, Math.max(mapInst.z, 10)); },
          () => toast('Allow location to see where you are'), { enableHighAccuracy: true, timeout: 10000 });
        return;
      case 'export': return exportTrip();
      case 'reset-ask': $('#resetConfirm').innerHTML = '<div class="row"><button class="btn small" data-act="reset-yes">Yes, reset</button><button class="btn small ghost" data-act="reset-no">Keep it</button></div>'; return;
      case 'reset-yes': S.ridden = []; S.packed = {}; save(); toast('Progress reset'); return back();
      case 'reset-no': $('#resetConfirm').innerHTML = ''; return;
      default:
    }
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('dblclick', async (e) => { const img = e.target.closest('[data-photo]'); if (img) { await delPhoto(+img.dataset.photo); hydrateDay(stack[stack.length - 1].day); toast('Photo removed'); } });
  let pressT = null;
  document.addEventListener('pointerdown', (e) => { const img = e.target.closest('[data-photo]'); if (!img) return; pressT = setTimeout(async () => { await delPhoto(+img.dataset.photo); hydrateDay(stack[stack.length - 1].day); toast('Photo removed'); }, 700); });
  ['pointerup', 'pointercancel', 'pointermove'].forEach((ev) => document.addEventListener(ev, () => { clearTimeout(pressT); }));

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'nameForm' || f.id === 'setForm') {
      const a = (f.id === 'nameForm' ? $('#n1') : $('#s1')).value.trim(), b = (f.id === 'nameForm' ? $('#n2') : $('#s2')).value.trim();
      if (!a || !b) { toast('Add both names'); return; }
      S.names = [a, b];
      if (f.id === 'setForm') { S.theme = $('#sTheme').value; applyTheme(); }
      save();
      if (f.id === 'setForm') { toast('Saved'); back(); } else render();
    }
    if (f.id === 'extraForm') { const v = $('#extraIn').value.trim(); if (v && !S.extra.includes(v)) { S.extra.push(v); save(); } render(); }
    if (f.id === 'expForm') {
      const amt = parseFloat($('#exAmt').value);
      if (!(amt > 0)) return;
      S.expenses.push({ id: Date.now(), what: $('#exWhat').value.trim() || 'Something', amount: amt, cur: $('#exCur').value, who: +$('#exWho').value, date: new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) });
      save(); render(); toast('Added');
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'jt') { const n = stack[stack.length - 1].day; S.journal[n] = { ...(S.journal[n] || {}), text: e.target.value }; save(); }
    if (e.target.id === 'sosNotes') { S.sosNotes = e.target.value; save(); }
    if (e.target.dataset.rate) { const v = parseFloat(e.target.value); if (v > 0) { S.rates[e.target.dataset.rate] = v; save(); } }
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'pf') {
      const n = stack[stack.length - 1].day;
      for (const file of e.target.files) await addPhotoBlob(n, await shrink(file));
      e.target.value = ''; hydrateDay(n); toast('Photos added');
    }
    if (e.target.id === 'importFile' && e.target.files[0]) importTrip(e.target.files[0]);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (mapInst) mapInst.draw(); });

  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
