/* ==========================================================
   首頁的星球（home-planet.js）
   用共用的 planet.js 蓋出夢幻星球，再把它畫在首頁 #planet 畫布上：
   圓心、半徑、旋轉都由 home.js 算好傳進來（和原本設計稿一樣的位置）。
   ========================================================== */
import { THREE, scene, sky, updateWorld, R, C, V3 } from './planet.js';

const HOME = window.HomePlanet;
const canvas = document.getElementById('planet');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  console.error(err);
  if (HOME) HOME.fail('你的瀏覽器不支援 3D 顯示，星球暫時無法出現');
  throw err;
}
renderer.setClearColor(0x000000, 0);
sky.visible = false;                       // 首頁背景維持黑色：不畫星星、太陽、月亮

// ★ 用哪個半徑對齊設計稿上的星球輪廓（R = 海平面；稍微大一點把陸地算進去）
const FIT_R = R * 1.03;
const DIST = 32;                           // 相機和星球中心的距離
const camera = new THREE.PerspectiveCamera(45, 1, 1, 120);

// 「正面」＝一開始主城朝向鏡頭（和 planet.html 剛打開時的角度一樣）
const eye = C.main.dir.clone().multiplyScalar(DIST).add(new V3(0, 4, 0));
const Q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, new V3(), new V3(0, 1, 0)));

const m3 = new THREE.Matrix3(), m4 = new THREE.Matrix4(), qR = new THREE.Quaternion();
const tanA = Math.tan(Math.asin(FIT_R / DIST));
let lastW = 0, lastH = 0, lastDpr = 0, t = 0;

function draw(rot, ps, W, H, dpr, dt) {
  if (W !== lastW || H !== lastH || dpr !== lastDpr) {
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    lastW = W; lastH = H; lastDpr = dpr;
  }
  // 旋轉：home.js 轉的是星球，這裡換成反方向轉相機，效果一樣
  m4.setFromMatrix3(m3.fromArray(rot)); qR.setFromRotationMatrix(m4).invert();
  camera.quaternion.copy(Q0).multiply(qR);
  camera.position.set(0, 0, DIST).applyQuaternion(camera.quaternion);
  // 大小與位置：讓星球輪廓剛好落在圓心 (ps.x, ps.y)、半徑 ps.r
  camera.aspect = W / H;
  camera.fov = 2 * Math.atan((H / 2) * tanA / Math.max(ps.r, 1)) * 180 / Math.PI;
  camera.setViewOffset(W, H, W / 2 - ps.x, H / 2 - ps.y, W, H);
  camera.updateProjectionMatrix();

  t += dt;
  updateWorld(dt, t, camera.position);
  renderer.render(scene, camera);
}

if (HOME) HOME.ready({ draw });
