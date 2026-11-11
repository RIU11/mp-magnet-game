// 入力：PSコントローラー（Gamepad API の標準配置）とキーボード＋マウスをまとめて扱う
// ボタン・キーの配置はプレイヤーが変えられる（binds）。移動・視点・メニュー（Esc／OPTIONS）は固定
// 標準配置：0=×, 1=○, 2=□, 3=△, 4=L1, 5=R1, 6=L2, 7=R2, 8=CREATE, 9=OPTIONS, 10=L3, 11=R3, 12-15=十字キー
const keys = new Set();
const keyEdge = new Set();
const mouse = { b: [false, false, false], edge: [false, false, false], dx: 0, dy: 0 };
let padPrev = [];
let sprintToggle = false;

// 配置を変えられる操作
export const BIND_ACTIONS = ["jump", "dash", "magnet", "mp", "flip", "neutral", "attack", "next", "craft", "menu"];
export const DEFAULT_BINDS = {
  pad: { jump: 0, next: 1, craft: 2, neutral: 3, flip: 4, mp: 5, magnet: 6, attack: 7, dash: 10 },
  kb: { jump: "Space", next: "KeyR", craft: "KeyC", neutral: "KeyQ", flip: "KeyE", mp: "KeyF", magnet: "Mouse2", attack: "Mouse0", dash: "ShiftLeft", menu: "KeyM" }
};
// 移動・メニュー用に決まっていて、割り当てられないもの
const RESERVED_KB = { KeyW: "移動", KeyA: "移動", KeyS: "移動", KeyD: "移動", ArrowUp: "移動", ArrowDown: "移動", ArrowLeft: "移動", ArrowRight: "移動", Escape: "メニュー" };
const RESERVED_PAD = { 9: "メニュー（OPTIONS）", 16: "PSボタン" };

const PAD_NAMES = { 0: "×", 1: "○", 2: "□", 3: "△", 4: "L1", 5: "R1", 6: "L2", 7: "R2", 8: "CREATE", 9: "OPTIONS", 10: "L3（押しこみ）", 11: "R3（押しこみ）", 12: "十字↑", 13: "十字↓", 14: "十字←", 15: "十字→" };
const KEY_NAMES = {
  Mouse0: "左クリック", Mouse1: "ホイールクリック", Mouse2: "右クリック", Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "BackSpace",
  ShiftLeft: "左Shift", ShiftRight: "右Shift", ControlLeft: "左Ctrl", ControlRight: "右Ctrl", AltLeft: "左Alt", AltRight: "右Alt", CapsLock: "CapsLock",
  Backquote: "@の左（半角/全角）", Minus: "-", Equal: "^", BracketLeft: "@", BracketRight: "[", Backslash: "]", Semicolon: ";", Quote: ":", Comma: ",", Period: ".", Slash: "/", IntlRo: "\\（ろ）", IntlYen: "¥"
};
export function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return "テンキー" + code.slice(6);
  if (/^F\d+$/.test(code)) return code;
  return code;
}
export function padName(i) { return PAD_NAMES[i] !== undefined ? PAD_NAMES[i] : "ボタン" + i; }

export const LABELS = {
  move: { pad: "左スティック", kb: "WASD" },
  look: { pad: "右スティック", kb: "マウス" },
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
  binds: null,
  capture: null, // { dev, action, done(result) }：配置の変更で、次に押されたボタン・キーを待っている
  // 毎フレームの結果
  move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, lookRate: { x: 0, y: 0 },
  held: {}, pressed: {},
  pad: null, padPressed: [],
  sim: { held: {}, pressed: {}, move: null },
  onDevice: null,

  init(canvas) {
    this.setBinds(null);
    addEventListener("keydown", (e) => {
      if (this.capture && this.capture.dev === "kb") { e.preventDefault(); this.finishCapture(e.code === "Escape" ? null : e.code); return; }
      if (this.capture && e.code === "Escape") { e.preventDefault(); this.finishCapture(null); return; }
      if (e.repeat) return;
      const k = e.code;
      if (!keys.has(k)) keyEdge.add(k);
      keys.add(k);
      this.setDevice("kb");
      if (!e.ctrlKey && !e.metaKey && (this.boundKeys.has(k) || k === "Tab" || k === "AltLeft")) e.preventDefault();
    });
    addEventListener("keyup", (e) => keys.delete(e.code));
    addEventListener("blur", () => { keys.clear(); mouse.b = [false, false, false]; });
    document.addEventListener("mousedown", (e) => {
      if (e.button > 2) return;
      if (e.button === 1) e.preventDefault(); // ホイールクリックの自動スクロールを出さない
      if (this.capture && this.capture.dev === "kb") { e.preventDefault(); e.stopPropagation(); this.finishCapture("Mouse" + e.button); return; }
      if (!mouse.b[e.button]) mouse.edge[e.button] = true;
      mouse.b[e.button] = true; this.setDevice("kb");
    }, true);
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

  /* ---------- ボタン・キー配置 ---------- */
  setBinds(b) {
    const d = DEFAULT_BINDS;
    const src = b || {};
    this.binds = { pad: Object.assign({}, d.pad, src.pad || {}), kb: Object.assign({}, d.kb, src.kb || {}) };
    this.refreshLabels();
  },
  refreshLabels() {
    for (const a of BIND_ACTIONS) {
      LABELS[a] = {
        pad: a === "menu" ? "OPTIONS" : padName(this.binds.pad[a]),
        kb: keyName(this.binds.kb[a])
      };
    }
    this.boundKeys = new Set(Object.values(this.binds.kb));
  },
  // 割り当て：同じ機器でほかの操作が使っていたら入れかえる。戻り値は {ok, msg}
  assign(dev, action, code) {
    if (dev === "pad" && action === "menu") return { ok: false, msg: "メニューは OPTIONS で開きます（変更できません）" };
    const reserved = dev === "kb" ? RESERVED_KB[code] : RESERVED_PAD[code];
    if (reserved) return { ok: false, msg: (dev === "kb" ? keyName(code) : padName(code)) + " は「" + reserved + "」に使うので割り当てられません" };
    const map = this.binds[dev];
    const old = map[action];
    let swapped = null;
    for (const a of Object.keys(map)) if (a !== action && map[a] === code) { map[a] = old; swapped = a; }
    map[action] = code;
    this.refreshLabels();
    const nm = dev === "kb" ? keyName(code) : padName(code);
    return { ok: true, msg: "「" + ACTION_NAMES[action].replace(/（.*）/, "") + "」を " + nm + " にしました" + (swapped ? "（「" + ACTION_NAMES[swapped].replace(/（.*）/, "") + "」と入れかえ）" : "") };
  },
  startCapture(dev, action, done) {
    this.capture = { dev, action, done, t: performance.now() };
    keys.clear(); mouse.b = [false, false, false];
  },
  finishCapture(code) {
    const c = this.capture; if (!c) return;
    this.capture = null;
    if (typeof code === "string" && code.startsWith("Mouse")) this.lastMouseCapture = performance.now();
    const res = code === null || code === undefined ? { ok: false, msg: "変更をやめました", cancel: true } : this.assign(c.dev, c.action, code);
    c.done(res);
  },

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
    // 配置の変更中：次に押されたコントローラーのボタンを受けとる（OPTIONSでやめる）
    if (this.capture) {
      const i = this.padPressed.findIndex((v) => v);
      if (this.capture.dev === "pad" && i >= 0) this.finishCapture(i === 9 ? null : i);
      else if (this.capture.dev === "kb" && this.padPressed[9]) this.finishCapture(null);
      else if (performance.now() - (this.capture ? this.capture.t : 0) > 8000) this.finishCapture(null);
      this.held = {}; this.pressed = {}; mouse.dx = mouse.dy = 0;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    const ax = (i) => (pad && pad.axes[i] !== undefined ? dz(pad.axes[i]) : 0);
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    if (pad && (padNow.some((v) => v) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.5)) this.setDevice("pad");

    // キーボードのキー（マウスのボタンは "Mouse0" などの名前で同じように扱う）
    const k = (c) => (c && c.startsWith("Mouse") ? mouse.b[+c.slice(5)] : keys.has(c));
    const ke = (c) => (c && c.startsWith("Mouse") ? mouse.edge[+c.slice(5)] : keyEdge.has(c));
    let mx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    let my = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    if (Math.abs(lx) + Math.abs(ly) > 0) { mx = lx; my = -ly; }
    if (this.sim.move) { mx = this.sim.move.x; my = this.sim.move.y; }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    this.move.x = mx; this.move.y = my;
    const B = this.binds, P = B.pad, K = B.kb, pp = this.padPressed;
    // ダッシュ（コントローラー）：押すと、止まるまでダッシュ
    if (pp[P.dash]) sprintToggle = !sprintToggle;
    if (Math.hypot(mx, my) < 0.2) sprintToggle = false;

    this.look.x = mouse.dx * this.sens; this.look.y = mouse.dy * this.sens * (this.invertY ? -1 : 1);
    this.lookRate.x = rx; this.lookRate.y = ry * (this.invertY ? -1 : 1);
    mouse.dx = mouse.dy = 0;

    const S = this.sim;
    const H = (a) => k(K[a]) || padNow[P[a]] || !!S.held[a];
    const E = (a) => ke(K[a]) || pp[P[a]] || !!S.pressed[a];
    // ダッシュを右Shiftでも（初期設定のときだけ）
    this.held = { magnet: H("magnet"), attack: H("attack"), mp: H("mp"), jump: H("jump"),
      dash: k(K.dash) || (K.dash === "ShiftLeft" && keys.has("ShiftRight")) || sprintToggle || !!S.held.dash };
    this.pressed = {
      jump: E("jump"), flip: E("flip"), next: E("next"), craft: E("craft"), neutral: E("neutral"), attack: E("attack"),
      pause: keyEdge.has("Escape") || pp[9],
      menu: ke(K.menu),
      // メニュー操作（コントローラー。ここは固定）
      up: pp[12], down: pp[13], left: pp[14], right: pp[15], ok: pp[0], back: pp[1]
    };
    S.pressed = {};
  },
  endFrame() { keyEdge.clear(); mouse.edge = [false, false, false]; },
  // メニューを閉じた直後に、そのボタンでジャンプなどが起きないようにする
  consume() { keyEdge.clear(); mouse.edge = [false, false, false]; for (const k in this.pressed) this.pressed[k] = false; }
};
