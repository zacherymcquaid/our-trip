/* Tiny canvas slippy map: tiles + route + markers, with pan / pinch / wheel / tap. No libraries. */
(function () {
  const TS = 256;
  const lonX = (lon) => (lon + 180) / 360;
  const latY = (lat) => {
    const r = (lat * Math.PI) / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  };
  const xLon = (x) => x * 360 - 180;
  const yLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

  const PROVIDERS = {
    terrain: {
      url: (z, x, y, i) => `https://${'abc'[i % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`, max: 17,
      attrib: 'Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM · style © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
    },
    clean: {
      url: (z, x, y, i, r) => `https://${'abcd'[i % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}${r ? '@2x' : ''}.png`, max: 19,
      attrib: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    },
  };

  class TripMap {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = opts; // { getLayers(), onTap(hit), style, tint() }
      this.cx = 0.55; this.cy = 0.36; this.z = 5;
      this.tiles = new Map();
      this.ptrs = new Map();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.style = opts.style || 'terrain';
      this.raf = 0;
      this.anim = null;
      this.resize = this.resize.bind(this);
      this.ro = new ResizeObserver(this.resize);
      this.ro.observe(canvas);
      this.bind();
      this.resize();
    }
    destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); this.dead = true; }
    get W0() { return TS * Math.pow(2, this.z); }
    resize() {
      const r = this.c.getBoundingClientRect();
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * this.dpr); this.c.height = Math.round(this.h * this.dpr);
      this.draw();
    }
    toScreen(xn, yn) { const W = this.W0; return [(xn - this.cx) * W + this.w / 2, (yn - this.cy) * W + this.h / 2]; }
    toWorld(sx, sy) { const W = this.W0; return [(sx - this.w / 2) / W + this.cx, (sy - this.h / 2) / W + this.cy]; }
    clampZ(z) { return Math.max(3, Math.min(PROVIDERS[this.style].max, z)); }
    zoomAt(sx, sy, nz) {
      nz = this.clampZ(nz);
      const [wx, wy] = this.toWorld(sx, sy);
      this.z = nz;
      const W = this.W0;
      this.cx = wx - (sx - this.w / 2) / W;
      this.cy = wy - (sy - this.h / 2) / W;
      this.draw();
    }
    setStyle(s) { this.style = s; this.z = this.clampZ(this.z); this.draw(); }

    fitBounds(b, animate = true, pad = 40) {
      // b = [minLat, minLon, maxLat, maxLon]
      const x0 = lonX(b[1]), x1 = lonX(b[3]), y0 = latY(b[2]), y1 = latY(b[0]);
      const padTop = 110, padBot = 150;
      const zx = Math.log2((this.w - pad * 2) / (TS * Math.max(1e-6, x1 - x0)));
      const zy = Math.log2((this.h - padTop - padBot) / (TS * Math.max(1e-6, y1 - y0)));
      const tz = this.clampZ(Math.min(zx, zy, 13));
      const W = TS * Math.pow(2, tz);
      const tcx = (x0 + x1) / 2, tcy = (y0 + y1) / 2 + ((padBot - padTop) / 2) / W;
      if (!animate) { this.cx = tcx; this.cy = tcy; this.z = tz; this.draw(); return; }
      const s = { cx: this.cx, cy: this.cy, z: this.z }, t0 = performance.now(), dur = 700;
      this.anim = (now) => {
        let k = Math.min(1, (now - t0) / dur); k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        this.cx = s.cx + (tcx - s.cx) * k; this.cy = s.cy + (tcy - s.cy) * k; this.z = s.z + (tz - s.z) * k;
        if (k >= 1) this.anim = null;
      };
      this.draw();
    }
    centerOn(lat, lon, z) {
      const s = { cx: this.cx, cy: this.cy, z: this.z }, t0 = performance.now(), dur = 600;
      const tcx = lonX(lon), tcy = latY(lat), tz = this.clampZ(z || this.z);
      this.anim = (now) => {
        let k = Math.min(1, (now - t0) / dur); k = 1 - Math.pow(1 - k, 3);
        this.cx = s.cx + (tcx - s.cx) * k; this.cy = s.cy + (tcy - s.cy) * k; this.z = s.z + (tz - s.z) * k;
        if (k >= 1) this.anim = null;
      };
      this.draw();
    }

    tile(z, x, y) {
      const key = `${this.style}/${z}/${x}/${y}`;
      let t = this.tiles.get(key);
      if (!t) {
        const img = new Image();
        t = { img, ok: false, bad: false };
        img.onload = () => { t.ok = true; this.draw(); };
        img.onerror = () => { t.bad = true; };
        img.src = PROVIDERS[this.style].url(z, x, y, x + y, this.dpr > 1);
        this.tiles.set(key, t);
        if (this.tiles.size > 500) this.tiles.delete(this.tiles.keys().next().value);
      }
      return t;
    }
    peek(z, x, y) { return this.tiles.get(`${this.style}/${z}/${x}/${y}`); }

    draw() {
      if (this.raf || this.dead) return;
      this.raf = requestAnimationFrame((now) => {
        this.raf = 0;
        if (this.anim) { this.anim(now); if (this.anim) this.draw(); }
        this.render();
      });
    }

    render() {
      const ctx = this.ctx, d = this.dpr, w = this.w, h = this.h;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const css = getComputedStyle(document.documentElement);
      ctx.fillStyle = css.getPropertyValue('--paper-2').trim() || '#E7DABD';
      ctx.fillRect(0, 0, w, h);

      // tiles
      const P = PROVIDERS[this.style];
      const tz = Math.max(0, Math.min(P.max, Math.round(this.z)));
      const n = Math.pow(2, tz), W = this.W0, size = W / n;
      const [lx, ty] = this.toWorld(0, 0), [rx, by] = this.toWorld(w, h);
      const x0 = Math.floor(lx * n), x1 = Math.floor(rx * n), y0 = Math.max(0, Math.floor(ty * n)), y1 = Math.min(n - 1, Math.floor(by * n));
      ctx.imageSmoothingQuality = 'high';
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const xx = ((x % n) + n) % n;
          const [sx, sy] = this.toScreen(x / n, y / n);
          const t = this.tile(tz, xx, y);
          if (t.ok) { ctx.drawImage(t.img, sx, sy, size + 0.5, size + 0.5); continue; }
          for (let k = 1; k <= 4 && tz - k >= 0; k++) { // parent fallback
            const p = this.peek(tz - k, xx >> k, y >> k);
            if (p && p.ok) {
              const sub = TS / Math.pow(2, k), m = Math.pow(2, k) - 1;
              ctx.drawImage(p.img, (xx & m) * sub, (y & m) * sub, sub, sub, sx, sy, size + 0.5, size + 0.5);
              break;
            }
          }
        }
      }
      // vintage paper wash
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = (this.o.tint && this.o.tint()) || 'rgba(236,220,185,.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';

      const L = this.o.getLayers();
      this.hits = [];
      // ferries
      ctx.setLineDash([6, 6]); ctx.lineWidth = 2.2; ctx.strokeStyle = L.seaColor;
      L.ferries.forEach((f) => { ctx.beginPath(); f.pts.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke(); });
      ctx.setLineDash([]);
      // routes
      const lw = this.z < 6 ? 3 : this.z < 9 ? 4.5 : 6;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const drawDay = (dd, color, width, casing) => {
        dd.segs.forEach((seg) => {
          ctx.beginPath();
          seg.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
          if (casing) { ctx.strokeStyle = casing; ctx.lineWidth = width + 4; ctx.stroke(); }
          ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        });
      };
      L.days.forEach((dd) => { if (dd.day !== L.selected) drawDay(dd, dd.color, lw, L.casing); });
      const sel = L.days.find((dd) => dd.day === L.selected);
      if (sel) drawDay(sel, '#F2B630', lw + 3, '#1E2638');

      // week badges (zoomed out)
      if (this.z < 7.2) {
        L.weekBadges.forEach((b) => {
          const [sx, sy] = this.toScreen(b.x, b.y);
          ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fillStyle = b.color; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = '700 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(b.week), sx, sy + 0.5);
          this.hits.push({ kind: 'week', week: b.week, x: sx, y: sy, r: 14 });
        });
      }
      // overnights
      L.nights.forEach((nt) => {
        const [sx, sy] = this.toScreen(nt.x, nt.y);
        if (sx < -30 || sy < -30 || sx > w + 30 || sy > h + 30) return;
        if (nt.kind === 'Overnight') {
          if (this.z < 6.5) return;
          ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.fillStyle = L.ink; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
          if (this.z >= 8.5) {
            ctx.font = '700 11px "Atkinson Hyperlegible", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(nt.label, sx + 8, sy);
            ctx.fillStyle = '#1E2638'; ctx.fillText(nt.label, sx + 8, sy);
          }
        } else {
          ctx.font = `${nt.kind === 'Rest day (2 nights)' ? 18 : 24}px system-ui, "Apple Color Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(nt.kind === 'Start' ? '🚩' : nt.kind === 'Finish' ? '🏛️' : '⭐', sx, sy);
        }
        this.hits.push({ kind: 'night', day: nt.day, x: sx, y: sy, r: 14 });
      });
      // highlights
      if (L.showSights && this.z >= 6.3) {
        ctx.font = '19px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        L.sights.forEach((s) => {
          const [sx, sy] = this.toScreen(s.x, s.y);
          if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) return;
          ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = s.color; ctx.stroke();
          ctx.fillText(s.emoji, sx, sy + 1);
          this.hits.push({ kind: 'sight', name: s.name, x: sx, y: sy, r: 16 });
        });
      }
      // me
      if (L.me) {
        const [sx, sy] = this.toScreen(lonX(L.me.lon), latY(L.me.lat));
        ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fillStyle = 'rgba(43,106,138,.22)'; ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#2B6A8A'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
      this.routeHit = L.days;
    }

    hitTest(sx, sy) {
      let best = null, bd = 1e9;
      for (const h of this.hits || []) {
        const d = Math.hypot(h.x - sx, h.y - sy);
        if (d < h.r && d < bd) { best = h; bd = d; }
      }
      if (best) return best;
      // nearest route segment
      let bestDay = null; bd = 16;
      for (const dd of this.routeHit || []) {
        for (const seg of dd.segs) {
          let prev = null;
          for (const [x, y] of seg) {
            const p = this.toScreen(x, y);
            if (prev) {
              const vx = p[0] - prev[0], vy = p[1] - prev[1], L2 = vx * vx + vy * vy;
              let t = L2 ? ((sx - prev[0]) * vx + (sy - prev[1]) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
              const d = Math.hypot(sx - (prev[0] + t * vx), sy - (prev[1] + t * vy));
              if (d < bd) { bd = d; bestDay = dd.day; }
            }
            prev = p;
          }
        }
      }
      return bestDay ? { kind: 'day', day: bestDay } : null;
    }

    bind() {
      const c = this.c;
      let start = null, pinch = null, moved = false, lastTap = 0;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        this.ptrs.set(e.pointerId, pos(e));
        this.anim = null;
        if (this.ptrs.size === 1) { start = { p: pos(e), cx: this.cx, cy: this.cy }; moved = false; }
        if (this.ptrs.size === 2) {
          const [a, b] = [...this.ptrs.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.z, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
            world: this.toWorld((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
          moved = true;
        }
      });
      c.addEventListener('pointermove', (e) => {
        if (!this.ptrs.has(e.pointerId)) return;
        this.ptrs.set(e.pointerId, pos(e));
        if (this.ptrs.size >= 2 && pinch) {
          const [a, b] = [...this.ptrs.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          this.z = this.clampZ(pinch.z + Math.log2(d / pinch.d));
          const W = this.W0;
          this.cx = pinch.world[0] - (mid[0] - this.w / 2) / W;
          this.cy = pinch.world[1] - (mid[1] - this.h / 2) / W;
          this.draw();
        } else if (start) {
          const p = pos(e), dx = p[0] - start.p[0], dy = p[1] - start.p[1];
          if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
          if (moved) { const W = this.W0; this.cx = start.cx - dx / W; this.cy = start.cy - dy / W; this.draw(); c.style.cursor = 'grabbing'; }
        }
      });
      const end = (e) => {
        if (!this.ptrs.has(e.pointerId)) return;
        const p = pos(e);
        this.ptrs.delete(e.pointerId);
        c.style.cursor = 'grab';
        if (this.ptrs.size === 1) { // continue panning with remaining finger
          const q = [...this.ptrs.values()][0];
          start = { p: q, cx: this.cx, cy: this.cy }; pinch = null; return;
        }
        if (this.ptrs.size === 0) {
          pinch = null;
          if (!moved && e.type === 'pointerup') {
            const now = Date.now();
            if (now - lastTap < 300) { this.zoomAt(p[0], p[1], this.z + 1); lastTap = 0; return; }
            lastTap = now;
            const hit = this.hitTest(p[0], p[1]);
            this.o.onTap(hit);
          }
          start = null;
        }
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const p = pos(e);
        this.zoomAt(p[0], p[1], this.z - e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      }, { passive: false });
    }
  }

  window.TripMap = TripMap;
  window.TripMap.lonX = lonX; window.TripMap.latY = latY; window.TripMap.xLon = xLon; window.TripMap.yLat = yLat;
  window.TripMap.PROVIDERS = PROVIDERS;
})();
