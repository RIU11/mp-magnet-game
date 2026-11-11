// 共通：Three.js、ゲーム全体の状態、数学、テクスチャと素材、当たり判定（すべて箱で判定する）
import * as THREE from "../vendor/three.module.min.js";
export { THREE };

export const G = {
  scene: null, camera: null, renderer: null,
  solids: [], scrap: [], enemies: [], triggers: [], pickups: [], plates: [], anchors: [], updaters: [],
  player: null, level: null, time: 0, save: null, checkpoint: null, button: null, boss: null,
  shake: 0, hitstop: 0
};

export const POLE = { N: 0xff3b3b, S: 0x3d8bff };
export const POLE_CSS = { N: "#ff4a4a", S: "#4a95ff" };
export const POLE_NAME = { N: "N極", S: "S極" };
export const GRAV = 22;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const other = (p) => (p === "N" ? "S" : "N");
export function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function turnTo(a, b, rate, dt) { const d = angleDiff(a, b); const m = rate * dt; return a + (Math.abs(d) < m ? d : Math.sign(d) * m); }

/* ---------------- テクスチャ（画像ファイルを使わず、その場で描く） ---------------- */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, colors, smin, smax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pick(colors); g.globalAlpha = rand(0.05, 0.35);
    const s = rand(smin, smax); g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}
const shade = (base, amt) => {
  const n = parseInt(base.slice(1), 16);
  const f = (v) => clamp(Math.round(v + amt), 0, 255);
  return "rgb(" + f(n >> 16) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")";
};

export const TEX = {};
export const MAT = {};

export function initAssets() {
  // 石の壁：大きな石を積んだブロック
  TEX.stone = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#16181d"; g.fillRect(0, 0, w, h);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 64 : 0;
      for (let c = -1; c < 3; c++) {
        g.fillStyle = shade("#454a52", rand(-14, 10));
        g.fillRect(c * 128 + off + 3, r * 64 + 3, 122, 58);
      }
    }
    speckle(g, w, h, 1400, ["#000", "#777", "#5b5f66"], 1, 4);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rand(-14, 14); y += rand(-14, 14); g.lineTo(x, y); } g.stroke(); }
  });
  // 床：四角い石畳
  TEX.floor = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#121418"; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { g.fillStyle = shade("#33373e", rand(-10, 8)); g.fillRect(c * 128 + 3, r * 128 + 3, 122, 122); }
    speckle(g, w, h, 1600, ["#000", "#666", "#4b4f56"], 1, 4);
  });
  // 鉄板（扉・機械）
  TEX.metal = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#3c4148"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ["#222", "#666", "#5a3b26"], 1, 5);
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 126, w, 4); g.fillRect(126, 0, 4, h);
    g.fillStyle = "#7a8089";
    for (let i = 0; i < 8; i++) for (const y of [10, 116, 138, 244]) { g.beginPath(); g.arc(16 + i * 32, y, 3.5, 0, 7); g.fill(); }
  });
  // さび
  TEX.rust = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#5a321c"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = pick(["#7c4422", "#3b2216", "#8f5a2c", "#4d4a46", "#2a1a12"]); g.globalAlpha = rand(.3, .8); g.beginPath(); g.arc(Math.random() * w, Math.random() * h, rand(2, 12), 0, 7); g.fill(); }
    g.globalAlpha = 1; speckle(g, w, h, 500, ["#000", "#a0602e"], 1, 3);
  });
  // 落ちたら危ない場所のふちどり
  TEX.hazard = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h); g.fillStyle = "#d8a21a";
    for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  });
  // ぼんやり光る丸（光の表現）
  TEX.glow = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  // 磁力ビームの流れ
  TEX.beam = canvasTex(16, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(255,255,255,0.15)"); gr.addColorStop(.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0.15)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // 床の磁石板（N/S）
  const plateTex = (col, letter) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#1b1d22"; g.fillRect(0, 0, w, h);
    g.strokeStyle = col; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
    g.globalAlpha = .35; g.fillStyle = col; g.fillRect(30, 30, w - 60, h - 60); g.globalAlpha = 1;
    g.fillStyle = col; g.font = "bold 120px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(letter, w / 2, h / 2 + 6);
  }, false);
  TEX.plateN = plateTex("#ff4040", "N");
  TEX.plateS = plateTex("#3d8bff", "S");

  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: .9, metalness: 0 }, o));
  MAT.stone = std({ map: TEX.stone });
  MAT.floor = std({ map: TEX.floor });
  MAT.metal = std({ map: TEX.metal, roughness: .55, metalness: .35 });
  MAT.rust = std({ map: TEX.rust, roughness: .85, metalness: .25, flatShading: true });
  MAT.iron = std({ color: 0x2b2f36, roughness: .5, metalness: .45, flatShading: true });
  MAT.dark = std({ color: 0x101216, roughness: 1 });
  MAT.hazard = std({ map: TEX.hazard, roughness: .8 });
  MAT.wood = std({ color: 0x4a3524, roughness: .9, flatShading: true });
  MAT.pipe = std({ color: 0x40464e, roughness: .45, metalness: .5 });
  MAT.lamp = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  MAT.redBtn = std({ color: 0xc81818, emissive: 0x5a0000, roughness: .4 });
  MAT.plateN = std({ map: TEX.plateN, emissive: 0xff2020, emissiveMap: TEX.plateN, emissiveIntensity: .6 });
  MAT.plateS = std({ map: TEX.plateS, emissive: 0x2a6bff, emissiveMap: TEX.plateS, emissiveIntensity: .6 });
  MAT.glowN = new THREE.MeshBasicMaterial({ color: POLE.N });
  MAT.glowS = new THREE.MeshBasicMaterial({ color: POLE.S });
  MAT.scrapN = std({ map: TEX.rust, color: 0xffb0a0, emissive: 0x7a0c0c, emissiveIntensity: .9, flatShading: true, roughness: .8 });
  MAT.scrapS = std({ map: TEX.rust, color: 0xa8c4ff, emissive: 0x0c2a80, emissiveIntensity: .9, flatShading: true, roughness: .8 });
  MAT.portal = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false });
}

export function glowSprite(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: TEX.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}

/* ---------------- 箱の形（テクスチャが伸びないよう大きさに合わせて模様をくり返す） ---------------- */
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
  }
  uv.needsUpdate = true;
  return g;
}

// 当たり判定のある箱を置く（opts.solid=false なら見た目だけ）
export function addBox(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
  const min = V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1));
  const max = V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1));
  const size = max.clone().sub(min);
  const mesh = new THREE.Mesh(boxGeo(size.x, size.y, size.z, opts.tile || 2), mat);
  mesh.position.copy(min).add(max).multiplyScalar(.5);
  (opts.parent || G.scene).add(mesh);
  const s = { min, max, mesh, active: true, kind: opts.kind || "wall" };
  if (opts.solid !== false) G.solids.push(s);
  return s;
}

/* ---------------- 当たり判定（体は縦長の箱として扱う） ---------------- */
function overlaps(b, s) {
  return b.pos.x + b.r > s.min.x && b.pos.x - b.r < s.max.x &&
    b.pos.z + b.r > s.min.z && b.pos.z - b.r < s.max.z &&
    b.pos.y + b.h > s.min.y && b.pos.y < s.max.y;
}
function freeAt(b, y) {
  const oy = b.pos.y; b.pos.y = y + 0.01;
  let ok = true;
  for (const s of G.solids) if (s.active && overlaps(b, s)) { ok = false; break; }
  b.pos.y = oy; return ok;
}
function axis(b, ax, d, canStep) {
  if (!d) return;
  b.pos[ax] += d;
  for (const s of G.solids) {
    if (!s.active || !overlaps(b, s)) continue;
    if (ax === "y") {
      if (d < 0) { b.pos.y = s.max.y; b.onGround = true; b.ground = s; }
      else b.pos.y = s.min.y - b.h - 1e-4;
      b.vel.y = 0;
    } else {
      if (canStep && s.max.y - b.pos.y <= 0.55 && s.max.y - b.pos.y > 0 && freeAt(b, s.max.y)) { b.pos.y = s.max.y + 0.01; continue; }
      b.pos[ax] = d > 0 ? s.min[ax] - b.r - 1e-4 : s.max[ax] + b.r + 1e-4;
      b.hitWall = true;
      b.vel[ax] = 0;
    }
  }
}
// b: {pos, vel, r, h}。動かして、床・壁・天井に当たったら止める
export function moveBody(b, dt) {
  const wasGround = b.onGround;
  b.onGround = false; b.ground = null; b.hitWall = false;
  const sp = Math.max(Math.abs(b.vel.x), Math.abs(b.vel.y), Math.abs(b.vel.z)) * dt;
  const n = Math.min(10, Math.max(1, Math.ceil(sp / 0.2)));
  const sdt = dt / n;
  for (let i = 0; i < n; i++) {
    axis(b, "x", b.vel.x * sdt, wasGround && !b.noStep);
    axis(b, "z", b.vel.z * sdt, wasGround && !b.noStep);
    axis(b, "y", b.vel.y * sdt, false);
  }
}
export function pointInSolid(p, pad = 0) {
  for (const s of G.solids) {
    if (s.active && p.x > s.min.x - pad && p.x < s.max.x + pad && p.y > s.min.y - pad && p.y < s.max.y + pad && p.z > s.min.z - pad && p.z < s.max.z + pad) return s;
  }
  return null;
}

/* ---------------- 光線（照準・カメラのめり込み防止） ---------------- */
export function rayBox(o, d, min, max) {
  let t0 = 0, t1 = Infinity;
  for (const a of ["x", "y", "z"]) {
    const inv = 1 / d[a];
    let tn = (min[a] - o[a]) * inv, tf = (max[a] - o[a]) * inv;
    if (tn > tf) { const k = tn; tn = tf; tf = k; }
    if (tn > t0) t0 = tn;
    if (tf < t1) t1 = tf;
    if (t0 > t1) return Infinity;
  }
  return t0 >= 0 ? t0 : Infinity;
}
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (cc < 0 ? 0 : Infinity);
}
export function raycastWorld(o, d, maxT) {
  let best = maxT, hit = null;
  for (const s of G.solids) {
    if (!s.active || s.noRay) continue;
    const t = rayBox(o, d, s.min, s.max);
    if (t < best) { best = t; hit = s; }
  }
  return { t: best, solid: hit };
}
