// 見た目の組み立て（主人公・敵・鉄くず・武器・磁石ブロック・看板）。すべて箱などの単純な形で作るローポリ
import { THREE, MAT, TEX, POLE, rand, pick, glowSprite, boxGeo } from "./core.js";

const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: .85, metalness: 0, flatShading: true }, o));
function part(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); if (parent) parent.add(m); return m;
}
function pivot(x, y, z, parent) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

/* ---------------- 主人公 ---------------- */
export function makePlayerModel() {
  const coat = std({ color: 0x23364a }), pants = std({ color: 0x24272d }), boot = std({ color: 0x141518 });
  const skin = std({ color: 0xd9a98a }), hair = std({ color: 0x1b1612 }), plate = std({ color: 0x59606a, metalness: .3, roughness: .5 });
  const glow = new THREE.MeshBasicMaterial({ color: POLE.N });
  const root = new THREE.Group();
  const body = pivot(0, 0, 0, root); // 体全体（かたむけ用）
  // 胴
  const torso = pivot(0, 0.95, 0, body);
  part(0.56, 0.62, 0.32, coat, 0, 0.32, 0, torso);
  part(0.6, 0.16, 0.36, plate, 0, 0.6, 0, torso);         // 肩当て
  part(0.5, 0.12, 0.34, pants, 0, 0.02, 0, torso);         // ベルト
  part(0.14, 0.1, 0.02, glow, 0, 0.36, -0.17, torso);      // 胸の光
  // 背中の磁力コイル
  part(0.26, 0.34, 0.1, plate, 0, 0.38, 0.19, torso);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), glow);
  coil.position.set(0, 0.38, 0.25); torso.add(coil);
  // 頭
  const head = pivot(0, 0.72, 0, torso);
  part(0.3, 0.32, 0.3, skin, 0, 0.17, 0, head);
  part(0.34, 0.14, 0.34, hair, 0, 0.34, 0.01, head);
  part(0.34, 0.2, 0.08, hair, 0, 0.22, 0.15, head);
  part(0.32, 0.06, 0.04, glow, 0, 0.2, -0.16, head);       // ゴーグル
  // 腕（左手が磁力の手）
  const mkArm = (side) => {
    const sh = pivot(side * 0.36, 0.56, 0, torso);
    part(0.16, 0.34, 0.16, coat, 0, -0.17, 0, sh);
    const el = pivot(0, -0.34, 0, sh);
    part(0.15, 0.3, 0.15, coat, 0, -0.15, 0, el);
    const hand = pivot(0, -0.34, 0, el);
    part(0.2, 0.16, 0.2, plate, 0, 0.02, 0, hand);           // 手甲
    part(0.21, 0.04, 0.21, glow, 0, 0.08, 0, hand);
    return { sh, el, hand };
  };
  const L = mkArm(-1), R = mkArm(1);
  // 脚
  const mkLeg = (side) => {
    const hip = pivot(side * 0.14, 0.95, 0, body);
    part(0.2, 0.44, 0.2, pants, 0, -0.22, 0, hip);
    const kn = pivot(0, -0.46, 0, hip);
    part(0.18, 0.4, 0.18, pants, 0, -0.2, 0, kn);
    part(0.2, 0.1, 0.3, boot, 0, -0.44, -0.04, kn);
    return { hip, kn };
  };
  const LL = mkLeg(-1), RL = mkLeg(1);
  const scrapHolder = pivot(0, 0, 0, body);
  const weaponHolder = pivot(0, -0.06, 0, R.hand);
  root.traverse((o) => { o.castShadow = false; });
  // 足元の極の輪
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 24), new THREE.MeshBasicMaterial({ color: POLE.N, transparent: true, opacity: .5, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; root.add(ring);
  return { root, body, torso, head, L, R, LL, RL, glow, ring, scrapHolder, weaponHolder, coil };
}

/* ---------------- 武器（鉄くずで作った剣と槍） ---------------- */
export function makeWeapon(id) {
  const g = new THREE.Group();
  const blade = std({ color: 0x8e949c, metalness: .5, roughness: .35 });
  if (id === "sword") {
    part(0.07, 0.22, 0.07, MAT.wood, 0, -0.02, 0, g);
    part(0.32, 0.06, 0.1, MAT.rust, 0, -0.15, 0, g);
    part(0.11, 0.85, 0.035, blade, 0, -0.6, 0, g);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 4), blade);
    tip.rotation.x = Math.PI; tip.rotation.y = Math.PI / 4; tip.scale.z = .35; tip.position.y = -1.11; g.add(tip);
    part(0.13, 0.2, 0.05, MAT.rust, 0.02, -0.38, 0.01, g);
    part(0.12, 0.12, 0.05, MAT.rust, -0.02, -0.78, 0.01, g);
  } else {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), MAT.iron);
    shaft.position.y = -0.55; g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), blade);
    tip.rotation.x = Math.PI; tip.position.y = -1.88; g.add(tip);
    part(0.16, 0.12, 0.12, MAT.rust, 0, -1.62, 0, g);
    part(0.1, 0.1, 0.1, MAT.rust, 0.03, 0.45, 0, g);
  }
  return g;
}

/* ---------------- 鉄くず ---------------- */
let scrapGeos = null;
export function getScrapGeos() { if (!scrapGeos) makeScrapMesh("N"); return scrapGeos; }
export function makeScrapMesh(pole) {
  if (!scrapGeos) scrapGeos = [
    new THREE.BoxGeometry(0.3, 0.12, 0.22),
    new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6),
    new THREE.BoxGeometry(0.36, 0.05, 0.26),
    new THREE.DodecahedronGeometry(0.15, 0),
    new THREE.TorusGeometry(0.11, 0.04, 4, 6)
  ];
  const gi = (Math.random() * scrapGeos.length) | 0;
  const m = new THREE.Mesh(scrapGeos[gi], pole === "N" ? MAT.scrapN : MAT.scrapS);
  m.userData.gi = gi;
  m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  return m;
}

/* ---------------- 敵（さびた鉄くずのゴーレム） ---------------- */
function addChunks(parent, n, sx, sy, sz, mat) {
  for (let i = 0; i < n; i++) {
    const c = part(rand(.08, .22) * sx * 2, rand(.06, .18) * sy * 2, rand(.06, .2) * sz * 2, mat, rand(-sx, sx), rand(-sy, sy), rand(-sz, sz), parent);
    c.rotation.set(rand(-.6, .6), rand(-.6, .6), rand(-.6, .6));
  }
}
export function makeEnemyModel(type, pole) {
  const rust = MAT.rust.clone(), iron = MAT.iron.clone();
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const coreM = new THREE.MeshBasicMaterial({ color: POLE[pole] });
  const root = new THREE.Group();
  const body = pivot(0, 0, 0, root);
  const M = { root, body, mats: [rust, iron], coreM, legs: [], arms: [] };
  let coreR = .12, coreParent, corePos;
  const eyes = (head, w, y, z, s) => { part(s, s * .6, .04, eyeM, -w, y, z, head); part(s, s * .6, .04, eyeM, w, y, z, head); };

  if (type === "lv1" || type === "dummy") {
    const torso = pivot(0, 0.72, 0, body); M.torso = torso;
    part(0.78, 0.66, 0.52, rust, 0, 0.33, 0, torso);
    addChunks(torso, 6, .4, .3, .27, iron);
    const head = pivot(0, 0.7, 0, torso); M.head = head;
    part(0.44, 0.36, 0.4, iron, 0, 0.16, 0, head);
    eyes(head, .1, .18, -.21, .1);
    for (const s of [-1, 1]) {
      const sh = pivot(s * 0.5, 0.56, 0, torso); M.arms.push(sh);
      part(0.22, 0.58, 0.22, rust, 0, -0.27, 0, sh);
      part(0.28, 0.24, 0.28, iron, 0, -0.62, 0, sh);
      const hip = pivot(s * 0.2, 0.72, 0, body); M.legs.push(hip);
      part(0.26, 0.7, 0.28, iron, 0, -0.36, 0, hip);
    }
    coreParent = torso; corePos = [0, 0.36, -0.28];
    if (type === "dummy") { const post = part(0.12, 0.5, 0.12, MAT.wood, 0, -0.1, 0.4, body); post.rotation.x = .3; }
  } else if (type === "lv2") {
    const torso = pivot(0, 0.62, 0, body); M.torso = torso;
    part(0.58, 0.44, 1.15, rust, 0, 0, 0, torso);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4), iron); sp.position.set(rand(-.15, .15), 0.3, -0.4 + i * 0.2); sp.rotation.x = .5; torso.add(sp); }
    const head = pivot(0, 0.16, -0.68, torso); M.head = head;
    part(0.42, 0.34, 0.46, iron, 0, 0, -0.1, head);
    part(0.3, 0.12, 0.3, rust, 0, -0.16, -0.22, head);
    eyes(head, .1, .06, -.34, .09);
    for (const [x, z] of [[-.24, -.4], [.24, -.4], [-.24, .42], [.24, .42]]) {
      const hip = pivot(x, 0.5, z, body); M.legs.push(hip);
      part(0.13, 0.5, 0.13, iron, 0, -0.25, 0, hip);
    }
    coreParent = torso; corePos = [0, 0.25, 0.2]; coreR = .1;
  } else if (type === "lv3") {
    const torso = pivot(0, 1.2, 0, body); M.torso = torso;
    part(1.5, 1.1, 0.95, rust, 0, 0.55, 0, torso);
    addChunks(torso, 10, .75, .55, .5, iron);
    for (const s of [-1, 1]) part(0.6, 0.35, 0.8, iron, s * 0.85, 1.05, 0, torso);
    const head = pivot(0, 1.1, -0.2, torso); M.head = head;
    part(0.5, 0.42, 0.5, iron, 0, 0.18, 0, head);
    eyes(head, .12, .2, -.26, .11);
    for (const s of [-1, 1]) {
      const sh = pivot(s * 0.98, 0.95, 0, torso); M.arms.push(sh);
      part(0.48, 1.0, 0.48, rust, 0, -0.5, 0, sh);
      part(0.72, 0.62, 0.72, iron, 0, -1.2, 0, sh);
      const hip = pivot(s * 0.45, 1.2, 0, body); M.legs.push(hip);
      part(0.55, 1.2, 0.6, iron, 0, -0.6, 0, hip);
    }
    coreParent = torso; corePos = [0, 0.6, -0.5]; coreR = .2;
  } else { // ボス
    const torso = pivot(0, 2.0, 0, body); M.torso = torso;
    part(2.5, 1.9, 1.5, rust, 0, 0.95, 0, torso);
    addChunks(torso, 22, 1.25, .95, .8, iron);
    addChunks(torso, 10, 1.3, 1, .8, rust);
    for (const s of [-1, 1]) { part(1.1, 0.55, 1.3, iron, s * 1.4, 1.8, 0, torso); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 5), iron); sp.position.set(s * 1.5, 2.3, 0); torso.add(sp); }
    const head = pivot(0, 1.95, -0.25, torso); M.head = head;
    part(0.9, 0.75, 0.85, iron, 0, 0.32, 0, head);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), rust); sp.position.set(-0.36 + i * 0.18, 0.85, 0); head.add(sp); }
    eyes(head, .2, .36, -.44, .18);
    for (const s of [-1, 1]) {
      const sh = pivot(s * 1.65, 1.6, 0, torso); M.arms.push(sh);
      part(0.8, 1.7, 0.8, rust, 0, -0.85, 0, sh);
      addChunks(sh, 5, .45, .8, .45, iron);
      part(1.15, 1.0, 1.15, iron, 0, -2.0, 0, sh);
      const hip = pivot(s * 0.75, 2.0, 0, body); M.legs.push(hip);
      part(0.95, 2.0, 1.0, iron, 0, -1.0, 0, hip);
    }
    coreParent = torso; corePos = [0, 1.0, -0.78]; coreR = .38;
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(coreR, 0), coreM);
  core.position.set(...corePos); coreParent.add(core);
  const cg = glowSprite(POLE[pole], coreR * 9, .9); core.add(cg);
  M.core = core; M.coreGlow = cg;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow); M.shadow = shadow;
  return M;
}
export function setEnemyPole(M, pole) {
  M.coreM.color.setHex(POLE[pole]);
  M.coreGlow.material.color.setHex(POLE[pole]);
}

/* ---------------- 磁石ブロック（引っぱる・引っぱられるための大きな磁石） ---------------- */
export function makeAnchorMesh(pole, size) {
  const g = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), pole === "N" ? MAT.plateN : MAT.plateS);
  g.add(cube);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(size * .14, size * 1.04, size * .14), MAT.iron);
    e.position.set(x * size * .47, 0, z * size * .47); g.add(e);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size * .9, size * .05, 6, 28), pole === "N" ? MAT.glowN : MAT.glowS);
  g.add(ring);
  const sp = glowSprite(POLE[pole], size * 3.2, .55); g.add(sp);
  return { group: g, ring, glow: sp };
}

/* ---------------- 看板（文字はキャンバスに描く） ---------------- */
export function makeSign(lines, w = 3, h = 1.2, color = "#f2e6c8") {
  const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = "#1a1c21"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#8a6a3a"; g.lineWidth = 10; g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  const fs = Math.min(54, (c.height - 30) / lines.length * .78);
  g.font = "bold " + fs + "px 'Yu Gothic UI','Hiragino Sans',Meiryo,sans-serif";
  lines.forEach((t, i) => g.fillText(t, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.25, c.width - 30));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: 0xb8b8b8 }));
  return m;
}

export { boxGeo, TEX };
