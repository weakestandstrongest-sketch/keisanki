/* MATHSCAPE — ホログラム・ビュー (アイソメトリックの計算台座) */
window.MS = window.MS || {};
(function (MS) {
  'use strict';

  const TAU = Math.PI * 2;
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /** 角丸の正方形 (xz 平面) */
  function roundSquare(hs, r, seg = 6) {
    const pts = [];
    const c = hs - r;
    const corners = [[c, c, 0], [-c, c, Math.PI / 2], [-c, -c, Math.PI], [c, -c, Math.PI * 1.5]];
    for (const [cx, cz, a0] of corners) {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      }
    }
    return pts;
  }

  /** 結晶の形: 輪の列から多面体を作る */
  function crystalMesh(kind, seed) {
    const R = rng(seed);
    const sides = kind === 'prism' ? 6 : 7;
    const rings = kind === 'prism'
      ? [[0.2, 1], [0.74, 0.92]]
      : [[0.28, 0.95], [0.62, 0.85]];
    const verts = [[0, 0, 0]];
    const rot = R() * TAU;
    for (const [y, r] of rings) {
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * TAU + (kind === 'pebble' ? (R() - 0.5) * 0.4 : 0);
        const rr = r * (kind === 'pebble' ? 0.85 + R() * 0.3 : 1);
        verts.push([Math.cos(a) * rr, y + (kind === 'pebble' ? (R() - 0.5) * 0.08 : 0), Math.sin(a) * rr]);
      }
    }
    verts.push([(R() - 0.5) * 0.1, 1, (R() - 0.5) * 0.1]);
    const faces = [];
    const top = verts.length - 1;
    const ring = (k, i) => 1 + k * sides + ((i + sides) % sides);
    for (let i = 0; i < sides; i++) {
      faces.push([0, ring(0, i + 1), ring(0, i)]);
      faces.push([ring(0, i), ring(0, i + 1), ring(1, i + 1), ring(1, i)]);
      faces.push([ring(1, i), ring(1, i + 1), top]);
    }
    return { verts, faces };
  }

  const SLOTS = [
    [-0.62, -0.5], [0.02, -0.7], [0.62, -0.42], [-0.78, 0.1], [-0.12, -0.08],
    [0.5, 0.18], [-0.42, 0.55], [0.18, 0.58], [0.78, 0.66], [-0.02, 0.28], [0.32, -0.3], [-0.4, -0.25],
  ];
  const DEFAULTS = [100, 7, 12, 3.14, 365, 28, 0.5, 144, 17];

  class Holo {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts || {};
      this.yaw0 = Math.PI / 4;
      this.yaw = this.yaw0; this.yawT = this.yaw0;
      this.pitch = 0.58; this.pitchT = 0.58;
      this.t = 0;
      this.active = false;
      this.focus = 100;
      this.crystals = [];
      this.meshCache = new Map();
      this.build();
      this.panels = [
        { id: 'spectrum', c: [-1.62, 0.78, 0.5], w: [0, 0, -1], W: 1.3, H: 0.88, draw: (g, W, H) => this.drawSpectrum(g, W, H) },
        { id: 'residue', c: [-1.5, 1.08, -0.75], w: [0, 0, -1], W: 1.05, H: 0.74, draw: (g, W, H) => this.drawResidues(g, W, H) },
        { id: 'signal', c: [0.95, 0.88, -1.62], w: [1, 0, 0], W: 1.36, H: 0.86, draw: (g, W, H) => this.drawSignal(g, W, H) },
      ];
      for (const p of this.panels) {
        p.cv = document.createElement('canvas');
        p.cv.width = 420; p.cv.height = Math.round(420 * p.H / p.W);
      }
      this.bindInput();
      window.addEventListener('resize', () => this.active && this.resize());
    }

    /* ---------- 静的な形を準備 ---------- */
    build() {
      const R = rng(7);
      this.meshY = 0.52;
      const m = 0.9;
      this.nodes = [];
      for (let i = 0; i < 90; i++) this.nodes.push([(R() * 2 - 1) * m, (R() * 2 - 1) * m, R()]);
      this.edges = [];
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i], b = this.nodes[j];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (d < 0.34) this.edges.push([i, j, d]);
        }
      }
      // 長い対角線も少し
      for (let k = 0; k < 26; k++) {
        const i = Math.floor(R() * this.nodes.length), j = Math.floor(R() * this.nodes.length);
        if (i !== j) this.edges.push([i, j, 1]);
      }
      // 光の糸 (板から上へまっすぐ立ちのぼる)
      this.fibers = [];
      for (let i = 0; i < 170; i++) {
        // 中央ほど密に
        const a = R() * TAU, rr = Math.pow(R(), 1.6) * 0.82;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        this.fibers.push({
          x, z,
          h: 0.9 + R() * 1.5 * (1 - rr * 0.6),           // 高さ
          lean: [x * 0.12 + (R() - 0.5) * 0.08, z * 0.12 + (R() - 0.5) * 0.08], // わずかに外へ広がる
          wav: 0.015 + R() * 0.03, freq: 2 + R() * 3,
          hue: R() < 0.62 ? 280 + R() * 30 : 185 + R() * 15,
          ph: R(), sp: 0.18 + R() * 0.3, sw: R() * TAU,
        });
      }
      this.sparks = [];
      for (let i = 0; i < 160; i++) this.sparks.push([(R() * 2 - 1) * 1.3, 0.6 + R() * 2.2, (R() * 2 - 1) * 1.3, R()]);
      this.stars = [];
      for (let i = 0; i < 140; i++) this.stars.push([R(), R(), R() * 1.2 + 0.2, R()]);
      this.base = roundSquare(1.6, 0.14);
      this.l1 = roundSquare(1.08, 0.08);
      this.l2 = roundSquare(0.86, 0.06);
      this.frame = roundSquare(1.02, 0.06, 3);
      this.plate = roundSquare(0.92, 0.03, 2);
    }

    setActive(on) {
      this.active = on;
      this.c.hidden = !on;
      if (on) {
        this.resize();
        this._last = performance.now();
        const loop = (t) => {
          if (!this.active) return;
          const dt = Math.min(0.05, (t - this._last) / 1000);
          this._last = t;
          this.update(dt);
          this.draw();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    }

    setFocus(v) {
      if (!MS.isValid(v)) return;
      this.focus = MS.clean(v);
      this.panelTick = 0;
      if (this.opts.onFocus) this.opts.onFocus(this.focus);
    }

    setValues(values) {
      const vals = values.filter(MS.isValid).slice(0, SLOTS.length);
      const list = vals.length >= 9 ? vals : vals.concat(DEFAULTS.filter((d) => !vals.includes(d))).slice(0, 9);
      this.crystals = list.map((v, i) => {
        const prime = MS.isPrime(v);
        const kind = prime || (Number.isInteger(v) && Math.abs(v) >= 100) ? 'prism' : 'pebble';
        const size = 0.115 + Math.min(0.09, Math.log10(Math.abs(v) + 1) * 0.03);
        const h = kind === 'prism' ? size * (2.6 + (prime ? 0.8 : 0)) : size * 1.5;
        const key = kind + ':' + i;
        if (!this.meshCache.has(key)) this.meshCache.set(key, crystalMesh(kind, 11 + i * 31));
        return { v, kind, x: SLOTS[i][0], z: SLOTS[i][1], r: size, h, mesh: this.meshCache.get(key), i };
      });
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
      this.c.width = Math.round(this.w * this.dpr);
      this.c.height = Math.round(this.h * this.dpr);
      this.k = Math.min(this.w / 5.0, this.h / 3.85);
      this.ox = this.w / 2;
      this.oy = this.h * 0.63;
    }

    /* ---------- 投影 ---------- */
    proj(x, y, z) {
      const xr = x * this.cy - z * this.sy;
      const zr = x * this.sy + z * this.cy;
      return { x: this.ox + xr * this.k, y: this.oy - (y * this.cp - zr * this.sp) * this.k, d: zr * this.cp + y * this.sp };
    }
    viewNormal(nx, ny, nz) {
      const xr = nx * this.cy - nz * this.sy;
      const zr = nx * this.sy + nz * this.cy;
      return [xr, ny * this.cp - zr * this.sp, zr * this.cp + ny * this.sp];
    }

    /* ---------- 入力: ドラッグで回転、タップで結晶を選ぶ ---------- */
    bindInput() {
      let st = null;
      this.c.addEventListener('pointerdown', (e) => {
        this.c.setPointerCapture(e.pointerId);
        st = { x: e.clientX, y: e.clientY, yaw: this.yawT, pitch: this.pitchT, moved: false, id: e.pointerId };
        this.idle = 0;
      });
      this.c.addEventListener('pointermove', (e) => {
        if (!st || e.pointerId !== st.id) {
          const hit = this.hitCrystal(e);
          this.c.style.cursor = hit ? 'pointer' : 'grab';
          this.hover = hit;
          return;
        }
        const dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (Math.hypot(dx, dy) > 5) st.moved = true;
        this.yawT = Math.max(this.yaw0 - 0.55, Math.min(this.yaw0 + 0.55, st.yaw + dx * 0.005));
        this.pitchT = Math.max(0.3, Math.min(0.95, st.pitch + dy * 0.004));
        this.idle = 0;
      });
      const end = (e) => {
        if (!st || e.pointerId !== st.id) return;
        if (!st.moved) {
          const hit = this.hitCrystal(e);
          if (hit) { this.setFocus(hit.v); hit.pop = 1; }
        }
        st = null;
      };
      this.c.addEventListener('pointerup', end);
      this.c.addEventListener('pointercancel', () => { st = null; });
    }

    hitCrystal(e) {
      const r = this.c.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = Infinity;
      for (const c of this.crystals) {
        if (!c.sp) continue;
        const d = Math.hypot(x - c.sp.x, y - c.sp.y);
        if (d < Math.max(22, c.r * this.k * 1.3) && d < bd) { bd = d; best = c; }
      }
      return best;
    }

    update(dt) {
      this.t += dt;
      this.idle = (this.idle || 0) + dt;
      if (this.idle > 4) this.yawT += (this.yaw0 + Math.sin(this.t * 0.15) * 0.25 - this.yawT) * 0.01;
      this.yaw += (this.yawT - this.yaw) * 0.12;
      this.pitch += (this.pitchT - this.pitch) * 0.12;
      this.cy = Math.cos(this.yaw); this.sy = Math.sin(this.yaw);
      this.cp = Math.cos(this.pitch); this.sp = Math.sin(this.pitch);
      for (const s of this.sparks) { s[1] += dt * (0.12 + s[3] * 0.2); if (s[1] > 2.9) s[1] = 0.6; }
      for (const c of this.crystals) if (c.pop) c.pop = Math.max(0, c.pop - dt * 2);
    }

    /* ---------- 描画 ---------- */
    draw() {
      const g = this.ctx;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      const bgr = g.createRadialGradient(this.w / 2, this.h * 0.55, 10, this.w / 2, this.h * 0.55, Math.max(this.w, this.h) * 0.75);
      bgr.addColorStop(0, '#100b2c');
      bgr.addColorStop(0.55, '#05040f');
      bgr.addColorStop(1, '#010103');
      g.fillStyle = bgr;
      g.fillRect(0, 0, this.w, this.h);
      for (const [sx, sy, r, a] of this.stars) {
        g.fillStyle = `rgba(200,190,255,${0.15 + 0.5 * a * (0.6 + 0.4 * Math.sin(this.t * 1.3 + a * 20))})`;
        g.fillRect(sx * this.w, sy * this.h, r, r);
      }

      // パネル: 奥のものから
      const panels = this.panels.map((p) => ({ p, d: this.proj(...p.c).d })).sort((a, b) => a.d - b.d);
      const backPanels = panels.filter((x) => x.d < -0.4), frontPanels = panels.filter((x) => x.d >= -0.4);
      this.panelTick = (this.panelTick || 0) - 1;
      const redraw = this.panelTick <= 0;
      if (redraw) this.panelTick = 4;
      for (const { p } of backPanels) this.drawPanel(p, redraw);

      // 台座
      this.drawSlab(this.base, 0, 0.13, { top: ['#1c1946', '#0d0b26'], side: [22, 20, 58], edge: 'rgba(170,190,255,0.55)', glow: 'rgba(120,200,255,0.5)' });
      this.drawGuides();
      this.drawSlab(this.l1, 0.13, 0.21, { top: ['#221b58', '#110d34'], side: [30, 24, 80], edge: 'rgba(160,140,255,0.45)' });
      this.drawSlab(this.l2, 0.21, 0.27, { top: ['#2a1f6c', '#150f40'], side: [40, 30, 100], edge: 'rgba(180,160,255,0.5)' });
      this.drawFrame();
      this.drawPlate();

      // 結晶 (奥から)
      const cs = this.crystals.map((c) => ({ c, d: this.proj(c.x, this.meshY, c.z).d })).sort((a, b) => a.d - b.d);
      for (const { c } of cs) this.drawCrystal(c);

      this.drawFibers();
      this.drawSparks();
      for (const { p } of frontPanels) this.drawPanel(p, redraw);
      this.drawLabels(cs);
    }

    drawSlab(poly, y0, y1, st) {
      const g = this.ctx;
      const T = poly.map(([x, z]) => this.proj(x, y1, z));
      const B = poly.map(([x, z]) => this.proj(x, y0, z));
      const n = poly.length;
      // 側面
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [x1, z1] = poly[i], [x2, z2] = poly[j];
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        let nx = z2 - z1, nz = -(x2 - x1);
        if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
        const l = Math.hypot(nx, nz) || 1;
        const vn = this.viewNormal(nx / l, 0, nz / l);
        if (vn[2] <= 0) continue;
        const shade = 0.55 + 0.45 * Math.max(0, vn[0] * -0.5 + vn[2] * 0.8);
        const [r, gg, b] = st.side;
        g.fillStyle = `rgb(${r * shade | 0},${gg * shade | 0},${b * shade | 0})`;
        g.beginPath();
        g.moveTo(T[i].x, T[i].y); g.lineTo(T[j].x, T[j].y); g.lineTo(B[j].x, B[j].y); g.lineTo(B[i].x, B[i].y);
        g.closePath(); g.fill();
      }
      // 下の縁の光
      if (st.glow) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = st.glow; g.lineWidth = 1.4;
        g.beginPath();
        let drawing = false;
        for (let i = 0; i <= n; i++) {
          const k = i % n;
          const [x, z] = poly[k];
          const vn = this.viewNormal(x, 0, z);
          if (vn[2] > -0.05) { if (!drawing) { g.moveTo(B[k].x, B[k].y); drawing = true; } else g.lineTo(B[k].x, B[k].y); }
          else drawing = false;
        }
        g.stroke();
        g.restore();
      }
      // 上面
      let minY = Infinity, maxY = -Infinity;
      for (const p of T) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      const tg = g.createLinearGradient(0, minY, 0, maxY);
      tg.addColorStop(0, st.top[1]); tg.addColorStop(1, st.top[0]);
      g.fillStyle = tg;
      g.beginPath();
      T.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath(); g.fill();
      g.strokeStyle = st.edge; g.lineWidth = 1;
      g.stroke();
    }

    /** 台座の上の細い目盛りと溝 */
    drawGuides() {
      const g = this.ctx;
      const y = 0.131;
      g.save();
      g.strokeStyle = 'rgba(150,160,255,0.22)';
      g.lineWidth = 1;
      const sq = roundSquare(1.3, 0.1, 3);
      g.beginPath();
      sq.forEach(([x, z], i) => { const p = this.proj(x, y, z); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
      g.closePath(); g.stroke();
      // 縁の小さな溝 (各辺に 1 本)
      g.fillStyle = 'rgba(8,6,24,0.85)';
      for (const [cx, cz, ax, az] of [[0, 1.45, 1, 0], [1.45, 0, 0, 1], [0, -1.45, 1, 0], [-1.45, 0, 0, 1]]) {
        const p = [[-0.32, -0.05], [0.32, -0.05], [0.32, 0.05], [-0.32, 0.05]].map(([u, v]) =>
          this.proj(cx + ax * u + az * v, y, cz + az * u + ax * v));
        g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill();
      }
      // 目盛り
      g.fillStyle = 'rgba(170,180,255,0.35)';
      for (let i = 0; i < 9; i++) {
        const u = -1.0 + i * 0.07;
        const p = this.proj(1.38, y, u), q = this.proj(-u, y, 1.38);
        g.fillRect(p.x, p.y, 3, 1); g.fillRect(q.x, q.y, 3, 1);
      }
      g.restore();
    }

    drawFrame() {
      const g = this.ctx;
      const y = 0.36 + Math.sin(this.t * 0.8) * 0.006;
      const P = this.frame.map(([x, z]) => this.proj(x, y, z));
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const [w, a] of [[9, 0.08], [4, 0.22], [1.6, 0.95]]) {
        g.strokeStyle = a > 0.5 ? 'rgba(235,240,255,0.95)' : `rgba(140,190,255,${a})`;
        g.lineWidth = w;
        g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke();
      }
      g.restore();
    }

    drawPlate() {
      const g = this.ctx;
      const y = this.meshY;
      const P = this.plate.map(([x, z]) => this.proj(x, y, z));
      g.save();
      const c = this.proj(0, y, 0);
      const rg = g.createRadialGradient(c.x, c.y, 4, c.x, c.y, this.k * 1.3);
      rg.addColorStop(0, 'rgba(220,170,255,0.42)');
      rg.addColorStop(0.6, 'rgba(160,110,255,0.26)');
      rg.addColorStop(1, 'rgba(120,180,255,0.16)');
      g.fillStyle = rg;
      g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(230,210,255,0.75)'; g.lineWidth = 1.2; g.stroke();

      // ネットワーク
      g.globalCompositeOperation = 'lighter';
      const N = this.nodes.map(([x, z]) => this.proj(x, y + 0.002, z));
      g.lineWidth = 0.7;
      for (const [i, j, d] of this.edges) {
        const a = this.nodes[i][2], hue = a < 0.5 ? 285 : 195;
        g.strokeStyle = `hsla(${hue},100%,78%,${d > 0.5 ? 0.18 : 0.32})`;
        g.beginPath(); g.moveTo(N[i].x, N[i].y); g.lineTo(N[j].x, N[j].y); g.stroke();
      }
      for (let i = 0; i < N.length; i++) {
        const tw = 0.5 + 0.5 * Math.sin(this.t * 2 + this.nodes[i][2] * 30);
        g.fillStyle = this.nodes[i][2] < 0.35 ? `rgba(120,255,255,${0.4 + tw * 0.6})` : `rgba(230,200,255,${0.25 + tw * 0.4})`;
        g.beginPath(); g.arc(N[i].x, N[i].y, this.nodes[i][2] < 0.35 ? 1.6 : 1.1, 0, TAU); g.fill();
      }
      g.restore();
    }

    drawCrystal(c) {
      const g = this.ctx;
      const bob = Math.sin(this.t * 1.1 + c.i * 1.7) * 0.012 + (c.pop || 0) * 0.05;
      const spin = this.t * 0.25 + c.i;
      const cs = Math.cos(spin), sn = Math.sin(spin);
      const baseY = this.meshY + 0.01 + bob;
      const focus = c.v === this.focus;
      // 足元の光
      const foot = this.proj(c.x, this.meshY, c.z);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const fr = c.r * this.k * (focus ? 2.4 : 1.6);
      const fg = g.createRadialGradient(foot.x, foot.y, 1, foot.x, foot.y, fr);
      fg.addColorStop(0, focus ? 'rgba(120,255,255,0.55)' : 'rgba(220,180,255,0.35)');
      fg.addColorStop(1, 'rgba(160,120,255,0)');
      g.fillStyle = fg;
      g.beginPath(); g.ellipse(foot.x, foot.y, fr, fr * this.sp, 0, 0, TAU); g.fill();
      g.restore();

      const W = c.mesh.verts.map(([x, y, z]) => {
        const rx = x * cs - z * sn, rz = x * sn + z * cs;
        return [c.x + rx * c.r, baseY + y * c.h, c.z + rz * c.r];
      });
      const S = W.map((v) => this.proj(...v));
      const faces = c.mesh.faces.map((f) => {
        const a = W[f[0]], b = W[f[1]], d = W[f[2]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        // 外向きにそろえる
        const mx = f.reduce((s, k) => s + W[k][0], 0) / f.length - c.x;
        const my = f.reduce((s, k) => s + W[k][1], 0) / f.length - (baseY + c.h / 2);
        const mz = f.reduce((s, k) => s + W[k][2], 0) / f.length - c.z;
        if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1;
        const vn = this.viewNormal(nx / l, ny / l, nz / l);
        const depth = f.reduce((s, k) => s + S[k].d, 0) / f.length;
        return { f, vn, depth };
      }).sort((a, b) => a.depth - b.depth);

      const hue = focus ? 190 : c.kind === 'prism' ? 255 : 275;
      for (const { f, vn } of faces) {
        const front = vn[2] > 0;
        const light = Math.max(0, -0.45 * vn[0] + 0.65 * vn[1] + 0.6 * vn[2]);
        const spec = Math.pow(Math.max(0, light), 6);
        g.beginPath();
        f.forEach((k, i) => (i ? g.lineTo(S[k].x, S[k].y) : g.moveTo(S[k].x, S[k].y)));
        g.closePath();
        g.fillStyle = front
          ? `hsla(${hue},${focus ? 90 : 55}%,${62 + light * 30}%,${0.2 + light * 0.42 + spec * 0.3})`
          : `hsla(${hue + 20},60%,55%,0.12)`;
        g.fill();
        g.strokeStyle = front ? `rgba(245,240,255,${0.35 + light * 0.5})` : 'rgba(220,210,255,0.18)';
        g.lineWidth = front ? 0.9 : 0.6;
        g.stroke();
      }
      const top = this.proj(c.x, baseY + c.h * 0.55, c.z);
      c.sp = top;
    }

    drawFibers() {
      const g = this.ctx;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const SEG = 16;
      const y0 = this.meshY;
      for (const f of this.fibers) {
        const pts = [];
        for (let i = 0; i <= SEG; i++) {
          const u = i / SEG;
          const w = Math.sin(u * f.freq * Math.PI + this.t * 1.2 + f.sw) * f.wav * u;
          const x = f.x + f.lean[0] * u * u + w;
          const z = f.z + f.lean[1] * u * u + w * 0.6;
          pts.push(this.proj(x, y0 + u * f.h, z));
        }
        // 下は明るく、上へ行くほど消えていく
        g.lineWidth = 0.8;
        for (let i = 0; i < SEG; i++) {
          const u = i / SEG;
          const a = 0.3 * (1 - u) * (1 - u) + 0.03;
          g.strokeStyle = `hsla(${f.hue},100%,72%,${a})`;
          g.beginPath(); g.moveTo(pts[i].x, pts[i].y); g.lineTo(pts[i + 1].x, pts[i + 1].y); g.stroke();
        }
        // 下から上へ昇っていく光
        const head = ((this.t * f.sp + f.ph) % 1) * SEG;
        const h0 = Math.floor(head);
        if (h0 < SEG) {
          const fade = 1 - h0 / SEG;
          g.strokeStyle = `hsla(${f.hue},100%,88%,${0.75 * fade})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(pts[Math.max(0, h0 - 1)].x, pts[Math.max(0, h0 - 1)].y);
          g.lineTo(pts[h0].x, pts[h0].y);
          g.lineTo(pts[h0 + 1].x, pts[h0 + 1].y);
          g.stroke();
        }
      }
      // 根元の光
      const c = this.proj(0, y0, 0);
      const rg = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, this.k * 0.8);
      rg.addColorStop(0, 'rgba(230,190,255,0.25)');
      rg.addColorStop(1, 'rgba(160,110,255,0)');
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(c.x, c.y, this.k * 0.8, this.k * 0.8 * this.sp, 0, 0, TAU); g.fill();
      g.restore();
    }

    drawSparks() {
      const g = this.ctx;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const [x, y, z, a] of this.sparks) {
        const p = this.proj(x * 0.8, y, z * 0.8);
        const fade = Math.min(1, (2.9 - y) * 1.5) * (0.3 + 0.7 * a);
        g.fillStyle = a < 0.4 ? `rgba(130,240,255,${fade * 0.8})` : `rgba(220,190,255,${fade * 0.7})`;
        g.fillRect(p.x, p.y, a < 0.15 ? 2 : 1.3, a < 0.15 ? 2 : 1.3);
      }
      g.restore();
    }

    drawLabels(cs) {
      const g = this.ctx;
      g.save();
      g.font = '600 11px "SF Mono", ui-monospace, Menlo, monospace';
      g.textAlign = 'center';
      for (const { c } of cs) {
        const p = this.proj(c.x, this.meshY, c.z);
        const focus = c.v === this.focus;
        const hov = this.hover === c;
        const label = MS.short(c.v);
        if (focus || hov) {
          const w = g.measureText(label).width + 14;
          g.fillStyle = focus ? 'rgba(20,60,80,0.8)' : 'rgba(30,20,70,0.8)';
          g.strokeStyle = focus ? 'rgba(120,255,255,0.9)' : 'rgba(200,180,255,0.7)';
          g.beginPath(); g.roundRect ? g.roundRect(p.x - w / 2, p.y + 6, w, 18, 9) : g.rect(p.x - w / 2, p.y + 6, w, 18); g.fill(); g.stroke();
          g.fillStyle = '#fff';
          g.fillText(label, p.x, p.y + 19);
        } else {
          g.fillStyle = 'rgba(225,215,255,0.6)';
          g.fillText(label, p.x, p.y + 17);
        }
      }
      g.restore();
    }

    /* ---------- 浮かぶパネル ---------- */
    drawPanel(p, redraw) {
      const g = this.ctx;
      const [cx, cy, cz] = p.c;
      const [wx, , wz] = p.w;
      const hw = p.W / 2, hh = p.H / 2;
      const float = Math.sin(this.t * 0.9 + cx) * 0.02;
      const P0 = this.proj(cx - wx * hw, cy + hh + float, cz - wz * hw);
      const P1 = this.proj(cx + wx * hw, cy + hh + float, cz + wz * hw);
      const P3 = this.proj(cx - wx * hw, cy - hh + float, cz - wz * hw);
      const P2 = { x: P1.x + P3.x - P0.x, y: P1.y + P3.y - P0.y };
      if (redraw) {
        const pg = p.cv.getContext('2d');
        pg.clearRect(0, 0, p.cv.width, p.cv.height);
        p.draw(pg, p.cv.width, p.cv.height);
      }
      const W = p.cv.width, H = p.cv.height;
      g.save();
      g.setTransform(
        this.dpr * (P1.x - P0.x) / W, this.dpr * (P1.y - P0.y) / W,
        this.dpr * (P3.x - P0.x) / H, this.dpr * (P3.y - P0.y) / H,
        this.dpr * P0.x, this.dpr * P0.y);
      g.globalAlpha = 0.95;
      g.drawImage(p.cv, 0, 0);
      g.restore();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(120,220,255,0.35)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(P0.x, P0.y); g.lineTo(P1.x, P1.y); g.lineTo(P2.x, P2.y); g.lineTo(P3.x, P3.y); g.closePath(); g.stroke();
      g.restore();
    }

    panelBase(g, W, H, title) {
      g.fillStyle = 'rgba(16,28,58,0.62)';
      g.strokeStyle = 'rgba(140,230,255,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      if (g.roundRect) g.roundRect(3, 3, W - 6, H - 6, 16); else g.rect(3, 3, W - 6, H - 6);
      g.fill(); g.stroke();
      g.fillStyle = 'rgba(150,235,255,0.9)';
      g.font = '700 17px "SF Mono", ui-monospace, Menlo, monospace';
      g.textAlign = 'left';
      g.fillText(title, 22, 34);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.textAlign = 'right';
      g.fillText(MS.short(this.focus), W - 22, 34);
      g.textAlign = 'left';
    }

    drawSpectrum(g, W, H) {
      this.panelBase(g, W, H, 'DIGITS');
      const digits = String(MS.clean(Math.abs(this.focus))).replace(/[^0-9]/g, '').slice(0, 8).split('').map(Number);
      const x0 = 92, x1 = W - 70, y0 = 56, y1 = H - 26;
      const hues = [275, 240, 200, 170, 120, 55, 30, 330];
      const total = digits.reduce((s, d) => s + d + 1, 0);
      let y = y0;
      digits.forEach((d, i) => {
        const h = (d + 1) / total * (y1 - y0);
        const lg = g.createLinearGradient(x0, 0, x1, 0);
        lg.addColorStop(0, `hsla(${hues[i % 8]},100%,62%,0.95)`);
        lg.addColorStop(1, `hsla(${hues[i % 8] - 15},100%,70%,0.85)`);
        g.fillStyle = lg;
        g.fillRect(x0, y, x1 - x0, h - 1.5);
        g.fillStyle = 'rgba(220,240,255,0.75)';
        g.font = '600 13px ui-monospace, Menlo, monospace';
        g.fillText(String(d), x0 - 26, y + h / 2 + 5);
        y += h;
      });
      // 左の目盛りと右のアイコン
      g.fillStyle = 'rgba(150,220,255,0.45)';
      for (let i = 0; i < 9; i++) g.fillRect(24, y0 + i * ((y1 - y0) / 8), 30 - (i % 3) * 8, 3);
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = i === 2 ? 'rgba(120,255,200,0.9)' : 'rgba(150,220,255,0.6)';
        g.lineWidth = 2;
        g.strokeRect(W - 50, y0 + 6 + i * ((y1 - y0 - 24) / 4), 22, 16);
      }
    }

    drawResidues(g, W, H) {
      this.panelBase(g, W, H, 'n mod k');
      const n = Math.abs(Math.round(this.focus));
      const K = 40;
      const x0 = 22, x1 = W - 22, y0 = 52, y1 = H - 34;
      const bw = (x1 - x0) / K;
      for (let k = 2; k < K + 2; k++) {
        const r = n % k;
        const h = r === 0 ? (y1 - y0) : Math.max(4, r / (k - 1) * (y1 - y0) * 0.92);
        const x = x0 + (k - 2) * bw;
        const lg = g.createLinearGradient(0, y1 - h, 0, y1);
        if (r === 0) { lg.addColorStop(0, 'rgba(255,120,200,1)'); lg.addColorStop(1, 'rgba(200,80,255,0.7)'); }
        else { lg.addColorStop(0, 'rgba(110,255,220,0.95)'); lg.addColorStop(1, 'rgba(60,160,255,0.55)'); }
        g.fillStyle = lg;
        g.fillRect(x + 1.5, y1 - h, bw - 3, h);
      }
      g.fillStyle = 'rgba(200,230,255,0.7)';
      g.font = '600 12px ui-monospace, Menlo, monospace';
      g.fillText('k=2', x0, H - 14);
      g.textAlign = 'right'; g.fillText('k=41', x1, H - 14);
      g.fillStyle = 'rgba(255,140,210,0.9)'; g.fillText('■ 割り切れる', x1 - 70, H - 14);
      g.textAlign = 'left';
    }

    drawSignal(g, W, H) {
      this.panelBase(g, W, H, 'SIGNAL');
      const v = this.focus;
      // 左: 成長曲線 (5%) と 揺らぎ
      const x0 = 22, x1 = W * 0.56, y0 = 56, y1 = H * 0.62;
      g.strokeStyle = 'rgba(140,200,255,0.18)'; g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const y = y0 + i * (y1 - y0) / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
      const line = (fn, color, wdt) => {
        g.strokeStyle = color; g.lineWidth = wdt;
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const u = i / 60, y = y1 - fn(u) * (y1 - y0);
          i ? g.lineTo(x0 + u * (x1 - x0), y) : g.moveTo(x0 + u * (x1 - x0), y);
        }
        g.stroke();
      };
      const ph = this.t * 0.6;
      line((u) => (Math.pow(1.05, u * 30) - 1) / (Math.pow(1.05, 30) - 1), 'rgba(110,255,220,0.95)', 3);
      line((u) => 0.45 + 0.28 * Math.sin(u * 9 + ph) * Math.exp(-u * 1.5) + 0.06 * Math.sin(u * 37 + ph * 3), 'rgba(255,90,170,0.9)', 2);
      line((u) => 0.3 + 0.2 * Math.sin(u * 5 - ph * 0.7), 'rgba(120,180,255,0.6)', 1.5);

      // 右: 二項分布 (コインを n 回)
      const n = MS.lab.isInt(v) && v >= 1 ? Math.min(v, 200) : 20;
      const hx0 = W * 0.62, hx1 = W - 22, hy0 = 56, hy1 = H * 0.62;
      const bins = 24;
      const mean = n / 2, sd = Math.sqrt(n) / 2 || 1;
      for (let i = 0; i < bins; i++) {
        const xv = mean + (i - bins / 2 + 0.5) / (bins / 2) * 3 * sd;
        const d = Math.exp(-((xv - mean) ** 2) / (2 * sd * sd));
        const jitter = 0.08 * Math.sin(this.t * 2 + i * 1.7);
        const h = Math.max(0.03, d + jitter * d) * (hy1 - hy0);
        g.fillStyle = 'rgba(110,255,220,0.85)';
        g.fillRect(hx0 + i * (hx1 - hx0) / bins + 1, hy1 - h, (hx1 - hx0) / bins - 2, h);
      }
      g.fillStyle = 'rgba(200,230,255,0.7)';
      g.font = '600 12px ui-monospace, Menlo, monospace';
      g.fillText(`coin ×${n}`, hx0, hy1 + 18);
      g.fillText('growth 5%', x0, y1 + 18);

      // 下: 性質のゲージ
      const lab = MS.lab;
      const props = [['偶', lab.isInt(v) && v % 2 === 0], ['素', MS.isPrime(v)], ['平', lab.isSquare(v)], ['三', lab.isTriangular(v)], ['F', lab.isFib(v)]];
      const gy = H - 44, gr = 20;
      props.forEach(([k, on], i) => {
        const gx = 46 + i * 62;
        g.strokeStyle = on ? 'rgba(110,255,230,0.95)' : 'rgba(140,170,220,0.35)';
        g.lineWidth = 3;
        g.beginPath(); g.arc(gx, gy, gr, 0, TAU); g.stroke();
        if (on) {
          g.strokeStyle = 'rgba(110,255,230,0.35)'; g.lineWidth = 7;
          g.beginPath(); g.arc(gx, gy, gr, -Math.PI / 2, -Math.PI / 2 + TAU * 0.75); g.stroke();
        }
        g.fillStyle = on ? '#fff' : 'rgba(180,190,230,0.5)';
        g.font = '700 15px "Hiragino Sans", "Noto Sans JP", sans-serif';
        g.textAlign = 'center';
        g.fillText(k, gx, gy + 5);
        g.textAlign = 'left';
      });
    }
  }

  MS.Holo = Holo;
})(window.MS);
