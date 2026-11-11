// 敵：Lv1（弱い）、Lv2（速いが弱い）、Lv3（硬くて強いが遅い）、ステージボス（すべて高い）、練習用の人形
import { THREE, G, POLE, V, GRAV, clamp, damp, rand, pick, other, angleDiff, turnTo, moveBody } from "./core.js";
import { makeEnemyModel, setEnemyPole } from "./models.js";
import { addScrap, addCore } from "./world.js";
import { FX } from "./fx.js";

export const TYPES = {
  dummy: { name: "練習用人形", hp: 60, dmg: 0, speed: 0, def: 1, r: .45, h: 1.45, big: false, atkRange: 0, windup: 1, recover: 1, atkCd: 9, aggro: 0, drop: 0, core: 0 },
  lv1: { name: "Lv1 スクラップ兵", hp: 45, dmg: 9, speed: 2.6, def: 1, r: .45, h: 1.45, big: false, atkRange: 1.7, windup: .65, recover: .6, atkCd: 1.3, aggro: 15, drop: 7, core: 12 },
  lv2: { name: "Lv2 スクラップハウンド", hp: 30, dmg: 7, speed: 7, def: 1, r: .5, h: .95, big: false, atkRange: 1.6, windup: .32, recover: .35, atkCd: 1.0, aggro: 18, drop: 6, core: 10 },
  lv3: { name: "Lv3 重装ゴーレム", hp: 180, dmg: 22, speed: 1.35, def: .55, r: .95, h: 2.65, big: true, atkRange: 2.9, windup: 1.05, recover: 1.0, atkCd: 1.7, aggro: 14, drop: 15, core: 25 },
  boss: { name: "鉄くずの王", hp: 800, dmg: 24, speed: 2.7, def: .75, r: 1.45, h: 4.6, big: true, atkRange: 4.5, windup: 1, recover: 1.1, atkCd: 2, aggro: 99, drop: 30, core: 100 }
};
const tmp = new THREE.Vector3();

export class Enemy {
  constructor(type, pos, opts = {}) {
    const c = TYPES[type];
    this.type = type; this.kind = "enemy"; this.cfg = c;
    this.pos = pos.clone(); this.vel = V(); this.r = c.r; this.h = c.h;
    this.hp = c.hp; this.maxHp = c.hp; this.big = c.big;
    this.pole = opts.pole || pick(["N", "S"]);
    this.yaw = opts.yaw || 0; this.state = type === "boss" ? "idle" : "chase"; this.t = 0; this.cd = rand(.6, 1.6);
    this.aggro = false; this.stun = 0; this.pullT = 0; this.flash = 0; this.dead = false; this.deathT = 0;
    this.home = pos.clone(); this.homeYaw = this.yaw; this.center = V(); this.walk = rand(0, 6); this.retreat = 0;
    this.M = makeEnemyModel(type, this.pole);
    this.M.shadow.scale.setScalar(this.r * 1.5);
    G.scene.add(this.M.root);
    G.enemies.push(this);
    if (type === "boss") { this.poleT = 12; this.summoned = 0; this.active = false; G.boss = this; }
    this.updateCenter();
  }
  updateCenter() { this.center.set(this.pos.x, this.pos.y + this.h * .5, this.pos.z); }

  hurt(dmg, strong, dir, src) {
    if (this.dead) return;
    const mul = this.state === "stunned" ? 1.4 : 1;
    const d = Math.max(1, Math.round(dmg * this.cfg.def * mul));
    this.hp -= d; this.flash = .12; this.aggro = true;
    if (this.type === "boss" && !this.active) this.active = true;
    this.updateCenter();
    FX.text(this.center, strong ? "強攻撃！ " + d : String(d), strong ? "strong" : "dmg");
    FX.burst(this.center, strong ? 0xffe070 : 0xffa860, strong ? 22 : 8, strong ? 6 : 3);
    if (dir) {
      const k = this.big ? (strong ? 2 : .6) : (strong ? 10 : 4);
      this.vel.x += dir.x * k; this.vel.z += dir.z * k;
      if (!this.big) this.vel.y = Math.max(this.vel.y, strong ? 4 : 2.5);
    }
    if (!this.big) {
      this.stun = Math.max(this.stun, strong ? .7 : .25);
      if (this.state === "windup") { this.state = "chase"; this.cd = .5; }
    }
    if (strong) G.shake = Math.max(G.shake, .3);
    if (G.onEnemyHurt) G.onEnemyHurt(this, d, strong, src);
    if (this.hp <= 0) this.die(false);
  }

  die(fell) {
    this.dead = true; this.deathT = 0; this.hp = 0;
    this.updateCenter();
    FX.burst(this.center, 0xff9a50, 40, 7);
    FX.burst(this.center, POLE[this.pole], 20, 4);
    G.shake = Math.max(G.shake, this.big ? .5 : .2);
    if (!fell && this.type !== "dummy") {
      for (let i = 0; i < this.cfg.drop; i++) {
        const s = addScrap(tmp.copy(this.center), pick(["N", "S"]), "free");
        s.vel.set(rand(-4, 4), rand(3, 7), rand(-4, 4)); s.noStick = .5;
      }
      addCore(this.center, this.pole, this.cfg.core, this.type === "boss");
    }
    if (G.onEnemyDead) G.onEnemyDead(this, fell);
  }

  respawn() { // 練習用人形
    this.dead = false; this.hp = this.maxHp; this.pos.copy(this.home); this.vel.set(0, 0, 0); this.yaw = this.homeYaw;
    this.M.root.visible = true; this.M.root.scale.set(1, 1, 1); this.M.root.rotation.set(0, this.yaw, 0);
    if (!this.M.root.parent) G.scene.add(this.M.root);
    FX.burst(tmp.copy(this.pos).setY(this.pos.y + 1), 0x9be8ff, 16, 3);
  }
  resetBoss() {
    this.dead = false; this.hp = this.maxHp; this.pos.copy(this.home); this.vel.set(0, 0, 0); this.yaw = this.homeYaw;
    this.state = "idle"; this.active = false; this.aggro = false; this.summoned = 0; this.poleT = 12; this.stun = 0;
    this.M.root.visible = true; this.M.root.scale.set(1, 1, 1); if (!this.M.root.parent) G.scene.add(this.M.root);
  }
  setPole(p) { this.pole = p; setEnemyPole(this.M, p); }

  update(dt) {
    const M = this.M;
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / .5);
      M.root.scale.set(1 + k * .3, 1 - k * .95, 1 + k * .3);
      if (k >= 1 && M.root.parent) G.scene.remove(M.root);
      if (this.type === "dummy" && this.deathT > 2.5) this.respawn();
      return;
    }
    const P = G.player;
    this.flash -= dt; this.pullT -= dt;
    // 主人公の磁力を受けている（小さい敵だけ動かされる）
    if (this.mag) {
      const m = this.mag; this.mag = null;
      tmp.set(P.pos.x - this.pos.x, (P.pos.y + 1) - (this.pos.y + this.h / 2), P.pos.z - this.pos.z);
      const d = tmp.length() || 1; tmp.divideScalar(d);
      if (m.attract) {
        const near = d < this.r + 1.5;
        const sp = near ? 0 : 13 * m.s;
        this.vel.x = damp(this.vel.x, tmp.x * sp, near ? 14 : 8, dt);
        this.vel.z = damp(this.vel.z, tmp.z * sp, near ? 14 : 8, dt);
        this.vel.y = damp(this.vel.y, tmp.y * sp + (near ? 0 : 1.5), 6, dt);
        this.pullT = .3; this.stun = Math.max(this.stun, .3);
        if (this.state === "windup") { this.state = "chase"; this.cd = .5; }
      } else {
        this.vel.addScaledVector(tmp, -34 * m.s * dt);
        if (this.onGround) this.vel.y = Math.max(this.vel.y, 2.5);
        const sp = this.vel.length(); if (sp > 13) this.vel.multiplyScalar(13 / sp);
        this.stun = Math.max(this.stun, .45);
        if (this.state === "windup") { this.state = "chase"; this.cd = .6; }
      }
    }
    if (this.pullT > 0) this.vel.y += GRAV * .85 * dt;
    this.vel.y -= GRAV * dt;
    moveBody(this, dt);
    if (this.pos.y < (G.level ? G.level.killY : -14)) { this.die(true); return; }
    if (this.onGround && this.stun > 0) { const f = Math.exp(-5 * dt); this.vel.x *= f; this.vel.z *= f; }

    if (this.stun > 0) this.stun -= dt;
    else if (this.type === "boss") this.bossAI(dt, P);
    else if (this.type !== "dummy") this.meleeAI(dt, P);
    else { const f = Math.exp(-8 * dt); this.vel.x *= f; this.vel.z *= f; }

    // 主人公とめり込まない
    if (!P.dead) {
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dl = Math.hypot(dx, dz), min = this.r + P.r;
      if (dl < min && dl > 0.001 && P.pos.y < this.pos.y + this.h && P.pos.y + P.h > this.pos.y && !P.attached) {
        const push = (min - dl);
        P.pos.x += dx / dl * push * .8; P.pos.z += dz / dl * push * .8;
        this.pos.x -= dx / dl * push * .2; this.pos.z -= dz / dl * push * .2;
      }
    }
    this.updateCenter();
    this.animate(dt);
  }

  moveToward(tx, tz, speed, dt, k = 8) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x = damp(this.vel.x, dx / d * speed, k, dt);
    this.vel.z = damp(this.vel.z, dz / d * speed, k, dt);
  }
  stop(dt, k = 10) { this.vel.x = damp(this.vel.x, 0, k, dt); this.vel.z = damp(this.vel.z, 0, k, dt); }

  meleeAI(dt, P) {
    const c = this.cfg;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const dy = Math.abs(P.pos.y - this.pos.y);
    if (!this.aggro) {
      if (!P.dead && d < c.aggro && dy < 5) { this.aggro = true; if (G.onEnemyAggro) G.onEnemyAggro(this); }
      else { this.stop(dt); return; }
    }
    if (P.dead) { this.stop(dt); return; }
    const face = Math.atan2(-dx, -dz);
    this.cd -= dt;
    if (this.state === "chase") {
      this.yaw = turnTo(this.yaw, face, this.type === "lv2" ? 9 : 5, dt);
      if (this.retreat > 0) {
        this.retreat -= dt;
        this.moveToward(this.pos.x - dx, this.pos.z - dz, c.speed * .7, dt);
      } else if (d > c.atkRange * .8) this.moveToward(P.pos.x, P.pos.z, c.speed, dt);
      else this.stop(dt);
      if (d <= c.atkRange && this.cd <= 0 && Math.abs(angleDiff(this.yaw, face)) < .5 && dy < 2.2) { this.state = "windup"; this.t = c.windup; }
    } else if (this.state === "windup") {
      this.stop(dt, 14);
      this.yaw = turnTo(this.yaw, face, 2, dt);
      this.t -= dt;
      if (this.t <= 0) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        if (this.type === "lv2") { this.vel.x += fx * 9; this.vel.z += fz * 9; }
        if (this.type === "lv3") {
          FX.ring(this.pos, 0xff7040, c.atkRange + .4, .4); G.shake = Math.max(G.shake, .3);
          if (d <= c.atkRange + .4 && dy < 1.8) P.hurt(c.dmg, this.pos);
        } else {
          const ang = Math.abs(angleDiff(this.yaw, face));
          if (d <= c.atkRange + .5 && ang < 1.1 && dy < 1.8) P.hurt(c.dmg, this.pos);
        }
        this.state = "recover"; this.t = c.recover;
      }
    } else if (this.state === "recover") {
      this.stop(dt, 4);
      this.t -= dt;
      if (this.t <= 0) { this.state = "chase"; this.cd = c.atkCd * rand(.8, 1.25); if (this.type === "lv2") this.retreat = .7; }
    }
  }

  bossAI(dt, P) {
    const c = this.cfg;
    if (!this.active) { this.stop(dt); return; }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const face = Math.atan2(-dx, -dz);
    const ph2 = this.hp < this.maxHp * .5;
    const sm = ph2 ? 1.3 : 1;
    // 核の極がときどき入れかわる
    this.poleT -= dt;
    if (this.poleT <= 0) {
      this.poleT = ph2 ? 9 : 12;
      this.setPole(other(this.pole));
      FX.ring(this.pos, POLE[this.pole], 6, .6);
      if (G.onBossEvent) G.onBossEvent("pole", this.pole);
    }
    // 体力が減ると仲間を呼ぶ
    const want = this.hp < this.maxHp * .25 ? 2 : ph2 ? 1 : 0;
    if (this.summoned < want) {
      this.summoned++;
      for (const s of [-1, 1]) {
        const e = new Enemy("lv1", V(this.pos.x + s * 4, this.pos.y + .5, this.pos.z + 2));
        e.aggro = true; e.cd = 1.5;
        FX.burst(e.pos.clone().setY(e.pos.y + 1), 0xff8040, 20, 4);
      }
      if (G.onBossEvent) G.onBossEvent("summon");
    }
    if (P.dead) { this.stop(dt); return; }
    switch (this.state) {
      case "idle": this.state = "chase"; this.cd = 1.5; break;
      case "chase":
        this.yaw = turnTo(this.yaw, face, 2.6 * sm, dt);
        if (d > 3.4) this.moveToward(P.pos.x, P.pos.z, c.speed * sm, dt, 4); else this.stop(dt);
        this.cd -= dt;
        if (this.cd <= 0) {
          if (d < 5.8) { this.state = "slamWU"; this.t = 1.0 / sm; }
          else if (d < 20 && Math.random() < .55) { this.state = "chargeWU"; this.t = .85 / sm; }
          else { this.state = "volleyWU"; this.t = .9 / sm; }
        }
        break;
      case "slamWU":
        this.stop(dt, 14); this.yaw = turnTo(this.yaw, face, 1.5, dt); this.t -= dt;
        if (this.t <= 0) {
          FX.ring(this.pos, 0xff6030, 5.6, .5); FX.burst(this.pos.clone().setY(this.pos.y + .3), 0xffa050, 30, 6);
          G.shake = Math.max(G.shake, .6);
          if (d < 5.6 && P.pos.y < this.pos.y + 2.4) P.hurt(26, this.pos);
          this.state = "recover"; this.t = 1.2;
        }
        break;
      case "chargeWU":
        this.stop(dt, 14); this.yaw = turnTo(this.yaw, face, 4, dt); this.t -= dt;
        if (this.t <= 0) { this.state = "charge"; this.t = 1.1; this.hitDone = false; this.cdir = V(dx / (d || 1), 0, dz / (d || 1)); this.yaw = face; }
        break;
      case "charge":
        this.vel.x = this.cdir.x * 15 * sm; this.vel.z = this.cdir.z * 15 * sm;
        this.t -= dt;
        if (!this.hitDone && d < this.r + .9 && Math.abs(P.pos.y - this.pos.y) < 3) { this.hitDone = true; P.hurt(22, this.pos); }
        if (this.hitWall) {
          // 壁に激突：しばらく動けなくなる（ダメージが入りやすい）
          this.state = "stunned"; this.t = 2.2; this.vel.set(0, this.vel.y, 0);
          FX.burst(this.center, 0xffe080, 30, 6); G.shake = Math.max(G.shake, .7);
          if (G.onBossEvent) G.onBossEvent("stunned");
        } else if (this.t <= 0) { this.state = "recover"; this.t = .8; }
        break;
      case "volleyWU":
        this.stop(dt, 14); this.yaw = turnTo(this.yaw, face, 3, dt); this.t -= dt;
        if (this.t <= 0) {
          const n = ph2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const p = V(this.pos.x + rand(-1, 1), this.pos.y + this.h * .85, this.pos.z + rand(-1, 1));
            const tgt = V(P.pos.x + rand(-1.6, 1.6), P.pos.y + 1, P.pos.z + rand(-1.6, 1.6));
            const T = clamp(p.distanceTo(tgt) / 16, .55, 1.5);
            const s = addScrap(p, pick(["N", "S"]), "eproj");
            s.vel.copy(tgt).sub(p).divideScalar(T); s.vel.y += .5 * 12 * T; s.dmg = 8; s.life = 0;
          }
          this.state = "recover"; this.t = .9;
        }
        break;
      case "stunned":
        this.stop(dt, 6); this.t -= dt;
        if (this.t <= 0) { this.state = "recover"; this.t = .3; }
        break;
      case "recover":
        this.stop(dt, 6); this.t -= dt;
        if (this.t <= 0) { this.state = "chase"; this.cd = rand(.9, 1.9) / sm; }
        break;
    }
  }

  animate(dt) {
    const M = this.M;
    M.root.position.copy(this.pos);
    M.root.rotation.y = this.yaw;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walk += sp * dt * (this.type === "lv2" ? 2.4 : this.big ? 1.2 : 2);
    const amt = Math.min(1, sp / Math.max(1, this.cfg.speed));
    const s = Math.sin(this.walk);
    M.legs.forEach((l, i) => { l.rotation.x = s * (i % 2 ? -1 : 1) * (this.type === "lv2" && i >= 2 ? -1 : 1) * .7 * amt; });
    const st = this.state;
    let armX = -s * .5 * amt, armZ = 0;
    if (st === "windup" || st === "slamWU" || st === "volleyWU") {
      const k = this.type === "boss" ? 1 : 1 - this.t / this.cfg.windup;
      armX = (this.type === "lv1" ? 1.9 : 2.8) * Math.min(1, k * 1.5 + .3);
    } else if (st === "chargeWU") { armX = -.8; }
    else if (st === "charge") { armX = 1.4; }
    else if (st === "recover") { armX = .7; }
    else if (st === "stunned") { armX = -.2; armZ = .5; }
    M.arms.forEach((a, i) => { a.rotation.x = damp(a.rotation.x, armX, 14, dt); a.rotation.z = damp(a.rotation.z, (i ? -1 : 1) * armZ, 10, dt); });
    if (M.torso) {
      M.torso.rotation.x = damp(M.torso.rotation.x, st === "stunned" ? .4 : st === "charge" ? .3 : 0, 8, dt);
      M.torso.position.y = (this.type === "lv2" ? .62 : M.torso.position.y) + 0;
    }
    if (M.head && this.type === "lv2") M.head.rotation.x = Math.sin(G.time * 10) * .05 * amt;
    // 色：攻撃をくらった白い光、攻撃の前ぶれの赤い光
    const warn = st === "windup" || st.endsWith("WU");
    const e = this.flash > 0 ? 0xffffff : warn ? (Math.sin(G.time * 30) > 0 ? 0x661008 : 0x300400) : 0x000000;
    for (const m of M.mats) m.emissive.setHex(e);
    M.core.rotation.y += dt * 3;
    if (this.pullT > 0) M.body.rotation.z = Math.sin(G.time * 40) * .05; else M.body.rotation.z = 0;
  }
}

export function updateEnemies(dt) {
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) list[i].update(dt);
  // 敵どうしが重ならない
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.dead) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.r + b.r;
      if (d < m && d > .001 && Math.abs(a.pos.y - b.pos.y) < 2) {
        const p = (m - d) / 2, wa = a.big && !b.big ? .8 : b.big && !a.big ? .2 : .5;
        a.pos.x -= dx / d * p * 2 * (1 - wa); a.pos.z -= dz / d * p * 2 * (1 - wa);
        b.pos.x += dx / d * p * 2 * wa; b.pos.z += dz / d * p * 2 * wa;
      }
    }
  }
  // 倒れて片付いた敵を一覧から外す（練習用人形とボスは残す）
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead && e.deathT > 1 && e.type !== "dummy" && e.type !== "boss") list.splice(i, 1);
  }
}
