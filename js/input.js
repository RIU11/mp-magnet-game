// 入力：PSコントローラー（Gamepad API の標準配置）とキーボード＋マウスをまとめて扱う
// 標準配置：0=×, 1=○, 2=□, 3=△, 4=L1, 5=R1, 6=L2, 7=R2, 8=SHARE/CREATE, 9=OPTIONS, 10=L3, 11=R3, 12-15=十字キー
const keys = new Set();
const keyEdge = new Set();
const mouse = { b: [false, false, false], edge: [false, false, false], dx: 0, dy: 0 };
let padPrev = [];
let sprintToggle = false;

export const LABELS = {
  move: { pad: "左スティック", kb: "WASD" },
  look: { pad: "右スティック", kb: "マウス" },
  magnet: { pad: "L2", kb: "右クリック" },
  attack: { pad: "R2", kb: "左クリック" },
  flip: { pad: "L1", kb: "E" },
  mp: { pad: "R1", kb: "F" },
  next: { pad: "○", kb: "R" },
  craft: { pad: "□", kb: "C" },
  jump: { pad: "×", kb: "Space" },
  dash: { pad: "L3（押しこみ）", kb: "Shift" },
  neutral: { pad: "△", kb: "Q" },
  menu: { pad: "OPTIONS", kb: "M" },
  pause: { pad: "OPTIONS", kb: "Esc" }
};
export const ACTION_NAMES = {
  move: "移動", look: "視点・ねらう", dash: "ダッシュ", jump: "ジャンプ", magnet: "磁力発動", attack: "攻撃",
  flip: "S極／N極 切り替え", mp: "MP消費（磁力を強く・遠くへ）", next: "次の武器を選ぶ", craft: "武器を作る",
  neutral: "磁力ニュートラル（磁力を切る）", menu: "メニュー（操作方法・設定）", pause: "一時停止"
};

export const input = {
  device: "kb",
  locked: false,
  sens: 0.002, invertY: false, skipMoves: 0,
  // 毎フレームの結果
  move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, lookRate: { x: 0, y: 0 },
  held: {}, pressed: {},
  pad: null, padPressed: [],
  sim: { held: {}, pressed: {}, move: null },
  onDevice: null,

  init(canvas) {
    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (!keys.has(k)) keyEdge.add(k);
      keys.add(k);
      this.setDevice("kb");
      if (["KeyR", "KeyF", "KeyE", "KeyQ", "KeyC", "Tab", "AltLeft"].includes(k) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    });
    addEventListener("keyup", (e) => keys.delete(e.code));
    addEventListener("blur", () => { keys.clear(); mouse.b = [false, false, false]; });
    document.addEventListener("mousedown", (e) => {
      if (e.button > 2) return;
      if (!mouse.b[e.button]) mouse.edge[e.button] = true;
      mouse.b[e.button] = true; this.setDevice("kb");
    });
    addEventListener("mouseup", (e) => { if (e.button <= 2) mouse.b[e.button] = false; });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      // ロックした直後の大きな値や、ブラウザがまれに出す飛んだ値は捨てる（視点が急に回るのを防ぐ）
      if (this.skipMoves > 0) { this.skipMoves--; return; }
      if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
      mouse.dx += mx; mouse.dy += my;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.setDevice("kb");
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.skipMoves = 2; mouse.dx = mouse.dy = 0; this.lockFailed = false; }
      if (!this.locked) mouse.b = [false, false, false];
      if (this.onLock) this.onLock(this.locked);
    });
    this.canvas = canvas;
  },
  lock() {
    // OSのマウス加速を切った生の動き（使えないブラウザでは普通のロック）
    const fail = () => { this.lockFailed = true; };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(fail); } catch (e) { fail(); } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { fail(); } }
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  setDevice(d) { if (this.device !== d) { this.device = d; if (this.onDevice) this.onDevice(d); } },
  label(a) { return LABELS[a][this.device]; },

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    const pb = (i) => !!(pad && pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.3));
    const padNow = [];
    for (let i = 0; i < 17; i++) padNow[i] = pb(i);
    this.padPressed = padNow.map((v, i) => v && !padPrev[i]);
    padPrev = padNow;
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    const ax = (i) => (pad && pad.axes[i] !== undefined ? dz(pad.axes[i]) : 0);
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    if (pad && (padNow.some((v) => v) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.5)) this.setDevice("pad");

    const k = (c) => keys.has(c);
    const ke = (c) => keyEdge.has(c);
    let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
    let my = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
    if (Math.abs(lx) + Math.abs(ly) > 0) { mx = lx; my = -ly; }
    if (this.sim.move) { mx = this.sim.move.x; my = this.sim.move.y; }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    this.move.x = mx; this.move.y = my;
    // ダッシュ：L3を押すと、止まるまでダッシュ
    if (this.padPressed[10]) sprintToggle = !sprintToggle;
    if (Math.hypot(mx, my) < 0.2) sprintToggle = false;

    this.look.x = mouse.dx * this.sens; this.look.y = mouse.dy * this.sens * (this.invertY ? -1 : 1);
    this.lookRate.x = rx; this.lookRate.y = ry * (this.invertY ? -1 : 1);
    mouse.dx = mouse.dy = 0;

    const S = this.sim;
    this.held = {
      magnet: mouse.b[2] || padNow[6] || !!S.held.magnet,
      attack: mouse.b[0] || padNow[7] || !!S.held.attack,
      mp: k("KeyF") || padNow[5] || !!S.held.mp,
      dash: k("ShiftLeft") || k("ShiftRight") || sprintToggle || !!S.held.dash,
      jump: k("Space") || padNow[0] || !!S.held.jump
    };
    const pp = this.padPressed;
    this.pressed = {
      jump: ke("Space") || pp[0] || !!S.pressed.jump,
      flip: ke("KeyE") || pp[4] || !!S.pressed.flip,
      next: ke("KeyR") || pp[1] || !!S.pressed.next,
      craft: ke("KeyC") || pp[2] || !!S.pressed.craft,
      neutral: ke("KeyQ") || pp[3] || !!S.pressed.neutral,
      attack: mouse.edge[0] || pp[7] || !!S.pressed.attack,
      pause: ke("Escape") || ke("KeyP") || pp[9],
      menu: ke("KeyM"),
      // メニュー操作（コントローラー）
      up: pp[12], down: pp[13], left: pp[14], right: pp[15], ok: pp[0], back: pp[1]
    };
    S.pressed = {};
  },
  endFrame() { keyEdge.clear(); mouse.edge = [false, false, false]; },
  // メニューを閉じた直後に、そのボタンでジャンプなどが起きないようにする
  consume() { keyEdge.clear(); mouse.edge = [false, false, false]; for (const k in this.pressed) this.pressed[k] = false; }
};
