// 演出：火花、衝撃の輪、磁力ビーム、ダメージの数字
import { THREE, G, TEX, POLE, rand, glowSprite } from "./core.js";

const N = 500;
let points, pos, col, life, vel, gravity;
const rings = [];
let beam = null, beamGlow = null, beamCore = null, hitGlow = null, handGlow = null;
const labels = [];
let labelBox = null;
const tmp = new THREE.Vector3();

export const FX = {
  init() {
    const geo = new THREE.BufferGeometry();
    pos = new Float32Array(N * 3); col = new Float32Array(N * 3);
    life = new Float32Array(N); vel = new Float32Array(N * 3); gravity = new Float32Array(N);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -9999;
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: TEX.glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    points.frustumCulled = false;
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2; r.visible = false; r.userData = { t: 0, dur: 1, max: 1 };
      rings.push(r);
    }
    const bgeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); bgeo.translate(0, 0.5, 0);
    const bm = (op, w) => new THREE.MeshBasicMaterial({ map: TEX.beam, color: 0xffffff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    beam = new THREE.Group();
    beamCore = new THREE.Mesh(bgeo, bm(1)); beamCore.scale.set(.035, 1, .035);
    beamGlow = new THREE.Mesh(bgeo, bm(.35)); beamGlow.scale.set(.13, 1, .13);
    beamCore.material.map = TEX.beam.clone(); beamCore.material.map.repeat.set(1, 4);
    beam.add(beamCore, beamGlow); beam.visible = false;
    hitGlow = glowSprite(0xffffff, 1.6, .9); hitGlow.visible = false;
    handGlow = glowSprite(0xffffff, .7, .9); handGlow.visible = false;
    labelBox = document.getElementById("labels");
  },
  attach(scene) {
    for (const o of [points, beam, hitGlow, handGlow, ...rings]) o.userData.keep = true;
    scene.add(points, beam, hitGlow, handGlow); rings.forEach((r) => scene.add(r));
  },
  burst(p, color, n = 14, speed = 4, grav = 9, upBias = 1.5) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      let i = -1;
      for (let j = 0; j < N; j++) { const q = (FX._next = ((FX._next || 0) + 1) % N); if (life[q] <= 0) { i = q; break; } }
      if (i < 0) return;
      life[i] = rand(.35, .8);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const a = rand(0, Math.PI * 2), e = rand(-0.4, 1);
      vel[i * 3] = Math.cos(a) * speed * rand(.3, 1); vel[i * 3 + 1] = (e * speed + upBias) * rand(.4, 1); vel[i * 3 + 2] = Math.sin(a) * speed * rand(.3, 1);
      gravity[i] = grav;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  },
  ring(p, color, radius, dur = .45) {
    const r = rings.find((x) => !x.visible) || rings[0];
    r.visible = true; r.position.copy(p); r.position.y += .08;
    r.material.color.setHex(color); r.userData = { t: 0, dur, max: radius };
  },
  // 磁力ビーム：from（手）→ to（当たったところ）。attract なら手前に流れる
  setBeam(from, to, pole, attract, strength, miss) {
    if (!from) { beam.visible = false; hitGlow.visible = false; handGlow.visible = false; return; }
    const color = POLE[pole];
    tmp.copy(to).sub(from); const len = tmp.length();
    beam.visible = true; beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.normalize());
    beam.scale.set(1, len, 1);
    beamCore.material.color.setHex(color); beamGlow.material.color.setHex(color);
    beamCore.material.map.repeat.set(1, Math.max(1, len / 1.2));
    beamCore.material.map.offset.y += (attract ? 1 : -1) * 0.06 * (1 + strength);
    const fl = miss ? .25 + Math.random() * .2 : .8 + Math.random() * .2;
    beamCore.material.opacity = fl; beamGlow.material.opacity = (miss ? .1 : .3) * (0.7 + strength * .5);
    const w = miss ? .6 : 1 + strength * .5;
    beamCore.scale.set(.03 * w, 1, .03 * w); beamGlow.scale.set(.12 * w, 1, .12 * w);
    hitGlow.visible = !miss; hitGlow.position.copy(to); hitGlow.material.color.setHex(color);
    const hs = 1.2 + Math.random() * .5; hitGlow.scale.set(hs, hs, 1);
    handGlow.visible = true; handGlow.position.copy(from); handGlow.material.color.setHex(color);
  },
  text(p, str, cls = "") {
    const el = document.createElement("div");
    el.className = "flt " + cls; el.textContent = str;
    labelBox.appendChild(el);
    labels.push({ el, p: p.clone(), t: 0, dur: 1.1 });
  },
  clear() {
    for (let i = 0; i < N; i++) { life[i] = 0; pos[i * 3 + 1] = -9999; }
    rings.forEach((r) => (r.visible = false));
    labels.splice(0).forEach((l) => l.el.remove());
    this.setBeam(null);
  },
  update(dt, camera) {
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      vel[i * 3 + 1] -= gravity[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = Math.min(1, life[i] * 2.2);
      col[i * 3] *= .985 + .015 * f; col[i * 3 + 1] *= .97 + .03 * f; col[i * 3 + 2] *= .97 + .03 * f;
    }
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
    for (const r of rings) {
      if (!r.visible) continue;
      const u = r.userData; u.t += dt; const k = u.t / u.dur;
      if (k >= 1) { r.visible = false; continue; }
      const s = u.max * (0.2 + k * .8); r.scale.set(s, s, s); r.material.opacity = (1 - k) * .9;
    }
    const w = innerWidth, h = innerHeight;
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i]; l.t += dt;
      if (l.t >= l.dur) { l.el.remove(); labels.splice(i, 1); continue; }
      tmp.copy(l.p); tmp.y += l.t * 1.2; tmp.project(camera);
      if (tmp.z > 1) { l.el.style.opacity = 0; continue; }
      l.el.style.opacity = String(1 - Math.max(0, l.t - .6) / .5);
      l.el.style.transform = "translate(" + ((tmp.x * .5 + .5) * w).toFixed(1) + "px," + ((-tmp.y * .5 + .5) * h).toFixed(1) + "px) translate(-50%,-50%)";
    }
  }
};
