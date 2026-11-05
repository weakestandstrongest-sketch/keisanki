/* MATHSCAPE — 全体の結線 */
(function (MS) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('space');
  const calcEl = $('calc');
  const trash = $('trash');
  const ghost = $('ghost');
  const picker = $('opPicker');
  const hint = $('hint');

  const world = new MS.World(canvas);

  /* ---------- トースト ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function hideHint() { hint.classList.add('gone'); }

  /* ---------- ぷにを生む (要素から飛んでくる演出つき) ---------- */
  function spawn(v, fromEl, at) {
    v = MS.clean(v);
    if (!MS.isValid(v)) { toast('この数はぷにできません'); return; }
    const sr = stage.getBoundingClientRect();
    const tx = at ? at.x : sr.width * (0.25 + Math.random() * 0.5);
    const ty = at ? at.y : Math.min(90, sr.height * 0.2);
    if (fromEl && !at) {
      const r = fromEl.getBoundingClientRect();
      const fly = document.createElement('div');
      fly.className = 'fly';
      fly.textContent = MS.short(v);
      fly.style.setProperty('--h', MS.blobHue(v));
      fly.style.left = r.left + r.width / 2 + 'px';
      fly.style.top = r.top + r.height / 2 + 'px';
      document.body.appendChild(fly);
      requestAnimationFrame(() => {
        fly.style.transform = `translate(${sr.left + tx - (r.left + r.width / 2)}px, ${sr.top + ty - (r.top + r.height / 2)}px) scale(1.4)`;
        fly.style.opacity = '0.2';
      });
      setTimeout(() => { fly.remove(); world.add(tx, ty, v, { vy: 2 }); }, 380);
    } else {
      world.add(tx, ty, v, { vy: at ? 0 : 2 });
    }
    hideHint();
  }

  /* ---------- 計算機 ---------- */
  const calc = new MS.Calculator({
    exprEl: $('expr'),
    resultEl: $('result'),
    keysEl: $('keys'),
    historyEl: $('history'),
    onEvaluate: () => {
      $('result').classList.remove('pulse');
      void $('result').offsetWidth;
      $('result').classList.add('pulse');
    },
  });

  const inspector = new MS.Inspector($('inspector'), {
    spawn: (v, el) => spawn(v, el),
    toCalc: (v) => { calc.insertValue(v); toast(`計算機に ${MS.fmt(v)} を入れました`); pulseCalc(); },
    close: () => {},
  });

  function pulseCalc() {
    calcEl.classList.remove('got');
    void calcEl.offsetWidth;
    calcEl.classList.add('got');
  }

  $('btnInspect').addEventListener('click', () => inspector.open(calc.value, false));
  $('btnPuni').addEventListener('click', (e) => spawn(calc.value, $('result')));
  $('result').addEventListener('click', (e) => {
    if ($('result')._dragged) return;
    inspector.open(calc.value, false);
  });
  $('result').addEventListener('keydown', (e) => { if (e.key === 'Enter') inspector.open(calc.value, false); });
  $('history').addEventListener('click', (e) => {
    const h = e.target.closest('.hist');
    if (!h || h._dragged) return;
    inspector.open(parseFloat(h.dataset.value), false);
  });

  /* ---------- DOM の数字をドラッグして空間へ ---------- */
  (function domDrag() {
    let st = null;
    const valueOf = (el) => {
      if (el.id === 'result') return calc.value;
      return parseFloat(el.dataset.v != null ? el.dataset.v : el.dataset.value);
    };
    const overStage = (x, y) => {
      const r = stage.getBoundingClientRect();
      const ir = $('inspector').getBoundingClientRect();
      const insp = !$('inspector').hidden && x >= ir.left && x <= ir.right && y >= ir.top && y <= ir.bottom;
      return !insp && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest('.nchip-main, .hist, #result');
      if (!el) return;
      const v = valueOf(el);
      if (!MS.isValid(v)) return;
      st = { el, v, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
    });
    document.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.dragging && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) {
        st.dragging = true;
        ghost.hidden = false;
        ghost.textContent = MS.short(st.v);
        ghost.style.setProperty('--h', MS.blobHue(st.v));
        document.body.classList.add('dragging-num');
      }
      if (st.dragging) {
        e.preventDefault();
        ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        stage.classList.toggle('drop-hover', overStage(e.clientX, e.clientY));
      }
    }, { passive: false });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.dragging) {
        const el = st.el;
        el._dragged = true;
        setTimeout(() => { el._dragged = false; }, 50);
        ghost.hidden = true;
        document.body.classList.remove('dragging-num');
        stage.classList.remove('drop-hover');
        if (!cancel && overStage(e.clientX, e.clientY)) {
          const r = stage.getBoundingClientRect();
          spawn(st.v, null, { x: e.clientX - r.left, y: e.clientY - r.top });
        }
      }
      st = null;
    };
    document.addEventListener('pointerup', (e) => end(e, false));
    document.addEventListener('pointercancel', (e) => end(e, true));
  })();

  /* ---------- 空間のぷにを操作 ---------- */
  let drag = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inside = (el, e) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e);
    const b = world.blobAt(p.x, p.y);
    closePicker();
    if (!b) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drag = { b, id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    world.startGrab(b, p.x, p.y);
    hideHint();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!drag) {
      canvas.style.cursor = world.blobAt(p.x, p.y) ? 'grab' : 'default';
      return;
    }
    if (e.pointerId !== drag.id) return;
    world.moveGrab(Math.max(0, Math.min(world.w, p.x)), Math.max(0, Math.min(world.h, p.y)));
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.moved = true;
      stage.classList.add('grabbing');
    }
    if (drag.moved) {
      canvas.style.cursor = 'grabbing';
      world.highlight = world.overlapping(drag.b);
      trash.classList.toggle('hot', inside(trash, e));
      calcEl.classList.toggle('drop-target', inside(calcEl, e));
    }
  });

  const endDrag = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    const b = drag.b;
    const quick = performance.now() - drag.t < 400;
    stage.classList.remove('grabbing');
    calcEl.classList.remove('drop-target');
    trash.classList.remove('hot');
    if (!cancel && !drag.moved && quick) {
      b.poke(0.22);
      inspector.open(b.value, false);
    } else if (!cancel && inside(trash, e)) {
      world.remove(b);
      toast(`${MS.fmt(b.value)} を消しました`);
    } else if (!cancel && inside(calcEl, e)) {
      calc.insertValue(b.value);
      pulseCalc();
      toast(`計算機に ${MS.fmt(b.value)} を入れました`);
    } else if (!cancel && world.highlight) {
      openPicker(b, world.highlight);
    }
    world.highlight = null;
    world.endGrab();
    drag = null;
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ダブルクリックで計算機の答えをその場にぷに化
  canvas.addEventListener('dblclick', (e) => {
    const p = local(e);
    if (world.blobAt(p.x, p.y)) return;
    spawn(calc.value, null, p);
  });

  /* ---------- 合体の演算ピッカー ---------- */
  const lab = MS.lab;
  const OPS = [
    { s: '+', name: 'たす', f: (a, b) => a + b, ex: (a, b) => `${a} + ${b}` },
    { s: '−', name: 'ひく', f: (a, b) => a - b, ex: (a, b) => `${a} − ${b}` },
    { s: '×', name: 'かける', f: (a, b) => a * b, ex: (a, b) => `${a} × ${b}` },
    { s: '÷', name: 'わる', f: (a, b) => (b === 0 ? NaN : a / b), ex: (a, b) => `${a} ÷ ${b}` },
    { s: 'xʸ', name: 'べき乗', f: (a, b) => Math.pow(a, b), ex: (a, b) => `${a} ^ ${b}` },
    { s: 'mod', name: 'あまり', f: (a, b) => (b === 0 ? NaN : ((a % b) + b) % b), ex: (a, b) => `${a} mod ${b}` },
    { s: 'gcd', name: '最大公約数', f: (a, b) => lab.gcd(a, b), ex: (a, b) => `gcd(${a}, ${b})` },
    { s: 'lcm', name: '最小公倍数', f: (a, b) => lab.lcm(a, b), ex: (a, b) => `lcm(${a}, ${b})` },
    { s: 'avg', name: '平均', f: (a, b) => (a + b) / 2, ex: (a, b) => `avg(${a}, ${b})` },
    { s: '⧺', name: 'つなげる', f: (a, b) => (lab.isInt(a) && lab.isInt(b) && a >= 0 && b >= 0 ? parseFloat(`${a}${b}`) : NaN), ex: (a, b) => `${a} ⧺ ${b}` },
  ];
  let pick = null;

  function openPicker(a, b) {
    pick = { a, b };
    renderPicker();
    picker.hidden = false;
    positionPicker();
  }
  function renderPicker() {
    const { a, b } = pick;
    const A = a.value, B = b.value;
    picker.innerHTML =
      `<div class="op-head"><span class="pv" style="--h:${a.hue}">${MS.short(A)}</span>` +
      `<button type="button" class="op-swap" data-swap title="入れ替え">⇄</button>` +
      `<span class="pv" style="--h:${b.hue}">${MS.short(B)}</span>` +
      `<button type="button" class="op-x" data-cancel aria-label="やめる">✕</button></div>` +
      `<div class="op-grid">` +
      OPS.map((o, i) => {
        const r = MS.clean(o.f(A, B));
        const ok = MS.isValid(r);
        return `<button type="button" data-op="${i}" ${ok ? '' : 'disabled'} title="${o.name}"><i>${o.s}</i><small>${ok ? MS.short(r) : '—'}</small></button>`;
      }).join('') + `</div>`;
  }
  function positionPicker() {
    if (!pick) return;
    if (pick.a.dying || pick.b.dying) { closePicker(); return; }
    const mx = (pick.a.cx + pick.b.cx) / 2, my = Math.min(pick.a.cy, pick.b.cy) - Math.max(pick.a.R, pick.b.R) - 12;
    // ぷにが大きく動いたときだけ追従 (小さな揺れでは動かさない)
    if (pick.ax != null && Math.hypot(mx - pick.ax, my - pick.ay) < 30) return;
    pick.ax = mx; pick.ay = my;
    const pw = picker.offsetWidth, ph = picker.offsetHeight;
    const x = Math.round(Math.max(8, Math.min(world.w - pw - 8, mx - pw / 2)));
    const y = Math.round(Math.max(8, Math.min(world.h - ph - 8, my - ph)));
    picker.style.transform = `translate(${x}px, ${y}px)`;
  }
  function closePicker() { pick = null; picker.hidden = true; }
  world.onFrame = positionPicker;

  picker.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !pick) return;
    if (t.hasAttribute('data-cancel')) { closePicker(); return; }
    if (t.hasAttribute('data-swap')) { pick = { a: pick.b, b: pick.a, ax: pick.ax, ay: pick.ay }; renderPicker(); return; }
    const o = OPS[+t.dataset.op];
    if (!o) return;
    const { a, b } = pick;
    const r = MS.clean(o.f(a.value, b.value));
    if (!MS.isValid(r)) { toast('この組み合わせは計算できません'); return; }
    const expr = o.ex(MS.fmt(a.value), MS.fmt(b.value));
    closePicker();
    world.merge(a, b, r);
    toast(`${expr} = ${MS.fmt(r)}`);
    calc.addExternalHistory(o.ex(MS.raw(a.value), MS.raw(b.value)), r);
  });

  /* ---------- ヘッダーの操作 ---------- */
  $('btnGravity').addEventListener('click', (e) => {
    world.gravity = !world.gravity;
    e.currentTarget.setAttribute('aria-pressed', String(!world.gravity));
    e.currentTarget.textContent = world.gravity ? '⟡ 無重力' : '⟡ 重力';
    if (!world.gravity) for (const b of world.blobs) for (const p of b.pts) { p.oy = p.y + 1.5 + Math.random(); }
    toast(world.gravity ? '重力 ON' : '無重力 — ふわふわ漂います');
  });
  const FUN = [100, 12, 7, 365, 3.14, 24, 60, 2, 1000, 8, 42, 0.5, 144, 17, 9, 1.08];
  let funIdx = 0;
  $('btnSpawn').addEventListener('click', () => { spawn(FUN[funIdx++ % FUN.length]); });
  $('btnClear').addEventListener('click', () => { world.clear(); closePicker(); });
  $('btnHelp').addEventListener('click', () => { $('help').hidden = false; });
  $('btnHelpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });

  /* ---------- キーボード ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const map = { '*': '×', 'x': '×', '/': '÷', '-': '-', '+': '+', '^': '^', '%': '%', '(': '(', ')': ')', '.': '.', 'p': 'π' };
    if (/^[0-9]$/.test(k)) calc.press(k);
    else if (map[k]) calc.press(map[k]);
    else if (k === 'Enter' || k === '=') { if (e.target.closest && e.target.closest('button, [role="button"]') && !e.target.closest('#keys')) return; calc.press('eq'); }
    else if (k === 'Backspace') calc.press('back');
    else if (k === 'Escape') {
      if (pick) closePicker();
      else if (!$('help').hidden) $('help').hidden = true;
      else if (!$('inspector').hidden) inspector.close();
      else calc.press('clear');
    } else return;
    e.preventDefault();
  });

  /* ---------- 最初のぷにたち ---------- */
  const r0 = stage.getBoundingClientRect();
  [[100, 0.3], [12, 0.5], [7, 0.68], [3.14, 0.42]].forEach(([v, fx], i) => {
    setTimeout(() => world.add(r0.width * fx, 60 + i * 10, v, { vy: 1 }), 250 + i * 260);
  });
  try {
    if (!localStorage.getItem('mathscape-seen')) {
      $('help').hidden = false;
      localStorage.setItem('mathscape-seen', '1');
    }
  } catch (e) { /* storage 不可 */ }

  MS.app = { world, calc, inspector, spawn };
})(window.MS);
