// 主人公：移動、磁力（引き寄せ・引っぱられる・反発・浮遊）、鉄くずをまとう、極の切り替えで発射、武器づくり、攻撃
import { THREE, G, POLE, V, GRAV, clamp, damp, rand, other, turnTo, moveBody, rayBox, raySphere, raycastWorld } from "./core.js";
import { makePlayerModel, makeWeapon } from "./models.js";
import { detachScrap, removeScrap, scrapCenter } from "./world.js";
import { FX } from "./fx.js";
import { input } from "./input.js";

export const WEAPONS = [
  { id: "sword", name: "剣", cost: 10, dmg: 24, reach: 2.6, cd: 0.32, arc: 1.5 },
  { id: "spear", name: "槍", cost: 15, dmg: 24, reach: 3.9, cd: 0.6, arc: 0.75 }
];
const FIST = { id: "fist", name: "素手", dmg: 9, reach: 1.8, cd: 0.42, arc: 1.4 };
const BASE_RANGE = 14;

export const cam = { yaw: 0, pitch: -0.12, dist: 4.3, ty: 0, curD: 4.3 };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
const camFwd = new THREE.Vector3(), camRight = new THREE.Vector3();

export class Player {
  constructor() {
    this.model = makePlayerModel();
    this.pos = V(); this.vel = V(); this.r = 0.36; this.h = 1.75;
    this.yaw = 0; this.pole = "N"; this.neutral = false;
    this.stuck = []; this.weapon = null; this.weaponMesh = null; this.sel = 0;
    this.hp = 100; this.mp = 100;
    this.atkCd = 0; this.atkT = -1; this.atkW = FIST; this.atkHit = false;
    this.invuln = 0; this.mpDelay = 0; this.pullT = 0; this.coyote = 0;
    this.attached = null; this.repelT = 0; this.dead = false;
    this.aim = { target: null, point: V(), dist: 0, t: 0, inRange: false };
    this.beamOn = false; this.walk = 0; this.hover = false;
    this._chest = V();
    this.events = {}; // 画面表示用のできごと
  }
  get maxHp() { return 100; }
  get maxMp() { return 100 + 20 * G.save.stats.mp; }
  get maxLoad() { return 30 + 5 * G.save.stats.load; }
  get speedMul() { return 1 + 0.08 * G.save.stats.speed; }
  get load() { return this.stuck.length; }
  get chest() { return this._chest.set(this.pos.x, this.pos.y + 1.2, this.pos.z); }
  get overloaded() { return this.load > this.maxLoad; }
  range() { return BASE_RANGE * (1 - 0.45 * Math.min(1, this.load / this.maxLoad)); }
  emit(name, data) { if (G.onPlayerEvent) G.onPlayerEvent(name, data); }

  reset(pos, yaw) {
    this.pos.copy(pos); this.vel.set(0, 0, 0); this.yaw = yaw; cam.yaw = yaw; cam.pitch = -0.12; cam.ty = pos.y + 1.75; cam.curD = cam.dist;
    this.hp = this.maxHp; this.mp = this.maxMp; this.dead = false; this.attached = null;
    for (const s of this.stuck) removeScrap(s);
    this.stuck = [];
    this.setWeapon(null);
    this.pole = "N"; this.neutral = false; this.invuln = 1; this.atkT = -1; this.pullT = 0;
    this.model.root.visible = true; this.model.body.rotation.set(0, 0, 0);
    this.applyColor();
  }
  applyColor() {
    const c = this.neutral ? 0x8a8f99 : POLE[this.pole];
    this.model.glow.color.setHex(c); this.model.ring.material.color.setHex(c);
  }
  setWeapon(id) {
    if (this.weaponMesh) { this.weaponMesh.parent.remove(this.weaponMesh); this.weaponMesh = null; }
    this.weapon = id;
    if (id) { this.weaponMesh = makeWeapon(id); this.model.weaponHolder.add(this.weaponMesh); }
  }
  canStick(s) { return !this.dead && !this.neutral && s.pole !== this.pole && s.noStick <= 0 && this.load < this.maxLoad + 10; }
  stick(s) {
    s.state = "stuck"; s.vel.set(0, 0, 0);
    if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
    const a = rand(0, Math.PI * 2), y = rand(0.35, 1.55), r = (y > 0.95 ? 0.34 : 0.22) + rand(0, .07);
    s.mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    s.mesh.scale.setScalar(.8);
    this.model.scrapHolder.add(s.mesh);
    this.stuck.push(s);
    if (this.load === this.maxLoad + 1) this.emit("overload");
    this.emit("stick");
  }

  /* ---------- 照準：カメラの中心から光線を飛ばし、磁石になるものを探す ---------- */
  computeAim() {
    const cmr = G.camera, o = cmr.position;
    cmr.getWorldDirection(camFwd);
    const chest = this.chest;
    const minT = o.distanceTo(chest) * 0.8;
    const w = raycastWorld(o, camFwd, 140);
    let best = null, bestT = w.t + 0.05;
    if (w.solid && w.solid.target && w.t >= minT) { best = w.solid.target; bestT = w.t; }
    for (const e of G.enemies) {
      if (e.dead) continue;
      tmp.set(e.pos.x - e.r, e.pos.y, e.pos.z - e.r); tmp2.set(e.pos.x + e.r, e.pos.y + e.h, e.pos.z + e.r);
      const t = rayBox(o, camFwd, tmp, tmp2);
      if (t >= minT && t < bestT) { best = e; bestT = t; }
    }
    for (const s of G.scrap) {
      if (s.state !== "ground" && s.state !== "free") continue;
      const t = raySphere(o, camFwd, scrapCenter(s, tmp), 0.42);
      if (t >= minT && t < bestT) { best = s; bestT = t; }
    }
    let point = null;
    // ねらいの補助：少しずれていても、近くの敵・鉄くずに合わせる
    if (!best) {
      let bestA = 1;
      const tryT = (obj, c, lim) => {
        tmp3.copy(c).sub(o); const d = tmp3.length(); if (d < minT || d > 60) return;
        tmp3.divideScalar(d);
        const a = Math.acos(clamp(tmp3.dot(camFwd), -1, 1));
        if (a > lim || a / lim >= bestA) return;
        if (raycastWorld(o, tmp3, d).t < d - 0.5) return;
        bestA = a / lim; best = obj; point = c.clone();
      };
      for (const e of G.enemies) if (!e.dead) tryT(e, tmp2.set(e.pos.x, e.pos.y + e.h * .5, e.pos.z), 0.08);
      for (const s of G.scrap) if (s.state === "ground" || s.state === "free") tryT(s, scrapCenter(s, V()), 0.05);
    }
    const A = this.aim;
    A.target = best;
    if (point) A.point.copy(point); else A.point.copy(o).addScaledVector(camFwd, Math.min(bestT, w.t));
    A.t = o.distanceTo(A.point);
    A.dist = A.point.distanceTo(chest);
    return A;
  }
  targetPole(t) { return t.pole; }

  /* ---------- 操作 ---------- */
  flip() {
    if (this.dead) return;
    this.neutral = false;
    this.pole = other(this.pole);
    this.applyColor();
    FX.ring(this.pos, POLE[this.pole], 2.2, .35);
    // くっついていた鉄くずは同じ極になり、反発してねらった先へ飛んでいく
    if (this.stuck.length) {
      const target = this.aim.point;
      const n = this.stuck.length;
      for (const s of this.stuck) {
        detachScrap(s);
        s.state = "proj"; s.dmg = 7; s.life = 0;
        tmp.copy(target).sub(s.pos).normalize();
        tmp.x += rand(-.05, .05); tmp.y += rand(-.03, .06); tmp.z += rand(-.05, .05);
        s.vel.copy(tmp.normalize()).multiplyScalar(rand(27, 33));
      }
      this.stuck = [];
      FX.burst(this.chest, POLE[this.pole], 16, 5);
      G.shake = Math.max(G.shake, .15);
      this.emit("launch", n);
    }
    // 磁石ブロックにくっついていたら、反発で飛び出す
    if (this.attached) {
      const a = this.attached.a;
      tmp.copy(this.chest).sub(a.center); tmp.y = Math.max(tmp.y, 0); tmp.normalize();
      this.vel.copy(tmp).multiplyScalar(15); this.vel.y += 7;
      this.attached = null; this.repelT = .25; this.lock = null; this.noLockT = .5;
      FX.ring(a.center, POLE[this.pole], 3, .4);
      this.emit("repelJump");
    }
    this.emit("flip");
  }
  toggleNeutral() {
    if (this.dead) return;
    this.neutral = !this.neutral;
    if (this.neutral) {
      for (const s of this.stuck) { detachScrap(s); s.vel.set(rand(-2, 2), rand(1, 3), rand(-2, 2)); s.noStick = .6; }
      this.stuck = []; this.attached = null;
    }
    this.applyColor();
    this.emit("neutral", this.neutral);
  }
  nextWeapon() { this.sel = (this.sel + 1) % WEAPONS.length; this.emit("select"); }
  craft() {
    const w = WEAPONS[this.sel];
    if (this.weapon === w.id) { this.emit("toast", "もう" + w.name + "を持っています"); return; }
    if (this.load < w.cost) { this.emit("toast", "鉄くずが足りません（" + w.name + "は" + w.cost + "個、いま" + this.load + "個）"); return; }
    for (let i = 0; i < w.cost; i++) removeScrap(this.stuck.pop());
    this.setWeapon(w.id);
    this.model.weaponHolder.getWorldPosition(tmp);
    FX.burst(tmp, 0xffd28a, 24, 4);
    this.emit("crafted", w);
  }

  hurt(dmg, from) {
    if (this.dead || this.invuln > 0) return;
    let d = dmg;
    // まとった鉄くずが攻撃を少し防ぐ。そのかわり、はがれ落ちる
    if (this.load > 0) {
      d *= 0.6;
      const k = Math.min(this.load, Math.ceil(dmg / 5));
      for (let i = 0; i < k; i++) {
        const s = this.stuck.pop(); detachScrap(s);
        s.vel.set(rand(-4, 4), rand(2, 5), rand(-4, 4)); s.noStick = 1.6;
      }
    }
    d = Math.round(d);
    this.hp -= d; this.invuln = 0.75;
    FX.text(this.chest, "-" + d, "hurt");
    if (from) {
      tmp.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
      if (!this.attached) { this.vel.addScaledVector(tmp, 6); this.vel.y = Math.max(this.vel.y, 4); }
    }
    G.shake = Math.max(G.shake, .25);
    this.emit("hurt", d);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.attached = null; this.emit("dead"); }
  }

  /* ---------- 毎フレーム ---------- */
  update(dt) {
    const I = input;
    this.atkCd -= dt; this.invuln -= dt; this.mpDelay -= dt; this.pullT -= dt; this.repelT -= dt; this.coyote -= dt; this.noLockT = (this.noLockT || 0) - dt; this.plateJumpT = (this.plateJumpT || 0) - dt;
    // 視点
    cam.yaw -= I.look.x + I.lookRate.x * 2.9 * dt;
    cam.pitch = clamp(cam.pitch - I.look.y - I.lookRate.y * 2.1 * dt, -1.05, 0.9);
    if (this.dead) { this.animate(dt); return; }

    if (I.pressed.neutral) this.toggleNeutral();
    this.computeAim();
    if (I.pressed.flip) this.flip();
    if (I.pressed.next) this.nextWeapon();
    if (I.pressed.craft) this.craft();

    this.updateMagnet(dt);

    // 磁石の床：同じ極なら反発して浮く、反対の極なら吸いつく
    this.hover = false; let onSame = false, onOpp = false;
    if (!this.neutral) {
      for (const p of G.plates) {
        if (this.pos.x < p.min.x - .3 || this.pos.x > p.max.x + .3 || this.pos.z < p.min.z - .3 || this.pos.z > p.max.z + .3) continue;
        const h = this.pos.y - p.top;
        if (h < -0.2 || h > 4.6) continue;
        if (p.pole === this.pole) {
          const f = 1 - Math.max(0, h) / 4.6;
          this.vel.y += 44 * f * dt;
          // ふわっと止まるようにブレーキ（床からジャンプした直後はかけない）
          if (!(this.plateJumpT > 0)) this.vel.y *= Math.exp((this.vel.y < 0 ? -3 : -2.2) * dt);
          if (h < 4) this.hover = true;
          onSame = true;
        } else if (h < 1.6) { this.vel.y -= 16 * dt; onOpp = true; }
      }
    }

    // 移動
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let wx = rx * I.move.x + fx * I.move.y, wz = rz * I.move.x + fz * I.move.y;
    const wl = Math.hypot(wx, wz);
    const loadF = this.overloaded ? 0.3 : 1 - 0.3 * (this.load / this.maxLoad);
    const dash = I.held.dash && wl > 0.2 && !this.overloaded;
    const speed = 6.2 * this.speedMul * (dash ? 1.55 : 1) * loadF * (onOpp ? .6 : 1);
    if (this.attached) {
      this.vel.set(0, 0, 0);
      const a = this.attached;
      this.pos.copy(a.a.center).add(a.off); this.pos.y -= 1.2;
      this.mp = Math.min(this.maxMp, this.mp + 14 * dt);
      if (I.pressed.jump) { // その場から飛び降りる
        tmp.copy(this.chest).sub(a.a.center); tmp.y = 0; tmp.normalize();
        this.vel.copy(tmp).multiplyScalar(4); this.vel.y = 6; this.attached = null;
      }
    } else {
      const grounded = this.onGround || this.hover;
      const acc = this.pullT > 0 || this.repelT > 0 ? 5 : grounded ? 70 : 16;
      const tx = wx * speed, tz = wz * speed;
      const k = Math.min(1, acc * dt / Math.max(1, Math.hypot(tx - this.vel.x, tz - this.vel.z)));
      if (grounded || wl > 0.05 || this.pullT <= 0) {
        this.vel.x += (tx - this.vel.x) * (this.pullT > 0 || this.repelT > 0 ? Math.min(k, .06) : k);
        this.vel.z += (tz - this.vel.z) * (this.pullT > 0 || this.repelT > 0 ? Math.min(k, .06) : k);
      }
      if (this.onGround) this.coyote = 0.12;
      if (I.pressed.jump && (this.coyote > 0 || this.hover)) {
        this.vel.y = onSame ? 13.5 : (this.overloaded ? 5 : 8.2);
        this.coyote = 0; this.onGround = false;
        if (onSame) { FX.ring(this.pos, POLE[this.pole], 2.4, .4); this.emit("plateJump"); this.plateJumpT = 0.7; }
      }
      this.vel.y -= GRAV * dt;
      if (this.vel.y < -32) this.vel.y = -32;
      moveBody(this, dt);
    }

    // 向き：構えているときはカメラの向き、それ以外は進む方向
    if (this.beamOn || this.atkT >= 0) this.yaw = turnTo(this.yaw, cam.yaw, 18, dt);
    else if (wl > 0.1) this.yaw = turnTo(this.yaw, Math.atan2(-wx, -wz), 12, dt);

    // 攻撃
    if (I.held.attack && this.atkCd <= 0) {
      const w = this.weapon ? WEAPONS.find((x) => x.id === this.weapon) : FIST;
      this.atkW = w; this.atkCd = w.cd; this.atkT = 0; this.atkHit = false;
      this.yaw = cam.yaw;
    }
    if (this.atkT >= 0) {
      this.atkT += dt;
      if (!this.atkHit && this.atkT >= 0.07) { this.atkHit = true; this.doHit(this.atkW); }
      if (this.atkT >= this.atkW.cd) this.atkT = -1;
    }

    // MP は少しずつ回復する
    if (this.mpDelay <= 0) this.mp = Math.min(this.maxMp, this.mp + 4 * dt);

    // 落ちた
    if (this.pos.y < (G.level ? G.level.killY : -14)) this.emit("fell");
    this.animate(dt);
  }

  updateMagnet(dt) {
    const I = input, A = this.aim;
    const on = I.held.magnet && !this.neutral;
    this.beamOn = on;
    A.inRange = false;
    if (!on) { if (this.attached) this.attached = null; this.lock = null; FX.setBeam(null); this.beamState = null; return; }
    let range = this.range(), str = 1;
    const useMp = I.held.mp && this.mp > 0.5;
    if (useMp) { range *= 1.7; str = 1.4; this.mp = Math.max(0, this.mp - 22 * dt); this.mpDelay = 1; }
    this.curRange = range;
    const hand = this.model.L.hand.getWorldPosition(tmp3);
    if (this.attached) {
      FX.setBeam(hand, this.attached.a.center, this.pole, true, 1, false);
      this.beamState = "attached"; A.inRange = true;
      return;
    }
    // 磁力を当てた相手には、ボタンを離すまで固定（ロックオン）される
    let lk = this.lock;
    if (lk) {
      const tt = lk.t;
      const gone = tt.dead || tt.state === "stuck" || tt.state === "proj" || tt.state === "eproj" || (tt.kind === "enemy" && tt.dead);
      if (gone) lk = this.lock = null;
      else {
        if (tt.kind === "anchor" || tt.kind === "enemy") lk.point.copy(tt.center);
        else if (tt.mesh && tt.kind !== "plate") scrapCenter(tt, lk.point);
        lk.dist = lk.point.distanceTo(this.chest);
        if (lk.dist > range * 1.25) lk = this.lock = null;
      }
    }
    if (!lk && A.target && A.dist <= range && !(this.noLockT > 0)) {
      const tt = A.target;
      lk = this.lock = { t: tt, point: (tt.kind === "anchor" || tt.kind === "enemy") ? tt.center.clone() : A.point.clone(), dist: A.dist };
      if (tt.kind === "anchor" || tt.kind === "enemy") lk.dist = lk.point.distanceTo(this.chest);
    }
    if (!lk) {
      const miss = tmp2.copy(G.camera.position).addScaledVector(camFwd, Math.min(A.t, range + G.camera.position.distanceTo(this.chest)));
      FX.setBeam(hand, miss, this.pole, true, 0, true);
      this.beamState = A.target ? "far" : "none";
      return;
    }
    const t = lk.t;
    A.inRange = true;
    const attract = t.pole !== this.pole;
    const f = str * Math.max(0.3, 1 - 0.55 * (lk.dist / range));
    const chest = this.chest;
    let to = lk.point;
    if (t.big) {
      if (attract) {
        // 自分より大きいもの：自分が引っぱられる
        tmp.copy(lk.point).sub(chest); const d = tmp.length(); tmp.divideScalar(d || 1);
        if (t.kind === "anchor" && d < t.size / 2 + 1.25) {
          this.attached = { a: t, off: chest.clone().sub(t.center) };
          this.vel.set(0, 0, 0);
          FX.burst(lk.point, POLE[t.pole], 12, 3);
          this.emit("attach");
        } else if (t.kind !== "anchor" && d < t.r + 1.1) {
          this.vel.multiplyScalar(Math.exp(-6 * dt));
        } else {
          this.vel.addScaledVector(tmp, 48 * f * dt);
          this.vel.y += GRAV * 0.92 * dt;
          const sp = this.vel.length(); if (sp > 19) this.vel.multiplyScalar(19 / sp);
          this.pullT = 0.25;
        }
        this.beamState = "pulledTo";
      } else {
        // 同じ極の大きいもの：反発して自分が飛ばされる（はじめに強く、そのあとはゆるやかに浮く）
        tmp.copy(chest).sub(lk.point).normalize();
        if (this.beamState !== "repel") { this.vel.addScaledVector(tmp, 12 * f); FX.ring(lk.point, POLE[this.pole], 1.8, .3); }
        this.vel.addScaledVector(tmp, 15 * f * dt);
        if (tmp.y > 0.3) this.vel.y += GRAV * 0.45 * tmp.y * dt;
        const sp = this.vel.length(); if (sp > 17) this.vel.multiplyScalar(17 / sp);
        this.repelT = 0.2;
        this.beamState = "repel";
      }
    } else {
      // 自分より小さいもの：相手を引き寄せる／はじく
      t.mag = { attract, s: f };
      this.beamState = attract ? "pull" : "push";
    }
    FX.setBeam(hand, to, this.pole, attract, f, false);
  }

  doHit(w) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let hits = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dl = Math.hypot(dx, dz);
      if (dl - e.r > w.reach) continue;
      if (e.pos.y + e.h < this.pos.y - 0.6 || e.pos.y > this.pos.y + 2.2) continue;
      if (dl > 0.6) { const c = (dx * fx + dz * fz) / dl; if (Math.acos(clamp(c, -1, 1)) > w.arc / 2 + Math.atan2(e.r, dl)) continue; }
      // 引き寄せた勢い、または自分が引っぱられた勢いに合わせて当てると強攻撃
      const strong = e.pullT > 0 || (this.pullT > 0 && this.vel.length() > 6 && e.big);
      e.hurt(w.dmg * (strong ? 2.5 : 1), strong, tmp.set(fx, 0, fz), w.id);
      hits++;
    }
    if (hits) { G.hitstop = 0.05; G.shake = Math.max(G.shake, .12); }
    const b = G.button;
    if (b && !b.pressed && this.chest.distanceTo(b.center) < 3.2) this.emit("buttonPunch");
    this.emit("swing", { w, hits });
  }

  /* ---------- 見た目の動き ---------- */
  animate(dt) {
    const M = this.model;
    M.root.position.copy(this.pos);
    M.root.rotation.y = this.yaw;
    if (this.dead) {
      M.body.rotation.x = damp(M.body.rotation.x, Math.PI / 2, 6, dt);
      M.body.position.y = damp(M.body.position.y, 0.2, 6, dt);
      return;
    }
    M.body.position.y = 0;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const grounded = this.onGround || this.hover;
    if (grounded) this.walk += sp * dt * 1.7;
    const amt = Math.min(1, sp / 6.2);
    const s = Math.sin(this.walk);
    if (grounded && !this.attached) {
      M.LL.hip.rotation.x = s * 0.8 * amt; M.RL.hip.rotation.x = -s * 0.8 * amt;
      M.LL.kn.rotation.x = -Math.max(0, -s) * 1.1 * amt; M.RL.kn.rotation.x = -Math.max(0, s) * 1.1 * amt;
    } else {
      M.LL.hip.rotation.x = damp(M.LL.hip.rotation.x, .5, 10, dt); M.RL.hip.rotation.x = damp(M.RL.hip.rotation.x, -.2, 10, dt);
      M.LL.kn.rotation.x = damp(M.LL.kn.rotation.x, -.9, 10, dt); M.RL.kn.rotation.x = damp(M.RL.kn.rotation.x, -.4, 10, dt);
    }
    // 左腕：磁力を出しているときはねらう方向へまっすぐ
    if (this.beamOn) {
      M.L.sh.rotation.x = damp(M.L.sh.rotation.x, Math.PI / 2 + cam.pitch, 20, dt);
      M.L.sh.rotation.z = damp(M.L.sh.rotation.z, -0.15, 20, dt);
      M.L.el.rotation.x = 0;
    } else {
      M.L.sh.rotation.x = damp(M.L.sh.rotation.x, -s * 0.6 * amt, 10, dt);
      M.L.sh.rotation.z = damp(M.L.sh.rotation.z, 0.08, 10, dt);
      M.L.el.rotation.x = 0.3;
    }
    // 右腕：攻撃
    const R = M.R;
    if (this.atkT >= 0) {
      const k = clamp(this.atkT / this.atkW.cd, 0, 1);
      if (this.atkW.id === "sword") {
        const e = k < .25 ? k / .25 : 1 - (k - .25) / .75 * .3;
        R.sh.rotation.x = 2.7 - e * 2.3; R.sh.rotation.z = -0.5 + e * 0.9; R.el.rotation.x = 0.2;
        R.sh.position.z = 0;
      } else if (this.atkW.id === "spear") {
        const e = Math.sin(Math.min(1, k / .6) * Math.PI);
        R.sh.rotation.x = Math.PI / 2 + cam.pitch * .5; R.sh.rotation.z = 0; R.el.rotation.x = 0;
        R.sh.position.z = 0.15 - e * 0.55;
      } else {
        const e = Math.sin(Math.min(1, k / .7) * Math.PI);
        R.sh.rotation.x = e * Math.PI / 2; R.sh.rotation.z = 0; R.el.rotation.x = (1 - e) * 1.2; R.sh.position.z = -e * .2;
      }
    } else {
      R.sh.position.z = damp(R.sh.position.z, 0, 12, dt);
      const hold = this.weapon === "spear" ? 0.9 : this.weapon === "sword" ? 0.5 : 0;
      R.sh.rotation.x = damp(R.sh.rotation.x, s * 0.6 * amt + hold, 10, dt);
      R.sh.rotation.z = damp(R.sh.rotation.z, -0.08, 10, dt);
      R.el.rotation.x = damp(R.el.rotation.x, this.weapon ? -0.3 : 0.3, 10, dt);
    }
    // 体のかたむき（引っぱられているときは前のめり）
    const lean = this.pullT > 0 ? 0.45 : -0.08 * amt * -1;
    M.body.rotation.x = damp(M.body.rotation.x, -lean * 0.5, 8, dt);
    M.coil.rotation.z += dt * (this.beamOn ? 12 : 2);
    // ダメージ直後は点滅
    M.root.visible = this.invuln > 0 && this.invuln < 0.7 ? Math.floor(this.invuln * 14) % 2 === 0 : true;
    M.ring.material.opacity = this.neutral ? .15 : .45 + Math.sin(G.time * 5) * .1;
  }
}

/* ---------- カメラ（肩ごしの三人称視点。壁にめり込まないよう手前に寄る） ---------- */
export function updateCamera(dt) {
  const P = G.player, C = G.camera;
  cam.ty = damp(cam.ty, P.pos.y + 1.75, 16, dt);
  const target = tmp.set(P.pos.x, cam.ty, P.pos.z);
  const cp = Math.cos(cam.pitch);
  const f = tmp2.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
  camRight.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  // 見上げるときは床にもぐらないよう少し近づく
  const dist = cam.dist * (cam.pitch > 0 ? 1 - 0.4 * cam.pitch : 1);
  const desired = tmp3.copy(target).addScaledVector(f, -dist).addScaledVector(camRight, 0.95);
  desired.y += 0.15;
  const dir = desired.sub(target); const len = dir.length(); dir.divideScalar(len);
  const hit = raycastWorld(target, dir, len + 0.35).t;
  const want = Math.max(0.35, Math.min(len, hit - 0.35));
  // 壁に当たったらすぐ寄る。離れるときはゆっくり戻る（カメラがガタガタしない）
  cam.curD = want < cam.curD ? want : damp(cam.curD, want, 5, dt);
  C.position.copy(target).addScaledVector(dir, cam.curD);
  if (G.shake > 0) {
    C.position.x += rand(-1, 1) * G.shake * .3; C.position.y += rand(-1, 1) * G.shake * .3;
    G.shake = Math.max(0, G.shake - dt * 1.8);
  }
  C.lookAt(tmp.copy(C.position).add(f));
}
