/* ==========================================================
   首頁互動（home.js）
   1. 拉環：點一下，或按住向下拖曳，都能打開選單（再點一下、或向上拖曳收起）
   2. 3D 星球：載入 assets/planet.glb，按住星球拖曳旋轉
   不依賴任何外部程式庫。
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
  var MOUNTAIN = [0, 83, 85], PLAIN = [39, 204, 255];   // 山、平地的顏色（和你的插畫一致）

  var lay = LAYOUTS.d, W = 1, H = 1, u = 1, dpr = 1;

  function layout() {
    lay = portraitQ.matches ? LAYOUTS.m : LAYOUTS.d;
    W = stage.clientWidth; H = stage.clientHeight;
    u = Math.min(W / lay.W, H / lay.H);
    root.style.setProperty('--u', u + 'px');
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    needsDraw = true;
  }

  /* ---------- 選單開合進度 p（0 = 收起，1 = 打開） ---------- */
  var p = 0, anim = 0, needsDraw = true;

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
    needsDraw = true;
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
     3D 星球（原生 WebGL）
     ========================================================== */
  var gl = canvas.getContext('webgl2', { antialias: true, alpha: true }) ||
           canvas.getContext('webgl', { antialias: true, alpha: true });
  var prog, parts = [], meanR = 1, ready = false;

  // 旋轉矩陣（3×3，欄優先）
  function mul(a, b) {
    var o = new Float32Array(9);
    for (var c = 0; c < 3; c++) for (var r = 0; r < 3; r++)
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    return o;
  }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 1, 0, s, 0, c]); }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, c, s, 0, -s, c]); }
  var R = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);     // 目前的星球朝向（一開始正對鏡頭＝你畫的「正面」）
  var spinX = 0, spinY = 0;                                   // 慣性（弧度／秒）
  var IDLE = 0.05;                                            // 沒人碰時的緩慢自轉（弧度／秒）

  function parseGLB(buf) {
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a glb');
    var off = 12, json, bin;
    while (off < buf.byteLength) {
      var len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), s = off + 8;
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, s, len)));
      else if (type === 0x004E4942) bin = buf.slice(s, s + len);
      off = s + len;
    }
    return { json: json, bin: bin };
  }
  function accessor(g, i, Type, comps) {
    var a = g.json.accessors[i], v = g.json.bufferViews[a.bufferView];
    return new Type(g.bin, (v.byteOffset || 0) + (a.byteOffset || 0), a.count * comps);
  }

  function initGL(g) {
    var vs = 'attribute vec3 aPos;attribute vec3 aNor;uniform mat3 uRot;uniform float uScale;' +
      'uniform vec2 uCenter;uniform vec2 uSize;varying vec3 vN;' +
      'void main(){vec3 p=uRot*aPos*uScale;vN=uRot*normalize(mix(aNor,normalize(aPos),0.85));' +
      'gl_Position=vec4(((uCenter.x+p.x)/uSize.x)*2.0-1.0,1.0-((uCenter.y-p.y)/uSize.y)*2.0,-p.z/(uScale*1.6),1.0);}';
    var fs = 'precision mediump float;varying vec3 vN;uniform vec3 uColor;' +
      'void main(){vec3 n=normalize(vN);vec3 L=normalize(vec3(-0.45,0.55,0.70));' +
      'float d=max(dot(n,L),0.0);float shade=0.84+0.16*d;shade*=0.93+0.07*clamp(n.z,0.0,1.0);' +
      'gl_FragColor=vec4(uColor*shade,1.0);}';
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    var isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (!isGL2 && !gl.getExtension('OES_element_index_uint')) throw new Error('no uint index');

    var prims = g.json.meshes[0].primitives, sum = 0, n = 0;
    for (var i = 0; i < prims.length; i++) {
      var pr = prims[i];
      var pos = accessor(g, pr.attributes.POSITION, Float32Array, 3);
      var nor = accessor(g, pr.attributes.NORMAL, Float32Array, 3);
      var ia = g.json.accessors[pr.indices];
      var idx = ia.componentType === 5125 ? accessor(g, pr.indices, Uint32Array, 1) : accessor(g, pr.indices, Uint16Array, 1);
      var matName = ((g.json.materials[pr.material] || {}).name || '');
      // 用材質名字判斷山或平地；名字認不出來時，第 1 個當山、第 2 個當平地
      var isMountain = /mountain/i.test(matName) || (!/plain/i.test(matName) && i === 0);
      var b = {
        pos: gl.createBuffer(), nor: gl.createBuffer(), idx: gl.createBuffer(), count: idx.length,
        type: ia.componentType === 5125 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        color: (isMountain ? MOUNTAIN : PLAIN).map(function (c) { return c / 255; })
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      parts.push(b);
      for (var k = 0; k < pos.length; k += 3 * 97) { sum += Math.sqrt(pos[k] * pos[k] + pos[k + 1] * pos[k + 1] + pos[k + 2] * pos[k + 2]); n++; }
    }
    meanR = sum / n || 1;     // 星球的平均半徑，用來把模型縮放成設計圖上的大小
  }

  function planetState() {      // 目前星球的圓心與半徑（螢幕像素，原點在舞台左上）
    var a = lay.p0, b = lay.p1;
    return {
      x: (a.x + (b.x - a.x) * p) * W,
      y: (a.y + (b.y - a.y) * p) * H,
      r: (a.r + (b.r - a.r) * p) * u
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
      if (Math.abs(spinY) > 1e-4 || Math.abs(spinX) > 1e-4) {
        R = mul(mul(rotX(spinX * dt), rotY(spinY * dt)), R); needsDraw = true;
      }
    }
    if (!needsDraw) return;
    needsDraw = false;
    draw();
  }

  function draw() {
    var ps = planetState();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(prog);
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uRot'), false, R);
    gl.uniform1f(gl.getUniformLocation(prog, 'uScale'), ps.r / meanR);
    gl.uniform2f(gl.getUniformLocation(prog, 'uCenter'), ps.x, ps.y);
    gl.uniform2f(gl.getUniformLocation(prog, 'uSize'), W, H);
    var aPos = gl.getAttribLocation(prog, 'aPos'), aNor = gl.getAttribLocation(prog, 'aNor');
    var uColor = gl.getUniformLocation(prog, 'uColor');
    for (var i = 0; i < parts.length; i++) {
      var b = parts[i];
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.enableVertexAttribArray(aNor); gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.uniform3fv(uColor, b.color);
      gl.drawElements(gl.TRIANGLES, b.count, b.type, 0);
    }
  }

  /* ---------- 按住星球拖曳旋轉 ---------- */
  var pointer = null;
  function onPlanet(e) {
    var rect = canvas.getBoundingClientRect(), ps = planetState();
    var dx = e.clientX - rect.left - ps.x, dy = e.clientY - rect.top - ps.y;
    return dx * dx + dy * dy <= ps.r * ps.r * 1.04;
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!ready || !onPlanet(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointer = { id: e.pointerId, active: true, x: e.clientX, y: e.clientY, t: e.timeStamp };
    canvas.classList.add('dragging'); userT = performance.now();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointer || !pointer.active) {
      if (ready && e.pointerType === 'mouse') canvas.classList.toggle('grab', onPlanet(e));
      return;
    }
    if (e.pointerId !== pointer.id) return;
    var rPx = planetState().r, dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    var ay = dx / rPx, ax = dy / rPx;                         // 手指移動多少，星球表面就跟著移動多少
    R = mul(mul(rotX(ax), rotY(ay)), R);
    var dt = Math.max(0.008, (e.timeStamp - pointer.t) / 1000);
    spinY = ay / dt; spinX = ax / dt;                         // 記下速度，放手後繼續轉一下
    var cap = 8; spinY = Math.max(-cap, Math.min(cap, spinY)); spinX = Math.max(-cap, Math.min(cap, spinX));
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = e.timeStamp; userT = performance.now();
    needsDraw = true;
  });
  function endPlanet(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (e.timeStamp - pointer.t > 80) { spinX = 0; spinY = 0; }   // 停了一下才放手 → 不甩
    pointer.active = false; canvas.classList.remove('dragging'); userT = performance.now();
  }
  canvas.addEventListener('pointerup', endPlanet);
  canvas.addEventListener('pointercancel', endPlanet);

  /* ---------- 啟動 ---------- */
  setP(0);
  layout();
  window.addEventListener('resize', layout);
  if (portraitQ.addEventListener) portraitQ.addEventListener('change', layout);

  if (!gl) {
    loadingEl.textContent = '你的瀏覽器不支援 3D 顯示，星球暫時無法出現';
  } else {
    fetch('assets/planet.glb')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        initGL(parseGLB(buf));
        ready = true; needsDraw = true;
        canvas.classList.add('ready'); loadingEl.classList.add('done');
      })
      .catch(function (err) {
        console.error('星球載入失敗：', err);
        loadingEl.textContent = '星球載入失敗，請重新整理';
      });
    requestAnimationFrame(frame);
  }
})();
