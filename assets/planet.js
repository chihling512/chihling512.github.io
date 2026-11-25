/* ==========================================================
   夢幻星球（planet.js）— 首頁與 planet.html 共用
   只負責「把星球、城市、居民、海洋生物、天空蓋出來」並提供 updateWorld()；
   相機、操作、介面由各頁自己處理。
   需要頁面上的 importmap 把 'three' 指到 assets/vendor/three/three.module.js
   ========================================================== */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const R = 10, TAU = Math.PI*2, V3 = THREE.Vector3, UP = new V3(0,1,0), IDQ = new THREE.Quaternion();
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;

// ================= 亂數與雜訊 =================
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng = mulberry32(20211013);
function hash3(x,y,z){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1274126177)^1013904223;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967295;}
function vnoise(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf), h=(a,b,c)=>hash3(xi+a,yi+b,zi+c);
  const x00=h(0,0,0)+(h(1,0,0)-h(0,0,0))*u,x10=h(0,1,0)+(h(1,1,0)-h(0,1,0))*u,x01=h(0,0,1)+(h(1,0,1)-h(0,0,1))*u,x11=h(0,1,1)+(h(1,1,1)-h(0,1,1))*u;
  const y0=x00+(x10-x00)*v,y1=x01+(x11-x01)*v; return (y0+(y1-y0)*w)*2-1;
}
function fbm(x,y,z){let s=0,a=.5,f=1,n=0;for(let i=0;i<4;i++){s+=a*vnoise(x*f+i*7.1,y*f-i*3.3,z*f+i*1.7);n+=a;a*=.5;f*=2.07;}return s/n;}

// ================= 球面工具 =================
const V = (x,y,z) => new V3(x,y,z).normalize();
const tangentTo = (p, target) => target.clone().addScaledVector(p, -p.dot(target)).normalize();
function basis(dir){ const a = Math.abs(dir.y) < .9 ? new V3(0,1,0) : new V3(1,0,0); const t1 = new V3().crossVectors(a, dir).normalize(); return [t1, new V3().crossVectors(dir, t1)]; }
function offsetDir(c, heading, ang){ const [t1,t2] = basis(c); const t = t1.multiplyScalar(Math.cos(heading)).addScaledVector(t2, Math.sin(heading)); return c.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang)).normalize(); }
function scatter(c, rad, minA=0){ return offsetDir(c, rng()*TAU, minA + Math.sqrt(rng())*(rad - minA)); }
function step(p, f, a){ const c = Math.cos(a), s = Math.sin(a); const np = p.clone().multiplyScalar(c).addScaledVector(f, s); f.multiplyScalar(c).addScaledVector(p, -s); p.copy(np).normalize(); f.addScaledVector(p, -p.dot(f)).normalize(); }
function turn(p, f, a){ const k = new V3().crossVectors(p, f); f.multiplyScalar(Math.cos(a)).addScaledVector(k, Math.sin(a)).normalize(); }
const _m4 = new THREE.Matrix4(), _x = new V3(), _f = new V3();
function frameQuat(obj, p, f){ _f.copy(f).addScaledVector(p, -p.dot(f)).normalize(); _x.crossVectors(p, _f); obj.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, p, _f)); }

// ================= 地區 =================
const CITIES = [
  {id:'main', name:'Who am I 主城', dir:V(0,.3,1), rad:.26, core:.13, desc:'Who am I 城堡長在星球的心臟上，正門朝著棉花糖森林。皇冠城牆裡種滿玫瑰，城門有拿愛心長槍的衛兵看守，城前的雲朵廣場每天都有馬戲團表演。'},
  {id:'metal',name:'金之城', dir:V(.3,-.3,-.95), rad:.16, core:.08, desc:'像音樂盒一樣的金色鐘樓城。齒輪一直轉個不停，鐘樓裡掛著會叮噹響的大鈴鐺，周圍是金色圓頂的小民宅。'},
  {id:'wood', name:'木之城', dir:V(-.95,.3,-.05), rad:.16, core:.06, desc:'蓋在大樹上的樹屋村，樹屋之間用吊橋連起來，四周是毛茸茸的綠色森林和小木屋。'},
  {id:'water',name:'水之城', dir:V(.726,-.679,.111), rad:.1, core:.035, sea:true, desc:'漂在大海中央的貝殼珊瑚城，四周有小島和旋轉往上竄的水柱。只能搭船過去喔。'},
  {id:'fire', name:'火之城', dir:V(-.4,.6,-.7), rad:.15, core:.07, desc:'紅磚燈籠塔和冒泡的熔岩池，被粉紅尖塔山團團圍住，地上到處是跳動的小火焰。'},
  {id:'earth',name:'土之城', dir:V(.95,.35,-.1), rad:.16, core:.08, desc:'糖果沙漠中央的土之城，一層層梯田上蓋著陶罐屋和蘑菇屋，周圍是薑餅屋民宅。'},
];
const C = Object.fromEntries(CITIES.map(c => [c.id, c]));
const FORESTS = [
  {id:'candy',  name:'棉花糖森林', dir:V(.55,.25,.75),   rad:.3,  ground:[1,.82,.9],  desc:'粉粉嫩嫩、毛茸茸的棉花糖樹，走進去空氣是甜的。'},
  {id:'mist',   name:'迷霧森林',   dir:V(-.55,-.45,.65), rad:.3,  ground:[.5,.4,.6],  desc:'終年起霧的深紫色森林，聽說有幽靈在裡面迷路過，到現在還在找出口。'},
  {id:'crystal',name:'星光水晶林', dir:V(-.25,-.85,-.45),rad:.28, ground:[.8,.87,1],  desc:'會發出藍色微光的水晶叢，夜裡看起來像星星掉在地上。'},
];
const PLAZA_DIR = (() => { const m = C.main.dir, t = tangentTo(m, FORESTS[0].dir); return m.clone().multiplyScalar(Math.cos(.21)).addScaledVector(t, Math.sin(.21)).normalize(); })();
const WATER = C.water, PLAT = .085;
const ISLANDS = [0,1,2,3,4,5].map(i => ({dir:offsetDir(WATER.dir, i/6*TAU + .3, .2 + (i%2)*.04), rad:.045}));
const DESERT = {dir:C.earth.dir, rad:.36};
const BUMPS = [
  ...CITIES.filter(c => !c.sea).map(c => ({dir:c.dir, rad:c.rad, boost:1.4, flat:1})),
  {dir:C.fire.dir, rad:.42, boost:.9, flat:0, fire:true},
  {dir:C.wood.dir, rad:.34, boost:.8, flat:.85},
  {dir:DESERT.dir, rad:DESERT.rad, boost:1.0, flat:.93, desert:true},
  {dir:PLAZA_DIR, rad:.12, boost:.5, flat:1},
  ...ISLANDS.map(i => ({dir:i.dir, rad:i.rad, boost:2.4, flat:.6})),
];

// ================= 地形 =================
function terrain(d){
  let land = fbm(d.x*1.7+3.1, d.y*1.7-1.3, d.z*1.7+.7)*1.6, flat = 0, fw = null, fwW = 0, fireW = 0, desertW = 0;
  for (const b of BUMPS){ const w = Math.exp(-((d.angleTo(b.dir)/b.rad)**2)); if (w < .001) continue; land += w*b.boost; flat = Math.max(flat, w*b.flat); if (b.fire) fireW = w; if (b.desert) desertW = w; }
  for (const f of FORESTS){ const w = Math.exp(-((d.angleTo(f.dir)/f.rad)**2)); land += w; if (w > fwW){ fwW = w; fw = f; } flat = Math.max(flat, w*.75); }
  land -= Math.exp(-((d.angleTo(WATER.dir)/.45)**2))*1.3;
  const sea = land < .12;
  const ridge = Math.pow(1 - Math.abs(vnoise(d.x*3.4+9, d.y*3.4+2, d.z*3.4-5)), 2.2);
  const bump = vnoise(d.x*6+1, d.y*6, d.z*6)*.5 + .5;
  const mtn = (ridge*1.35 + bump*.25)*smooth(land, .12, .5)*(1 - flat);
  let dune = 0, h = sea ? Math.max(-.75, (land - .12)*.9) : .1 + Math.min(land - .12, .6)*.3 + mtn*1.15;
  if (!sea && desertW > .05){ dune = Math.sin(d.x*34 + d.z*21 + vnoise(d.x*5, d.y*5, d.z*5)*3)*.5 + .5; h += desertW*(.04 + dune*.12); }
  return {h, sea, land, mtn, flat, fw, fwW, fireW, desertW, dune};
}
const onPlat = p => p.angleTo(WATER.dir) < PLAT;
// 橋：在海上也能走，高度沿著拱形
const BRIDGES = [];
function bridgeAt(p){ for (const b of BRIDGES){ if (Math.abs(p.dot(b.n)) > b.w) continue; const ta = p.angleTo(b.A), tb = p.angleTo(b.B); if (ta + tb > b.L + .004) continue; return {b, t:ta/(ta + tb)}; } return null; }
const deckH = (b, t) => b.hA + (b.hB - b.hA)*t + Math.sin(Math.PI*t)*b.arch;
const ground = p => { if (onPlat(p)) return .2; const t = terrain(p); if (!t.sea) return t.h; const br = bridgeAt(p); return br ? deckH(br.b, br.t) : 0; };
const isOpenSea = p => terrain(p).sea && p.angleTo(WATER.dir) > PLAT + .02;
const walkable = p => onPlat(p) || !terrain(p).sea || !!bridgeAt(p);
const surf = (d, lift=0) => d.clone().multiplyScalar(R + terrain(d).h + lift);
const lerp3 = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
function colorAt(t){
  if (t.sea) return lerp3([.55,.8,1], [.24,.38,.82], clamp(-t.h/.7, 0, 1));
  let c = [1,.72,.85];
  if (t.fw && t.fwW > .3) c = lerp3(c, t.fw.ground, Math.min((t.fwW - .3)*2, 1));
  if (t.fireW > .2) c = lerp3(c, [1,.6,.62], Math.min((t.fireW - .2)*.9, .6));
  c = lerp3(c, [.9,.5,.74], Math.min(t.mtn/1.0, 1));
  if (t.mtn > 1.2) c = lerp3(c, [1,.93,.97], Math.min((t.mtn - 1.2)*3, 1));
  if (t.desertW > .2) c = lerp3(c, lerp3([1,.86,.64], [1,.74,.76], t.dune), smooth(t.desertW, .2, .5));
  return lerp3([1,.91,.78], c, smooth(t.land, .17, .27)); // 沙灘
}
// 瞭望塔（主城與迷霧森林之間的山頂）、燈塔（火、木、主城之間的海岬）
const TOWER_DIR = (() => { const m = C.main.dir.clone().add(FORESTS[1].dir).normalize(); let best = m, bh = -9;
  for (let i = 0; i < 500; i++){ const d = offsetDir(m, i*2.39996, Math.sqrt(i/500)*.16), t = terrain(d); if (!t.sea && t.h > bh && t.flat < .3){ bh = t.h; best = d; } } return best; })();
const LIGHT_DIR = V(-.1955, .9133, .3572); // 指定的海岬尖端
const SPOTS = [
  {id:'plaza', name:'雲朵廣場', dir:PLAZA_DIR, rad:.08, spot:true, desc:'城堡正門前的雲朵廣場，馬戲團每天在這裡表演：踩球、騎獨輪車、走鋼索，旁邊還有條紋帳篷。'},
  {id:'tower', name:'瞭望塔', dir:TOWER_DIR, rad:.05, spot:true, desc:'蓋在主城和迷霧森林之間山頂上的瞭望塔，從上面可以看到大半顆星球。'},
  {id:'light', name:'海岬燈塔', dir:LIGHT_DIR, rad:.05, spot:true, desc:'立在海岬尖端的粉白條紋燈塔，旋轉的光會替出海的小船指路。'},
];
const ZONES = [{id:'desert', name:'糖果沙漠', dir:DESERT.dir, rad:DESERT.rad, zone:true, labelDir:offsetDir(DESERT.dir, 2.2, .24), desc:'用糖果堆出來的沙漠：巨大的棒棒糖、拐杖糖、軟糖、包裝糖和杯子蛋糕，插在粉金色的沙丘上。'}];
const REGIONS = [...CITIES, ...FORESTS, ...SPOTS, ...ZONES];

// ================= 場景與燈光 =================
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffe6f2', '#7a5cff', 1.25));
const sunLight = new THREE.DirectionalLight('#fff1dc', 2.1); scene.add(sunLight);

// ================= 材質：柔和卡通光影＋邊緣光 =================
const gmap = new THREE.DataTexture(new Uint8Array([105,160,212,255]), 4, 1, THREE.RedFormat);
gmap.minFilter = gmap.magFilter = THREE.LinearFilter; gmap.needsUpdate = true;
const HOLE = {uHole:{value:new THREE.Vector3()}, uHoleDepth:{value:0}};
function rimify(m, k){
  m.onBeforeCompile = sh => { sh.uniforms.uHole = HOLE.uHole; sh.uniforms.uHoleDepth = HOLE.uHoleDepth;
    sh.fragmentShader = 'uniform vec3 uHole;\nuniform float uHoleDepth;\n' + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (uHole.z > 0.0 && vViewPosition.z < uHoleDepth) { float hd = distance(gl_FragCoord.xy, uHole.xy); float ha = smoothstep(uHole.z*.45, uHole.z, hd);
    float hn = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233)))*43758.5453); if (hn > ha*1.05) discard; }`)
      .replace('#include <dithering_fragment>', `float rimF = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);\n gl_FragColor.rgb += vec3(1.0,0.86,0.95) * pow(rimF, 2.6) * ${k.toFixed(2)};\n#include <dithering_fragment>`); };
  m.customProgramCacheKey = () => 'rim' + k; return m;
}
const matCache = new Map();
function toon(color, opt={}){
  const {key='', rim=.28, ...rest} = opt, k = color + '|' + key;
  if (matCache.has(k)) return matCache.get(k);
  const m = rimify(new THREE.MeshToonMaterial({color, gradientMap:gmap, ...rest}), rim); matCache.set(k, m); return m;
}
const glow = (color, i=.5) => toon(color, {key:'glow' + i, emissive:new THREE.Color(color), emissiveIntensity:i});
const ds = color => toon(color, {key:'ds', side:THREE.DoubleSide});
const basic = (color, op=1) => new THREE.MeshBasicMaterial({color, transparent:op < 1, opacity:op, depthWrite:op >= 1});
const ink = toon('#2a1636', {rim:.12, key:'ink'});
const put = (p, o) => (p.add(o), o);
const ringAt = (p, r, tube, m, y, seg=32) => { const o = mesh(new THREE.TorusGeometry(r, tube, 8, seg), m, 0, y, 0); o.rotation.x = Math.PI/2; p.add(o); return o; };
const mesh = (g, m, x=0, y=0, z=0) => { const o = new THREE.Mesh(g, m); o.position.set(x,y,z); return o; };
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function stripes(cols, vertical, n=12){ return canvasTex(256, 256, (x) => { for (let i = 0; i < n; i++){ x.fillStyle = cols[i%cols.length]; vertical ? x.fillRect(i*256/n, 0, 256/n + 1, 256) : x.fillRect(0, i*256/n, 256, 256/n + 1); } }); }
const lathe = (pts, seg=48) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
function bake(root){
  root.updateMatrixWorld(true); const groups = new Map();
  root.traverse(o => { if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.clearGroups(); g.applyMatrix4(o.matrixWorld);
    if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material).push(g); });
  const out = new THREE.Group(); for (const [m, list] of groups) out.add(new THREE.Mesh(mergeGeometries(list), m)); return out;
}
function place(obj, dir, lift=0, spin=rng()*TAU){ obj.position.copy(surf(dir, lift)); obj.quaternion.setFromUnitVectors(UP, dir); obj.rotateY(spin); return obj; }
function faceToward(obj, dir, target){ const z = new V3(0,0,1).applyQuaternion(obj.quaternion), T = tangentTo(dir, target); obj.rotateY(Math.atan2(new V3().crossVectors(z, T).dot(dir), z.dot(T))); return obj; }
function placeAt(obj, dir, radius, spin=0){ obj.position.copy(dir).multiplyScalar(radius); obj.quaternion.setFromUnitVectors(UP, dir); obj.rotateY(spin); return obj; }
const softTex = canvasTex(128, 128, (x, w, h) => { const gr = x.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0,0,w,h); });

// ================= 星球本體（平滑） =================
let pgeo = new THREE.IcosahedronGeometry(1, 80); pgeo.deleteAttribute('normal'); pgeo.deleteAttribute('uv'); pgeo = mergeVertices(pgeo);
{
  const pos = pgeo.attributes.position, cols = new Float32Array(pos.count*3), d = new V3(), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++){
    d.fromBufferAttribute(pos, i).normalize(); const t = terrain(d), r = R + t.h; pos.setXYZ(i, d.x*r, d.y*r, d.z*r);
    const c = colorAt(t); col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); cols[i*3] = col.r; cols[i*3+1] = col.g; cols[i*3+2] = col.b;
  }
  pgeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); pgeo.computeVertexNormals();
}
scene.add(new THREE.Mesh(pgeo, rimify(new THREE.MeshToonMaterial({vertexColors:true, gradientMap:gmap}), .22)));

// 海面：半透明、會閃光、輕輕起伏
const waterMat = new THREE.ShaderMaterial({
  uniforms:{uT:{value:0}, uCam:{value:new V3()}, uL:{value:new V3(1,1,1)}},
  vertexShader:`uniform float uT; varying vec3 vW; varying vec3 vN;
    void main(){ vec3 p = position; p += normal * (sin(p.x*2.6 + uT*1.1) * sin(p.z*2.9 + uT*.9) * .025);
      vec4 wp = modelMatrix * vec4(p, 1.); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader:`uniform float uT; uniform vec3 uCam; uniform vec3 uL; varying vec3 vW; varying vec3 vN;
    void main(){ vec3 n = normalize(vN), v = normalize(uCam - vW), l = normalize(uL);
      float fr = pow(1. - max(dot(n, v), 0.), 2.);
      vec3 c = mix(vec3(.47,.74,1.), vec3(.86,.95,1.), fr) * (.78 + .3*max(dot(n, l), 0.));
      float s = sin(vW.x*7. + uT*1.7) * sin(vW.y*6.3 - uT*1.3) * sin(vW.z*7.7 + uT);
      float sp = pow(max(s, 0.), 16.) * .9 + pow(max(dot(n, normalize(l + v)), 0.), 90.) * .55;
      gl_FragColor = vec4(c + sp, .68 + fr*.25); }`,
  transparent:true, depthWrite:false
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), waterMat));

// 大氣光暈
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R*1.2, 64, 48), new THREE.ShaderMaterial({
  uniforms:{c:{value:new THREE.Color('#ff9ed2')}},
  vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
  fragmentShader:'uniform vec3 c;varying vec3 vN;varying vec3 vV;void main(){float f=pow(max(0.,-dot(vN,vV)),1.6);gl_FragColor=vec4(c,f*1.1);}',
  side:THREE.BackSide, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false
})));

// ================= 毛茸茸樹（大量實例化） =================
function fluffGeo(){
  let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i); const n = 1 + (hash3(Math.round(v.x*97), Math.round(v.y*97), Math.round(v.z*97)) - .5)*.16; p.setXYZ(i, v.x*n, v.y*n, v.z*n); }
  g.computeVertexNormals(); return g;
}
const FL = {fluff:[], trunk:[], flower:[]};
function frameAt(dir, lift, spin, scale=1, radius){ const pos = radius ? dir.clone().multiplyScalar(radius) : surf(dir, lift); const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin)); return new THREE.Matrix4().compose(pos, q, new V3(scale, scale, scale)); }
function addPart(list, F, x, y, z, sx, sy, sz, color){ list.push([F.clone().multiply(new THREE.Matrix4().compose(new V3(x,y,z), IDQ, new V3(sx,sy,sz))), new THREE.Color(color)]); }
const PAL = {
  candy:{fl:['#ffb3d1','#ffc8e0','#ffe0ee','#ffd1e6','#fff0f6'], tr:'#fff0f5'},
  green:{fl:['#8fdc9a','#a9e8a8','#7acb8d','#c4f0b0','#9be3b0'], tr:'#a87a5a'},
  mist:{fl:['#4a3a63','#5b4675','#3f3157','#685083'], tr:'#33243f'},
};
function fluffTree(F, pal, kind){
  if (kind === 'mist'){ addPart(FL.trunk, F, 0, .32, 0, .045, .64, .045, pal.tr);
    [[.48,.24],[.7,.2],[.9,.15],[1.06,.1],[1.17,.06]].forEach(([y, r], i) => addPart(FL.fluff, F, (rng()-.5)*.05, y, (rng()-.5)*.05, r, r*1.05, r, pal.fl[i%pal.fl.length])); return; }
  addPart(FL.trunk, F, 0, .22, 0, .035, .44, .035, pal.tr);
  addPart(FL.fluff, F, 0, .58, 0, .22, .2, .22, pal.fl[0]);
  const n = 9 + Math.floor(rng()*4);
  for (let i = 0; i < n; i++){ const a = rng()*TAU, el = (rng() - .3)*1.3, r = .12 + rng()*.07;
    addPart(FL.fluff, F, Math.cos(a)*Math.cos(el)*.18, .58 + Math.sin(el)*.15, Math.sin(a)*Math.cos(el)*.18, r, r, r, pal.fl[1 + i%(pal.fl.length - 1)]); }
}
function forestScatter(center, rad, count, pal, kind, minA=0, scale=[.8,1.5]){
  for (let i = 0; i < count; i++){ const dir = scatter(center, rad, minA); if (!walkable(dir) || onPlat(dir)) continue;
    fluffTree(frameAt(dir, -.03, rng()*TAU, scale[0] + rng()*(scale[1] - scale[0])), pal, kind); }
}
forestScatter(FORESTS[0].dir, .29, 60, PAL.candy, 'candy');
forestScatter(FORESTS[1].dir, .29, 55, PAL.mist, 'mist');
forestScatter(C.wood.dir, .34, 70, PAL.green, 'green', .13);
ISLANDS.forEach(is => forestScatter(is.dir, .03, 3, PAL.green, 'green', 0, [.6,1]));

// 小花
for (let n = 0, tries = 0; n < 1500 && tries < 20000; tries++){
  const d = new V3(rng()*2-1, rng()*2-1, rng()*2-1); if (d.lengthSq() > 1 || d.lengthSq() < .01) continue; d.normalize();
  const t = terrain(d); if (t.sea || t.flat > .55 || t.mtn > .9 || t.fireW > .3 || t.desertW > .2 || t.land < .26) continue;
  if (REGIONS.some(r => d.angleTo(r.dir) < r.rad*.7)) continue;
  const s = .028 + rng()*.02; addPart(FL.flower, frameAt(d, .01, 0), 0, 0, 0, s, s*.8, s, ['#ffffff','#ffd36e','#ff9ec7','#c9b6ff','#ffe0ee'][n%5]); n++;
}
function buildInstances(list, geo, mat){ if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); }); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; scene.add(im); return im; }

// ================= 角色：戴貓耳頭套的小幽靈 =================
const ZS = .82, ST = 1.15, sy = y => .16 + (y - .16)*ST;
const UPPER = new THREE.SplineCurve([[.35,.2],[.34,.4],[.32,.7],[.3,.9],[.26,1.02],[.12,1.07],[.001,1.08]].map(p => new THREE.Vector2(p[0], sy(p[1])))).getPoints(40);
const TOP = UPPER[UPPER.length - 1].y, EYE_Y = .96;
const CG = (() => { const g = new THREE.LatheGeometry([new THREE.Vector2(0,.16), new THREE.Vector2(.34,.16), ...UPPER], 48), p = g.attributes.position;
  for (let i = 0; i < p.count; i++){ const y = p.getY(i), x = p.getX(i), z = p.getZ(i); if (y < .275 && Math.hypot(x, z) > .2) p.setY(i, y + .025*Math.sin(7*Math.atan2(z, x))*(1 - (y - .16)/.115)); }
  g.computeVertexNormals(); return g; })();
const rAt = y => { let b = UPPER[0]; for (const v of UPPER) if (Math.abs(v.y - y) < Math.abs(b.y - y)) b = v; return b.x; };
const faceZ = (x, y) => Math.sqrt(Math.max(rAt(y)**2 - x*x, 0))*ZS + .005;
const GG = {ear:new THREE.ConeGeometry(.15, .5, 24), eye:new THREE.SphereGeometry(.045, 16, 12), hi:new THREE.SphereGeometry(.014, 8, 6), dot:new THREE.SphereGeometry(1, 10, 8)};
function limbGeo(pts, r){ return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(...p)), false, 'catmullrom', .35), 20, r, 6, false); }
function limb(pts, r=.016, end=1.7){ const g = new THREE.Group(); g.add(new THREE.Mesh(limbGeo(pts, r), ink)); const e = mesh(GG.dot, ink, ...pts[pts.length-1]); e.scale.setScalar(r*end); g.add(e); return g; }
const POSE = { arms:s => [[s*.3,.66,0],[s*.47,.47,.06],[s*.44,.28,.14]], legs:s => [[s*.1,.26,0],[s*.13,.12,.04],[s*.11,.015,0],[s*.11,.015,.08]] };
function ghost(color, pose={}){
  const g = new THREE.Group(), m = ds(color), arms = pose.arms || POSE.arms, legs = pose.legs === null ? null : (pose.legs || POSE.legs);
  const body = new THREE.Mesh(CG, m); body.scale.z = ZS; g.add(body);
  [-1, 1].forEach(s => {
    const e = mesh(GG.ear, m, s*.15, sy(1.2) + .02, 0); e.rotation.z = -s*.16; e.scale.z = ZS*.75; g.add(e);
    const eye = mesh(GG.eye, ink, s*.1, EYE_Y, faceZ(s*.1, EYE_Y)); eye.scale.set(1, 1.3, .5); g.add(eye);
    g.add(mesh(GG.hi, toon('#ffffff'), s*.1 + .015, EYE_Y + .02, faceZ(s*.1, EYE_Y) + .02));
    g.add(limb(arms(s), .016, 1.8)); if (legs) g.add(limb(legs(s), .018, 1.4));
  });
  return g;
}
function heartGeo(depth, bevel=1.2){
  const s = new THREE.Shape(), x = 0, y = 0;
  s.moveTo(x+5,y+5); s.bezierCurveTo(x+5,y+5,x+4,y,x,y); s.bezierCurveTo(x-6,y,x-6,y+7,x-6,y+7);
  s.bezierCurveTo(x-6,y+11,x-3,y+15.4,x+5,y+19); s.bezierCurveTo(x+12,y+15.4,x+16,y+11,x+16,y+7);
  s.bezierCurveTo(x+16,y+7,x+16,y,x+10,y); s.bezierCurveTo(x+7,y,x+5,y+5,x+5,y+5);
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled:true, bevelSize:bevel, bevelThickness:bevel, bevelSegments:4, curveSegments:20}); g.center(); return g;
}
function costume(p){
  const sm = new THREE.Mesh(lathe(UPPER.filter(v => v.y < .64).map(v => [v.x*1.04, v.y])), toon('#ffffff', {key:'suit', map:stripes(['#e8444c','#fff4e6'], true, 16), side:THREE.DoubleSide})); sm.scale.z = ZS; p.add(sm);
  const puff = new THREE.SphereGeometry(.065, 14, 10);
  for (let i = 0; i < 18; i++){ const a = i/18*TAU; p.add(mesh(puff, toon(i%2 ? '#fff4e6' : '#e8444c'), Math.cos(a)*.345, .67, Math.sin(a)*.345*ZS)); }
  const hat = mesh(new THREE.ConeGeometry(.1, .3, 24), toon('#ffffff', {key:'hat', map:stripes(['#5aa7f0','#ffd36e'], false, 8)}), 0, TOP + .1, 0); hat.rotation.z = -.12; p.add(hat);
  p.add(mesh(new THREE.SphereGeometry(.045, 12, 10), toon('#ff9ec7'), .018, TOP + .27, 0));
}
const T_CITIZEN = bake(ghost('#fbf7f2'));
const T_GUARD = (() => {
  const SP = [.02,.66,.37], D = [Math.sin(.85), Math.cos(.85)], at = t => [SP[0] + D[0]*t, SP[1] + D[1]*t, SP[2]], red = toon('#d63a3a');
  const g = ghost('#f2c14e', {arms:s => s > 0 ? [[.3,.66,0],[.44,.7,.22],at(.16)] : [[-.3,.66,0],[-.44,.46,.22],at(-.26)]});
  const my = EYE_Y - .13; g.add(mesh(new THREE.TorusGeometry(.05, .011, 8, 20, Math.PI), ink, 0, my, faceZ(0, my + .02)));
  const cy = my - .1, cr = rAt(cy) + .012, col = mesh(new THREE.TorusGeometry(cr, .028, 10, 48), red, 0, cy, 0); col.rotation.x = Math.PI/2; col.scale.set(1, ZS, 1); g.add(col);
  g.add(mesh(new THREE.SphereGeometry(.04, 12, 10), toon('#ffd36e'), 0, cy - .01, cr*ZS + .02));
  const sp = new THREE.Group(), sh = mesh(new THREE.CylinderGeometry(.02, .02, 1, 10), red); sh.scale.y = 1.3; sp.add(sh);
  const hz = mesh(heartGeo(2.5), red, 0, .77, 0); hz.scale.setScalar(.013); sp.add(hz);
  [-1, 1].forEach(s => { const f = mesh(new THREE.ConeGeometry(.06, .16, 3), red, s*.045, -.57, 0); f.rotation.z = s*.5; f.scale.z = .3; sp.add(f); });
  sp.position.set(...SP); sp.rotation.z = -.85; g.add(sp); return bake(g);
})();
const T_PLAYER = (() => { const g = ghost('#c8b4ff'); g.add(mesh(new THREE.OctahedronGeometry(.12), glow('#ffd36e', .5), 0, TOP + .5, 0)); return bake(g); })();

// ================= 地點建築 =================
const pickables = [], anim = [];
function makeCastle(){
  const g = new THREE.Group(), gold = toon('#f2b84b'), pinkG = glow('#ffe3a3', .7);
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.12, .38, 48), toon('#7b5ea8'), 0, .19, 0));
  for (let i = 0; i < 24; i++){ const a = i/24*TAU; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI/2) < .25) continue; // 石牆上的磚縫
    const b = mesh(new THREE.BoxGeometry(.1, .06, .03), toon('#9479c2'), Math.cos(a)*1.075, .14 + (i%2)*.1, Math.sin(a)*1.075); b.rotation.y = -a + Math.PI/2; g.add(b); }
  g.add(mesh(new THREE.CylinderGeometry(.74, .74, .06, 48), toon('#4f9a6a'), 0, .4, 0));
  [0, Math.PI/2].forEach(r => { const pth = mesh(new THREE.BoxGeometry(1.36, .012, .12), toon('#fff0dc'), 0, .435, 0); pth.rotation.y = r; g.add(pth); });
  g.add(mesh(new THREE.CylinderGeometry(.76, .76, .5, 48, 1, true), ds('#f2b84b'), 0, .62, 0));
  { const rimT = mesh(new THREE.TorusGeometry(.765, .025, 8, 64), gold, 0, .87, 0); rimT.rotation.x = Math.PI/2; g.add(rimT); }
  const spike = new THREE.ConeGeometry(.13, .38, 16), hz = heartGeo(3, 1);
  for (let i = 0; i < 9; i++){ const a = i/9*TAU, b = a + TAU/18;
    g.add(mesh(spike, gold, Math.cos(a)*.76, 1.05, Math.sin(a)*.76));
    const h = mesh(hz, toon('#ff7fb5'), Math.cos(b)*.775, .66, Math.sin(b)*.775); h.scale.setScalar(.011); h.rotation.set(0, -b + Math.PI/2, Math.PI); g.add(h); }
  const rose = new THREE.IcosahedronGeometry(.06, 1);
  for (let i = 0; i < 40; i++){ const a = rng()*TAU, r = .2 + rng()*.48; if (Math.abs(Math.cos(a)*r) < .08 || Math.abs(Math.sin(a)*r) < .08) continue; g.add(mesh(rose, toon(i%3 ? '#d6334a' : '#3f8f5a'), Math.cos(a)*r, .47, Math.sin(a)*r)); }
  const heart = mesh(heartGeo(5, 1.5), toon('#e2453f'), 0, 1.25, 0); heart.scale.setScalar(.052); heart.rotation.z = Math.PI; g.add(heart);
  g.add(mesh(new THREE.BoxGeometry(.2, .28, .1), toon('#5a1f3a'), 0, .97, .2));
  const gw = mesh(new THREE.TorusGeometry(.1, .02, 8, 20, Math.PI), gold, 0, 1.11, .25); g.add(gw);
  [-.28, .28].forEach(x => g.add(mesh(new THREE.CircleGeometry(.06, 20), pinkG, x, 1.28, .3)));
  const crown = new THREE.Group(); crown.position.y = 1.86; crown.add(mesh(new THREE.CylinderGeometry(.17, .17, .1, 20), gold));
  for (let i = 0; i < 5; i++){ const a = i/5*TAU; crown.add(mesh(new THREE.ConeGeometry(.05, .18, 10), gold, Math.cos(a)*.15, .12, Math.sin(a)*.15)); crown.add(mesh(new THREE.SphereGeometry(.025, 8, 6), toon('#ff7fb5'), Math.cos(a)*.15, .23, Math.sin(a)*.15)); }
  g.add(crown);
  // 正門：階梯、拱門、城門（朝 +z）
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.BoxGeometry(.5 - k*.06, .13*(k + 1), .13), toon(k%2 ? '#e8dcff' : '#f6efff'), 0, .065*(k + 1), 1.24 - k*.11));
  g.add(mesh(new THREE.BoxGeometry(.26, .3, .06), toon('#5a1f3a'), 0, .2, 1.07));
  g.add(mesh(new THREE.TorusGeometry(.15, .035, 10, 24, Math.PI), gold, 0, .32, 1.09));
  [-1, 1].forEach(s => { g.add(mesh(new THREE.CylinderGeometry(.04, .045, .45, 12), toon('#f6efff'), s*.2, .22, 1.1)); g.add(mesh(new THREE.SphereGeometry(.05, 12, 8), gold, s*.2, .47, 1.1)); });
  // 四座塔：發光窗戶與旗子
  const tower = new THREE.CylinderGeometry(.12, .15, .7, 20), roof = new THREE.ConeGeometry(.2, .36, 20), win = glow('#ffd36e', .8), flagG = new THREE.ShapeGeometry((() => { const f = new THREE.Shape(); f.moveTo(0,0); f.quadraticCurveTo(.12,.02,.22,-.05); f.lineTo(0,-.12); f.lineTo(0,0); return f; })());
  const flags = [];
  for (let i = 0; i < 4; i++){ const a = i/4*TAU + .4, x = Math.cos(a)*1.02, z = Math.sin(a)*1.02;
    g.add(mesh(tower, toon('#9c6fb8'), x, .5, z)); g.add(mesh(roof, toon('#ff8fc0'), x, 1.03, z));
    for (const yy of [.45, .68]){ const w = mesh(new THREE.BoxGeometry(.05, .08, .02), win, Math.cos(a)*1.165, yy, Math.sin(a)*1.165); w.rotation.y = -a + Math.PI/2; g.add(w); }
    g.add(mesh(new THREE.CylinderGeometry(.008, .008, .3, 6), toon('#5a1f3a'), x, 1.33, z));
    const fl = mesh(flagG, ds(i%2 ? '#ffd36e' : '#ff7fb5'), x, 1.47, z); g.add(fl); flags.push(fl); }
  anim.push(t => flags.forEach((f, i) => { f.rotation.y = Math.sin(t*2.4 + i)*.5; }));
  return g;
}
// 金之城：音樂盒鐘樓
function makeMetal(){
  const g = new THREE.Group(), gold = toon('#f2b84b'), cream = toon('#fff0c8'), pale = toon('#ffe08a');
  g.add(mesh(new THREE.CylinderGeometry(.85, .9, .14, 40), cream, 0, .07, 0));
  put(g, mesh(new THREE.TorusGeometry(.86, .035, 8, 60), gold, 0, .14, 0)).rotation.x = Math.PI/2;
  g.add(mesh(new THREE.CylinderGeometry(.24, .28, .55, 24), pale, 0, .42, 0));
  g.add(mesh(new THREE.CylinderGeometry(.2, .22, .45, 8), gold, 0, .92, 0));
  for (let i = 0; i < 4; i++){ const a = i/4*TAU + Math.PI/4; g.add(mesh(new THREE.CylinderGeometry(.025, .025, .34, 10), cream, Math.cos(a)*.17, 1.32, Math.sin(a)*.17)); }
  g.add(mesh(lathe([[0,0],[.13,0],[.12,.03],[.09,.08],[.08,.16],[.06,.21],[0,.22]], 32), glow('#ffcc33', .3), 0, 1.2, 0));
  g.add(mesh(new THREE.SphereGeometry(.24, 32, 16, 0, TAU, 0, Math.PI/2), gold, 0, 1.49, 0));
  g.add(mesh(new THREE.ConeGeometry(.05, .3, 12), gold, 0, 1.85, 0));
  g.add(mesh(new THREE.OctahedronGeometry(.08), glow('#ffe08a', .6), 0, 2.06, 0));
  const gearG = (() => { const parts = [new THREE.CylinderGeometry(.16, .16, .05, 24)]; for (let i = 0; i < 10; i++){ const b = new THREE.BoxGeometry(.06, .05, .06); b.translate(Math.cos(i/10*TAU)*.18, 0, Math.sin(i/10*TAU)*.18); parts.push(b.toNonIndexed()); } return mergeGeometries(parts.map(p => { p = p.index ? p.toNonIndexed() : p; p.clearGroups(); return p; })); })();
  for (let i = 0; i < 3; i++){ const a = i/3*TAU, gear = mesh(gearG, gold, Math.cos(a)*.29, .5, Math.sin(a)*.29); gear.rotation.z = Math.PI/2; gear.rotation.y = -a; const piv = new THREE.Group(); piv.add(gear); g.add(piv);
    anim.push(t => { gear.rotateY(.01*(i%2 ? 1 : -1)); }); }
  const onion = lathe([[0,0],[.12,0],[.16,.06],[.13,.13],[.06,.2],[.02,.26],[0,.3]], 32);
  for (let i = 0; i < 5; i++){ const a = i/5*TAU + .3, x = Math.cos(a)*.62, z = Math.sin(a)*.62;
    g.add(mesh(new THREE.CylinderGeometry(.12, .12, .3, 20), cream, x, .29, z)); g.add(mesh(onion, i%2 ? gold : toon('#ff9ec7'), x, .44, z)); }
  return g;
}
// 木之城：樹屋村與吊橋
function makeWood(){
  const g = new THREE.Group(), bark = toon('#9a6a4a'), wall = toon('#e8b27a'), roofM = toon('#d9615a'), rope = toon('#c89a6a');
  const spots = [[0,0,1.25],[.55,.25,1.0],[-.45,.4,.95],[.1,-.6,1.05]];
  const houses = spots.map(([x, z, h], i) => {
    g.add(mesh(new THREE.CylinderGeometry(.09, .14, h, 16), bark, x, h/2, z));
    const hy = h*.62; g.add(mesh(new THREE.BoxGeometry(.32, .24, .3), wall, x, hy, z));
    const rf = mesh(new THREE.ConeGeometry(.27, .22, 4), roofM, x, hy + .23, z); rf.rotation.y = Math.PI/4; g.add(rf);
    g.add(mesh(new THREE.CircleGeometry(.05, 16), toon('#5a3a2a'), x, hy + .02, z + .151));
    g.add(mesh(new THREE.CylinderGeometry(.2, .2, .03, 20), toon('#b07a52'), x, hy - .13, z));
    return new V3(x, hy - .1, z);
  });
  [[0,1],[0,2],[0,3]].forEach(([a, b]) => { const A = houses[a], B = houses[b], M = A.clone().lerp(B, .5); M.y -= .12;
    const cv = new THREE.CatmullRomCurve3([A, M, B]); [-.06, .06].forEach(o => { const off = new V3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(o);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([A.clone().add(off).setY(A.y + .1), M.clone().add(off).setY(M.y + .1), B.clone().add(off).setY(B.y + .1)]), 16, .008, 5), rope)); });
    for (let i = 1; i < 10; i++){ const p = cv.getPoint(i/10), plank = mesh(new THREE.BoxGeometry(.12, .015, .04), toon('#b07a52'), p.x, p.y, p.z); plank.lookAt(g.localToWorld(cv.getPoint(i/10 + .01))); g.add(plank); } });
  g.userData.crowns = spots.map(([x, z, h]) => [x, h + .25, z]);
  return g;
}
// 水之城：海上貝殼珊瑚城
function makeWater(){
  const g = new THREE.Group(), shellG = new THREE.CylinderGeometry(.86, .7, .2, 64, 1), p = shellG.attributes.position;
  for (let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + .05*Math.cos(a*16); p.setX(i, x*k); p.setZ(i, z*k); }
  shellG.computeVertexNormals();
  g.add(mesh(shellG, toon('#ffe4ec'), 0, .1, 0));
  const pearl = toon('#f4f0ff', {key:'pearl', rim:.6});
  [[0,0,.34],[.42,.22,.2],[-.4,.3,.18],[.1,-.48,.22],[-.3,-.35,.15]].forEach(([x, z, r]) => g.add(mesh(new THREE.SphereGeometry(r, 32, 16, 0, TAU, 0, Math.PI/2), pearl, x, .2, z)));
  const conch = new THREE.Group(); conch.position.set(0, .5, 0); g.add(conch);
  for (let i = 0; i < 7; i++){ const r = .2 - i*.025; put(conch, mesh(new THREE.TorusGeometry(Math.max(r, .03), .05 - i*.004, 12, 32), toon(i%2 ? '#ffd9c2' : '#ffc0a8'), 0, i*.08, 0)).rotation.x = Math.PI/2; }
  conch.add(mesh(new THREE.ConeGeometry(.05, .2, 12), toon('#ffc0a8'), 0, .62, 0));
  const coralM = [toon('#ff8fa3'), toon('#ffb38a'), toon('#ff9ec7')];
  for (let i = 0; i < 7; i++){ const a = i/7*TAU + .2, x = Math.cos(a)*.68, z = Math.sin(a)*.68, m = coralM[i%3], c = new THREE.Group(); c.position.set(x, .2, z);
    c.add(mesh(new THREE.CylinderGeometry(.025, .04, .35, 8), m, 0, .17, 0));
    [-1, 0, 1].forEach(s => { const b = mesh(new THREE.CylinderGeometry(.018, .022, .2, 8), m, s*.06, .36, 0); b.rotation.z = -s*.6; c.add(b); c.add(mesh(new THREE.SphereGeometry(.035, 10, 8), m, s*.12, .44, 0)); });
    c.rotation.y = rng()*TAU; g.add(c); }
  return g;
}
// 火之城：紅磚燈籠塔與熔岩池
function makeFire(){
  const g = new THREE.Group(), brick = toon('#b8443a'), roofM = toon('#5a1f3a'), win = glow('#ffb347', .9), gold = toon('#f2b84b');
  g.add(mesh(new THREE.CylinderGeometry(.85, .92, .12, 40), toon('#7a3a3a'), 0, .06, 0));
  const tower = (x, z, h, r) => { g.add(mesh(new THREE.CylinderGeometry(r*.9, r, h, 6), brick, x, .12 + h/2, z));
    const rf = mesh(lathe([[0,0],[r*1.9,0],[r*1.2,.06],[r*.7,.14],[r*.3,.24],[0,.3]], 6), roofM, x, .12 + h, z); g.add(rf);
    g.add(mesh(new THREE.SphereGeometry(.03, 8, 6), gold, x, .12 + h + .32, z));
    for (let k = 0; k < 6; k++){ const a = k/6*TAU + Math.PI/6; for (const yy of [h*.35, h*.72]) { const w = mesh(new THREE.BoxGeometry(.05, .07, .02), win, x + Math.cos(a)*r*.86, .12 + yy, z + Math.sin(a)*r*.86); w.rotation.y = -a + Math.PI/2; g.add(w); } } };
  tower(0, 0, 1.15, .2);
  [[.5,.2,.6],[-.45,.35,.7],[.2,-.55,.5],[-.35,-.4,.55],[.6,-.25,.45]].forEach(([x, z, h]) => tower(x, z, h, .12));
  const lantern = mesh(new THREE.SphereGeometry(.12, 20, 14), glow('#ffcf6e', .9), 0, 1.75, 0); g.add(lantern);
  const lava = mesh(new THREE.CircleGeometry(.22, 32), glow('#ff6a2a', 1.0), .05, .125, .45); lava.rotation.x = -Math.PI/2; g.add(lava);
  put(g, mesh(new THREE.TorusGeometry(.23, .04, 8, 32), toon('#5a2a2a'), .05, .125, .45)).rotation.x = Math.PI/2;
  anim.push(t => { lantern.material.emissiveIntensity = .7 + Math.sin(t*3)*.25; lava.scale.setScalar(1 + Math.sin(t*2)*.04); });
  return g;
}
// 土之城：梯田、陶罐屋、蘑菇屋
function makeEarth(){
  const g = new THREE.Group(), tiers = [[.85,.12,'#f2c98a'],[.62,.12,'#f6b5c8'],[.4,.12,'#ffe0a8']];
  let y = 0; tiers.forEach(([r, h, c]) => { g.add(mesh(new THREE.CylinderGeometry(r, r + .04, h, 48), toon(c), 0, y + h/2, 0)); y += h; });
  const pot = lathe([[0,0],[.1,0],[.15,.08],[.16,.16],[.12,.26],[.07,.3],[.08,.34],[.001,.34]], 32), potM = toon('#d9875a'), door = toon('#5a2a1f');
  const putPot = (x, yy, z, s) => { const o = mesh(pot, potM, x, yy, z); o.scale.setScalar(s); g.add(o); const d = mesh(new THREE.BoxGeometry(.06*s*1.6, .1*s*1.6, .02), door, x, yy + .06*s, z); d.lookAt(g.localToWorld(new V3(x*3, yy + .06*s, z*3))); d.position.addScaledVector(new V3(x, 0, z).normalize(), .15*s); g.add(d); };
  for (let i = 0; i < 6; i++){ const a = i/6*TAU + .2; putPot(Math.cos(a)*.74, .12, Math.sin(a)*.74, .8); }
  const cap = new THREE.SphereGeometry(.18, 32, 16, 0, TAU, 0, Math.PI/2), capM = toon('#e25a4a'), stemM = toon('#fff0dc'), dotM = toon('#ffffff');
  for (let i = 0; i < 4; i++){ const a = i/4*TAU + .7, x = Math.cos(a)*.5, z = Math.sin(a)*.5;
    g.add(mesh(new THREE.CylinderGeometry(.07, .08, .2, 16), stemM, x, .34, z)); g.add(mesh(cap, capM, x, .44, z));
    for (let k = 0; k < 4; k++){ const b = k/4*TAU + .3; g.add(mesh(new THREE.SphereGeometry(.025, 8, 6), dotM, x + Math.cos(b)*.11, .54, z + Math.sin(b)*.11)); } }
  putPot(0, .36, 0, 1.6);
  return g;
}
const BUILDERS = {main:makeCastle, metal:makeMetal, wood:makeWood, water:makeWater, fire:makeFire, earth:makeEarth};
for (const c of CITIES){
  const g = BUILDERS[c.id]();
  if (c.sea) placeAt(g, c.dir, R + .02, 0); else place(g, c.dir, -.05, 0);
  if (c.id === 'main') faceToward(g, c.dir, PLAZA_DIR);
  g.userData.region = c; scene.add(g); pickables.push(g); g.updateMatrixWorld(true);
  if (c.id === 'main') for (let i = 0; i < 26; i++){ const a = i/26*TAU; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI/2) < .35) continue; // 城堡外圍的玫瑰花叢（避開正門）
    const x = Math.cos(a)*1.28, z = Math.sin(a)*1.28, r = .11 + rng()*.04; addPart(FL.fluff, g.matrixWorld, x, .05, z, r*1.2, r, r*1.2, PAL.green.fl[i%5]);
    for (let k = 0; k < 3; k++) addPart(FL.flower, g.matrixWorld, x + (rng() - .5)*.16, .1 + rng()*.05, z + (rng() - .5)*.16, .035, .035, .035, k%2 ? '#e2334f' : '#ff7fb5'); }
  if (c.id === 'wood') g.userData.crowns.forEach(([x, y, z]) => { const F = g.matrixWorld.clone(); g.updateMatrixWorld(true);
    const W = g.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    for (let i = 0; i < 14; i++){ const a = rng()*TAU, el = (rng() - .2)*1.2, r = .16 + rng()*.08; addPart(FL.fluff, W, Math.cos(a)*Math.cos(el)*.24, Math.sin(el)*.16, Math.sin(a)*Math.cos(el)*.24, r, r, r, PAL.green.fl[i%5]); }
    addPart(FL.fluff, W, 0, .05, 0, .3, .26, .3, PAL.green.fl[0]); });
}
// 森林與廣場的點選區（隱形）
for (const r of [...FORESTS, ...SPOTS]){ const pk = place(new THREE.Mesh(new THREE.CylinderGeometry(r.rad*R*.9, r.rad*R*.9, .6, 24), new THREE.MeshBasicMaterial({visible:false})), r.dir, .2, 0); pk.userData.region = r; scene.add(pk); pickables.push(pk); }

// 水晶林
{ const cg = new THREE.OctahedronGeometry(.11, 0), cm = [toon('#bff0ff', {key:'cr', emissive:new THREE.Color('#5ab8ff'), emissiveIntensity:.45, rim:.5}), toon('#8fd8ff', {key:'cr', emissive:new THREE.Color('#5ab8ff'), emissiveIntensity:.45, rim:.5})];
  for (let i = 0; i < 46; i++){ const dir = scatter(FORESTS[2].dir, .27); if (!walkable(dir)) continue; const g = new THREE.Group(), n = 2 + Math.floor(rng()*3);
    for (let k = 0; k < n; k++){ const m = mesh(cg, cm[k%2], (rng()-.5)*.2, .25, (rng()-.5)*.2); m.scale.set(1, 2.6 + rng()*1.6, 1); m.rotation.set((rng()-.5)*.6, 0, (rng()-.5)*.6); g.add(m); }
    g.scale.setScalar(.8 + rng()*.7); scene.add(place(bake(g), dir, -.03)); } }
// 迷霧
const fogs = [];
for (let i = 0; i < 18; i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:softTex, color:'#cdb8e6', transparent:true, opacity:.38, depthWrite:false}));
  const dir = scatter(FORESTS[1].dir, .3); s.position.copy(surf(dir, .5)); s.scale.setScalar(2 + rng()*1.6); s.userData = {base:s.position.clone(), up:dir, ph:rng()*TAU}; scene.add(s); fogs.push(s); }

// 火之城：尖塔山＋小火焰
{ const spireG = new THREE.ConeGeometry(.3, 1, 20), sm = [toon('#e86aa6'), toon('#c94f93'), toon('#f08cb8')];
  for (let n = 0, tries = 0; n < 30 && tries < 3000; tries++){ const dir = scatter(C.fire.dir, .42, .17), t = terrain(dir); if (t.sea || t.flat > .35) continue;
    const s = mesh(spireG, sm[n%3]), h = 1.3 + rng()*1.6; s.scale.set(1, h, 1); place(s, dir, h/2 - .3); s.rotateX((rng() - .5)*.12); scene.add(s); n++; } }
const flameG = new THREE.ConeGeometry(.08, .3, 14); flameG.translate(0, .15, 0);
const flameIn = new THREE.ConeGeometry(.045, .18, 12); flameIn.translate(0, .09, 0);
const flames = [];
for (let n = 0, tries = 0; n < 42 && tries < 3000; tries++){ const dir = scatter(C.fire.dir, .36, .09); if (!walkable(dir)) continue;
  const g = new THREE.Group(); g.add(new THREE.Mesh(flameG, basic('#ff7a3d', .92))); const inn = new THREE.Mesh(flameIn, basic('#ffe08a', .95)); inn.position.z = .01; g.add(inn);
  g.scale.setScalar(.8 + rng()*.9); place(g, dir, -.02); g.userData.ph = rng()*TAU; g.userData.s = g.scale.x; scene.add(g); flames.push(g); n++; }

// 水之城：旋轉水柱
const spoutTex = canvasTex(64, 256, (x) => { for (let i = 0; i < 8; i++){ x.fillStyle = i%2 ? 'rgba(255,255,255,.95)' : 'rgba(150,215,255,.75)'; x.save(); x.translate(0, i*32); x.transform(1, .5, 0, 1, 0, 0); x.fillRect(-64, 0, 192, 32); x.restore(); } });
spoutTex.wrapS = spoutTex.wrapT = THREE.RepeatWrapping;
const spouts = [];
{ const sg = new THREE.CylinderGeometry(.05, .2, 1, 24, 6, true); sg.translate(0, .5, 0);
  const sm = new THREE.MeshBasicMaterial({map:spoutTex, transparent:true, opacity:.85, side:THREE.DoubleSide, depthWrite:false});
  for (let i = 0; i < 6; i++){ const dir = offsetDir(WATER.dir, i/6*TAU + .3 + Math.PI/6, .15), s = new THREE.Mesh(sg, sm); placeAt(s, dir, R - .05); s.userData.ph = i*1.3; scene.add(s); spouts.push(s); } }

// ================= 雲朵廣場與馬戲團 =================
const plaza = new THREE.Group(); place(plaza, PLAZA_DIR, -.02, 0); faceToward(plaza, PLAZA_DIR, C.main.dir); scene.add(plaza); plaza.updateMatrixWorld(true);
plaza.add(mesh(new THREE.CylinderGeometry(1.05, 1.1, .06, 56), toon('#ffd6e7'), 0, .03, 0));
plaza.add(mesh(new THREE.CylinderGeometry(.62, .62, .065, 56), toon('#fff4e6'), 0, .035, 0));
for (let i = 0; i < 34; i++){ const a = i/34*TAU, r = .07 + rng()*.05; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI/2) < .3) continue; addPart(FL.fluff, plaza.matrixWorld, Math.cos(a)*1.1, .05, Math.sin(a)*1.1, r*1.3, r, r*1.3, i%2 ? '#ffffff' : '#ffd1e6'); }
{ const tent = new THREE.Group(), st = toon('#ffffff', {key:'tent', map:stripes(['#e8444c','#fff4e6'], true, 14)});
  tent.add(mesh(new THREE.CylinderGeometry(.3, .3, .22, 28), st, 0, .11, 0)); tent.add(mesh(new THREE.ConeGeometry(.36, .36, 28), st, 0, .4, 0));
  tent.add(mesh(new THREE.CylinderGeometry(.008, .008, .2, 6), toon('#5a1f3a'), 0, .66, 0)); const fl = mesh(new THREE.ConeGeometry(.04, .1, 3), toon('#ffd36e'), .05, .72, 0); fl.rotation.z = -Math.PI/2; tent.add(fl);
  tent.scale.setScalar(.8); tent.position.set(0, .06, -.8); plaza.add(tent); }
const CS = .3; // 馬戲團角色縮放
const circus = {};
{ // 踩球
  const g = new THREE.Group(); g.scale.setScalar(CS); g.position.set(-.22, .06, .22); plaza.add(g);
  const ball = mesh(new THREE.SphereGeometry(.38, 32, 24), toon('#ffffff', {key:'ball', map:stripes(['#e8444c','#fff4e6','#5aa7f0'], true, 12)}), 0, .38, 0); g.add(ball);
  const p = ghost('#f2c14e', {arms:s => [[s*.3,.66,0],[s*.52,.86,.08],[s*.36,1.12,.16]]}); costume(p); const pb = bake(p); pb.position.y = .76; g.add(pb);
  const balls = new THREE.Group(); ['#ff7fb5','#5aa7f0','#ffd36e'].forEach(c => balls.add(mesh(new THREE.SphereGeometry(.06, 14, 10), toon(c)))); balls.position.set(0, .76 + TOP + .62, .2); g.add(balls);
  anim.push(t => { ball.rotation.x = t*.6; pb.position.y = .76 + Math.abs(Math.sin(t*2))*.03; balls.children.forEach((b, i) => { const a = t*3 + i*TAU/3; b.position.set(Math.cos(a)*.3, Math.sin(a)*.2, 0); }); });
}
{ // 走鋼索
  const g = new THREE.Group(); g.scale.setScalar(CS); g.position.set(0, .06, -.12); plaza.add(g);
  const st = new THREE.Group(), rope = mesh(new THREE.CylinderGeometry(.014, .014, 2.4, 8), toon('#fff4e6'), 0, .7, 0); rope.rotation.z = Math.PI/2; st.add(rope);
  [-1.15, 1.15].forEach(x => { st.add(mesh(new THREE.CylinderGeometry(.04, .05, .76, 12), toon('#8a5a8c'), x, .38, 0)); st.add(mesh(new THREE.SphereGeometry(.06, 12, 10), toon('#ffd36e'), x, .78, 0)); });
  g.add(bake(st));
  const p = ghost('#f2c14e', {arms:s => [[s*.3,.66,0],[s*.44,.5,.16],[s*.22,.6,.32]], legs:s => [[s*.1,.26,0],[s*.12,.12,.05],[s*.04,.03,0],[s*.04,.03, s > 0 ? .1 : -.06]]}); costume(p);
  const pole = new THREE.Group(); pole.position.set(0, .6, .32); p.add(pole); const pl = mesh(new THREE.CylinderGeometry(.015, .015, 1.5, 8), toon('#ffd36e')); pl.rotation.z = Math.PI/2; pole.add(pl);
  [-.75, .75].forEach(x => pole.add(mesh(new THREE.SphereGeometry(.07, 12, 10), toon('#ff7fb5'), x, 0, 0)));
  const pb = bake(p); const walker = new THREE.Group(); walker.position.y = .69; walker.add(pb); walker.rotation.y = Math.PI/2; g.add(walker);
  anim.push(t => { walker.position.x = Math.sin(t*.35)*.75; walker.rotation.y = Math.cos(t*.35) > 0 ? Math.PI/2 : -Math.PI/2; pb.rotation.z = Math.sin(t*1.6)*.12; });
}
{ // 獨輪車：輪子、踏板、腳一起轉
  const g = new THREE.Group(); g.scale.setScalar(CS); plaza.add(g); const metal = toon('#5aa7f0');
  const wheel = new THREE.Group(); wheel.position.y = .3; wheel.rotation.y = Math.PI/2; g.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(.26, .045, 12, 40), toon('#3b1d4a'))); wheel.add(mesh(new THREE.TorusGeometry(.22, .015, 6, 40), metal));
  for (let i = 0; i < 8; i++){ const s = mesh(new THREE.CylinderGeometry(.008, .008, .44, 5), metal); s.rotation.z = i/8*Math.PI; wheel.add(s); }
  const hub = mesh(new THREE.CylinderGeometry(.04, .04, .3, 12), toon('#ffd36e')); hub.rotation.x = Math.PI/2; wheel.add(hub);
  const crank = new THREE.Group(); crank.position.y = .3; g.add(crank);
  [-1, 1].forEach(s => { const a = mesh(new THREE.BoxGeometry(.02, .12, .02), metal, s*.1, -s*.06, 0); crank.add(a); crank.add(mesh(new THREE.BoxGeometry(.08, .02, .05), toon('#ffd36e'), s*.13, -s*.12, 0)); });
  const frame = new THREE.Group(); frame.add(mesh(new THREE.CylinderGeometry(.025, .025, .42, 10), metal, 0, .52, 0));
  const seat = mesh(new THREE.CapsuleGeometry(.07, .12, 4, 10), toon('#e8444c'), 0, .74, 0); seat.rotation.x = Math.PI/2; seat.scale.set(1, 1, .6); frame.add(seat); g.add(bake(frame));
  const p = ghost('#f2c14e', {arms:s => [[s*.3,.66,0],[s*.55,.7,.02],[s*.7,.86,0]], legs:null}); costume(p); const pb = bake(p); pb.position.y = .65; g.add(pb);
  const legs = [-1, 1].map(s => { const m = new THREE.Mesh(limbGeo([[0,0,0],[0,-.1,.1],[0,-.2,0]], .018), ink); g.add(m); return m; });
  let ang = 0, last = 0;
  anim.push(t => { const dt = t - last; last = t; const w = .35; ang += dt*w*.5/(.26*CS); // 角速度 = 線速度 / 輪半徑
    const a = t*w, x = Math.cos(a)*.5, z = Math.sin(a)*.5; g.position.set(x, .06, z); g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
    wheel.rotation.z = ang; crank.rotation.x = ang;
    legs.forEach((m, i) => { const s = i ? 1 : -1, ph = ang + (s > 0 ? 0 : Math.PI);
      const ped = new V3(s*.13, .3 - .12*Math.cos(ph), .12*Math.sin(ph) * -1), hip = new V3(s*.1, .65 + .26, 0), knee = hip.clone().lerp(ped, .5).add(new V3(s*.02, 0, .16));
      m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hip, knee, ped], false, 'catmullrom', .35), 16, .018, 6, false); });
  });
}

// ================= 導航網格：大海判定、小路 =================
const NAV = (() => {
  let g = new THREE.IcosahedronGeometry(1, 36); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const pos = g.attributes.position, idx = g.index.array, n = pos.count, dir = [], block = new Uint8Array(n), cost = new Float32Array(n), seaN = new Uint8Array(n);
  for (let i = 0; i < n; i++){ const d = new V3().fromBufferAttribute(pos, i).normalize(), t = terrain(d); dir.push(d); seaN[i] = t.sea ? 1 : 0; block[i] = (t.sea || onPlat(d)) ? 1 : 0; cost[i] = 1 + t.mtn*6; }
  const adjS = Array.from({length:n}, () => new Set());
  for (let k = 0; k < idx.length; k += 3){ const a = idx[k], b = idx[k+1], c = idx[k+2]; adjS[a].add(b).add(c); adjS[b].add(a).add(c); adjS[c].add(a).add(b); }
  const adj = adjS.map(s => [...s]);
  // 空間雜湊：快速找最近節點
  const cell = .08, key = (x, y, z) => `${Math.floor(x/cell)},${Math.floor(y/cell)},${Math.floor(z/cell)}`, buckets = new Map();
  dir.forEach((d, i) => { const k = key(d.x, d.y, d.z); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); });
  function nearest(d){ let best = -1, bd = -2; const cx = Math.floor(d.x/cell), cy = Math.floor(d.y/cell), cz = Math.floor(d.z/cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++){ const l = buckets.get(`${cx+a},${cy+b},${cz+c}`); if (l) for (const i of l){ const v = dir[i].dot(d); if (v > bd){ bd = v; best = i; } } }
    return best; }
  // 海的連通區塊：最大的那片是大海
  const comp = new Int32Array(n).fill(-1); let big = -1, bigN = 0;
  for (let i = 0, id = 0; i < n; i++){ if (!seaN[i] || comp[i] >= 0) continue; const st = [i]; comp[i] = id; let cnt = 0;
    while (st.length){ const u = st.pop(); cnt++; for (const v of adj[u]) if (seaN[v] && comp[v] < 0){ comp[v] = id; st.push(v); } }
    if (cnt > bigN){ bigN = cnt; big = id; } id++; }
  return {dir, block, cost, adj, nearest, isOcean:d => { const i = nearest(d); return i >= 0 && comp[i] === big; }};
})();
function dijkstra(src){
  const n = NAV.dir.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), heap = [[0, src]]; dist[src] = 0;
  const push = it => { heap.push(it); let i = heap.length - 1; while (i){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length){ heap[0] = last; let i = 0; for (;;){ const l = 2*i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length){ const [du, u] = pop(); if (du > dist[u]) continue;
    for (const v of NAV.adj[u]){ if (NAV.block[v]) continue; const w = du + NAV.dir[u].angleTo(NAV.dir[v])*(NAV.cost[u] + NAV.cost[v])*.5; if (w < dist[v]){ dist[v] = w; prev[v] = u; push([w, v]); } } }
  return {dist, prev};
}
function chaikin(pts, it=2){ for (let k = 0; k < it; k++){ const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++){ const a = pts[i], b = pts[i+1]; o.push(a.clone().lerp(b, .25).normalize(), a.clone().lerp(b, .75).normalize()); } o.push(pts[pts.length - 1]); pts = o; } return pts; }
function resample(pts, stepA=.006){ const o = [pts[0].clone()]; let carry = 0;
  for (let i = 0; i < pts.length - 1; i++){ const a = pts[i], b = pts[i+1], L = a.angleTo(b); let s = stepA - carry; while (s < L){ o.push(a.clone().lerp(b, s/L).normalize()); s += stepA; } carry = L - (s - stepA); }
  o.push(pts[pts.length - 1].clone()); return o; }
// 小路連接的地區（水之城除外）
const ROAD_NODES = [C.main, C.metal, C.wood, C.fire, C.earth, ...FORESTS, SPOTS[1], SPOTS[2]];
const ROADS = [];
{
  const src = ROAD_NODES.map(r => { let i = NAV.nearest(r.id === 'main' ? PLAZA_DIR : r.dir); if (NAV.block[i]) i = NAV.adj[i].find(v => !NAV.block[v]) ?? i; return i; });
  const runs = src.map(s => dijkstra(s)), pairs = [];
  for (let a = 0; a < src.length; a++) for (let b = a + 1; b < src.length; b++){ const c = runs[a].dist[src[b]]; if (isFinite(c)) pairs.push([c, a, b]); }
  pairs.sort((x, y) => x[0] - y[0]); const par = src.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i])), used = [];
  for (const [c, a, b] of pairs){ if (find(a) !== find(b)){ par[find(a)] = find(b); used.push([a, b]); } else if (c < .5 && used.length < src.length + 3) used.push([a, b]); }
  // 火之城 ↔ 木之城：找兩岸最窄的地方搭橋
  { const fi = ROAD_NODES.indexOf(C.fire), wi = ROAD_NODES.indexOf(C.wood), n = NAV.dir.length, comp = new Int32Array(n).fill(-1);
    for (let i = 0, id = 0; i < n; i++){ if (NAV.block[i] || comp[i] >= 0) continue; const st = [i]; comp[i] = id; while (st.length){ const u = st.pop(); for (const v of NAV.adj[u]) if (!NAV.block[v] && comp[v] < 0){ comp[v] = id; st.push(v); } } id++; }
    if (comp[src[fi]] !== comp[src[wi]]){
      const M = C.fire.dir.clone().add(C.wood.dir).normalize(), coast = c => { const o = []; for (let i = 0; i < n; i++) if (comp[i] === c && NAV.dir[i].angleTo(M) < .5 && NAV.adj[i].some(v => NAV.block[v])) o.push(i); return o; };
      const ca = coast(comp[src[fi]]), cb = coast(comp[src[wi]]); let best = null;
      for (const a of ca) for (const b of cb){ const sc = NAV.dir[a].angleTo(NAV.dir[b]) + .15*(NAV.dir[a].angleTo(M) + NAV.dir[b].angleTo(M)); if (!best || sc < best[0]) best = [sc, a, b]; }
      if (best){ const [, a, b] = best, A = NAV.dir[a], B = NAV.dir[b], L = A.angleTo(B);
        const br = {A:A.clone(), B:B.clone(), L:L + .02, n:new V3().crossVectors(A, B).normalize(), w:.013, hA:terrain(A).h, hB:terrain(B).h, arch:Math.min(.9, L*R*.22)};
        // 兩端各往陸地延伸一點，避免接縫掉進海裡
        BRIDGES.push(br);
        const walkBack = (run, from) => { const o = []; let u = from; while (u >= 0){ o.push(NAV.dir[u]); u = run.prev[u]; } return o; };
        const toA = walkBack(runs[fi], a).reverse(), fromB = walkBack(runs[wi], b), span = [];
        for (let k = 1; k < 30; k++) span.push(A.clone().lerp(B, k/30).normalize());
        ROADS.push({a:C.fire, b:C.wood, pts:resample([...chaikin(toA, 3), ...span, ...chaikin(fromB, 3)]), bridge:br}); } } }
  for (const [a, b] of used){ const path = []; let u = src[b]; while (u >= 0){ path.push(NAV.dir[u]); if (u === src[a]) break; u = runs[a].prev[u]; }
    path.reverse(); if (ROAD_NODES[a].id === 'main') path.unshift(C.main.dir.clone()); if (ROAD_NODES[b].id === 'main') path.push(C.main.dir.clone());
    ROADS.push({a:ROAD_NODES[a], b:ROAD_NODES[b], pts:resample(chaikin(path, 3))}); }
}
const ROAD_PTS = [];
{ // 淺粉色小路：兩層緞帶（深色邊＋淺色路面），貼著地形
  const near = (p, r) => r.id === 'main' ? p.angleTo(r.dir) < .135 : r.core ? p.angleTo(r.dir) < r.core : r.spot ? p.angleTo(r.dir) < .025 : false;
  const strips = [];
  for (const rd of ROADS){ let cur = []; for (const p of rd.pts){ if (near(p, rd.a) || near(p, rd.b) || !walkable(p)){ if (cur.length > 2) strips.push(cur); cur = []; } else { cur.push(p); ROAD_PTS.push(p); } } if (cur.length > 2) strips.push(cur); }
  const build = (w, lift, color, off) => { const P = [], N = [], I = []; let base = 0;
    for (const s of strips){ for (let i = 0; i < s.length; i++){ const d = s[i], h = ground(d) + lift, c = d.clone().multiplyScalar(R + h), t = s[Math.min(i+1, s.length-1)].clone().sub(s[Math.max(i-1, 0)]), side = new V3().crossVectors(t, d).normalize().multiplyScalar(w);
        P.push(c.x + side.x, c.y + side.y, c.z + side.z, c.x - side.x, c.y - side.y, c.z - side.z); N.push(d.x, d.y, d.z, d.x, d.y, d.z);
        if (i) I.push(base + 2*i - 2, base + 2*i - 1, base + 2*i, base + 2*i - 1, base + 2*i + 1, base + 2*i); }
      base += s.length*2; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
    const m = toon(color, {key:'road' + off, rim:.1, polygonOffset:true, polygonOffsetFactor:-off, polygonOffsetUnits:-off*2, side:THREE.DoubleSide}); const o = new THREE.Mesh(g, m); o.frustumCulled = false; scene.add(o); };
  build(.085, .03, '#f3a9c9', 2); build(.06, .04, '#ffe3ef', 4);
}
// 拱橋模型：木板橋面、粉色欄杆、柱子與小燈
for (const br of BRIDGES){
  const g = new THREE.Group(), N = Math.max(20, Math.round(br.L*R/.075)), plankG = new THREE.BoxGeometry(.3, .035, .07), wood = toon('#e8b27a'), wood2 = toon('#d9a066'), rail = toon('#ff9ec7'), post = toon('#fff4f8'), lampM = glow('#ffe08a', .9);
  const P = [], D = [];
  for (let i = 0; i <= N; i++){ const t = i/N, d = br.A.clone().lerp(br.B, t).normalize(); D.push(d); P.push(d.clone().multiplyScalar(R + deckH(br, t))); }
  const tmp = new THREE.Object3D(), rails = [[], []];
  for (let i = 0; i <= N; i++){ const d = D[i], p = P[i], nx = P[Math.min(i+1, N)], pv = P[Math.max(i-1, 0)], fwd = nx.clone().sub(pv).normalize(), side = new V3().crossVectors(fwd, d).normalize();
    tmp.position.copy(p).addScaledVector(d, -.018); tmp.up.copy(d); tmp.lookAt(tmp.position.clone().add(fwd)); tmp.updateMatrix();
    const pl = new THREE.Mesh(plankG, i%2 ? wood : wood2); pl.applyMatrix4(tmp.matrix); g.add(pl);
    [-1, 1].forEach((s, k) => rails[k].push(p.clone().addScaledVector(side, s*.14).addScaledVector(d, .14)));
    if (i%4 === 0) [-1, 1].forEach(s => { const q = p.clone().addScaledVector(side, s*.14).addScaledVector(d, .07), m = mesh(new THREE.CylinderGeometry(.012, .012, .14, 6), post); m.position.copy(q); m.quaternion.setFromUnitVectors(UP, d); g.add(m);
      if (i%12 === 0){ const l = mesh(new THREE.SphereGeometry(.03, 10, 8), lampM); l.position.copy(q).addScaledVector(d, .1); g.add(l); } });
    if (i%8 === 4){ const sea = d.clone().multiplyScalar(R + Math.min(terrain(d).h, 0) - .05), top = p.clone().addScaledVector(d, -.03), h = top.distanceTo(sea);
      if (terrain(d).sea && h > .1){ const c = mesh(new THREE.CylinderGeometry(.05, .07, h, 12), toon('#c9a6b8')); c.position.copy(sea).lerp(top, .5); c.quaternion.setFromUnitVectors(UP, d); g.add(c); } }
  }
  rails.forEach(r => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r), N*2, .014, 6), rail)));
  scene.add(bake(g));
}
const nearRoad = (p, a=.018) => ROAD_PTS.some(q => q.angleTo(p) < a);

// ================= 民宅（各區風格） =================
const HOUSES = [];
function hBox(w, h, d, m, x=0, y=0, z=0){ return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z); }
function door(g, z, m=toon('#5a1f3a')){ g.add(hBox(.07, .12, .02, m, 0, .06, z)); }
function pyramidRoof(r, h, m, y){ const c = mesh(new THREE.ConeGeometry(r, h, 4), m, 0, y, 0); c.rotation.y = Math.PI/4; return c; }
const HOUSE_T = {
  main:(() => { const g = new THREE.Group(); g.add(hBox(.28, .24, .26, toon('#f6ecff'), 0, .12, 0)); g.add(pyramidRoof(.25, .22, toon('#ff9ec7'), .35)); door(g, .131);
    const h = mesh(heartGeo(2, .8), glow('#ffb3d1', .6), .08, .16, .135); h.scale.setScalar(.0045); h.rotation.z = Math.PI; g.add(h); return bake(g); })(),
  metal:(() => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(.13, .14, .26, 20), toon('#fff0c8'), 0, .13, 0));
    g.add(mesh(lathe([[0,0],[.12,0],[.16,.06],[.13,.13],[.06,.2],[.02,.26],[0,.3]], 24), toon('#f2b84b'), 0, .26, 0)); door(g, .135); g.add(mesh(new THREE.SphereGeometry(.02, 8, 6), glow('#ffe08a', .6), 0, .57, 0)); return bake(g); })(),
  wood:(() => { const g = new THREE.Group(), log = toon('#b07a52'); g.add(hBox(.32, .2, .26, log, 0, .1, 0));
    for (let i = 0; i < 4; i++) g.add(hBox(.33, .012, .27, toon('#8a5a3c'), 0, .03 + i*.05, 0));
    const roof = mesh(new THREE.ConeGeometry(.26, .2, 4), toon('#6fbf73'), 0, .3, 0); roof.rotation.y = Math.PI/4; roof.scale.set(1.2, 1, .9); g.add(roof); g.add(hBox(.05, .14, .05, toon('#8a5a3c'), .09, .36, -.04)); door(g, .131); return bake(g); })(),
  fire:(() => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(.12, .13, .3, 6), toon('#b8443a'), 0, .15, 0));
    g.add(mesh(lathe([[0,0],[.22,0],[.14,.04],[.08,.1],[.03,.16],[0,.2]], 6), toon('#5a1f3a'), 0, .3, 0)); door(g, .118, glow('#ffb347', .8)); return bake(g); })(),
  earth:(() => { const g = new THREE.Group(), icing = toon('#fffafc'); g.add(hBox(.28, .22, .24, toon('#c98a4f'), 0, .11, 0));
    g.add(pyramidRoof(.24, .2, icing, .32)); [-.07, .07].forEach(x => g.add(hBox(.05, .05, .01, toon('#ffd36e'), x, .15, .121))); door(g, .121, toon('#7a4a2a'));
    ['#ff7fb5','#5aa7f0','#9be3b0','#ffd36e'].forEach((c, i) => g.add(mesh(new THREE.SphereGeometry(.035, 10, 8), toon(c), (i - 1.5)*.06, .33 - Math.abs(i - 1.5)*.02, .09)));
    return bake(g); })(),
  water:(() => { const g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(.15, 24, 12, 0, TAU, 0, Math.PI/2), toon('#fff4f8', {key:'shellhut', rim:.6})));
    g.add(mesh(new THREE.ConeGeometry(.05, .14, 12), toon('#ff9ec7'), 0, .2, 0)); door(g, .135); return bake(g); })(),
  candy:(() => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(.12, .12, .2, 20), toon('#fffafc'), 0, .1, 0));
    g.add(mesh(new THREE.SphereGeometry(.13, 20, 10, 0, TAU, 0, Math.PI/2), toon('#ffb3d1'), 0, .2, 0)); door(g, .121); return bake(g); })(),
  mist:(() => { const g = new THREE.Group(); g.add(hBox(.26, .2, .22, toon('#4a3a63'), 0, .1, 0)); g.add(pyramidRoof(.22, .26, toon('#2f2440'), .33));
    g.add(hBox(.05, .05, .01, glow('#ffd36e', .9), .06, .13, .111)); door(g, .111, toon('#2a1636')); return bake(g); })(),
  crystal:(() => { const g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(.13, 20, 10, 0, TAU, 0, Math.PI/2), toon('#d9d0ff')));
    const c = mesh(new THREE.OctahedronGeometry(.07), toon('#8fd8ff', {key:'cr', emissive:new THREE.Color('#5ab8ff'), emissiveIntensity:.45, rim:.5}), 0, .2, 0); c.scale.y = 2; g.add(c); door(g, .125); return bake(g); })(),
};
{
  const plan = [[C.main,'main',9,.2,.27],[C.metal,'metal',7,.1,.17],[C.wood,'wood',7,.16,.28],[C.fire,'fire',7,.1,.16],[C.earth,'earth',8,.11,.22],
    [FORESTS[0],'candy',4,.05,.24],[FORESTS[1],'mist',4,.05,.24],[FORESTS[2],'crystal',4,.05,.22]];
  for (const [r, k, n, a0, a1] of plan){ let placed = 0;
    for (let tries = 0; placed < n && tries < 400; tries++){ const d = scatter(r.dir, a1, a0);
      if (!walkable(d) || onPlat(d) || nearRoad(d, .02) || HOUSES.some(h => h.angleTo(d) < .045) || d.angleTo(PLAZA_DIR) < .14 || d.angleTo(TOWER_DIR) < .05 || d.angleTo(LIGHT_DIR) < .05) continue;
      const o = HOUSE_T[k].clone(); o.scale.setScalar(1.1 + rng()*.4); place(o, d, -.02, 0); faceToward(o, d, r.dir); scene.add(o); HOUSES.push(d); placed++; } }
  ISLANDS.forEach(is => { const o = HOUSE_T.water.clone(); o.scale.setScalar(1.2); place(o, is.dir, -.02, 0); faceToward(o, is.dir, WATER.dir); scene.add(o); HOUSES.push(is.dir); });
}

// ================= 糖果沙漠 =================
{
  const spiralTex = canvasTex(256, 256, (x) => { x.fillStyle = '#fff4f8'; x.fillRect(0,0,256,256); x.translate(128,128); x.lineWidth = 16; x.lineCap = 'round';
    ['#ff7fb5','#5aa7f0','#ffd36e'].forEach((c, k) => { x.strokeStyle = c; x.beginPath(); for (let a = 0; a < 18; a += .05){ const r = a*6.5; x.lineTo(Math.cos(a + k*2.1)*r, Math.sin(a + k*2.1)*r); } x.stroke(); }); });
  const caneTex = canvasTex(64, 64, (x) => { x.fillStyle = '#fff4f8'; x.fillRect(0,0,64,64); x.fillStyle = '#e8444c'; x.beginPath(); x.moveTo(0,0); x.lineTo(24,0); x.lineTo(64,40); x.lineTo(64,64); x.lineTo(40,64); x.lineTo(0,24); x.fill(); });
  caneTex.wrapS = caneTex.wrapT = THREE.RepeatWrapping; caneTex.repeat.set(10, 1);
  const T = {
    lolly:(() => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(.025, .025, .9, 10), toon('#fffafc'), 0, .45, 0));
      const sm = toon('#ffffff', {key:'spiral', map:spiralTex}); [0, Math.PI].forEach(r => { const c = mesh(new THREE.CircleGeometry(.28, 40), sm, 0, 1.12, r ? -.03 : .03); c.rotation.y = r; g.add(c); });
      put(g, mesh(new THREE.CylinderGeometry(.28, .28, .06, 40, 1, true), toon('#ff7fb5'), 0, 1.12, 0)).rotation.x = Math.PI/2; return bake(g); })(),
    cane:(() => { const pts = [new V3(0,0,0), new V3(0,.5,0), new V3(0,.85,0)]; for (let a = 0; a <= Math.PI; a += Math.PI/8) pts.push(new V3(.15 - Math.cos(a)*.15, .85 + Math.sin(a)*.17, 0)); pts.push(new V3(.3,.75,0));
      return bake(new THREE.Group().add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, .05, 12), toon('#ffffff', {key:'cane', map:caneTex})))); })(),
    gum:['#ff7fb5','#9be3b0','#ffd36e','#c9b6ff','#5aa7f0'].map(c => bake(new THREE.Group().add(mesh(lathe([[0,0],[.16,0],[.17,.05],[.14,.15],[.08,.21],[.001,.23]], 28), toon(c, {key:'gum', rim:.55}))))),
    wrap:['#ff7fb5','#5aa7f0','#ffd36e'].map(c => { const g = new THREE.Group(), m = toon(c); const b = mesh(new THREE.SphereGeometry(.12, 20, 14), m, 0, .12, 0); b.scale.x = 1.4; g.add(b);
      [-1, 1].forEach(s => { const e = mesh(new THREE.ConeGeometry(.08, .14, 10), m, s*.22, .12, 0); e.rotation.z = s*Math.PI/2; g.add(e); }); return bake(g); }),
    rock:bake(new THREE.Group().add(mesh(new THREE.DodecahedronGeometry(.18, 1), toon('#6b3f2a')))),
    cupcake:(() => { const g = new THREE.Group(); g.add(mesh(lathe([[0,0],[.16,0],[.2,.18],[.001,.18]], 24), toon('#ff9ec7'), 0, 0, 0));
      for (let i = 0; i < 3; i++) ringAt(g, .17 - i*.05, .05, toon('#fffafc'), .21 + i*.06, 24);
      g.add(mesh(new THREE.SphereGeometry(.045, 12, 8), toon('#e8444c'), 0, .38, 0)); return bake(g); })(),
  };
  const kinds = () => { const r = rng(); return r < .14 ? T.lolly : r < .26 ? T.cane : r < .55 ? T.gum[Math.floor(rng()*5)] : r < .72 ? T.wrap[Math.floor(rng()*3)] : r < .86 ? T.rock : T.cupcake; };
  const used = [];
  for (let n = 0, tries = 0; n < 60 && tries < 2000; tries++){ const d = scatter(DESERT.dir, DESERT.rad*.95, C.earth.rad*.75);
    if (!walkable(d) || terrain(d).desertW < .3 || nearRoad(d, .025) || HOUSES.some(h => h.angleTo(d) < .04) || used.some(u => u.angleTo(d) < .03)) continue;
    const o = kinds().clone(); o.scale.setScalar(.9 + rng()*1.3); place(o, d, -.02); scene.add(o); used.push(d); n++; }
}

// ================= 瞭望塔與燈塔 =================
function makeWatchtower(){
  const g = new THREE.Group(), stone = toon('#b9a6d6'), wood = toon('#b07a52');
  g.add(mesh(new THREE.CylinderGeometry(.24, .32, 1.5, 16), stone, 0, .75, 0));
  for (const y of [.35, .8, 1.2]) ringAt(g, .3 - y*.05, .02, toon('#9a86bd'), y, 24);
  for (let i = 0; i < 3; i++){ const a = i*2.1, w = hBox(.05, .12, .02, toon('#3b2a4a'), Math.cos(a)*.27, .6 + i*.3, Math.sin(a)*.27); w.rotation.y = -a + Math.PI/2; g.add(w); }
  g.add(mesh(new THREE.CylinderGeometry(.42, .42, .06, 20), wood, 0, 1.52, 0));
  for (let i = 0; i < 12; i++){ const a = i/12*TAU; g.add(mesh(new THREE.CylinderGeometry(.012, .012, .2, 6), wood, Math.cos(a)*.4, 1.65, Math.sin(a)*.4)); }
  ringAt(g, .4, .015, wood, 1.75, 40);
  for (let i = 0; i < 4; i++){ const a = i/4*TAU + .4; g.add(mesh(new THREE.CylinderGeometry(.02, .02, .5, 6), wood, Math.cos(a)*.3, 1.8, Math.sin(a)*.3)); }
  g.add(mesh(new THREE.ConeGeometry(.5, .5, 20), toon('#ff8fc0'), 0, 2.28, 0));
  g.add(mesh(new THREE.CylinderGeometry(.01, .01, .35, 6), toon('#5a1f3a'), 0, 2.68, 0));
  const fl = mesh(new THREE.ConeGeometry(.06, .2, 3), toon('#ffd36e'), .1, 2.78, 0); fl.rotation.z = -Math.PI/2; fl.scale.z = .2; g.add(fl);
  const tel = mesh(new THREE.CylinderGeometry(.03, .045, .32, 12), toon('#f2b84b'), .25, 1.72, .1); tel.rotation.z = -1.0; g.add(tel);
  return g;
}
function makeLighthouse(){
  const g = new THREE.Group();
  put(g, mesh(new THREE.DodecahedronGeometry(.45, 1), toon('#c9a6b8'), 0, .05, 0)).scale.set(1.2, .5, 1.2);
  g.add(mesh(lathe([[.3,0],[.27,.6],[.23,1.2],[.19,1.7],[.001,1.7]], 32), toon('#ffffff', {key:'lh', map:stripes(['#fff4f8','#ff7fb5'], false, 8)}), 0, .2, 0));
  g.add(mesh(new THREE.CylinderGeometry(.3, .3, .05, 24), toon('#5a1f3a'), 0, 1.92, 0));
  ringAt(g, .29, .015, toon('#5a1f3a'), 2.05);
  const lamp = mesh(new THREE.CylinderGeometry(.15, .15, .26, 16), glow('#fff2b0', 1.0), 0, 2.08, 0); g.add(lamp);
  g.add(mesh(new THREE.SphereGeometry(.18, 20, 10, 0, TAU, 0, Math.PI/2), toon('#e8444c'), 0, 2.21, 0));
  g.add(mesh(new THREE.SphereGeometry(.035, 8, 6), toon('#ffd36e'), 0, 2.42, 0));
  const beamG = new THREE.ConeGeometry(.55, 4, 24, 1, true); beamG.translate(0, -2, 0); beamG.rotateX(Math.PI/2);
  const beams = new THREE.Group(); beams.position.y = 2.08; g.add(beams);
  [0, Math.PI].forEach(r => { const b = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({color:'#fff6c8', transparent:true, opacity:.22, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide})); b.rotation.y = r; beams.add(b); });
  anim.push(t => { beams.rotation.y = t*.9; });
  return g;
}
{ const tw = place(makeWatchtower(), TOWER_DIR, -.15, 0); tw.userData.region = SPOTS[1]; scene.add(tw); pickables.push(tw);
  const lh = place(makeLighthouse(), LIGHT_DIR, -.12, 0); lh.userData.region = SPOTS[2]; scene.add(lh); pickables.push(lh); }

// ================= 沙灘：陽傘、貝殼 =================
const BEACH = [];
{ for (let i = 0; i < 6000 && BEACH.length < 90; i++){ const d = new V3(rng()*2-1, rng()*2-1, rng()*2-1); if (d.lengthSq() > 1 || d.lengthSq() < .01) continue; d.normalize();
    const t = terrain(d); if (t.sea || t.land > .2 || t.desertW > .3 || t.flat > .6 || onPlat(d) || ISLANDS.some(is => is.dir.angleTo(d) < .06)) continue;
    if (!terrain(offsetDir(d, 0, .04)).sea && !terrain(offsetDir(d, Math.PI, .04)).sea && !terrain(offsetDir(d, Math.PI/2, .04)).sea && !terrain(offsetDir(d, -Math.PI/2, .04)).sea) continue;
    if (BEACH.some(b => b.angleTo(d) < .05)) continue; BEACH.push(d); }
  const umb = ['#ff7fb5','#5aa7f0','#ffd36e'].map(c => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(.012, .012, .5, 6), toon('#fff4e6'), 0, .25, 0));
    g.add(mesh(new THREE.ConeGeometry(.28, .12, 12), toon('#ffffff', {key:'umb' + c, map:stripes([c, '#fff4f8'], true, 12)}), 0, .52, 0)); g.add(hBox(.16, .02, .3, toon(c), .18, .04, .05)); return bake(g); });
  const shell = bake(new THREE.Group().add(mesh(new THREE.ConeGeometry(.05, .04, 10), toon('#ffd1e6'))));
  BEACH.forEach((d, i) => { if (i%3 === 0){ const o = umb[i%3 === 0 ? (i/3)%3 : 0].clone(); place(o, d, -.01); scene.add(o); }
    for (let k = 0; k < 2; k++){ const o = shell.clone(); place(o, offsetDir(d, rng()*TAU, .01 + rng()*.015), 0); scene.add(o); } });
}

// ================= 居民 =================
const ghosts = [], guards = [];
const ROAD_OF = r => ROADS.filter(rd => rd.a === r || rd.b === r);
function addGhost(tpl, home, range, core, scale, p, guard){
  const obj = tpl.clone(); obj.scale.setScalar(scale); scene.add(obj);
  const [t1] = basis(p), g = {obj, p, f:tangentTo(p, t1), home, anchor:home.dir, range, core, sp:guard ? 0 : .012 + rng()*.018, ph:rng()*TAU, tw:0, guard, state:'idle', timer:5 + rng()*30, path:null, pi:0, atBeach:false};
  if (guard){ g.f = tangentTo(p, home.dir).negate(); guards.push(g); } ghosts.push(g); return g;
}
function mainGuardSpot(i){ // 兩位守正門（朝廣場），兩位守後方
  const c = C.main.dir, t = tangentTo(c, PLAZA_DIR), side = new V3().crossVectors(c, t), dirT = t.clone().multiplyScalar(i < 2 ? 1 : -1).addScaledVector(side, i%2 ? .45 : -.45).normalize(), k = i < 2 ? .15 : .135;
  return c.clone().multiplyScalar(Math.cos(k)).addScaledVector(dirT, Math.sin(k)).normalize(); }
const rangeOf = r => r.sea ? PLAT*.85 : r.spot ? .05 : r.rad*.75;
for (const c of CITIES){
  const n = c.id === 'main' ? 14 : 5;
  for (let i = 0; i < n; i++) addGhost(T_CITIZEN, c, rangeOf(c), c.core, .26 + rng()*.04, scatter(c.dir, rangeOf(c), c.core + .01));
  const ng = c.id === 'main' ? 4 : 2;
  for (let i = 0; i < ng; i++) addGhost(T_GUARD, c, 0, 0, .3, c.id === 'main' ? mainGuardSpot(i) : offsetDir(c.dir, i/ng*TAU + .4, c.sea ? .06 : .09), true);
}
for (const f of FORESTS) for (let i = 0; i < 3; i++) addGhost(T_CITIZEN, f, rangeOf(f), 0, .27, scatter(f.dir, f.rad*.5));
// 居民自由移動：在地區閒晃 → 沿小路去別的地區，或去附近的沙灘
function decide(g){
  if (g.atBeach){ g.state = 'go'; g.target = scatter(g.home.dir, rangeOf(g.home)*.6); g.atBeach = false; return; }
  const r = rng(), roads = ROAD_OF(g.home);
  if (r < .5 && roads.length){ const rd = roads[Math.floor(rng()*roads.length)]; g.path = rd.a === g.home ? rd.pts : [...rd.pts].reverse(); g.dest = rd.a === g.home ? rd.b : rd.a; g.pi = 0; g.state = 'travel'; return; }
  if (r < .75){ const b = BEACH.filter(d => d.angleTo(g.p) < .35).sort(() => rng() - .5).find(d => { for (let k = 1; k <= 10; k++) if (!walkable(g.p.clone().lerp(d, k/10).normalize())) return false; return true; });
    if (b){ g.state = 'go'; g.target = b; g.toBeach = true; return; } }
  g.timer = 10 + rng()*25;
}
function steerTo(g, target, dt, k=6){ g.f.lerp(tangentTo(g.p, target), Math.min(1, dt*k)).normalize(); }
function updateGhost(g, dt, t){
  if (g.guard){ g.obj.position.copy(g.p).multiplyScalar(R + ground(g.p) + .005); frameQuat(g.obj, g.p, g.f); return; }
  let speed = g.sp;
  if (g.state === 'idle'){
    g.tw = clamp(g.tw + (rng() - .5)*dt*4, -1, 1); const a = g.p.angleTo(g.anchor);
    if (a > g.range) steerTo(g, g.anchor, dt, 1.5); else if (a < g.core) g.f.lerp(tangentTo(g.p, g.anchor).negate(), dt*2).normalize();
    turn(g.p, g.f, g.tw*dt*.8); if ((g.timer -= dt) <= 0) decide(g);
  } else if (g.state === 'travel'){
    speed = .04; const tg = g.path[g.pi]; steerTo(g, tg, dt); if (g.p.angleTo(tg) < .012) g.pi += 2;
    if (g.pi >= g.path.length){ g.home = g.dest; g.anchor = g.dest.dir; g.range = rangeOf(g.dest); g.core = g.dest.core || 0; g.state = 'idle'; g.timer = 15 + rng()*30; }
  } else if (g.state === 'go'){
    speed = .035; steerTo(g, g.target, dt); if (g.p.angleTo(g.target) < .01){ g.state = 'idle'; g.timer = 8 + rng()*15;
      if (g.toBeach){ g.anchor = g.target; g.range = .025; g.core = 0; g.atBeach = true; g.toBeach = false; } else { g.anchor = g.home.dir; g.range = rangeOf(g.home); g.core = g.home.core || 0; } }
  }
  const q = g.p.clone(), f = g.f.clone(); step(q, f, speed*dt);
  if (walkable(q)){ g.p.copy(q); g.f.copy(f); } else { turn(g.p, g.f, 1.5); if (g.state !== 'idle'){ g.state = 'idle'; g.timer = 3; } }
  g.obj.position.copy(g.p).multiplyScalar(R + ground(g.p) + .01 + Math.abs(Math.sin(t*(g.state === 'idle' ? 5 : 8) + g.ph))*.03); frameQuat(g.obj, g.p, g.f);
}
const player = {obj:T_PLAYER.clone(), p:new V3(), f:new V3(), boat:null};
player.obj.scale.setScalar(.34); player.obj.visible = false; scene.add(player.obj);

// ================= 小船（只停在大海邊，湖不放） =================
function makeBoat(c1, c2){
  const g = new THREE.Group(), hull = new THREE.SphereGeometry(1, 28, 14, 0, TAU, Math.PI/2, Math.PI/2);
  const h = mesh(hull, ds(c1)); h.scale.set(.26, .18, .52); h.position.y = .1; g.add(h);
  const deck = mesh(new THREE.CircleGeometry(1, 28), toon('#e8c39a')); deck.rotation.x = -Math.PI/2; deck.scale.set(.24, .5, 1); deck.position.y = .085; g.add(deck);
  const rim = mesh(new THREE.TorusGeometry(1, .06, 8, 40), toon(c2)); rim.rotation.x = Math.PI/2; rim.scale.set(.26, .52, 1); rim.position.y = .1; g.add(rim);
  g.add(mesh(new THREE.CylinderGeometry(.015, .015, .75, 8), toon('#8a5a3c'), 0, .45, .1));
  const sail = new THREE.Shape(); sail.moveTo(0, 0); sail.quadraticCurveTo(.3, .3, 0, .6); sail.lineTo(0, 0);
  const sm = mesh(new THREE.ShapeGeometry(sail, 12), ds(c2)); sm.position.set(0, .18, .12); sm.rotation.y = -Math.PI/2; g.add(sm);
  put(g, mesh(heartGeo(3, 1), toon('#ff7fb5'), 0, .83, .1)).scale.setScalar(.005);
  return bake(g);
}
const boats = [];
{ const anchors = [C.main, C.metal, C.wood, C.earth, FORESTS[0], C.fire, FORESTS[2], FORESTS[1], SPOTS[2], ...ISLANDS.slice(0, 2).map(i => ({dir:i.dir, rad:.05}))], cols = [['#ff9ec7','#fff4e6'],['#ffd36e','#ff7fb5'],['#9fd8ff','#ffffff'],['#c9b6ff','#ffd36e']];
  anchors.forEach((a, k) => { const cands = [];
    for (let hd = 0; hd < 24; hd++){ const heading = hd/24*TAU; for (let ang = (a.rad || .05)*.5; ang < .9; ang += .01){ const d = offsetDir(a.dir, heading, ang); if (isOpenSea(d)){ cands.push({ang, heading}); break; } } }
    cands.sort((x, y) => x.ang - y.ang);
    for (const c of cands){ const p = offsetDir(a.dir, c.heading, c.ang + .03); if (!isOpenSea(p) || !NAV.isOcean(p) || boats.some(b => b.p.angleTo(p) < .12)) continue;
      const obj = makeBoat(...cols[k%cols.length]); scene.add(obj); boats.push({obj, p, f:tangentTo(p, a.dir).negate(), ph:rng()*TAU, home:p.clone(), homeF:null}); break; } }); }
boats.forEach(b => b.homeF = b.f.clone());
// 有些船由居民自己開出海，繞一圈再沿原路回來
boats.filter((_, i) => i%3 === 1).forEach(b => { b.npc = true; b.state = 'dock'; b.t = 5 + rng()*15; b.trail = []; b.rider = T_CITIZEN.clone(); b.rider.scale.setScalar(.27); scene.add(b.rider); });
function placeBoat(b, t){ b.obj.position.copy(b.p).multiplyScalar(R - .02 + Math.sin(t*1.5 + b.ph)*.02); frameQuat(b.obj, b.p, b.f); b.obj.rotateZ(Math.sin(t*1.2 + b.ph)*.05);
  if (b.rider){ b.rider.position.copy(b.p).multiplyScalar(R + .06); frameQuat(b.rider, b.p, b.f); } }
function updateNpcBoat(b, dt, t){
  b.t -= dt;
  if (b.state === 'dock'){ if (b.t <= 0){ b.state = 'sail'; b.t = 22 + rng()*14; b.trail = [b.p.clone()]; b.rec = 0; } }
  else if (b.state === 'sail'){ steerSea(b, .1); turn(b.p, b.f, Math.sin(t*.4 + b.ph)*.4*dt); step(b.p, b.f, .06*dt);
    if ((b.rec += dt) > .4){ b.rec = 0; b.trail.push(b.p.clone()); } if (b.t <= 0) b.state = 'return'; }
  else if (b.state === 'return'){ const tg = b.trail[b.trail.length - 1]; if (!tg){ b.p.copy(b.home); b.f.copy(b.homeF); b.state = 'dock'; b.t = 12 + rng()*20; }
    else { b.f.lerp(tangentTo(b.p, tg), Math.min(1, dt*5)).normalize(); step(b.p, b.f, .06*dt); if (b.p.angleTo(tg) < .01) b.trail.pop(); } }
  placeBoat(b, t);
}

// ================= 海中生物 =================
const puffs = [];
for (let i = 0; i < 70; i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:softTex, transparent:true, depthWrite:false})); s.visible = false; scene.add(s); puffs.push({s, age:0, life:1, vel:new V3(), size:.3}); }
let puffI = 0;
function puff(pos, vel, color='#ffffff', size=.3, life=1){ const p = puffs[puffI++ % puffs.length]; p.s.position.copy(pos); p.vel.copy(vel); p.s.material.color.set(color); p.size = size; p.life = life; p.age = 0; p.s.visible = true; }
function splash(p, n=7, size=.25){ const up = p.clone(), base = p.clone().multiplyScalar(R + .05), [t1, t2] = basis(p);
  for (let i = 0; i < n; i++){ const a = i/n*TAU; puff(base, up.clone().multiplyScalar(.9 + rng()*.8).addScaledVector(t1, Math.cos(a)*.6).addScaledVector(t2, Math.sin(a)*.6), '#ffffff', size, .8); } }
function fishBody(pts, color, seg=32){ const g = lathe(pts, seg); g.rotateX(Math.PI/2); return mesh(g, toon(color)); }
function finShape(pts){ const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i += 2) s.quadraticCurveTo(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]); return new THREE.ShapeGeometry(s, 10); }
function makeDolphin(){
  const g = new THREE.Group(), c = '#8fb8f0';
  g.add(fishBody([[0,-.5],[.07,-.4],[.13,-.15],[.15,.05],[.12,.26],[.07,.42],[.03,.5],[0,.53]], c));
  const dor = mesh(new THREE.ConeGeometry(.05, .16, 10), toon(c), 0, .17, -.02); dor.rotation.x = -.5; dor.scale.z = .35; g.add(dor);
  [-1, 1].forEach(s => { const fl = mesh(new THREE.ConeGeometry(.06, .2, 10), toon(c), s*.08, 0, -.5); fl.rotation.set(-Math.PI/2, 0, -s*1.1); fl.scale.z = .3; g.add(fl);
    const pf = mesh(new THREE.ConeGeometry(.04, .14, 8), toon(c), s*.13, -.07, .12); pf.rotation.set(-Math.PI/2.4, 0, -s*1.2); pf.scale.z = .35; g.add(pf);
    g.add(mesh(new THREE.SphereGeometry(.018, 8, 6), ink, s*.08, .04, .35)); });
  put(g, mesh(new THREE.SphereGeometry(.09, 16, 10), toon('#dce9ff'), 0, -.05, .2)).scale.set(1, .6, 2.2);
  return bake(g);
}
function makeFlyingFish(){
  const g = new THREE.Group(); g.add(fishBody([[0,-.14],[.03,-.1],[.045,0],[.04,.08],[0,.13]], '#9fe0ff', 16));
  [-1, 1].forEach(s => { const w = mesh(finShape([[0,0],[.12,.02],[.22,-.06],[.12,-.1],[0,-.05]]), ds('#ffd36e')); w.rotation.x = -Math.PI/2; w.scale.x = s; w.position.set(s*.03, .01, .05); g.add(w); });
  const tail = mesh(new THREE.ConeGeometry(.05, .08, 3), toon('#ffd36e'), 0, 0, -.16); tail.rotation.x = -Math.PI/2; tail.scale.x = .3; g.add(tail);
  return bake(g);
}
function makeWhale(){
  const g = new THREE.Group(), c = '#7fa6e8';
  g.add(fishBody([[0,-1.2],[.15,-1.0],[.42,-.5],[.58,0],[.6,.45],[.5,.85],[.3,1.08],[0,1.15]], c, 40));
  put(g, mesh(new THREE.SphereGeometry(.5, 24, 16), toon('#dbe7ff'), 0, -.2, .3)).scale.set(.95, .5, 1.6);
  [-1, 1].forEach(s => { const fl = mesh(new THREE.ConeGeometry(.22, .5, 12), toon(c), s*.25, 0, -1.25); fl.rotation.set(-Math.PI/2, 0, -s*1.2); fl.scale.z = .25; g.add(fl);
    const pf = mesh(new THREE.ConeGeometry(.14, .5, 10), toon(c), s*.55, -.2, .3); pf.rotation.set(-Math.PI/2.5, 0, -s*1.1); pf.scale.z = .25; g.add(pf);
    g.add(mesh(new THREE.SphereGeometry(.05, 10, 8), ink, s*.45, .05, .65)); });
  return bake(g);
}
function makeKun(){
  const g = new THREE.Group();
  g.add(fishBody([[0,-1.85],[.25,-1.6],[.6,-1],[.8,-.2],[.78,.5],[.55,1.2],[.25,1.7],[0,1.85]], '#ff9ec7', 40));
  put(g, mesh(new THREE.SphereGeometry(.6, 24, 16), toon('#fff0d6'), 0, -.32, .2)).scale.set(1, .5, 2.2);
  const tail = mesh(finShape([[0,0],[.8,.9],[1.3,1.1],[1.0,0],[1.3,-1.1],[.8,-.9],[0,0]]), ds('#ffd36e')); tail.geometry.rotateY(Math.PI/2); tail.position.z = -1.75; g.add(tail);
  const dor = mesh(finShape([[0,0],[.5,.7],[1.2,.6],[1.2,.2],[1.4,0]]), ds('#ffd36e')); dor.geometry.rotateY(Math.PI/2); dor.position.set(0, .7, .6); g.add(dor);
  [-1, 1].forEach(s => { const pg = finShape([[0,0],[.4,.2],[.8,-.1],[.4,-.3],[0,0]]); pg.rotateX(-Math.PI/2); pg.rotateY(s > 0 ? .4 : Math.PI - .4); const pf = mesh(pg, ds('#ffd36e'), s*.7, -.2, .6); g.add(pf);
    g.add(mesh(new THREE.SphereGeometry(.12, 16, 12), toon('#ffffff'), s*.5, .2, 1.3)); g.add(mesh(new THREE.SphereGeometry(.07, 12, 8), ink, s*.55, .22, 1.36));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(s*.2,-.1,1.75), new V3(s*.7,-.2,2.1), new V3(s*1.1,.1,2.0), new V3(s*1.3,-.1,1.7)]), 24, .03, 6), toon('#ffd36e'))); });
  return bake(g);
}
function makePeng(){
  const g = new THREE.Group(), body = new THREE.Group();
  put(body, mesh(new THREE.SphereGeometry(.5, 28, 18), toon('#ffc2dc'))).scale.set(1, .9, 2);
  body.add(mesh(new THREE.SphereGeometry(.38, 24, 16), toon('#ffc2dc'), 0, .35, 1.05));
  const beak = mesh(new THREE.ConeGeometry(.12, .35, 12), toon('#ffd36e'), 0, .3, 1.5); beak.rotation.x = Math.PI/2; body.add(beak);
  [-1, 1].forEach(s => { body.add(mesh(new THREE.SphereGeometry(.07, 12, 8), ink, s*.24, .45, 1.32)); });
  [-.15, 0, .15].forEach((x, i) => { const cr = mesh(new THREE.ConeGeometry(.05, .35, 8), toon('#ffd36e'), x, .78, .9 + i*.05); cr.rotation.x = -.5; body.add(cr); });
  ['#c9b6ff','#ffd36e','#9fd8ff','#ffd36e','#c9b6ff'].forEach((c, i) => { const tg = finShape([[0,0],[.3,.25],[2.0,.15],[2.2,0],[2.0,-.15],[.3,-.25],[0,0]]); tg.rotateX(-Math.PI/2); tg.rotateY(Math.PI/2 + (i - 2)*.22); const tf = mesh(tg, ds(c), 0, .1 + i*.01, -.9); body.add(tf); });
  g.add(bake(body));
  const wingG = finShape([[0,.3],[1.2,.9],[2.6,.5],[3.0,0],[2.6,-.5],[1.6,-.8],[0,-.3],[0,-.3],[0,.3]]), wingIn = finShape([[0,.25],[.8,.6],[1.6,.3],[1.7,0],[1.4,-.4],[.6,-.5],[0,-.25],[0,-.25],[0,.25]]);
  const wings = [-1, 1].map(s => { const piv = new THREE.Group(); piv.position.set(s*.35, .25, .3); const w = mesh(wingG, ds('#c9b6ff')); w.rotation.x = -Math.PI/2; piv.add(w);
    const wi = mesh(wingIn, ds('#ffd36e')); wi.rotation.x = -Math.PI/2; wi.position.y = .02; piv.add(wi); piv.scale.x = s; g.add(piv); return piv; });
  g.userData.wings = wings; return g;
}
function seaPoint(minDepth=-.2){ for (let i = 0; i < 2000; i++){ const d = new V3(rng()*2-1, rng()*2-1, rng()*2-1).normalize(); const t = terrain(d); if (t.sea && t.h < minDepth && d.angleTo(WATER.dir) > .2 && NAV.isOcean(d)) return d; } return V(0,-1,0); }
function aheadOpen(p, f, dist){ const q = p.clone(), g = f.clone(); step(q, g, dist); return isOpenSea(q); }
function steerSea(c, look=.08){ for (let i = 0; i < 14 && !aheadOpen(c.p, c.f, look); i++) turn(c.p, c.f, .45); }
function placeCreature(obj, p, f, alt, pitch=0, roll=0){ obj.position.copy(p).multiplyScalar(R + alt); frameQuat(obj, p, f); if (pitch) obj.rotateX(-pitch); if (roll) obj.rotateZ(roll); }
const T_DOLPHIN = makeDolphin(), T_FFISH = makeFlyingFish(), T_WHALE = makeWhale();
const pods = [0, 1].map(() => { const p = seaPoint(-.25), [t1] = basis(p); return {p, f:tangentTo(p, t1), m:[0,1,2].map(i => { const o = T_DOLPHIN.clone(); o.scale.setScalar(.9); scene.add(o); return {o, lat:(i - 1)*.025, back:(i%2)*.025, ph:i*1.1, s:0}; })}; });
const school = (() => { const p = seaPoint(-.2), [t1] = basis(p); return {p, f:tangentTo(p, t1), t:0, gl:false, m:[0,1,2,3,4,5].map(i => { const o = T_FFISH.clone(); o.scale.setScalar(1.3); scene.add(o); return {o, lat:(rng() - .5)*.05, back:rng()*.05, d:rng()*.4}; })}; })();
const whales = [0, 1].map(i => { const p = seaPoint(-.4), [t1] = basis(p), o = T_WHALE.clone(); scene.add(o); return {o, p, f:tangentTo(p, t1), t:i*11, sp:0}; });
const kun = (() => { const p = seaPoint(-.4), [t1] = basis(p), o = new THREE.Group(), fish = makeKun(), bird = makePeng(); o.add(fish); o.add(bird); bird.scale.setScalar(0); o.scale.setScalar(.6); scene.add(o);
  return {o, fish, bird, p, f:tangentTo(p, t1), state:'swim', t:0, m:0, mt:0}; })();

function updateSea(dt, t){
  for (const pod of pods){ steerSea(pod); step(pod.p, pod.f, .05*dt); const x = new V3().crossVectors(pod.p, pod.f);
    for (const m of pod.m){ m.ph += dt*2.3; const s = Math.sin(m.ph), alt = s > 0 ? s*.55 : s*.35, pitch = Math.cos(m.ph)*.9;
      if ((m.s < 0) !== (s < 0)) splash(pod.p.clone().addScaledVector(x, m.lat).normalize(), 5, .16); m.s = s;
      const mp = pod.p.clone().addScaledVector(x, m.lat).addScaledVector(pod.f, -m.back).normalize(); placeCreature(m.o, mp, pod.f, alt - .04, pitch); m.o.visible = alt > -.25; } }
  { const sc = school; sc.t += dt; steerSea(sc, .1); const sp = sc.gl ? .14 : .05; step(sc.p, sc.f, sp*dt); const x = new V3().crossVectors(sc.p, sc.f);
    if (!sc.gl && sc.t > 6){ sc.gl = true; sc.t = 0; splash(sc.p, 6, .15); } if (sc.gl && sc.t > 2.6){ sc.gl = false; sc.t = 0; splash(sc.p, 6, .15); }
    for (const m of sc.m){ const u = sc.gl ? clamp((sc.t - m.d)/2.1, 0, 1) : 0, alt = sc.gl ? Math.sin(Math.PI*u)*.4 - .02 : -.4;
      const mp = sc.p.clone().addScaledVector(x, m.lat).addScaledVector(sc.f, -m.back).normalize(); placeCreature(m.o, mp, sc.f, alt, sc.gl ? Math.cos(Math.PI*u)*.5 : 0, Math.sin(t*20 + m.d*9)*.15); m.o.visible = alt > -.1; } }
  for (const w of whales){ w.t = (w.t + dt)%22; steerSea(w, .14); step(w.p, w.f, .025*dt); let alt = -.3, pitch = 0;
    if (w.t > 3 && w.t - dt <= 3 || w.t > 7 && w.t - dt <= 7) for (let i = 0; i < 6; i++) puff(w.p.clone().multiplyScalar(R + .3).addScaledVector(w.f, .4), w.p.clone().multiplyScalar(1.6 + rng()*.6).addScaledVector(new V3(rng()-.5, rng()-.5, rng()-.5), .4), '#eaf6ff', .35, 1.3);
    if (w.t > 9 && w.t < 12) alt = -.3 - (w.t - 9)/3*1.1;
    else if (w.t >= 12 && w.t < 15) alt = -1.4;
    else if (w.t >= 15 && w.t < 17.5){ const u = (w.t - 15)/2.5; alt = -1.1 + Math.sin(Math.PI*u)*2.6; pitch = Math.cos(Math.PI*u)*1.1; if (u > .2 && u - dt/2.5 <= .2 || u > .85 && u - dt/2.5 <= .85) splash(w.p, 10, .4); }
    else if (w.t >= 17.5) alt = -1.1 + (w.t - 17.5)/4.5*.8;
    placeCreature(w.o, w.p, w.f, alt, pitch, w.t >= 15 && w.t < 17.5 ? Math.sin((w.t - 15)/2.5*Math.PI)*.6 : 0); w.o.visible = alt > -1; }
  // 鯤鵬：在海裡是鯤，躍出海面化為鵬，繞星球飛一圈再俯衝回海裡
  { const k = kun; k.t += dt; let alt = -.35, pitch = 0, speed = .03;
    if (k.state === 'swim'){ steerSea(k, .16); if (k.t > 14){ k.state = 'leap'; k.t = 0; splash(k.p, 12, .5); } }
    else if (k.state === 'leap'){ const u = Math.min(k.t/2.2, 1); alt = -.35 + 5.2*(1 - (1 - u)**2); pitch = (1 - u)*1.1 + .1; speed = .08; if (u > .35 && k.m === 0){ k.m = 1; sparkle(k.o.position); } if (u >= 1){ k.state = 'fly'; k.t = 0; } }
    else if (k.state === 'fly'){ alt = 4.85 + Math.sin(k.t*.6)*.4; speed = .13; turn(k.p, k.f, Math.sin(k.t*.25)*.12*dt); pitch = Math.cos(k.t*.6)*.08;
      if (k.t > 18 && isOpenSea(k.p) && aheadOpen(k.p, k.f, .15) && aheadOpen(k.p, k.f, .3)){ k.state = 'dive'; k.t = 0; } }
    else if (k.state === 'dive'){ const u = Math.min(k.t/2.6, 1); alt = 4.85*(1 - u*u) - .35*u; pitch = -.9*(1 - u*.6); speed = .07; if (u > .8 && k.m === 1){ k.m = 0; sparkle(k.o.position); } if (u >= 1){ k.state = 'swim'; k.t = 0; splash(k.p, 12, .5); } }
    step(k.p, k.f, speed*dt);
    k.mt += ((k.m) - k.mt)*Math.min(1, dt*5); k.fish.scale.setScalar(Math.max(1 - k.mt, .001)); k.bird.scale.setScalar(Math.max(k.mt, .001));
    k.fish.visible = k.mt < .99; k.bird.visible = k.mt > .01;
    k.bird.userData.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1)*Math.sin(t*3.2)*.55; });
    k.fish.rotation.y = k.state === 'swim' ? Math.sin(t*2)*.12 : 0;
    placeCreature(k.o, k.p, k.f, alt, pitch); }
}
function sparkle(pos){ for (let i = 0; i < 14; i++) puff(pos, new V3(rng()-.5, rng()-.5, rng()-.5).multiplyScalar(4), ['#ffd36e','#ff9ec7','#ffffff'][i%3], .4, 1.1); }

const sky = new THREE.Group(); scene.add(sky);   // 星星、太陽、月亮（首頁可以把它關掉）
// ================= 天空：星星、太陽、月亮 =================
{ const n = 1600, sp = new Float32Array(n*3), sc = new Float32Array(n*3), palette = ['#fff4e6','#ffc2dc','#bfe3ff','#ffe29a'].map(h => new THREE.Color(h));
  for (let i = 0; i < n; i++){ const v = new V3(rng()*2-1, rng()*2-1, rng()*2-1).normalize().multiplyScalar(220 + rng()*200); sp.set([v.x, v.y, v.z], i*3); const c = palette[i%4]; sc.set([c.r, c.g, c.b], i*3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  sky.add(new THREE.Points(sg, new THREE.PointsMaterial({size:1.5, vertexColors:true, transparent:true, opacity:.9, depthWrite:false}))); }
const sunTex = canvasTex(256, 256, (x) => { x.translate(128, 128);
  for (let i = 0; i < 6; i++){ x.save(); x.rotate(i/6*TAU + .2); const gr = x.createLinearGradient(0,0,124,0); gr.addColorStop(0,'#e0553f'); gr.addColorStop(1,'#6a5ab8'); x.fillStyle = gr; x.beginPath(); x.moveTo(0,-16); x.lineTo(124,0); x.lineTo(0,16); x.fill(); x.restore(); }
  [[50,'#e0553f'],[38,'#f4a6b8'],[29,'#f08a3c']].forEach(([r, c]) => { x.fillStyle = c; x.beginPath(); x.arc(0,0,r,0,TAU); x.fill(); }); });
const moonTex = canvasTex(256, 256, (x) => { const gr = x.createLinearGradient(220,30,40,230); gr.addColorStop(0,'#f4a640'); gr.addColorStop(.6,'#2f6b4f'); gr.addColorStop(1,'#1e3f8f');
  x.fillStyle = gr; x.beginPath(); x.arc(128,128,112,0,TAU); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(162,100,98,0,TAU); x.fill(); });
{ const s = new THREE.Sprite(new THREE.SpriteMaterial({map:sunTex, transparent:true, depthWrite:false})); s.position.set(-90, 60, -140); s.scale.setScalar(46); sky.add(s);
  const m = new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex, transparent:true, depthWrite:false})); m.position.set(110, -30, -90); m.scale.setScalar(34); sky.add(m); }

// 實例化：毛茸茸樹冠、樹幹、小花
buildInstances(FL.fluff, fluffGeo(), toon('#ffffff', {key:'fluff', rim:.6}));
buildInstances(FL.trunk, new THREE.CylinderGeometry(1, 1, 1, 10), toon('#ffffff', {key:'trunk'}));
buildInstances(FL.flower, new THREE.SphereGeometry(1, 10, 8), toon('#ffffff', {key:'flower', rim:.4}));


// ================= 每一格動畫（海浪、火焰、居民、船、海中生物、光線） =================
const lightOff = new V3(14, 22, 6);
function updateWorld(dt, t, camPos){
  waterMat.uniforms.uT.value = t;
  for (const a of anim) a(t);
  for (const f of flames){ const s = f.userData.s, k = Math.sin(t*9 + f.userData.ph); f.scale.set(s*(1 - k*.08), s*(1 + k*.22), s*(1 - k*.08)); }
  for (const s of spouts){ const k = s.userData.ph; s.rotateY(dt*3); s.scale.set(1, 1.1 + Math.sin(t*1.3 + k)*.55, 1); spoutTex.offset.y = -t*.6;
    if (Math.random() < dt*3){ const top = s.position.clone().addScaledVector(s.position.clone().normalize(), s.scale.y); puff(top, s.position.clone().normalize().multiplyScalar(.6).add(new V3(rng()-.5, rng()-.5, rng()-.5).multiplyScalar(.5)), '#eaf6ff', .25, .9); } }
  for (const s of fogs){ s.position.copy(s.userData.base).addScaledVector(s.userData.up, Math.sin(t*.4 + s.userData.ph)*.25); s.material.opacity = .3 + Math.sin(t*.5 + s.userData.ph)*.1; }
  for (const b of boats){ if (b.npc) updateNpcBoat(b, dt, t); else if (b !== player.boat) placeBoat(b, t); }
  for (const g of ghosts) updateGhost(g, dt, t);
  updateSea(dt, t);
  for (const p of puffs){ if (!p.s.visible) continue; p.age += dt; if (p.age >= p.life){ p.s.visible = false; continue; } p.s.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(.95); const u = p.age/p.life; p.s.material.opacity = (1 - u)*.9; p.s.scale.setScalar(p.size*(1 + u)); }
  sunLight.position.copy(camPos).add(lightOff); waterMat.uniforms.uCam.value.copy(camPos); waterMat.uniforms.uL.value.copy(sunLight.position);
}

export {
  THREE, scene, sky, updateWorld, R, TAU, V3, clamp, rng, surf, ground, walkable, isOpenSea,
  C, REGIONS, PLAZA_DIR, PLAT, tangentTo, offsetDir, basis, turn, step, frameQuat,
  HOLE, pickables, player, boats, placeBoat, guards
};
