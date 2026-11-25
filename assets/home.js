/* ==========================================================
   首頁互動（home.js）
   1. 拉環：點一下，或按住向下拖曳，都能打開選單（再點一下、或向上拖曳收起）
   2. 3D 星球：按住拖曳旋轉；點一下（或按「進入星球」）進入 planet.html
      （星球本身由 assets/home-planet.js 用 Three.js 畫）
   ========================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('planet');
  var ring = document.getElementById('ring');
  var hangs = document.querySelectorAll('.hang');
  var loadingEl = document.getElementById('loading');
  var portraitQ = window.matchMedia('(max-aspect-ratio: 9/10)');
  var reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- 版面數字（由設計圖量出來的） ---------- */
  var LAYOUTS = {
    d: { W: 8000, H: 4222, ringY: [711, 3172],
         p0: { x: 0.5018, y: 0.5183, r: 1545.4 },     // 星球：選單收起
         p1: { x: 0.5937, y: 0.7139, r: 2503.6 } },   // 星球：選單打開
    m: { W: 3691, H: 7384, ringY: [1146.5, 5939],
         p0: { x: 0.5028, y: 0.5354, r: 1160.6 },
         p1: { x: 0.5172, y: 1.0469, r: 3250 } }
  };

  var lay = LAYOUTS.d, W = 1, H = 1, u = 1, dpr = 1;

  function layout() {
    lay = portraitQ.matches ? LAYOUTS.m : LAYOUTS.d;
    W = stage.clientWidth; H = stage.clientHeight;
    u = Math.min(W / lay.W, H / lay.H);
    root.style.setProperty('--u', u + 'px');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  /* ---------- 選單開合進度 p（0 = 收起，1 = 打開） ---------- */
  var p = 0, anim = 0;

  function setP(v) {
    p = Math.min(1, Math.max(0, v));
    root.style.setProperty('--p', p.toFixed(4));
    var state = p < 0.002 ? 'closed' : (p > 0.998 ? 'open' : 'moving');
    if (root.getAttribute('data-state') !== state) {
      root.setAttribute('data-state', state);
      var open = state === 'open';
      ring.setAttribute('aria-expanded', String(open));
      ring.setAttribute('aria-label', open ? '收起選單' : '拉開選單');
      for (var i = 0; i < hangs.length; i++) { if ('inert' in hangs[i]) hangs[i].inert = (state === 'closed'); }
    }
  }

  function goTo(target) {
    cancelAnimationFrame(anim);
    if (reduceQ.matches) { setP(target); return; }
    var from = p, t0 = performance.now(), dur = 150 + 650 * Math.abs(target - from);
    function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);   // 先快後慢
      setP(from + (target - from) * e);
      if (k < 1) anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
  }

  function travel() { return Math.max(40, (lay.ringY[1] - lay.ringY[0]) * u); }   // 拉環從收起到打開要走的像素

  /* ---------- 拉環：點按 + 向下拖曳 ---------- */
  var drag = null, suppressClick = false;

  ring.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(anim);
    try { ring.setPointerCapture(e.pointerId); } catch (err) {}
    drag = { id: e.pointerId, y0: e.clientY, p0: p, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  });
  ring.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 6) return;           // 小於 6px 當作點按，不算拖曳
    if (!drag.moved) { drag.moved = true; ring.classList.add('dragging'); }
    setP(drag.p0 + dy / travel());
    var dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = (e.clientY - drag.lastY) / dt;     // 速度（像素／毫秒）
    drag.lastY = e.clientY; drag.lastT = e.timeStamp;
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    ring.classList.remove('dragging');
    if (!d.moved) return;                                    // 點按交給 click 處理
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 0);
    var target;
    if (d.v > 0.6) target = 1;                               // 快速往下甩 → 打開
    else if (d.v < -0.6) target = 0;                         // 快速往上甩 → 收起
    else target = d.p0 < 0.5 ? (p > 0.3 ? 1 : 0) : (p < 0.7 ? 0 : 1);
    goTo(target);
  }
  ring.addEventListener('pointerup', endDrag);
  ring.addEventListener('pointercancel', endDrag);
  ring.addEventListener('click', function () {               // 點按、或鍵盤 Enter / 空白鍵
    if (suppressClick) return;
    goTo(p > 0.5 ? 0 : 1);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && p > 0.5) goTo(0);
  });

  /* ---------- 信箱：避免被機器人直接抓到 ---------- */
  var mail = document.querySelector('.ico-mail');
  if (mail) mail.href = 'mailto:' + mail.getAttribute('data-u') + '@' + mail.getAttribute('data-d');

  /* ==========================================================
     3D 星球
     真正的繪圖交給 assets/home-planet.js（Three.js + 共用的 planet.js），
     這裡只負責：位置大小（跟著 PULL ME 移動）、拖曳旋轉、點一下進入 planet.html。
     ========================================================== */
  var enterBtn = document.getElementById('enter');
  var PLANET_PAGE = 'planet.html';
  var view = null, ready = false, entering = false, grow = 1;

  // 旋轉矩陣（3×3，欄優先）
  function mul(a, b) {
    var o = new Float32Array(9);
    for (var c = 0; c < 3; c++) for (var r = 0; r < 3; r++)
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    return o;
  }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 1, 0, s, 0, c]); }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, c, s, 0, -s, c]); }
  var R = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);     // 目前的星球朝向（一開始主城正對鏡頭）
  var spinX = 0, spinY = 0;                                   // 慣性（弧度／秒）
  var IDLE = 0.05;                                            // 沒人碰時的緩慢自轉（弧度／秒）

  function planetState() {      // 目前星球的圓心與半徑（螢幕像素，原點在舞台左上）
    var a = lay.p0, b = lay.p1;
    return {
      x: (a.x + (b.x - a.x) * p) * W,
      y: (a.y + (b.y - a.y) * p) * H,
      r: (a.r + (b.r - a.r) * p) * u * grow
    };
  }

  var lastT = 0, userT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    if (!ready) return;
    var spinning = !reduceQ.matches;
    if (!pointer || !pointer.active) {
      var idle = (spinning && now - userT > 2500) ? IDLE : 0;
      spinY += (idle - spinY) * Math.min(1, dt * 1.5);     // 慣性慢慢收斂到自轉速度
      spinX += (0 - spinX) * Math.min(1, dt * 3);
      if (Math.abs(spinY) > 1e-4 || Math.abs(spinX) > 1e-4) R = mul(mul(rotX(spinX * dt), rotY(spinY * dt)), R);
    }
    // 新星球上有海浪、居民、船在動，所以每一格都要畫
    view.draw(R, planetState(), W, H, dpr, reduceQ.matches ? 0 : dt);
  }

  /* ---------- 進入星球：星球放大＋淡出，再換頁 ---------- */
  function enter() {
    if (entering) return;
    entering = true;
    if (!ready || reduceQ.matches) { location.href = PLANET_PAGE; return; }
    root.classList.add('entering');
    var t0 = performance.now(), DUR = 750;
    (function step(now) {
      var k = Math.min(1, (now - t0) / DUR);
      grow = 1 + 1.8 * k * k;                                 // 越來越快地放大
      if (k < 1) requestAnimationFrame(step); else location.href = PLANET_PAGE;
    })(t0);
  }
  window.addEventListener('pageshow', function (e) {          // 從星球頁按「上一頁」回來時，恢復原狀
    if (!e.persisted) return;
    entering = false; grow = 1; root.classList.remove('entering');
  });
  if (enterBtn) enterBtn.addEventListener('click', function (e) { e.preventDefault(); enter(); });

  /* ---------- 按住星球拖曳旋轉；沒有移動就算「點一下」→ 進入星球 ---------- */
  var pointer = null;
  function onPlanet(e) {
    var rect = canvas.getBoundingClientRect(), ps = planetState();
    var dx = e.clientX - rect.left - ps.x, dy = e.clientY - rect.top - ps.y;
    return dx * dx + dy * dy <= ps.r * ps.r * 1.04;
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!ready || entering || !onPlanet(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointer = { id: e.pointerId, active: true, moved: false, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp };
    userT = performance.now();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointer || !pointer.active) {
      if (ready && e.pointerType === 'mouse') canvas.classList.toggle('grab', onPlanet(e));
      return;
    }
    if (e.pointerId !== pointer.id) return;
    if (!pointer.moved) {                                     // 移動不到 6px 還不算拖曳
      if (Math.hypot(e.clientX - pointer.x0, e.clientY - pointer.y0) < 6) return;
      pointer.moved = true; canvas.classList.add('dragging'); spinX = spinY = 0;
    }
    var rPx = planetState().r, dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    var ay = dx / rPx, ax = dy / rPx;                         // 手指移動多少，星球表面就跟著移動多少
    R = mul(mul(rotX(ax), rotY(ay)), R);
    var dt = Math.max(0.008, (e.timeStamp - pointer.t) / 1000);
    spinY = ay / dt; spinX = ax / dt;                         // 記下速度，放手後繼續轉一下
    var cap = 8; spinY = Math.max(-cap, Math.min(cap, spinY)); spinX = Math.max(-cap, Math.min(cap, spinX));
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = e.timeStamp; userT = performance.now();
  });
  function endPlanet(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    // 選單拉開時只能旋轉、不會進入（避免點路牌旁邊時誤觸星球）
    var clicked = !pointer.moved && e.type === 'pointerup' && root.getAttribute('data-state') === 'closed';
    if (e.timeStamp - pointer.t > 80) { spinX = 0; spinY = 0; }   // 停了一下才放手 → 不甩
    pointer.active = false; canvas.classList.remove('dragging'); userT = performance.now();
    if (clicked) enter();
  }
  canvas.addEventListener('pointerup', endPlanet);
  canvas.addEventListener('pointercancel', endPlanet);

  /* ---------- 和 home-planet.js 接上 ---------- */
  window.HomePlanet = {
    ready: function (v) {
      view = v; ready = true;
      canvas.classList.add('ready'); loadingEl.classList.add('done');
    },
    fail: function (msg) { loadingEl.textContent = msg || '星球載入失敗，請重新整理'; }
  };
  setTimeout(function () { if (!ready) window.HomePlanet.fail(); }, 20000);

  /* ---------- 啟動 ---------- */
  setP(0);
  layout();
  window.addEventListener('resize', layout);
  if (portraitQ.addEventListener) portraitQ.addEventListener('change', layout);
  requestAnimationFrame(frame);
})();
