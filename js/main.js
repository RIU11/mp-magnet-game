// ゲーム全体の流れ：タイトル → ロビー → ステージ → クリア（ポイント振り分け）→ ロビー
import { THREE, G, POLE_NAME, initAssets, V } from "./core.js";
import { FX } from "./fx.js";
import { input, LABELS } from "./input.js";
import { HUD } from "./hud.js";
import { Player, cam, updateCamera } from "./player.js";
import { updateEnemies } from "./enemies.js";
import { updateScrap, updatePickups, updateTriggers, updateAnchors, addScrap, initScrapInstances, syncScrap } from "./world.js";
import { LEVELS } from "./levels.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("mpgame:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("mpgame:" + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ } }
};
const freshSave = () => ({ stats: { load: 0, mp: 0, speed: 0 }, points: 0, cleared: {}, doorOpened: false });
function loadSave() {
  const s = Object.assign(freshSave(), store.get("save", {}) || {});
  s.stats = Object.assign({ load: 0, mp: 0, speed: 0 }, s.stats || {});
  s.cleared = s.cleared || {};
  return s;
}
G.save = loadSave();
G.persist = () => store.set("save", G.save);

/* ---------------- 描画の準備 ---------------- */
const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 110);
G.renderer = renderer; G.camera = camera;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight); camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

initAssets(); FX.init(); input.init(canvas); HUD.init();
const player = new Player(); G.player = player;

let state = "title";
let deadT = 0, clearT = 0, firstHints = {};
const ovs = ["title", "pause", "dead", "clear"];
function showOverlay(id) {
  for (const o of ovs) $(o).hidden = o !== id;
  if (id) { const b = $(id).querySelector("button"); if (b && input.device === "pad") b.focus(); }
}

/* ---------------- ステージの読み込み ---------------- */
function disposeScene(s) {
  if (!s) return;
  // 次のステージでも使い回すもの（演出・鉄くずのまとめ描き）は捨てない
  s.traverse((o) => { if (o.geometry && !o.userData.keep && !(o.parent && o.parent.userData.keep)) o.geometry.dispose(); });
}
function loadLevel(name, spawnKey) {
  if (G.scene) { G.scene.remove(player.model.root); disposeScene(G.scene); }
  G.scene = new THREE.Scene();
  for (const k of ["solids", "scrap", "enemies", "triggers", "pickups", "plates", "anchors", "updaters"]) G[k] = [];
  G.button = null; G.boss = null;
  G.level = LEVELS[name](G.save);
  G.scene.add(player.model.root);
  FX.attach(G.scene); FX.clear(); initScrapInstances(G.scene);
  const sp = G.level.spawns[spawnKey] || G.level.spawns.start;
  G.checkpoint = { pos: sp.pos.clone(), yaw: sp.yaw };
  player.reset(sp.pos, sp.yaw);
  HUD.setBoss(null); HUD.clearHint();
  updateCamera(1 / 60);
  lobbyHintT = 0;
  if (name === "stage1") HUD.hint("STAGE 1　さびた工場：鉄くずを集めて武器を作り、奥にいるボスを倒そう", 7);
}
function fadeTo(fn) {
  const f = $("fade"); f.classList.add("on");
  setTimeout(() => { fn(); setTimeout(() => f.classList.remove("on"), 60); }, 380);
}
G.enterStage = (name) => {
  if (state !== "playing" || G.loading) return;
  G.loading = true;
  fadeTo(() => { loadLevel(name, "start"); G.loading = false; });
};
G.setCheckpoint = (pos, yaw) => {
  G.checkpoint = { pos, yaw: cam.yaw };
  player.hp = Math.max(player.hp, player.maxHp * .6);
  HUD.toast("チェックポイント（体力が少し回復した）");
};

/* ---------------- できごと（ヒント・お知らせ） ---------------- */
const K = (a) => HUD.K(a);
function once(key, fn) { if (!firstHints[key]) { firstHints[key] = true; fn(); } }
G.onPlayerEvent = (name, data) => {
  const P = player;
  switch (name) {
    case "toast": HUD.toast(data); break;
    case "crafted": HUD.toast(data.name + "を作った！（鉄くず -" + data.cost + "）"); break;
    case "hurt": HUD.flashHurt(); break;
    case "dead": deadT = 1.4; break;
    case "fell": {
      P.hp -= 20;
      if (P.hp <= 0) { P.hp = 0; P.dead = true; deadT = .6; break; }
      const c = G.checkpoint;
      for (const s of P.stuck) s.mesh.parent && s.mesh.parent.remove(s.mesh);
      const keep = P.hp;
      P.reset(c.pos, c.yaw); P.hp = keep;
      if (G.level.onRespawn) G.level.onRespawn();
      HUD.toast("落ちてしまった…（体力 -20）");
      break;
    }
    case "overload": HUD.toast("まといすぎ！足がとても遅くなった（" + input.label("neutral") + "で鉄くずを落とせる）", 3.5); break;
    case "stick":
      if (P.load >= 10 && !P.weapon) once("craft", () => HUD.hint("鉄くずが10個たまった！ " + K("craft") + " で剣を作れる（" + K("next") + " で槍に切り替え。槍は15個）", 8));
      break;
    case "attach": once("attach", () => HUD.hint("強い磁石にくっついている間はMPが回復する。" + K("flip") + " で極を変えると反発して飛び出す", 8)); break;
    case "buttonPunch": HUD.toast("かたすぎて手では押せない…鉄くずを飛ばしてみよう"); break;
    case "neutral": HUD.toast(data ? "磁力ニュートラル：磁力を切った（鉄くずが落ちた）" : "磁力を戻した"); break;
    case "launch": once("launch", () => HUD.toast("同じ極になった鉄くずが反発して飛んでいった！")); break;
  }
};
G.onEnemyDead = (e, fell) => {
  if (fell) HUD.toast("敵を落とした！");
  if (e.type === "boss") { clearT = 2.8; HUD.toast("鉄くずの王をたおした！", 3); HUD.setBoss(null); }
};
G.onBossEvent = (k, p) => {
  if (k === "pole") HUD.toast("ボスの核が" + POLE_NAME[p] + "に変わった！");
  if (k === "stunned") HUD.toast("ボスが壁にぶつかって動けない！チャンス");
  if (k === "summon") HUD.toast("ボスが仲間を呼んだ！");
};
G.onStory = (k) => {
  const msgs = {
    doorOpen: "扉が開いた！奥のステージ選択の部屋へ進もう",
    gap: "向こう側の磁石ブロックをねらって " + K("magnet") + "。遠くて届かないときは " + K("mp") + " もいっしょに押す（MPを使うと遠くまで届く）",
    fast: "Lv2は速い敵。引き寄せて、近づいた瞬間に " + K("attack") + " で強攻撃",
    climb: "同じ極の床の上で浮いて " + K("jump") + "。上の磁石ブロックに引っぱられてもいい",
    bridge: "同じ極の磁力で敵をはじくと、下に落とせる",
    heavy: "Lv3は大きいので、反対の極なら自分が引っぱられる。その勢いのまま " + K("attack") + " で強攻撃",
    boss: "鉄くずの王：核の色（極）がときどき変わる。突進を壁にぶつけさせると、しばらく動けなくなる"
  };
  if (k === "boss") { HUD.setBoss(G.boss); player.hp = player.maxHp; }
  if (k === "bossReset") { HUD.setBoss(null); return; }
  if (msgs[k]) HUD.hint(msgs[k], k === "boss" ? 9 : 11);
};

// ロビーの説明（いまやることを順番に出す）
let lobbyHintT = 0;
function lobbyHints(dt) {
  if (!G.level || G.level.name !== "lobby") return;
  lobbyHintT -= dt; if (lobbyHintT > 0) return;
  lobbyHintT = 1;
  const P = player, z = P.pos.z;
  let h;
  if (!G.save.doorOpened) {
    if (P.load < 3 && P.pole === "N" && !P.neutral) h = "青い鉄くず（S極）に近づいて、体にくっつけよう。いまのあなたは <b class='pn'>赤＝N極</b>";
    else if (P.load < 3) h = "鉄くずは、自分と反対の極のものがくっつく。" + K("flip") + " で極を切り替えられる";
    else h = "扉の右の<b>赤いボタン</b>をねらって " + K("flip") + " で極を切り替えよう。くっついた鉄くずが反発して飛んでいく";
  } else if (z > -36) h = "ここは練習部屋。奥の部屋からステージへ進もう";
  else h = "STAGE 1 のゲートに入ろう";
  if (HUD._lobby !== h) { HUD._lobby = h; HUD.hint(h, 9999); }
}

/* ---------------- 一時停止・やられた・クリア ---------------- */
function startGame() {
  input.consume();
  showOverlay(null);
  HUD.show(true);
  HUD.toast(input.device === "pad" ? "OPTIONS でメニュー（操作方法・設定）" : input.label("menu") + " でメニュー（操作方法・ボタン配置・設定）を開けます", 5);
  if (!G.level) loadLevel("lobby", G.save.doorOpened ? "select" : "start");
  state = "playing";
  if (input.device === "kb") input.lock();
}
function pause() {
  if (state !== "playing") return;
  state = "paused";
  $("pause-stats").innerHTML = statsHtml();
  $("to-lobby").hidden = !G.level || G.level.name === "lobby";
  showOverlay("pause");
  $("pause").querySelector(".card").scrollTop = 0;
  input.unlock();
}
function resume() {
  input.consume();
  showOverlay(null);
  state = "playing";
  if (input.device === "kb") input.lock();
}
function statsHtml() {
  const P = player;
  return "まとい総量 <b>" + P.maxLoad + "</b>　MP <b>" + P.maxMp + "</b>　スピード <b>" + Math.round(P.speedMul * 100) + "%</b>";
}
function respawn() {
  const c = G.checkpoint;
  player.reset(c.pos, c.yaw);
  if (G.level.onRespawn) G.level.onRespawn();
  resume();
}

// クリア：ポイントを「まとい総量・MP・スピード」に振り分ける
let alloc = null;
function showClear() {
  state = "clear";
  input.unlock();
  const first = !G.save.cleared.stage1;
  G.save.cleared.stage1 = true;
  const gain = first ? 3 : 1;
  G.save.points += gain;
  G.persist();
  alloc = { load: 0, mp: 0, speed: 0 };
  $("clear-gain").textContent = (first ? "はじめてのクリア！" : "") + "ポイント +" + gain;
  renderAlloc();
  showOverlay("clear");
}
function renderAlloc() {
  const used = alloc.load + alloc.mp + alloc.speed, left = G.save.points - used, st = G.save.stats;
  const rows = [
    ["load", "まとい総量", (30 + 5 * (st.load + alloc.load)) + "個", "+5個"],
    ["mp", "MP", (100 + 20 * (st.mp + alloc.mp)) + "", "+20"],
    ["speed", "スピード", (100 + 8 * (st.speed + alloc.speed)) + "%", "+8%"]
  ];
  $("alloc").innerHTML = rows.map(([k, n, v, u]) =>
    '<div class="arow"><span class="an">' + n + '</span><span class="av">' + v + '</span>' +
    '<button type="button" class="sbtn" data-k="' + k + '" data-d="-1"' + (alloc[k] ? "" : " disabled") + ">－</button>" +
    '<button type="button" class="sbtn" data-k="' + k + '" data-d="1"' + (left ? "" : " disabled") + ">＋</button><small>" + u + "</small></div>").join("");
  $("alloc-left").textContent = "のこりポイント：" + left;
}
$("alloc").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  const k = b.dataset.k, d = +b.dataset.d;
  const used = alloc.load + alloc.mp + alloc.speed;
  if (d > 0 && used < G.save.points) alloc[k]++;
  if (d < 0 && alloc[k] > 0) alloc[k]--;
  const idx = [...document.querySelectorAll("#alloc button")].indexOf(b);
  renderAlloc();
  const again = document.querySelectorAll("#alloc button")[idx];
  if (again && !again.disabled) again.focus(); else $("clear-ok").focus();
});
$("clear-ok").addEventListener("click", () => {
  for (const k of ["load", "mp", "speed"]) { G.save.stats[k] += alloc[k]; G.save.points -= alloc[k]; }
  G.persist();
  showOverlay(null);
  state = "playing";
  fadeTo(() => loadLevel("lobby", "select"));
  input.consume();
  if (input.device === "kb") input.lock();
});

$("start-btn").addEventListener("click", startGame);
$("resume-btn").addEventListener("click", resume);
$("retry-btn").addEventListener("click", respawn);
$("to-lobby").addEventListener("click", () => { showOverlay(null); state = "playing"; fadeTo(() => loadLevel("lobby", "select")); input.consume(); if (input.device === "kb") input.lock(); });
$("reset-btn").addEventListener("click", () => {
  if (!confirm("これまでのクリアと能力の振り分けを消して、最初からにしますか？")) return;
  G.save = freshSave(); G.persist(); G.level = null; location.reload();
});
// 設定（マウス感度・上下反転・カメラの距離）は端末に保存
const settings = Object.assign({ sens: 4, inv: false, dist: 4.3 }, store.get("settings", {}) || {});
function applySettings() {
  input.sens = 0.0004 + 0.0004 * settings.sens;
  input.invertY = !!settings.inv;
  cam.dist = +settings.dist || 4.3;
  $("set-sens").value = settings.sens; $("set-sens-v").textContent = settings.sens;
  $("set-inv").checked = !!settings.inv;
  $("set-dist").value = String(cam.dist);
}
$("set-sens").addEventListener("input", (e) => { settings.sens = +e.target.value; store.set("settings", settings); applySettings(); });
$("set-inv").addEventListener("change", (e) => { settings.inv = e.target.checked; store.set("settings", settings); applySettings(); });
$("set-dist").addEventListener("change", (e) => { settings.dist = +e.target.value; store.set("settings", settings); applySettings(); });
applySettings();
// ボタン・キー配置（端末に保存）
input.setBinds(store.get("binds", null));
function renderControls() {
  $("title-ctl").innerHTML = HUD.controlsTable(false);
  $("pause-ctl").innerHTML = HUD.controlsTable(true);
  $("menu-key").textContent = LABELS.menu.kb;
  HUD.refreshKeys(); HUD._lobby = null; lobbyHintT = 0;
}
function bindsChanged() { store.set("binds", input.binds); renderControls(); }
$("pause-ctl").addEventListener("click", (e) => {
  const b = e.target.closest("button.bind"); if (!b || input.capture) return;
  // マウスのボタンを受けとった直後のクリックで、また入力待ちにならないように
  if (performance.now() - (input.lastMouseCapture || 0) < 400) return;
  const a = b.dataset.a, dev = b.dataset.d;
  b.classList.add("wait"); b.textContent = "入力待ち…";
  $("bind-msg").textContent = "「" + b.closest("tr").firstChild.textContent.replace(/（.*）/, "") + "」に使う" + (dev === "pad" ? "コントローラーのボタン" : "キーかマウスのボタン") + "を押してください";
  input.startCapture(dev, a, (res) => {
    if (res.ok) bindsChanged(); else renderControls();
    $("bind-msg").textContent = res.msg;
    const again = document.querySelector('#pause-ctl button.bind[data-a="' + a + '"][data-d="' + dev + '"]');
    if (again) again.focus();
    input.consume();
  });
});
$("bind-reset").addEventListener("click", () => {
  input.setBinds(null); bindsChanged();
  $("bind-msg").textContent = "ボタン・キー配置を初期設定に戻しました";
});
renderControls();
canvas.addEventListener("click", () => { if (state === "playing" && !input.locked) input.lock(); });
input.onLock = (locked) => { if (!locked && state === "playing" && input.device === "kb" && !G.loading) pause(); };
input.onDevice = () => { HUD.refreshKeys(); HUD._lobby = null; lobbyHintT = 0; };
addEventListener("blur", () => pause());
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("pagehide", () => pause());

// コントローラーでメニューを選ぶ（十字キーで移動、×で決定、OPTIONSで閉じる）
function menuNav() {
  const id = ovs.find((o) => !$(o).hidden); if (!id) return;
  const btns = [...$(id).querySelectorAll("button, input, select, summary")].filter((b) => !b.disabled && !b.hidden && b.offsetParent !== null);
  if (!btns.length) return;
  const p = input.pressed;
  const cur = btns.indexOf(document.activeElement);
  const ae = document.activeElement;
  // 設定のつまみ・選択は左右で変える
  if ((p.left || p.right) && ae && (ae.type === "range" || ae.tagName === "SELECT")) {
    const d = p.right ? 1 : -1;
    if (ae.type === "range") ae.value = String(Math.min(+ae.max, Math.max(+ae.min, +ae.value + d)));
    else ae.selectedIndex = Math.min(ae.options.length - 1, Math.max(0, ae.selectedIndex + d));
    ae.dispatchEvent(new Event(ae.type === "range" ? "input" : "change", { bubbles: true }));
    return;
  }
  if (p.down || p.right) btns[(cur + 1) % btns.length].focus();
  else if (p.up || p.left) btns[(cur - 1 + btns.length) % btns.length].focus();
  else if (p.ok) { if (cur >= 0) btns[cur].click(); else btns[0].focus(); }
  else if ((p.pause || p.menu) && id === "pause") resume();
  if (p.ok && cur >= 0 && btns[cur].scrollIntoView) btns[cur].scrollIntoView({ block: "nearest" });
  if ((p.up || p.down || p.left || p.right) && document.activeElement && document.activeElement.scrollIntoView) document.activeElement.scrollIntoView({ block: "nearest" });
}

/* ---------------- 毎フレーム ---------------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  input.poll();
  if (state !== "playing" && !input.capture) menuNav();
  else if (input.pressed.pause || input.pressed.menu) pause();
  $("lockhint").hidden = !(state === "playing" && input.device === "kb" && !input.locked && !G.loading);
  if (state === "playing" && G.level) {
    let gdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; gdt = dt * 0.15; }
    G.time += gdt;
    player.update(gdt);
    updateEnemies(gdt);
    updateScrap(gdt);
    updatePickups(gdt);
    updateTriggers();
    updateAnchors(gdt);
    for (const u of G.updaters) u(gdt);
    if (G.level.update) G.level.update(gdt);
    lobbyHints(dt);
    if (player.dead && deadT > 0) { deadT -= dt; if (deadT <= 0) { state = "dead"; showOverlay("dead"); input.unlock(); } }
    if (clearT > 0) { clearT -= dt; if (clearT <= 0) showClear(); }
  }
  if (G.level) { updateCamera(dt); FX.update(dt, camera); }
  HUD.update(player, dt);
  if (G.scene) { syncScrap(); renderer.render(G.scene, camera); }
  input.endFrame();
}
// タイトルの後ろにロビーを映しておく
loadLevel("lobby", G.save.doorOpened ? "select" : "start");
HUD.show(false);
showOverlay("title");
requestAnimationFrame(frame);
if (window.TTAnnounce) window.TTAnnounce.checkAndShow();

// 動作確認用
window.__mp = {
  G, player, input, cam, updateCamera, get state() { return state; }, loadLevel, startGame, pause, resume, respawn, showClear,
  give(n, pole) { for (let i = 0; i < n; i++) { const s = addScrap(player.pos.clone(), pole || (player.pole === "N" ? "S" : "N"), "ground"); player.stick(s); } },
  // カメラの中心（照準）を q に向ける
  aimAt(q) {
    for (let i = 0; i < 6; i++) {
      updateCamera(1 / 60);
      const d = q.clone().sub(camera.position).normalize();
      cam.yaw = Math.atan2(-d.x, -d.z); cam.pitch = Math.asin(d.y);
    }
    updateCamera(1 / 60);
  }
};
