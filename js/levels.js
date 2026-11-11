// ステージの組み立て：ロビー（練習部屋＋ステージ選択の部屋）と STAGE 1「さびた工場」
import { THREE, G, MAT, V, rand, addBox } from "./core.js";
import { addAnchor, addPlate, addScrap, scatterScrap, addTrigger, addLight, addSign, addDoor, addButton } from "./world.js";
import { Enemy } from "./enemies.js";

const H = Math.PI / 2;
function hazard(x0, z0, x1, z1, y) { addBox(x0, y, z0, x1, y + 0.02, z1, MAT.hazard, { solid: false, tile: 1 }); }
function crate(x, z, y, s = 1.6) { addBox(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, MAT.wood, { tile: s }); }
function pillar(x, z, y0, y1, w = 1.2) { addBox(x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, MAT.stone); }
function pipe(x, y, z0, z1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, Math.abs(z1 - z0), 8), MAT.pipe);
  m.rotation.x = H; m.position.set(x, y, (z0 + z1) / 2); G.scene.add(m);
}

function setupScene(bg, fogD, amb = 1) {
  G.scene.background = new THREE.Color(bg);
  G.scene.fog = new THREE.FogExp2(bg, fogD);
  G.scene.add(new THREE.HemisphereLight(0x8fa2c8, 0x2a2018, 1.1 * amb));
  G.scene.add(new THREE.AmbientLight(0x404858, 0.8 * amb));
  const d = new THREE.DirectionalLight(0xb8c4e0, 0.7); d.position.set(4, 10, 6); G.scene.add(d);
}

/* ======================= ロビー ======================= */
export function buildLobby(save) {
  setupScene(0x0b0e14, 0.022);
  const L = { name: "lobby", killY: -14, spawns: { start: { pos: V(0, 0, -4), yaw: 0 }, select: { pos: V(0, 0, -44), yaw: 0 } } };
  // 床・天井
  addBox(-14, -1, -36, 14, 0, 0, MAT.floor);
  addBox(-10, -1, -57, 10, 0, -36, MAT.floor);
  addBox(-15, 10, -37, 15, 11, 1, MAT.stone);
  addBox(-11, 10, -58, 11, 11, -37, MAT.stone);
  // 練習部屋の壁
  addBox(-15, 0, 0, 15, 10, 1, MAT.stone);
  addBox(-15, 0, -37, -14, 10, 0, MAT.stone);
  addBox(14, 0, -37, 15, 10, 0, MAT.stone);
  addBox(-14, 0, -37, -3, 10, -36, MAT.stone);
  addBox(3, 0, -37, 14, 10, -36, MAT.stone);
  addBox(-3, 7, -37, 3, 10, -36, MAT.stone);
  // ステージ選択の部屋の壁
  addBox(-11, 0, -58, -10, 10, -37, MAT.stone);
  addBox(10, 0, -58, 11, 10, -37, MAT.stone);
  addBox(-10, 0, -58, 10, 10, -57, MAT.stone);
  // 柱
  for (const z of [-8, -18, -28]) { pillar(-13.2, z, 0, 10, 1.4); pillar(13.2, z, 0, 10, 1.4); }

  // 大きな扉と、人の力では押せない赤いボタン
  const door = addDoor(-3, 0, -36.85, 3, 7, -36.15, save.doorOpened);
  addBox(-3.6, 0, -36, -3, 7.6, -35.6, MAT.iron); addBox(3, 0, -36, 3.6, 7.6, -35.6, MAT.iron); addBox(-3.6, 7, -36, 3.6, 7.6, -35.6, MAT.iron);
  addButton(6.5, 3.4, -36, () => { save.doorOpened = true; G.persist(); door.setOpen(true); if (G.onStory) G.onStory("doorOpen"); }, save.doorOpened);
  addSign(["このボタンは手では押せない", "鉄くずを飛ばして押そう"], 10, 5.6, -35.95, 0, 4, 1.3);
  addSign(["ステージ選択の部屋"], 0, 8.4, -35.55, 0, 4, .9);

  // 鉄くず：青（S極）は今のあなた（赤＝N極）にくっつく
  scatterScrap(0, -10, 0, 4.5, 40, ["S"]);
  scatterScrap(-8, -6, 0, 3, 20, ["N"]);
  scatterScrap(4, -30, 0, 4, 26, ["S", "N"]);
  addSign(["青い鉄くず（S極）は、赤（N極）の", "あなたに近づくとくっつく"], -13.8, 3.2, -11, H, 4, 1.3);

  // 浮遊の練習：同じ極の床と、高い足場
  addPlate(6, -9, 11.5, -15, 0, "N");
  addBox(8, 0, -19, 14, 4.5, -27, MAT.stone);
  hazard(8, -19, 14, -19.5, 4.5);
  scatterScrap(11, -23, 4.5, 2.4, 16, ["S"]);
  addSign(["同じ極の床の上では浮く", "浮いたままジャンプで高く跳べる"], 13.8, 3, -12, -H, 4, 1.3);

  // 引き寄せの練習：壁ぎわの磁石ブロック
  addAnchor(-11.5, 5, -19, "N");
  addAnchor(-11.5, 5, -27, "S");
  addSign(["磁石ブロック：反対の極なら引っぱられる", "同じ極なら反発して飛ばされる"], -13.8, 3, -23, H, 4.2, 1.3);

  // 練習用の人形
  new Enemy("dummy", V(-4, 0, -24), { pole: "S", yaw: Math.PI });
  new Enemy("dummy", V(1, 0, -24), { pole: "N", yaw: Math.PI });
  addSign(["練習用人形", "引き寄せて、近づいた瞬間に攻撃すると強攻撃"], -1.5, 2.8, -26.2, 0, 4.2, 1.2);

  // ステージの入口（ゲート）
  for (const [x, ok] of [[-4.5, true], [4.5, false]]) {
    addBox(x - 2.5, 0, -57, x - 1.8, 6, -56.2, MAT.metal); addBox(x + 1.8, 0, -57, x + 2.5, 6, -56.2, MAT.metal);
    addBox(x - 2.5, 6, -57, x + 2.5, 6.8, -56.2, MAT.metal);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), ok ? MAT.portal : MAT.dark);
    pl.position.set(x, 3, -56.8); G.scene.add(pl);
    if (!ok) addBox(x - 1.8, 0, -57, x + 1.8, 6, -56.75, MAT.dark);
  }
  addSign(["STAGE 1", "さびた工場" + (save.cleared.stage1 ? "　★クリア" : "")], -4.5, 7.8, -56.15, 0, 4, 1.3);
  addSign(["STAGE 2", "準備中"], 4.5, 7.8, -56.15, 0, 4, 1.3);
  addTrigger(-6.3, 0, -57, -2.7, 5, -55.6, () => G.enterStage("stage1"), false);
  addLight(-4.5, 3, -55.5, 0x8fd8ff, 25, 12, false);

  addLight(0, 8.5, -9, 0xffb060, 40, 26);
  addLight(0, 8.5, -27, 0xffb060, 40, 26);
  addLight(-9, 7, -23, 0xff9a70, 18, 14);
  addLight(0, 8.5, -46, 0xffb060, 35, 24);

  L.update = (dt) => {};
  return L;
}

/* ======================= STAGE 1 さびた工場 ======================= */
export function buildStage1() {
  setupScene(0x0d0b0a, 0.018, 1.5);
  const L = { name: "stage1", killY: -14, spawns: { start: { pos: V(0, 0, -3), yaw: 0 } } };
  const cp = (x, y, z) => () => { if (G.setCheckpoint) G.setCheckpoint(V(x, y, z), 0); };
  const hint = (key) => () => { if (G.onStory) G.onStory(key); };

  // 外壁（両側）と奥の壁
  addBox(-11, -20, -133, -10, 15, 1, MAT.stone);
  addBox(10, -20, -133, 11, 15, 1, MAT.stone);
  addBox(-10, -1, 0, 10, 15, 1, MAT.stone);

  // ---- A：入口のエリア ----
  addBox(-10, -1, -40, 10, 0, 0, MAT.floor);
  hazard(-10, -39.5, 10, -40, 0);
  crate(-6, -13, 0); crate(-6, -11.4, 0, 1.2); crate(5, -21, 0, 2); crate(7.5, -33, 0);
  pipe(-9.4, 4, 0, -40); pipe(9.4, 6, 0, -40);
  scatterScrap(0, -8, 0, 5, 40, ["S"]);
  scatterScrap(5.5, -16, 0, 3, 30, ["N"]);
  scatterScrap(-4, -28, 0, 4.5, 36, ["N", "S"]);
  addSign(["STAGE 1", "さびた工場"], -9.85, 4, -5, H, 3.4, 1.3);
  addLight(0, 9, -12, 0xffb060, 45, 30);
  addLight(0, 9, -31, 0xffb060, 45, 30);
  new Enemy("lv1", V(-4, 0, -20), { yaw: Math.PI });
  new Enemy("lv1", V(4.5, 0, -27), { yaw: Math.PI });
  new Enemy("lv1", V(0, 0, -34), { yaw: Math.PI });
  addTrigger(-10, -2, -40, 10, 8, -33, () => { cp(0, 0, -37)(); hint("gap")(); });

  // ---- 大きな穴：磁石ブロックに引っぱられて渡る ----
  addAnchor(-3.5, 4.5, -56, "N");
  addAnchor(3.5, 4.5, -56, "S");
  addLight(0, 7, -47, 0x9ab8ff, 22, 18, false);

  // ---- B：速い敵のエリア ----
  addBox(-10, -1, -92, 10, 0, -53, MAT.floor);
  hazard(-10, -53, 10, -53.5, 0);
  crate(-7, -63, 0); crate(6.5, -64, 0, 2); crate(-2, -74, 0, 1.2); crate(7, -82, 0);
  pipe(-9.4, 5, -53, -92); pipe(9.4, 3.5, -53, -92);
  scatterScrap(0, -60, 0, 5, 36, ["N", "S"]);
  scatterScrap(4, -77, 0, 4.5, 32, ["N", "S"]);
  addLight(0, 9, -70, 0xffb060, 45, 30);
  new Enemy("lv2", V(-5, 0, -66), { yaw: Math.PI });
  new Enemy("lv2", V(5, 0, -71), { yaw: Math.PI });
  new Enemy("lv2", V(0, 0, -79), { yaw: Math.PI });
  new Enemy("lv1", V(-6, 0, -86), { yaw: Math.PI });
  addTrigger(-10, -2, -60, 10, 8, -54, () => { cp(0, 0, -58)(); hint("fast")(); });

  // ---- 段差：磁石の床で浮いて跳ぶ、または上の磁石に引っぱられる ----
  addPlate(-8, -85, -2, -91, 0, "N");
  addPlate(2, -85, 8, -91, 0, "S");
  addAnchor(0, 8.5, -97.5, "S");
  addSign(["同じ極の床で浮いてジャンプ！", "上の磁石に引っぱられてもいい"], -9.85, 3, -86, H, 4, 1.3);
  addTrigger(-10, -2, -88, 10, 4, -82, hint("climb"));
  addLight(0, 8, -86, 0xffb060, 30, 20);

  // ---- C：高いところ、細い橋 ----
  addBox(-10, -1, -106, 10, 5, -92, MAT.stone);
  addBox(-10, 5, -106, 10, 5.02, -92, MAT.floor, { solid: false, tile: 2 });
  addBox(-2.5, -1, -118, 2.5, 5, -106, MAT.stone);
  hazard(-2.5, -106, -2.6, -118, 5.01); hazard(2.5, -106, 2.6, -118, 5.01);
  hazard(-10, -106, -2.5, -106.4, 5.01); hazard(2.5, -106, 10, -106.4, 5.01);
  addBox(-10, -1, -132, 10, 5, -118, MAT.stone);
  hazard(-10, -117.6, -2.5, -118, 5.01); hazard(2.5, -117.6, 10, -118, 5.01);
  crate(-7, -96, 5); crate(7, -128, 5, 2);
  scatterScrap(0, -99, 5, 4.5, 32, ["N", "S"]);
  scatterScrap(-5, -123, 5, 4, 32, ["N", "S"]);
  new Enemy("lv1", V(-5, 5, -101), { yaw: Math.PI });
  new Enemy("lv1", V(5, 5, -103), { yaw: Math.PI });
  new Enemy("lv1", V(0, 5, -112), { yaw: Math.PI });
  new Enemy("lv3", V(0, 5, -126), { pole: "S", yaw: Math.PI });
  new Enemy("lv1", V(-6, 5, -129), { yaw: Math.PI });
  addTrigger(-10, 4, -100, 10, 12, -93, () => { cp(0, 5, -97)(); });
  addTrigger(-3, 4, -108, 3, 12, -104, hint("bridge"));
  addTrigger(-10, 4, -122, 10, 12, -118, () => { cp(0, 5, -120)(); hint("heavy")(); });
  addLight(0, 11, -100, 0xffb060, 30, 22);
  addLight(0, 11, -125, 0xffb060, 30, 22);

  // ---- ボスの部屋 ----
  addBox(-16, -1, -168, 16, 5, -132, MAT.floor);
  addBox(-17, -1, -169, -16, 19, -132, MAT.stone);
  addBox(16, -1, -169, 17, 19, -132, MAT.stone);
  addBox(-17, -1, -169, 17, 19, -168, MAT.stone);
  addBox(-16, 5, -133, -3, 19, -132, MAT.stone);
  addBox(3, 5, -133, 16, 19, -132, MAT.stone);
  addBox(-3, 11, -133, 3, 19, -132, MAT.stone);
  const bdoor = addDoor(-3, 5, -132.9, 3, 11, -132.1, true);
  addBox(-6.5, 5, -149, -4.5, 8.5, -151, MAT.stone);
  addBox(4.5, 5, -149, 6.5, 8.5, -151, MAT.stone);
  addAnchor(-11, 9.5, -141, "N"); addAnchor(11, 9.5, -141, "S");
  addAnchor(-11, 9.5, -161, "S"); addAnchor(11, 9.5, -161, "N");
  scatterScrap(-10, -150, 5, 4.5, 26, ["N", "S"]);
  scatterScrap(10, -150, 5, 4.5, 26, ["N", "S"]);
  const boss = new Enemy("boss", V(0, 5, -160), { pole: "S", yaw: Math.PI });
  addLight(-9, 13, -146, 0xff7a50, 60, 34);
  addLight(9, 13, -158, 0xff7a50, 60, 34);
  const arena = addTrigger(-15, 4, -166, 15, 20, -136, () => {
    bdoor.setOpen(false);
    boss.active = true;
    if (G.onStory) G.onStory("boss");
  });
  // 鉄くずが足りなくならないよう、上から降ってくる
  let drip = 0;
  L.update = (dt) => {
    if (!boss.active || boss.dead) return;
    drip -= dt;
    if (drip > 0) return;
    drip = 0.5;
    let n = 0;
    for (const s of G.scrap) if (s.state !== "stuck" && s.pos.z < -133 && s.pos.y > 3) n++;
    if (n < 45) addScrap(V(rand(-14, 14), 15, rand(-166, -136)), Math.random() < .5 ? "N" : "S", "free");
  };
  // やられたときにボス戦をやり直せるようにする
  L.onRespawn = () => {
    if (!boss.dead && boss.active) {
      boss.resetBoss();
      for (const e of G.enemies) if (e !== boss && e.pos.z < -133 && !e.dead) { e.dead = true; e.deathT = 2; if (e.M.root.parent) G.scene.remove(e.M.root); }
      bdoor.setOpen(true, true);
      arena.done = false;
      if (G.onStory) G.onStory("bossReset");
    }
  };
  return L;
}

export const LEVELS = { lobby: buildLobby, stage1: buildStage1 };
