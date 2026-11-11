// ステージに置くもの：磁石ブロック、磁石の床、鉄くず、敵の核、扉、赤いボタン、看板、明かり、通過の判定
import { THREE, G, MAT, POLE, V, GRAV, rand, pick, addBox, moveBody, pointInSolid, glowSprite } from "./core.js";
import { makeAnchorMesh, makeScrapMesh, makeSign, getScrapGeos } from "./models.js";
import { FX } from "./fx.js";

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

/* ---------------- 磁石ブロック ---------------- */
export function addAnchor(x, y, z, pole, size = 1.6) {
  const m = makeAnchorMesh(pole, size);
  m.group.position.set(x, y, z); G.scene.add(m.group);
  const h = size / 2;
  const solid = { min: V(x - h, y - h, z - h), max: V(x + h, y + h, z + h), active: true, kind: "anchor" };
  G.solids.push(solid);
  const a = { kind: "anchor", pole, big: true, center: V(x, y, z), solid, mesh: m, size, phase: rand(0, 6) };
  solid.target = a;
  G.anchors.push(a);
  // 天井からの鎖
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 6, 4), MAT.iron);
  chain.position.set(x, y + h + 3, z); G.scene.add(chain);
  return a;
}

/* ---------------- 磁石の床（同じ極なら反発して浮く） ---------------- */
export function addPlate(x0, z0, x1, z1, y, pole) {
  const s = addBox(x0, y, z0, x1, y + 0.06, z1, pole === "N" ? MAT.plateN : MAT.plateS, { kind: "plate", tile: Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) });
  const p = { kind: "plate", pole, big: true, solid: s, top: y + 0.06, min: s.min, max: s.max };
  s.target = p;
  G.plates.push(p);
  return p;
}

/* ---------------- 鉄くず ---------------- */
export function addScrap(pos, pole, state = "ground") {
  const mesh = makeScrapMesh(pole); // 落ちている間はまとめて描く（syncScrap）。体にくっついたら主人公に付ける
  const s = { pos: pos.clone(), vel: V(), pole, state, r: 0.16, h: 0.22, noStick: 0, life: 0, mesh, mag: null, onGround: state === "ground", spin: V(rand(-6, 6), rand(-6, 6), rand(-6, 6)), noStep: true };
  mesh.position.set(s.pos.x, s.pos.y + 0.11, s.pos.z);
  G.scrap.push(s);
  return s;
}
export function scatterScrap(cx, cz, y, radius, n, poles) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * radius;
    addScrap(V(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r), pick(poles));
  }
}
export function scrapCenter(s, out) { return out.set(s.pos.x, s.pos.y + 0.11, s.pos.z); }
export function removeScrap(s) {
  if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
  const i = G.scrap.indexOf(s); if (i >= 0) G.scrap.splice(i, 1);
}
// 体についていた鉄くずを外して、世界に戻す
export function detachScrap(s) {
  s.mesh.getWorldPosition(tmp);
  if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
  s.mesh.scale.setScalar(1);
  s.pos.set(tmp.x, tmp.y - 0.11, tmp.z);
  s.state = "free"; s.onGround = false; s.life = 0;
}

function hitEnemyAt(c, pad) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (c.x > e.pos.x - e.r - pad && c.x < e.pos.x + e.r + pad && c.z > e.pos.z - e.r - pad && c.z < e.pos.z + e.r + pad && c.y > e.pos.y - pad && c.y < e.pos.y + e.h + pad) return e;
  }
  return null;
}

export function updateScrap(dt) {
  const P = G.player;
  for (let i = G.scrap.length - 1; i >= 0; i--) {
    const s = G.scrap[i];
    if (s.state === "stuck") continue;
    const c = scrapCenter(s, tmp);
    // 飛んでいる鉄くず（自分が飛ばしたもの／敵が投げたもの）
    if (s.state === "proj" || s.state === "eproj") {
      s.life += dt;
      s.vel.y -= (s.state === "eproj" ? 12 : 4) * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += 14 * dt; s.mesh.rotation.y += 9 * dt;
      scrapCenter(s, c);
      let stop = false;
      if (s.state === "proj") {
        const e = hitEnemyAt(c, 0.3);
        if (e) { e.hurt(s.dmg || 7, false, tmp2.copy(s.vel).normalize(), "scrap"); FX.burst(c, 0xffd28a, 6, 3); stop = true; }
        const b = G.button;
        if (b && !b.pressed && c.x > b.min.x - .4 && c.x < b.max.x + .4 && c.y > b.min.y - .4 && c.y < b.max.y + .4 && c.z > b.min.z - .4 && c.z < b.max.z + .4) { b.press(); stop = true; }
      } else if (P && !P.dead) {
        const dy = Math.max(P.pos.y + .2, Math.min(P.pos.y + 1.6, c.y));
        if (Math.hypot(c.x - P.pos.x, c.y - dy, c.z - P.pos.z) < 0.65) { P.hurt(s.dmg || 8, s.pos); stop = true; }
      }
      if (!stop && pointInSolid(c)) { s.pos.addScaledVector(s.vel, -dt); FX.burst(c, 0xffd28a, 4, 2); stop = true; }
      if (stop || s.life > 2.6) { s.vel.multiplyScalar(stop ? -0.15 : 0.5); s.state = "free"; s.noStick = Math.max(s.noStick, .4); }
      s.mesh.position.set(s.pos.x, s.pos.y + 0.11, s.pos.z);
      continue;
    }
    s.noStick -= dt;
    // 磁力ビームを当てられている
    if (s.mag) {
      tmp2.set(P.pos.x, P.pos.y + 1.1, P.pos.z).sub(c);
      const d = tmp2.length(); tmp2.divideScalar(d || 1);
      if (s.mag.attract) { s.vel.addScaledVector(tmp2, 46 * s.mag.s * dt); s.vel.y += GRAV * .9 * dt; }
      else { s.vel.addScaledVector(tmp2, -38 * s.mag.s * dt); s.vel.y += GRAV * .5 * dt; }
      const sp = s.vel.length(); if (sp > 16) s.vel.multiplyScalar(16 / sp);
      s.state = "free"; s.mag = null;
    }
    // 反対の極なら、近づくと体にくっつく
    if (P && P.canStick(s)) {
      const sy = Math.max(P.pos.y + .3, Math.min(P.pos.y + 1.5, c.y));
      tmp2.set(P.pos.x - c.x, sy - c.y, P.pos.z - c.z);
      const d = tmp2.length();
      if (d < 0.75) { P.stick(s); continue; }
      if (d < 2.0) { s.state = "free"; s.vel.addScaledVector(tmp2.divideScalar(d), 40 * dt); s.vel.y += GRAV * .8 * dt; }
    }
    if (s.state === "free") {
      s.vel.y -= GRAV * dt;
      moveBody(s, dt);
      if (s.onGround) {
        const f = Math.exp(-7 * dt); s.vel.x *= f; s.vel.z *= f;
        if (Math.abs(s.vel.x) + Math.abs(s.vel.z) < 0.25 && Math.abs(s.vel.y) < 0.1) { s.state = "ground"; s.vel.set(0, 0, 0); }
      } else { s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.z += s.spin.z * dt; }
      if (s.pos.y < -25) { removeScrap(s); continue; }
      s.mesh.position.set(s.pos.x, s.pos.y + 0.11, s.pos.z);
    }
  }
}

/* ---------------- 敵の核（触るとMP回復） ---------------- */
export function addCore(pos, pole, amount, big = false) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? .4 : .2, 0), new THREE.MeshBasicMaterial({ color: POLE[pole] }));
  g.add(core, glowSprite(POLE[pole], big ? 3 : 1.6, .9));
  g.position.copy(pos); G.scene.add(g);
  const p = { kind: "core", g, core, pos: pos.clone(), vel: V(rand(-1, 1), 4, rand(-1, 1)), r: .2, h: .3, amount, big, t: 0, noStep: true };
  G.pickups.push(p);
  return p;
}
export function updatePickups(dt) {
  const P = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.t += dt;
    p.vel.y -= GRAV * .5 * dt; moveBody(p, dt);
    if (p.onGround) { p.vel.x *= .9; p.vel.z *= .9; }
    p.g.position.set(p.pos.x, p.pos.y + 0.5 + Math.sin(p.t * 3) * .12, p.pos.z);
    p.core.rotation.y += dt * 2; p.core.rotation.x += dt;
    if (p.t > .5 && P && !P.dead) {
      const d = Math.hypot(P.pos.x - p.pos.x, (P.pos.y + 1) - (p.pos.y + .5), P.pos.z - p.pos.z);
      if (d < 1.8) {
        P.mp = Math.min(P.maxMp, P.mp + p.amount);
        if (p.big) P.hp = P.maxHp;
        FX.burst(p.g.position, 0x9be8ff, 18, 3);
        FX.text(p.g.position, p.big ? "MP・体力 全回復" : "MP +" + p.amount, "mp");
        G.scene.remove(p.g); G.pickups.splice(i, 1);
      }
    }
    if (p.pos.y < -25) { G.scene.remove(p.g); G.pickups.splice(i, 1); }
  }
}

/* ---------------- 通過の判定（チェックポイント・ヒント・ボス部屋など） ---------------- */
export function addTrigger(x0, y0, z0, x1, y1, z1, fn, once = true) {
  const t = { min: V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), max: V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), fn, once, done: false };
  G.triggers.push(t); return t;
}
export function updateTriggers() {
  const P = G.player; if (!P || P.dead) return;
  const p = P.pos;
  for (const t of G.triggers) {
    if (t.done) continue;
    if (p.x > t.min.x && p.x < t.max.x && p.y + .5 > t.min.y && p.y < t.max.y && p.z > t.min.z && p.z < t.max.z) {
      if (t.once) t.done = true;
      t.fn(t);
    }
  }
}

/* ---------------- 明かり ---------------- */
export function addLight(x, y, z, color = 0xffb060, intensity = 30, dist = 22, lamp = true) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(x, y, z); G.scene.add(l);
  if (lamp) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.3, .4, .3), MAT.lamp); m.position.set(x, y, z); G.scene.add(m);
    const s = glowSprite(color, 2.6, .7); s.position.set(x, y, z); G.scene.add(s);
  }
  return l;
}

/* ---------------- 看板 ---------------- */
export function addSign(lines, x, y, z, rotY = 0, w = 3, h = 1.2) {
  const m = makeSign(lines, w, h);
  m.position.set(x, y, z); m.rotation.y = rotY; G.scene.add(m); return m;
}

/* ---------------- 扉（下から上に開く／閉じる） ---------------- */
export function addDoor(x0, y0, z0, x1, y1, z1, startOpen = false) {
  const s = addBox(x0, y0, z0, x1, y1, z1, MAT.metal, { kind: "door", tile: 3 });
  const height = Math.abs(y1 - y0);
  const base = s.mesh.position.y;
  const d = { solid: s, open: startOpen ? 1 : 0, target: startOpen ? 1 : 0, height, base, y0: s.min.y, y1: s.max.y };
  const apply = () => {
    s.mesh.position.y = base + d.open * (height - .02);
    s.min.y = d.y0 + d.open * height; s.max.y = d.y1 + d.open * height;
    s.active = d.open < .7;
  };
  apply();
  G.updaters.push((dt) => {
    if (d.open === d.target) return;
    const sp = d.target > d.open ? .45 : 1.6;
    d.open = d.target > d.open ? Math.min(d.target, d.open + sp * dt) : Math.max(d.target, d.open - sp * dt);
    apply();
    G.shake = Math.max(G.shake, .08);
  });
  d.setOpen = (v, instant) => { d.target = v ? 1 : 0; if (instant) { d.open = d.target; apply(); } };
  return d;
}

/* ---------------- 人の力では押せない赤いボタン ---------------- */
export function addButton(x, y, z, onPress, pressed = false) {
  // 北向きの壁（z の大きい側を向く面）に付ける
  addBox(x - .9, y - .9, z, x + .9, y + .9, z + .12, MAT.metal, { solid: false, tile: 1.8 });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(.55, .6, .35, 16), MAT.redBtn.clone());
  cyl.rotation.x = Math.PI / 2; cyl.position.set(x, y, z + .3); G.scene.add(cyl);
  const glow = glowSprite(0xff2020, 2.6, .5); glow.position.set(x, y, z + .5); G.scene.add(glow);
  const b = {
    min: V(x - .6, y - .6, z), max: V(x + .6, y + .6, z + .5), pressed, mesh: cyl, center: V(x, y, z + .45),
    press() {
      if (b.pressed) return; b.pressed = true;
      cyl.position.z = z + .16; cyl.material.color.setHex(0x3a8a3a); cyl.material.emissive.setHex(0x0a3a0a);
      glow.material.color.setHex(0x40ff60);
      FX.burst(b.center, 0xffe080, 30, 5); G.shake = .4;
      onPress();
    }
  };
  if (pressed) { b.pressed = false; b.press = b.press.bind(b); cyl.position.z = z + .16; cyl.material.color.setHex(0x3a8a3a); glow.material.color.setHex(0x40ff60); b.pressed = true; }
  G.button = b;
  return b;
}

export function updateAnchors(dt) {
  for (const a of G.anchors) {
    a.phase += dt;
    a.mesh.ring.rotation.x = a.phase * .9; a.mesh.ring.rotation.y = a.phase * .6;
    const s = 1 + Math.sin(a.phase * 3) * .08;
    a.mesh.glow.scale.set(a.size * 3.2 * s, a.size * 3.2 * s, 1);
  }
}

/* ---------------- 落ちている鉄くずを、形と極ごとにまとめて一度に描く（数が多くても軽い） ---------------- */
const CAP = 900;
let inst = [];
export function initScrapInstances(scene) {
  if (!inst.length) {
    const geos = getScrapGeos();
    for (const g of geos) for (const m of [MAT.scrapN, MAT.scrapS]) {
      const im = new THREE.InstancedMesh(g, m, CAP);
      im.frustumCulled = false; im.count = 0; im.userData.keep = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.push(im);
    }
  }
  inst.forEach((im) => scene.add(im));
}
export function syncScrap() {
  const counts = new Array(inst.length).fill(0);
  for (const s of G.scrap) {
    if (s.state === "stuck") continue;
    const k = s.mesh.userData.gi * 2 + (s.pole === "N" ? 0 : 1);
    const im = inst[k];
    if (counts[k] >= CAP) continue;
    s.mesh.updateMatrix();
    im.setMatrixAt(counts[k]++, s.mesh.matrix);
  }
  inst.forEach((im, i) => { im.count = counts[i]; im.instanceMatrix.needsUpdate = true; });
}
