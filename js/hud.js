// 画面の表示：体力・MP・鉄くず重量・武器バー・極・照準・ヒント・ボスの体力
import { G, POLE_CSS, POLE_NAME } from "./core.js";
import { input, LABELS, ACTION_NAMES } from "./input.js";
import { WEAPONS } from "./player.js";

const $ = (id) => document.getElementById(id);
const ICONS = {
  sword: '<svg viewBox="0 0 40 40"><path d="M29 5l6 0 0 6-17 17-3-3-3 3 2 2-3 3-5-5 3-3 2 2 3-3-3-3z" fill="currentColor"/></svg>',
  spear: '<svg viewBox="0 0 40 40"><path d="M36 4l-2 9-3-3L8 33l-2-2L29 8l-3-3z M6 31l3 3-3 3-3-3z" fill="currentColor"/></svg>'
};
let el = {}, last = {}, hintT = 0, toastT = 0;
const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };

export const HUD = {
  init() {
    el = {
      hud: $("hud"), hp: $("hp-fill"), mp: $("mp-fill"), hpN: $("hp-n"), mpN: $("mp-n"), pole: $("pole"), scrapN: $("scrap-n"), ring: $("ring-fg"), scrapBox: $("scrap"),
      weapons: $("weapons"), equip: $("equip"), ret: $("reticle"), retInfo: $("ret-info"), hint: $("hint"), toast: $("toast"),
      boss: $("boss"), bossFill: $("boss-fill"), bossName: $("boss-name"), keys: $("keys"), hurt: $("hurt")
    };
    el.weapons.innerHTML = WEAPONS.map((w, i) => '<div class="wslot" data-i="' + i + '">' + ICONS[w.id] + '<b>' + w.name + '</b><small>鉄くず' + w.cost + '</small><em>装備中</em></div>').join("");
    this.slots = [...el.weapons.children];
    this.refreshKeys();
  },
  show(on) { el.hud.hidden = !on; el.ret.hidden = !on; el.keys.hidden = !on; if (!on) { el.boss.hidden = true; } },
  K(a) { return "<kbd>" + LABELS[a][input.device] + "</kbd>"; },
  refreshKeys() {
    const list = ["move", "jump", "magnet", "flip", "mp", "attack", "next", "craft", "neutral", "dash", "menu"];
    el.keys.innerHTML = list.map((a) => "<div><kbd>" + LABELS[a][input.device] + "</kbd>" + ACTION_NAMES[a].replace(/（.*）/, "") + "</div>").join("");
  },
  // editable=true なら、押して配置を変えられるボタンにする（移動・視点・コントローラーのメニューは固定）
  controlsTable(editable) {
    const list = ["move", "look", "dash", "jump", "magnet", "mp", "flip", "neutral", "attack", "next", "craft", "menu"];
    const fixed = (a, dev) => a === "move" || a === "look" || (a === "menu" && dev === "pad");
    const cell = (a, dev) => {
      const extra = a === "menu" && dev === "kb" ? '<small class="fx">（Escでも開く）</small>' : "";
      if (!editable || fixed(a, dev)) return "<td><kbd>" + LABELS[a][dev] + "</kbd>" + extra + (editable ? '<small class="fx">固定</small>' : "") + "</td>";
      return '<td><button type="button" class="bind" data-a="' + a + '" data-d="' + dev + '">' + LABELS[a][dev] + "</button>" + extra + "</td>";
    };
    return '<table class="ctl"><tr><th>操作</th><th>PSコントローラー</th><th>キーボード＋マウス</th></tr>' +
      list.map((a) => "<tr><td>" + ACTION_NAMES[a] + "</td>" + cell(a, "pad") + cell(a, "kb") + "</tr>").join("") + "</table>";
  },
  hint(html, dur = 10) { el.hint.innerHTML = html; el.hint.classList.add("on"); hintT = dur; },
  clearHint() { el.hint.classList.remove("on"); hintT = 0; },
  toast(text, dur = 2.6) { el.toast.textContent = text; el.toast.classList.add("on"); toastT = dur; },
  flashHurt() { el.hurt.classList.remove("on"); void el.hurt.offsetWidth; el.hurt.classList.add("on"); },
  setBoss(e) { el.boss.hidden = !e; if (e) el.bossName.textContent = e.cfg.name; },

  update(P, dt) {
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) el.hint.classList.remove("on"); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove("on"); }
    if (el.hud.hidden) return;
    set("hp", Math.ceil(P.hp) + "/" + P.maxHp, (v) => { el.hp.style.width = (P.hp / P.maxHp * 100) + "%"; el.hpN.textContent = v; });
    set("mp", Math.floor(P.mp) + "/" + P.maxMp, (v) => { el.mp.style.width = (P.mp / P.maxMp * 100) + "%"; el.mpN.textContent = v; });
    const pole = P.neutral ? "-" : P.pole;
    set("pole", pole, (v) => {
      el.pole.textContent = v === "-" ? "－" : v;
      el.pole.style.background = v === "-" ? "#6b7280" : POLE_CSS[v];
      el.pole.title = v === "-" ? "ニュートラル" : POLE_NAME[v];
      el.pole.classList.remove("pop"); void el.pole.offsetWidth; el.pole.classList.add("pop");
    });
    set("scrap", P.load + "/" + P.maxLoad, (v) => {
      el.scrapN.textContent = v;
      const k = Math.min(1, P.load / P.maxLoad);
      el.ring.style.strokeDashoffset = String(176 * (1 - k));
      el.scrapBox.classList.toggle("over", P.overloaded);
    });
    set("wep", P.sel + ":" + P.weapon + ":" + P.load, () => {
      this.slots.forEach((s, i) => {
        const w = WEAPONS[i];
        s.classList.toggle("sel", P.sel === i);
        s.classList.toggle("can", P.load >= w.cost && P.weapon !== w.id);
        s.classList.toggle("eq", P.weapon === w.id);
      });
      const w = WEAPONS.find((x) => x.id === P.weapon);
      el.equip.textContent = w ? "装備：" + w.name : "装備：素手";
    });
    // 照準：磁力の届く磁石にねらいが合うと色が変わって光る
    const A = P.aim, t = A.target;
    let cls = "", info = "";
    if (t && !P.neutral && !P.dead) {
      const range = P.range() * (input.held.mp && P.mp > 0.5 ? 1.7 : 1);
      const attract = t.pole !== P.pole;
      const verb = t.big ? (attract ? "引っぱられる" : "反発で飛ぶ") : (attract ? "引き寄せる" : "はじく");
      if (A.dist <= range) { cls = "on " + t.pole; info = verb + "　" + A.dist.toFixed(0) + "m"; }
      else { cls = "far " + t.pole; info = "届かない " + A.dist.toFixed(0) + "m／" + range.toFixed(0) + "m（" + LABELS.mp[input.device] + "でMP）"; }
    }
    set("ret", cls + "|" + info, () => { el.ret.className = cls; el.retInfo.textContent = info; });
    const B = G.boss;
    if (B && !el.boss.hidden) set("boss", Math.ceil(B.hp) + B.pole, () => { el.bossFill.style.width = (B.hp / B.maxHp * 100) + "%"; el.bossFill.style.background = "linear-gradient(90deg,#b42020," + POLE_CSS[B.pole] + ")"; });
  }
};
