/* ==========================================================================
   シャドバPS アナリティクス — 共通ロジック & 各ページ描画
   データ: window.PS_DATA（assets/ps-data.js / scripts/build_data.py が生成）
   ========================================================================== */
(function () {
  "use strict";
  const D = window.PS_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x, d = 1) => (x == null ? "—" : (x * 100).toFixed(d) + "%");
  const sign = (n) => (n > 0 ? "+" + n : String(n));
  const TEAM_ORDER = ["DFM", "MRG", "CR", "ZETA", "VRL", "LVH", "RDL", "RC"];
  const tc = (t) => `var(--team-${t})`;
  const tname = (t) => D.teams[t].name;
  const WD = { SUN: "日", MON: "月", TUE: "火", WED: "水", THU: "木", FRI: "金", SAT: "土" };
  const fmtDate = (d, wd) => { const [, m, dd] = d.split("-"); return `${+m}/${+dd}${wd ? "(" + (WD[wd] || wd) + ")" : ""}`; };
  const secLabel = (m) => `第${m.section}節${m.half ? " " + m.half : ""}`;

  // ------------------------------------------------------------------ layout
  const NAV = [
    ["index.html", "ポータル"],
    ["analysis.html", "解説"],
    ["results.html", "試合結果"],
    ["teams.html", "チーム"],
    ["players.html", "選手DB"],
    ["classes.html", "クラス分析"],
    ["guide.html", "大会ガイド"],
    ["about.html", "データについて"],
  ];
  function layout() {
    const here = (location.pathname.split("/").pop() || "index.html");
    const header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML = `<div class="inner">
      <a class="brand" href="index.html"><span class="brand-mark">PS</span><span>シャドバPS アナリティクス<br><small>Premier Series 26-27 非公式解析</small></span></a>
      <nav class="nav" aria-label="メインナビゲーション">${NAV.map(([h, l]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <button class="theme-btn" type="button" aria-label="ライト/ダーク切替" title="ライト/ダーク切替">◐</button>
    </div>`;
    document.body.prepend(header);
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `<div class="inner">
      <p><b>シャドバPS アナリティクス</b> は「Shadowverse Premier Series 26-27」の試合結果をファンが独自に集計・解析した<b>非公式</b>サイトです。Cygames および各チームとは関係ありません。
      データは第${D.meta.last_section}節（バトル詳細は第${D.meta.detailed_through}節）まで反映、最終生成 ${D.meta.generated}。正確な情報は<a href="https://ps.shadowverse-wb.com/26-27/" target="_blank" rel="noopener">公式サイト</a>をご確認ください。</p>
      <p>出典・集計方法は <a href="about.html">データについて</a> を参照。『Shadowverse: Worlds Beyond』は株式会社Cygamesの商標です。</p>
    </div>`;
    document.body.append(footer);
    // theme
    const btn = $(".theme-btn", header);
    let saved = null;
    try { saved = localStorage.getItem("ps-theme"); } catch (e) { /* storage unavailable */ }
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("ps-theme", next); } catch (e) { /* ignore */ }
    });
  }

  // ------------------------------------------------------------------ tooltip
  let tipEl;
  function tip(html, ev) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tooltip"; tipEl.setAttribute("role", "status"); document.body.append(tipEl); }
    if (html == null) { tipEl.classList.remove("show"); return; }
    tipEl.innerHTML = html;
    tipEl.classList.add("show");
    const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tipEl.style.left = Math.max(8, x) + "px";
    tipEl.style.top = Math.max(8, y) + "px";
  }
  function bindTips(root) {
    root.addEventListener("pointermove", (e) => {
      const t = e.target.closest("[data-tip]");
      if (t && root.contains(t)) tip(t.getAttribute("data-tip"), e); else tip(null);
    });
    root.addEventListener("pointerleave", () => tip(null));
  }

  // ------------------------------------------------------------------ small html helpers
  const teamChip = (t, opts = {}) => `<a class="team${opts.compact ? " compact" : ""}" href="teams.html?team=${t}" style="--c:${tc(t)}" title="${esc(tname(t))}"><span class="sw"></span>${opts.dual ? `<span class="tn tn-full">${esc(tname(t))}</span><span class="tn tn-short">${t}</span>` : `<span class="tn">${esc(opts.short ? t : tname(t))}</span>`}</a>`;
  const formBadges = (arr) => arr.map((r) => `<span class="wl ${r}" aria-label="${r === "W" ? "勝ち" : "負け"}">${r === "W" ? "勝" : "負"}</span>`).join("");
  const playerLink = (n) => `<a href="players.html?name=${encodeURIComponent(n)}">${esc(n)}</a>`;
  const rec = (a) => `${a[0]}-${a[1]}`;
  const recRate = (a) => (a[0] + a[1] ? a[0] / (a[0] + a[1]) : null);

  // ラウンド勝率（バトル勝率 p, B4 まで必ず実施, 2-2 で B5）
  function roundWinProb(pa, pb) {
    const p = (pa - pa * pb) / (pa + pb - 2 * pa * pb);
    const q = 1 - p;
    const c = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
    const ge3 = c(4, 3) * p ** 3 * q + p ** 4;
    const eq2 = c(4, 2) * p ** 2 * q ** 2;
    return ge3 + eq2 * p;
  }

  // ------------------------------------------------------------------ charts
  const NS = "http://www.w3.org/2000/svg";
  function svgEl(w, h, label) {
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">`;
  }

  /** 順位推移（バンプチャート）。focus: 強調するチーム配列 */
  function rankChart(el, focus = null) {
    const n = D.meta.last_section;
    const W = 760, H = 330, L = 34, R = 118, T = 16, B = 34;
    const x = (i) => L + (i * (W - L - R)) / (n - 1);
    const y = (r) => T + ((r - 1) * (H - T - B)) / 7;
    let s = svgEl(W, H, "節ごとの順位推移");
    s += `<g class="grid">`;
    for (let r = 1; r <= 8; r++) s += `<line x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}"/>`;
    s += `</g>`;
    // playoff line
    const yp = (y(4) + y(5)) / 2;
    s += `<line x1="${L}" x2="${W - R}" y1="${yp}" y2="${yp}" stroke="var(--accent)" stroke-dasharray="4 4" stroke-width="1.2"/>`;
    s += `<text x="${W - R + 12}" y="${yp + 3.5}" class="muted-text" style="font-size:9.5px">― PO圏 ―</text>`;
    for (let r = 1; r <= 8; r++) s += `<text x="${L - 10}" y="${y(r) + 4}" text-anchor="end">${r}</text>`;
    for (let i = 0; i < n; i++) s += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle">${i + 1}</text>`;
    s += `<text x="${(L + W - R) / 2}" y="${H}" text-anchor="middle" class="muted-text" style="font-size:10.5px">節</text>`;
    const order = [...TEAM_ORDER].sort((a, b) => (focus && focus.includes(a) ? 1 : 0) - (focus && focus.includes(b) ? 1 : 0));
    for (const t of order) {
      const hist = D.rank_history[t];
      const on = !focus || focus.includes(t);
      const col = on ? tc(t) : "var(--axis)";
      const pts = hist.map((r, i) => `${x(i)},${y(r)}`).join(" ");
      s += `<g data-team="${t}" opacity="${on ? 1 : 0.55}">`;
      s += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${on && focus ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      hist.forEach((r, i) => {
        const w = D.wins_history[t][i];
        const tipHtml = `<b>${esc(tname(t))}</b><div class="row"><span>第${i + 1}節終了時</span><span>${r}位</span></div><div class="row"><span>勝敗</span><span>${w}-${i + 1 - w}</span></div>`;
        s += `<circle cx="${x(i)}" cy="${y(r)}" r="4.5" fill="${col}" stroke="var(--surface-1)" stroke-width="2"/>`;
        s += `<circle cx="${x(i)}" cy="${y(r)}" r="11" fill="transparent" data-tip="${esc(tipHtml)}"/>`;
      });
      const last = hist[hist.length - 1];
      s += `<text x="${x(n - 1) + 12}" y="${y(last) + 4}" class="${on ? "lbl-strong" : "muted-text"}">${last}. ${t}</text>`;
      s += `</g>`;
    }
    s += `</svg>`;
    el.innerHTML = `<div class="chart">${s}</div>`;
    bindTips(el);
  }

  /** 横棒（勝率 or 値）。rows: [{label, value, sub, color, tip, lo, hi}] */
  function hbar(el, rows, opt = {}) {
    const max = opt.max ?? Math.max(...rows.map((r) => r.value)) * 1.08;
    const min = opt.min ?? 0;
    const W = 640, rowH = opt.rowH || 30, L = opt.left || 112, R = opt.right || 92, T = 8;
    const H = T + rows.length * rowH + 22;
    const x = (v) => L + ((v - min) / (max - min)) * (W - L - R);
    let s = svgEl(W, H, opt.label || "棒グラフ");
    s += `<g class="grid">`;
    const ticks = opt.ticks || [min, (min + max) / 2, max];
    ticks.forEach((t) => (s += `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - 22}"/>`));
    s += `</g>`;
    ticks.forEach((t) => (s += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle" class="muted-text">${opt.tickFmt ? opt.tickFmt(t) : t}</text>`));
    if (opt.ref != null) s += `<line x1="${x(opt.ref)}" x2="${x(opt.ref)}" y1="${T - 2}" y2="${H - 20}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>`;
    rows.forEach((r, i) => {
      const yy = T + i * rowH;
      const bh = Math.min(14, rowH - 12);
      const y0 = yy + (rowH - bh) / 2;
      s += `<text x="${L - 10}" y="${yy + rowH / 2 + 4}" text-anchor="end" class="lbl-strong">${esc(r.label)}</text>`;
      const x0 = x(Math.max(min, 0)), x1 = x(r.value);
      const bx = Math.min(x0, x1), bw = Math.max(2, Math.abs(x1 - x0));
      s += `<rect x="${bx}" y="${y0}" width="${bw}" height="${bh}" rx="4" fill="${r.color || "var(--accent)"}"/>`;
      if (r.lo != null) {
        s += `<line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${y0 + bh / 2}" y2="${y0 + bh / 2}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;
        s += `<line x1="${x(r.lo)}" x2="${x(r.lo)}" y1="${y0 + 2}" y2="${y0 + bh - 2}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;
        s += `<line x1="${x(r.hi)}" x2="${x(r.hi)}" y1="${y0 + 2}" y2="${y0 + bh - 2}" stroke="var(--text-secondary)" stroke-width="1.5"/>`;
      }
      s += `<text x="${W - R + 8}" y="${yy + rowH / 2 + 4}" class="lbl-strong">${esc(r.text ?? r.value)}</text>`;
      if (r.sub) s += `<text x="${W - R + 8 + (String(r.text ?? r.value).length * 7.4) + 4}" y="${yy + rowH / 2 + 4}" class="muted-text">${esc(r.sub)}</text>`;
      s += `<rect x="0" y="${yy}" width="${W}" height="${rowH}" fill="transparent" data-tip="${esc(r.tip || "")}"/>`;
    });
    s += `</svg>`;
    el.innerHTML = `<div class="chart">${s}</div>`;
    bindTips(el);
  }

  /** 勝敗の左右振り分け棒（負けを左、勝ちを右） */
  function wlBars(el, rows, label) {
    const W = 560, rowH = 30, L = 120, T = 6;
    const max = Math.max(...rows.map((r) => Math.max(r.w, r.l)), 1);
    const H = T + rows.length * rowH + 20;
    const mid = L + (W - L) / 2, half = (W - L) / 2 - 34;
    let s = svgEl(W, H, label);
    s += `<line x1="${mid}" x2="${mid}" y1="${T}" y2="${H - 18}" stroke="var(--axis)"/>`;
    s += `<text x="${mid - 6}" y="${H - 4}" text-anchor="end" class="muted-text">← 負け</text><text x="${mid + 6}" y="${H - 4}" class="muted-text">勝ち →</text>`;
    rows.forEach((r, i) => {
      const yy = T + i * rowH, bh = 14, y0 = yy + (rowH - bh) / 2;
      const lw = (r.l / max) * half, ww = (r.w / max) * half;
      s += `<text x="${L - 10}" y="${yy + rowH / 2 + 4}" text-anchor="end" class="lbl-strong">${esc(r.label)}</text>`;
      if (r.l) s += `<rect x="${mid - lw - 1}" y="${y0}" width="${lw}" height="${bh}" rx="4" fill="var(--div-neg-2)"/>`;
      if (r.w) s += `<rect x="${mid + 1}" y="${y0}" width="${ww}" height="${bh}" rx="4" fill="var(--div-pos-2)"/>`;
      s += `<text x="${mid - lw - 6}" y="${yy + rowH / 2 + 4}" text-anchor="end">${r.l}</text>`;
      s += `<text x="${mid + ww + 6}" y="${yy + rowH / 2 + 4}">${r.w}</text>`;
      const n = r.w + r.l;
      s += `<rect x="0" y="${yy}" width="${W}" height="${rowH}" fill="transparent" data-tip="${esc(`<b>${esc(r.label)}</b><div class="row"><span>${r.w}勝 ${r.l}敗</span><span>${n ? pct(r.w / n) : "—"}</span></div>${r.extra || ""}`)}"/>`;
    });
    s += `</svg>`;
    el.innerHTML = `<div class="chart">${s}</div>`;
    bindTips(el);
  }

  function divColor(rate, n) {
    if (!n) return "transparent";
    if (n < 3) return "var(--surface-2)";
    if (rate >= 0.7) return "var(--div-pos-3)";
    if (rate >= 0.6) return "var(--div-pos-2)";
    if (rate > 0.5) return "var(--div-pos-1)";
    if (rate === 0.5) return "var(--div-mid)";
    if (rate > 0.4) return "var(--div-neg-1)";
    if (rate > 0.3) return "var(--div-neg-2)";
    return "var(--div-neg-3)";
  }
  const divInk = (rate, n = 99) => (n < 3 ? "var(--text-muted)" : rate >= 0.7 || rate <= 0.3 ? "#fff" : "var(--text-primary)");
  const heatLegend = `<div class="heat-legend"><span>低い</span><i style="background:var(--div-neg-3)"></i><i style="background:var(--div-neg-2)"></i><i style="background:var(--div-neg-1)"></i><i style="background:var(--div-mid)"></i><i style="background:var(--div-pos-1)"></i><i style="background:var(--div-pos-2)"></i><i style="background:var(--div-pos-3)"></i><span>高い（50%=灰）</span><i style="background:var(--surface-2);margin-left:10px"></i><span>3戦未満（参考値）</span></div>`;

  // ------------------------------------------------------------------ table sort
  function sortable(table, rows, render, initial) {
    let key = initial?.key, dir = initial?.dir || -1;
    const ths = $$("th[data-key]", table);
    const apply = () => {
      const sorted = [...rows].sort((a, b) => {
        const va = a[key], vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "string" ? va.localeCompare(vb, "ja") : va - vb) * dir;
      });
      ths.forEach((th) => { th.classList.remove("sorted-asc", "sorted-desc"); if (th.dataset.key === key) th.classList.add(dir > 0 ? "sorted-asc" : "sorted-desc"); });
      render(sorted);
    };
    ths.forEach((th) => {
      th.classList.add("sortable");
      th.tabIndex = 0;
      const go = () => { if (key === th.dataset.key) dir = -dir; else { key = th.dataset.key; dir = th.dataset.dir === "asc" ? 1 : -1; } apply(); };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    apply();
    return { set(newRows) { rows = newRows; apply(); } };
  }

  // ------------------------------------------------------------------ shared components
  function standingsTable(el, opt = {}) {
    const sim = D.simulation.teams;
    const rows = D.standings.map((r) => `
      <tr class="${r.rank === D.meta.playoff_spots ? "playoff-line" : ""}">
        <td><span class="rank ${r.rank <= D.meta.playoff_spots ? "top" : ""}">${r.rank}</span></td>
        <td>${teamChip(r.team, { short: opt.compact })}</td>
        <td class="r num"><b>${r.w}</b>-${r.l}</td>
        <td class="r num ${r.diff > 0 ? "pos" : r.diff < 0 ? "neg" : ""}">${sign(r.diff)}</td>
        <td class="r num">${r.pts}</td>
        ${opt.compact ? "" : `<td class="r num">${rec(r.indiv)}</td><td class="r num">${rec(r.teambattle)}</td>`}
        <td class="nowrap">${formBadges(r.form)}</td>
        ${opt.noSim ? "" : `<td class="r num">${sim[r.team].playoff > 0 && sim[r.team].playoff < 0.005 ? "&lt;1%" : pct(sim[r.team].playoff, 0)}</td>`}
      </tr>`).join("");
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>チーム</th><th class="r" title="ROUND勝敗（勝ち点）">勝敗</th><th class="r" title="バトル勝敗差">差</th><th class="r" title="獲得バトルポイント">Pt</th>
      ${opt.compact ? "" : `<th class="r" title="バトル1〜3（選手戦）">選手戦</th><th class="r" title="バトル4・5（チーム戦）">チーム戦</th>`}
      <th>直近5</th>${opt.noSim ? "" : `<th class="r" title="モンテカルロ10万回によるプレーオフ（上位${D.meta.playoff_spots}）進出確率">PO確率</th>`}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="note">順位決定：①勝ち点（ROUND勝利数）②バトル勝敗差 ③獲得ポイント ④直接対決のバトル勝敗差。点線より上がプレーオフ圏（上位${D.meta.playoff_spots}・報道ベース）。${opt.noSim ? "" : "PO確率は当サイトの試算（<a href=\"analysis.html#outlook\">算出方法</a>）。"}</p>`;
  }

  function matchCard(m, open = false) {
    const done = m.s1 != null;
    const w1 = done && m.s1 > m.s2, w2 = done && m.s2 > m.s1;
    const scoreHtml = done ? `<span class="${w1 ? "w" : "l"}">${m.s1}</span> - <span class="${w2 ? "w" : "l"}">${m.s2}</span>` : `<span class="l" style="font-size:1rem">${m.time || "未定"}</span>`;
    let body = "";
    if (m.battles.length) {
      body = m.battles.map((b) => {
        const team = b.no >= 4;
        const name1 = team ? "チーム戦" : b.p1, name2 = team ? "チーム戦" : b.p2;
        const pool = (arr, used) => `<div class="pool">${arr.map((c) => `<span class="cls ${c === used ? "used" : "dim"}">${esc(c)}</span>`).join("")}</div>`;
        const pl = (side) => {
          const win = b.winner === side;
          const nm = side === 1 ? name1 : name2;
          const first = b.first === side ? `<span class="fs">先攻</span>` : `<span class="fs">後攻</span>`;
          return `<div class="pl ${side === 2 ? "right" : ""} ${win ? "win" : "lose"}"><span class="nm">${team ? esc(nm) : playerLink(nm)}</span>${first}${pool(side === 1 ? b.pool1 : b.pool2, side === 1 ? b.c1 : b.c2)}</div>`;
        };
        return `<div class="battle"><span class="bno">BATTLE ${b.no}${team ? "<br>チーム戦" : ""}</span>${pl(1)}<span class="vs">vs</span>${pl(2)}<span class="vid">${b.video ? `<a href="${esc(b.video)}" target="_blank" rel="noopener">▶ 試合映像</a>` : ""}</span></div>`;
      }).join("");
      body += `<p class="note" style="padding:0 16px 8px">◆=勝者。クラス枠は候補デッキ（濃い表示が実際に使用したクラス、取り消し線は未使用）。</p>`;
    } else if (done) {
      body = `<p class="note" style="padding:8px 16px">この試合のバトル詳細は未収録です（スコアは${esc(m.source || "公式発表")}より）。</p>`;
    } else {
      const sim = D.simulation.strength;
      const p = roundWinProb(sim[m.t1], sim[m.t2]);
      body = `<p class="note" style="padding:8px 16px">未実施。当サイトの試算勝率：${esc(m.t1)} ${pct(p, 0)} / ${esc(m.t2)} ${pct(1 - p, 0)}</p>`;
    }
    return `<details class="match"${open ? " open" : ""} id="${m.id}">
      <summary>
        <div class="side">${teamChip(m.t1, { dual: true })}${w1 ? '<span class="winner-tag">WIN</span>' : ""}</div>
        <div class="score">${scoreHtml}</div>
        <div class="side right">${w2 ? '<span class="winner-tag">WIN</span>' : ""}${teamChip(m.t2, { dual: true })}</div>
        <span class="chev" aria-hidden="true">▶</span>
      </summary>
      <div class="match-body">${body}</div>
    </details>`;
  }

  function groupMatchdays(ms) {
    const g = new Map();
    for (const m of ms) {
      const k = `${m.section}|${m.half}|${m.date}`;
      if (!g.has(k)) g.set(k, { section: m.section, half: m.half, date: m.date, weekday: m.weekday, time: m.time, list: [] });
      g.get(k).list.push(m);
    }
    return [...g.values()];
  }

  // ------------------------------------------------------------------ pages
  const pages = {};

  pages.index = function () {
    const lead = D.standings[0];
    const players = D.players.filter((p) => p.n >= 5);
    const topP = [...players].sort((a, b) => b.wr - a.wr || b.w - a.w)[0];
    const cls = D.class_stats.all.classes;
    const most = [...cls].sort((a, b) => b.picks - a.picks)[0];
    const fr = D.first_rate;
    $("#hero-meta").innerHTML = `
      <span class="pill">第<b>${D.meta.last_section}</b>節終了時点</span>
      <span class="pill"><b>${D.meta.n_matches_played}</b> / 56 ROUND 消化</span>
      <span class="pill">解析バトル数 <b>${D.meta.n_battles_detailed}</b></span>
      <span class="pill">年間優勝賞金 <b>1億円</b></span>`;
    $("#tiles").innerHTML = `
      <div class="tile"><div class="label">首位</div><div class="value">${esc(lead.team)}</div><div class="sub">${esc(tname(lead.team))}／${lead.w}勝${lead.l}敗・差${sign(lead.diff)}</div></div>
      <div class="tile"><div class="label">個人勝率トップ（5戦以上）</div><div class="value">${esc(topP.name)}</div><div class="sub">${esc(topP.team)}／${topP.w}勝${topP.l}敗（${pct(topP.wr)}）</div></div>
      <div class="tile"><div class="label">最多使用クラス</div><div class="value">${esc(most.class)}</div><div class="sub">${most.picks}回（使用率${pct(most.share)}）・勝率${pct(most.wr)}</div></div>
      <div class="tile"><div class="label">先攻勝率</div><div class="value">${pct(fr.rate)}</div><div class="sub">${fr.first_wins}勝${fr.second_wins}敗（全${fr.n}バトル）</div></div>`;
    standingsTable($("#standings"), { compact: true });
    // latest
    const lastSec = D.meta.last_section;
    const latest = D.matches.filter((m) => m.section === lastSec && m.s1 != null);
    $("#latest-title").textContent = `第${lastSec}節の結果（${fmtDate(latest[0].date, latest[0].weekday)}）`;
    $("#latest").innerHTML = latest.map((m) => matchCard(m)).join("");
    // next
    const upcoming = D.matches.filter((m) => m.s1 == null);
    const nextSec = upcoming.length ? upcoming[0].section : null;
    const nexts = upcoming.filter((m) => m.section === nextSec);
    const st = D.simulation.strength;
    $("#next-title").textContent = nextSec ? `次節：第${nextSec}節` : "日程終了";
    $("#next").innerHTML = `<ul class="list-plain">${nexts.map((m) => {
      const p = roundWinProb(st[m.t1], st[m.t2]);
      return `<li><div class="fixture"><span>${teamChip(m.t1, { short: true })} <span class="muted">vs</span> ${teamChip(m.t2, { short: true })}</span><span class="when">${fmtDate(m.date, m.weekday)}${m.half ? " " + m.half : ""}</span></div><div class="prob">試算勝率 ${m.t1} ${pct(p, 0)} − ${pct(1 - p, 0)} ${m.t2}</div></li>`;
    }).join("")}</ul>`;
    rankChart($("#rank-chart"));
  };

  pages.results = function () {
    const sel = $("#sec-select"), chips = $("#team-chips");
    const secs = [...new Set(D.matches.map((m) => m.section))];
    sel.innerHTML = `<option value="all">全節</option>` + secs.map((s) => `<option value="${s}">第${s}節</option>`).join("");
    chips.innerHTML = `<button class="chip" aria-pressed="true" data-team="all">全チーム</button>` + TEAM_ORDER.map((t) => `<button class="chip" aria-pressed="false" data-team="${t}" style="--c:${tc(t)}"><span class="sw"></span>${t}</button>`).join("");
    const params = new URLSearchParams(location.search);
    let team = params.get("team") || "all", sec = params.get("section") || "all";
    let showFuture = false;
    const fut = $("#show-future");
    const render = () => {
      $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.team === team)));
      sel.value = sec;
      let ms = D.matches.filter((m) => (team === "all" || m.t1 === team || m.t2 === team) && (sec === "all" || m.section === +sec) && (showFuture || m.s1 != null || sec !== "all"));
      ms = [...ms].sort((a, b) => (a.s1 == null) - (b.s1 == null) || (a.s1 == null ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.round - b.round);
      const days = groupMatchdays(ms);
      $("#result-list").innerHTML = days.map((d) => `
        <div class="matchday"><div class="matchday-head"><h3>第${d.section}節${d.half ? " " + d.half : ""}</h3><span class="muted">${fmtDate(d.date, d.weekday)} ${d.time || ""}</span></div>
        ${d.list.map((m) => matchCard(m, team !== "all" && d.list.length <= 2)).join("")}</div>`).join("") || `<p class="muted">該当する試合はありません。</p>`;
      if (team !== "all") {
        const log = D.team_log[team];
        const w = log.filter((x) => x.win).length;
        $("#team-summary").innerHTML = `<div class="card" style="margin-bottom:16px">${teamChip(team)} <span class="secondary">ここまで ${w}勝${log.length - w}敗。</span> <a href="teams.html?team=${team}">チーム詳細を見る →</a></div>`;
      } else $("#team-summary").innerHTML = "";
    };
    chips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; team = b.dataset.team; render(); });
    sel.addEventListener("change", () => { sec = sel.value; render(); });
    fut.addEventListener("change", () => { showFuture = fut.checked; render(); });
    render();
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) { t.open = true; t.scrollIntoView(); } }
  };

  pages.teams = function () {
    const chips = $("#team-chips");
    chips.innerHTML = TEAM_ORDER.map((t) => `<button class="chip" aria-pressed="false" data-team="${t}" style="--c:${tc(t)}"><span class="sw"></span>${esc(tname(t))}</button>`).join("");
    // overview table
    const ov = D.standings.map((r) => {
      const slot = (k) => recRate(r.slot[k]);
      return { team: r.team, rank: r.rank, w: r.w, l: r.l, diff: r.diff, indiv: recRate(r.indiv), tb: recRate(r.teambattle), first: recRate(r.first), second: recRate(r.second), b1: slot("1"), b2: slot("2"), b3: slot("3"), b4: slot("4"), f5: r.full_5 ? r.full_5_w / r.full_5 : null, r };
    });
    const cell = (v, n) => `<td class="c num" style="background:${divColor(v, n || 1)};color:${divInk(v)}">${pct(v, 0)}</td>`;
    const tableEl = $("#overview");
    tableEl.innerHTML = `<div class="table-wrap"><table class="heat-tbl"><thead><tr>
      <th data-key="rank" data-dir="asc">#</th><th>チーム</th><th class="c" data-key="indiv">選手戦</th><th class="c" data-key="tb">チーム戦</th>
      <th class="c" data-key="b1">B1</th><th class="c" data-key="b2">B2</th><th class="c" data-key="b3">B3</th><th class="c" data-key="b4">B4</th>
      <th class="c" data-key="first">先攻</th><th class="c" data-key="second">後攻</th><th class="c" data-key="f5">フルセット</th></tr></thead><tbody></tbody></table></div>${heatLegend}`;
    sortable($("table", tableEl), ov, (rows) => {
      $("tbody", tableEl).innerHTML = rows.map((o) => {
        const r = o.r;
        return `<tr><td class="num">${o.rank}</td><td>${teamChip(o.team, { short: true })}</td>
        <td class="c num" style="background:${divColor(o.indiv, 1)};color:${divInk(o.indiv)}" data-tip="${esc(`選手戦 ${rec(r.indiv)}`)}">${pct(o.indiv, 0)}</td>
        <td class="c num" style="background:${divColor(o.tb, 1)};color:${divInk(o.tb)}" data-tip="${esc(`チーム戦 ${rec(r.teambattle)}`)}">${pct(o.tb, 0)}</td>
        ${["1", "2", "3", "4"].map((k) => `<td class="c num" style="background:${divColor(recRate(r.slot[k]), 1)};color:${divInk(recRate(r.slot[k]))}" data-tip="${esc(`BATTLE ${k}: ${rec(r.slot[k])}`)}">${pct(recRate(r.slot[k]), 0)}</td>`).join("")}
        <td class="c num" style="background:${divColor(o.first, 1)};color:${divInk(o.first)}" data-tip="${esc(`先攻 ${rec(r.first)}`)}">${pct(o.first, 0)}</td>
        <td class="c num" style="background:${divColor(o.second, 1)};color:${divInk(o.second)}" data-tip="${esc(`後攻 ${rec(r.second)}`)}">${pct(o.second, 0)}</td>
        <td class="c num" style="background:${divColor(o.f5, r.full_5)};color:${divInk(o.f5, r.full_5)}" data-tip="${esc(`5バトルまでもつれた試合 ${r.full_5_w}勝${r.full_5 - r.full_5_w}敗`)}">${r.full_5_w}-${r.full_5 - r.full_5_w}</td></tr>`;
      }).join("");
    }, { key: "rank", dir: 1 });
    bindTips(tableEl);

    const show = (t) => {
      $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.team === t)));
      const r = D.standings.find((x) => x.team === t);
      const sim = D.simulation.teams[t];
      const log = D.team_log[t];
      const roster = D.roster[t].map((n) => D.players.find((p) => p.name === n));
      const sos = D.sos[t];
      const p = $("#team-panel");
      p.style.setProperty("--c", tc(t));
      p.innerHTML = `
        <div class="ph"><div class="avatar" style="--c:${tc(t)}">${esc(t.slice(0, 2))}</div><div><h2 style="margin:0">${esc(tname(t))}</h2><div class="muted">現在 <b style="color:var(--text-primary)">${r.rank}位</b>・${r.w}勝${r.l}敗・バトル差 ${sign(r.diff)}・連続 ${r.streak.startsWith("W") ? r.streak.slice(1) + "連勝中" : r.streak.slice(1) + "連敗中"}</div></div></div>
        <div class="grid g-4" style="margin-bottom:16px">
          <div class="tile"><div class="label">選手戦（B1〜3）</div><div class="value num">${rec(r.indiv)}</div><div class="sub">勝率 ${pct(recRate(r.indiv))}</div></div>
          <div class="tile"><div class="label">チーム戦（B4・5）</div><div class="value num">${rec(r.teambattle)}</div><div class="sub">勝率 ${pct(recRate(r.teambattle))}</div></div>
          <div class="tile"><div class="label">フルセット（5バトル）</div><div class="value num">${r.full_5_w}-${r.full_5 - r.full_5_w}</div><div class="sub">4-0勝 ${r.sweeps}回／0-4敗 ${r.swept}回</div></div>
          <div class="tile"><div class="label">PO進出確率（試算）</div><div class="value num">${pct(sim.playoff, 0)}</div><div class="sub">残り：${sos.opps.join("・") || "なし"}</div></div>
        </div>
        <div class="grid g-2">
          <div class="card"><h3>順位推移</h3><div id="team-rank"></div></div>
          <div class="card"><h3>バトル枠別の勝敗</h3><div id="team-slot"></div><p class="note">B1は3デッキ、B2・B3は2デッキから選択する選手戦。B4はチーム相談可のチーム戦、B5は2-2時のみ。</p></div>
        </div>
        <div class="grid g-2" style="margin-top:16px">
          <div class="card"><h3>クラス別成績</h3><div id="team-class"></div></div>
          <div class="card"><h3>直接対決</h3><div class="table-wrap"><table><thead><tr><th>相手</th><th>結果</th></tr></thead><tbody>
            ${TEAM_ORDER.filter((o) => o !== t).map((o) => `<tr><td>${teamChip(o)}</td><td class="num">${D.h2h[t][o].map((s) => { const [a, b] = s.split("-").map(Number); return `<span class="${a > b ? "pos" : "neg"}"><b>${s}</b></span>`; }).join("　") || '<span class="muted">未対戦</span>'}</td></tr>`).join("")}
          </tbody></table></div></div>
        </div>
        <div class="card flush" style="margin-top:16px"><div class="card-head"><h3>所属選手</h3><span class="muted">選手戦（B1〜3）の個人成績</span></div><div class="table-wrap"><table><thead><tr><th>選手</th><th class="r">勝敗</th><th class="r">勝率</th><th class="r">出場節</th><th>主な使用クラス</th><th>直近</th></tr></thead><tbody>
          ${roster.map((pl) => `<tr><td>${playerLink(pl.name)}</td><td class="r num">${pl.w}-${pl.l}</td><td class="r num">${pct(pl.wr)}</td><td class="r num">${pl.apps}</td><td>${pl.main_class ? `<span class="cls">${esc(pl.main_class)}</span>` : '<span class="muted">出場なし</span>'}</td><td>${formBadges(pl.recent)}</td></tr>`).join("")}
        </tbody></table></div></div>
        <div class="card flush" style="margin-top:16px"><div class="card-head"><h3>試合ログ</h3><a href="results.html?team=${t}">試合詳細 →</a></div><div class="table-wrap"><table><thead><tr><th>節</th><th>日付</th><th>相手</th><th class="r">スコア</th><th>結果</th></tr></thead><tbody>
          ${log.map((x) => `<tr><td>第${x.section}節</td><td class="num">${fmtDate(x.date)}</td><td>${teamChip(x.opp)}</td><td class="r num"><a href="results.html?team=${t}#${x.id}">${x.for}-${x.against}</a></td><td>${formBadges([x.win ? "W" : "L"])}</td></tr>`).join("")}
        </tbody></table></div></div>`;
      rankChart($("#team-rank"), [t]);
      wlBars($("#team-slot"), ["1", "2", "3", "4", "5"].map((k) => ({ label: `BATTLE ${k}`, w: r.slot[k][0], l: r.slot[k][1] })).concat([{ label: "先攻", w: r.first[0], l: r.first[1] }, { label: "後攻", w: r.second[0], l: r.second[1] }]), "バトル枠別の勝敗");
      wlBars($("#team-class"), D.classes.map((c) => ({ label: c, w: D.team_class[t][c][0], l: D.team_class[t][c][1] })), "クラス別の勝敗");
      history.replaceState(null, "", `?team=${t}`);
    };
    chips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) show(b.dataset.team); });
    const q = new URLSearchParams(location.search).get("team");
    show(TEAM_ORDER.includes(q) ? q : D.standings[0].team);
  };

  pages.players = function () {
    const chips = $("#team-chips");
    chips.innerHTML = `<button class="chip" aria-pressed="true" data-team="all">全チーム</button>` + TEAM_ORDER.map((t) => `<button class="chip" aria-pressed="false" data-team="${t}" style="--c:${tc(t)}"><span class="sw"></span>${t}</button>`).join("");
    let team = "all", query = "", minN = 0;
    const rows = D.players.map((p) => ({ ...p, f_n: p.first[0] + p.first[1], f_wr: recRate(p.first), s_wr: recRate(p.second), pre_wr: recRate(p.phase.pre), post_wr: recRate(p.phase.post) }));
    const tableEl = $("#player-table");
    tableEl.innerHTML = `<div class="table-wrap"><table><thead><tr>
      <th data-key="name" data-dir="asc">選手</th><th data-key="team" data-dir="asc">チーム</th><th class="r" data-key="w">勝</th><th class="r" data-key="l">敗</th>
      <th class="r" data-key="wr">勝率</th><th class="r" data-key="adj_wr" title="出場数の少なさを補正した勝率（Beta(5,5)事前分布）">補正勝率</th><th class="r" data-key="apps">出場節</th>
      <th class="r" data-key="f_wr">先攻</th><th class="r" data-key="s_wr">後攻</th><th class="r" data-key="pre_wr">前期</th><th class="r" data-key="post_wr">後期</th><th class="r" data-key="best_streak">最長連勝</th><th>主クラス</th><th>直近5</th></tr></thead><tbody></tbody></table></div>`;
    const draw = (sorted) => {
      const list = sorted.filter((p) => (team === "all" || p.team === team) && (!query || p.name.toLowerCase().includes(query)) && p.n >= minN);
      $("tbody", tableEl).innerHTML = list.map((p) => `<tr data-name="${esc(p.name)}" style="cursor:pointer">
        <td><b>${esc(p.name)}</b></td><td>${teamChip(p.team, { short: true })}</td><td class="r num">${p.w}</td><td class="r num">${p.l}</td>
        <td class="r num bar-cell">${pct(p.wr)}<div class="minibar"><i style="width:${(p.wr || 0) * 100}%"></i></div></td>
        <td class="r num">${pct(p.adj_wr)}</td><td class="r num">${p.apps}</td>
        <td class="r num">${p.first[0]}-${p.first[1]}</td><td class="r num">${p.second[0]}-${p.second[1]}</td>
        <td class="r num">${rec(p.phase.pre)}</td><td class="r num">${rec(p.phase.post)}</td><td class="r num">${p.best_streak}</td>
        <td>${p.main_class ? `<span class="cls">${esc(p.main_class)}</span>` : "—"}</td><td class="nowrap">${formBadges(p.recent)}</td></tr>`).join("") || `<tr><td colspan="14" class="muted">該当なし</td></tr>`;
      $("#player-count").textContent = `${list.length}名`;
    };
    const s = sortable($("table", tableEl), rows, draw, { key: "wr", dir: -1 });
    chips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; team = b.dataset.team; $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c === b))); s.set(rows); });
    $("#q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); s.set(rows); });
    $("#min-n").addEventListener("change", (e) => { minN = +e.target.value; s.set(rows); });
    tableEl.addEventListener("click", (e) => { const tr = e.target.closest("tr[data-name]"); if (tr) showPlayer(tr.dataset.name, true); });

    // CI chart
    const ci = D.players.filter((p) => p.n >= 5).sort((a, b) => b.adj_wr - a.adj_wr);
    hbar($("#ci-chart"), ci.map((p) => ({ label: p.name, value: p.wr, lo: p.ci[0], hi: p.ci[1], color: tc(p.team), text: pct(p.wr, 0), sub: `${p.w}-${p.l}`, tip: `<b>${esc(p.name)}</b>（${esc(p.team)}）<div class="row"><span>勝敗</span><span>${p.w}-${p.l}</span></div><div class="row"><span>勝率</span><span>${pct(p.wr)}</span></div><div class="row"><span>95%信頼区間</span><span>${pct(p.ci[0], 0)}〜${pct(p.ci[1], 0)}</span></div>` })), { min: 0, max: 1, ref: 0.5, ticks: [0, 0.25, 0.5, 0.75, 1], tickFmt: (t) => t * 100 + "%", rowH: 24, left: 120, right: 80, label: "選手勝率と95%信頼区間" });

    function showPlayer(name, scroll) {
      const p = D.players.find((x) => x.name === name);
      if (!p) return;
      const panel = $("#player-panel");
      panel.classList.add("show");
      panel.innerHTML = `<div class="card">
        <div class="ph"><div class="avatar" style="--c:${tc(p.team)}">${esc([...p.name][0])}</div><div><h2 style="margin:0">${esc(p.name)}</h2><div>${teamChip(p.team)} ${p.x ? `<a class="muted" href="https://x.com/${esc(p.x)}" target="_blank" rel="noopener">@${esc(p.x)}</a>` : ""}</div></div></div>
        <div class="kv" style="margin-bottom:16px">
          <div><span>勝敗</span><b>${p.w}-${p.l}</b></div><div><span>勝率</span><b>${pct(p.wr)}</b></div><div><span>95%信頼区間</span><b>${p.n ? pct(p.ci[0], 0) + "〜" + pct(p.ci[1], 0) : "—"}</b></div>
          <div><span>出場節</span><b>${p.apps}</b></div><div><span>現在の連続</span><b>${p.streak ? (p.streak[0] === "W" ? p.streak.slice(1) + "連勝" : p.streak.slice(1) + "連敗") : "—"}</b></div><div><span>最長連勝</span><b>${p.best_streak}</b></div>
          <div><span>先攻</span><b>${rec(p.first)}</b></div><div><span>後攻</span><b>${rec(p.second)}</b></div><div><span>前期 / 後期</span><b>${rec(p.phase.pre)} / ${rec(p.phase.post)}</b></div>
        </div>
        ${p.n ? `<div class="grid g-2"><div><h3>クラス別</h3><div id="pp-class"></div></div><div><h3>バトル枠別</h3><div id="pp-slot"></div></div></div>
        <h3 style="margin-top:16px">対戦ログ</h3><div class="table-wrap"><table><thead><tr><th>節</th><th>枠</th><th>使用</th><th>相手</th><th>相手クラス</th><th>先後</th><th>結果</th><th></th></tr></thead><tbody>
        ${[...p.log].reverse().map((x) => `<tr><td class="nowrap"><a href="results.html#${x.mid}">第${x.section}節</a> <span class="muted">${fmtDate(x.date)}</span></td><td>B${x.no}</td><td><span class="cls">${esc(x.cls)}</span></td><td>${playerLink(x.opp)} <span class="muted">${esc(x.opp_team)}</span></td><td><span class="cls">${esc(x.opp_cls)}</span></td><td>${x.first ? "先攻" : "後攻"}</td><td>${formBadges([x.win ? "W" : "L"])}</td><td>${x.video ? `<a href="${esc(x.video)}" target="_blank" rel="noopener">▶</a>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">まだ選手戦（B1〜3）への出場がありません。チーム戦（B4・5）は選手個人に紐づかないため集計対象外です。</p>`}
      </div>`;
      if (p.n) {
        wlBars($("#pp-class"), D.classes.filter((c) => p.classes[c][0] + p.classes[c][1]).map((c) => ({ label: c, w: p.classes[c][0], l: p.classes[c][1] })), "クラス別");
        wlBars($("#pp-slot"), ["1", "2", "3"].map((k) => ({ label: `BATTLE ${k}`, w: p.slots[k][0], l: p.slots[k][1] })), "枠別");
      }
      history.replaceState(null, "", `?name=${encodeURIComponent(name)}`);
      if (scroll) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const q = new URLSearchParams(location.search).get("name");
    if (q) showPlayer(q, true);
  };

  pages.classes = function () {
    const modes = { all: "全バトル", pre: "前期（〜8/26）", post: "後期（8/27〜）", indiv: "選手戦 B1〜3", team: "チーム戦 B4・5" };
    const chips = $("#mode-chips");
    chips.innerHTML = Object.entries(modes).map(([k, v]) => `<button class="chip" aria-pressed="${k === "all"}" data-mode="${k}">${v}</button>`).join("");
    const draw = (mode) => {
      const cs = D.class_stats[mode];
      $("#mode-note").textContent = `対象 ${cs.n_battles} バトル（1バトルにつき両チーム分＝${cs.n_battles * 2}回の使用）`;
      const cl = [...cs.classes].sort((a, b) => b.picks - a.picks);
      hbar($("#usage-chart"), cl.map((c) => ({ label: c.class, value: c.share, text: pct(c.share), sub: `${c.picks}回`, color: "var(--accent)", tip: `<b>${c.class}</b><div class="row"><span>使用回数</span><span>${c.picks}</span></div><div class="row"><span>使用率</span><span>${pct(c.share)}</span></div><div class="row"><span>候補入り→使用</span><span>${c.picked_when_offered}/${c.offered}（${pct(c.pick_rate, 0)}）</span></div>` })), { min: 0, max: Math.max(...cl.map((c) => c.share)) * 1.15, ticks: [0, 0.1, 0.2], tickFmt: (t) => Math.round(t * 100) + "%", label: "クラス使用率" });
      const wr = [...cs.classes].sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));
      hbar($("#wr-chart"), wr.map((c) => ({ label: c.class, value: c.wr ?? 0, lo: c.ci[0], hi: c.ci[1], text: pct(c.wr), sub: `${c.w}-${c.l}`, color: (c.wr ?? 0) >= 0.5 ? "var(--div-pos-2)" : "var(--div-neg-2)", tip: `<b>${c.class}</b><div class="row"><span>勝敗</span><span>${c.w}-${c.l}</span></div><div class="row"><span>勝率</span><span>${pct(c.wr)}</span></div><div class="row"><span>95%信頼区間</span><span>${pct(c.ci[0], 0)}〜${pct(c.ci[1], 0)}</span></div>` })), { min: 0, max: 1, ref: 0.5, ticks: [0, 0.25, 0.5, 0.75, 1], tickFmt: (t) => t * 100 + "%", label: "クラス勝率" });
      // first/second table
      $("#fs-table").innerHTML = `<div class="table-wrap"><table><thead><tr><th>クラス</th><th class="r">使用</th><th class="r">勝率</th><th class="r">先攻時</th><th class="r">後攻時</th><th class="r">先後差</th><th class="r" title="候補デッキに入っていたとき実際に選ばれた割合">選択率</th></tr></thead><tbody>
        ${[...cs.classes].sort((a, b) => b.picks - a.picks).map((c) => { const d = c.first_wr != null && c.second_wr != null ? c.first_wr - c.second_wr : null; return `<tr><td><b>${c.class}</b></td><td class="r num">${c.picks}</td><td class="r num">${pct(c.wr)}</td><td class="r num">${pct(c.first_wr, 0)} <span class="muted">(${c.first_w}-${c.first_n - c.first_w})</span></td><td class="r num">${pct(c.second_wr, 0)} <span class="muted">(${c.second_w}-${c.second_n - c.second_w})</span></td><td class="r num">${d == null ? "—" : (d > 0 ? "+" : "") + Math.round(d * 100) + "pt"}</td><td class="r num">${pct(c.pick_rate, 0)}</td></tr>`; }).join("")}
      </tbody></table></div>`;
      // matchup heat
      const mu = cs.matchups;
      $("#mu-table").innerHTML = `<div class="table-wrap"><table class="heat"><thead><tr><th style="text-align:left">使用＼相手</th>${D.classes.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
        ${D.classes.map((a) => `<tr><th style="text-align:left">${a}</th>${D.classes.map((b) => {
          if (a === b) return `<td class="self">同型</td>`;
          const [w, l] = mu[a][b]; const n = w + l;
          if (!n) return `<td class="na">—</td>`;
          const r = w / n;
          return `<td style="background:${divColor(r, n)};color:${divInk(r, n)}" data-tip="${esc(`<b>${a} → ${b}</b><div class="row"><span>${w}勝 ${l}敗</span><span>${pct(r, 0)}</span></div>`)}">${w}-${l}</td>`;
        }).join("")}</tr>`).join("")}
      </tbody></table></div>${heatLegend}`;
      bindTips($("#mu-table"));
    };
    chips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c === b))); draw(b.dataset.mode); });
    draw("all");
    // section heat (sequential)
    const n = D.meta.detailed_through;
    const maxv = Math.max(...D.classes.flatMap((c) => D.class_by_section[c].slice(0, n)));
    const seq = (v) => { const t = v / maxv; return t === 0 ? "transparent" : `color-mix(in srgb, var(--accent) ${Math.round(12 + t * 78)}%, var(--surface-1))`; };
    $("#sec-heat").innerHTML = `<div class="table-wrap"><table class="heat"><thead><tr><th style="text-align:left">クラス</th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}節</th>`).join("")}<th>計</th></tr></thead><tbody>
      ${D.classes.map((c) => { const arr = D.class_by_section[c].slice(0, n); return `<tr><th style="text-align:left">${c}</th>${arr.map((v, i) => `<td style="background:${seq(v)};color:${v / maxv > 0.6 ? "#fff" : "var(--text-primary)"}" data-tip="${esc(`<b>${c}</b> 第${i + 1}節：${v}回`)}">${v}</td>`).join("")}<td><b>${arr.reduce((a, b) => a + b, 0)}</b></td></tr>`; }).join("")}
    </tbody></table></div><p class="note">各節で使用された回数（両チーム合計）。第6節（8/30）から第9弾「アズヴォルト・レヴナント」環境。</p>`;
    bindTips($("#sec-heat"));
    // team x class
    $("#team-class").innerHTML = `<div class="table-wrap"><table class="heat"><thead><tr><th style="text-align:left">チーム</th>${D.classes.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${TEAM_ORDER.map((t) => `<tr><th style="text-align:left">${teamChip(t, { short: true })}</th>${D.classes.map((c) => { const [w, l] = D.team_class[t][c]; const k = w + l; if (!k) return `<td class="na">—</td>`; const r = w / k; return `<td style="background:${divColor(r, k)};color:${divInk(r, k)}" data-tip="${esc(`<b>${tname(t)}</b>の${c}<div class="row"><span>${w}勝 ${l}敗</span><span>${pct(r, 0)}</span></div>`)}">${w}-${l}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div>${heatLegend}`;
    bindTips($("#team-class"));
  };

  pages.analysis = function () {
    // 本文中の動的パーツ
    if ($("#a-rank")) rankChart($("#a-rank"));
    if ($("#a-po")) {
      const rows = [...TEAM_ORDER].sort((a, b) => D.simulation.teams[b].playoff - D.simulation.teams[a].playoff).map((t) => {
        const s = D.simulation.teams[t];
        return { label: t, value: s.playoff, text: pct(s.playoff, 1), color: tc(t), tip: `<b>${esc(tname(t))}</b><div class="row"><span>PO進出</span><span>${pct(s.playoff, 1)}</span></div><div class="row"><span>1位通過</span><span>${pct(s.seed[0], 1)}</span></div><div class="row"><span>補正バトル勝率</span><span>${pct(D.simulation.strength[t], 1)}</span></div>` };
      });
      hbar($("#a-po"), rows, { min: 0, max: 1, ticks: [0, 0.5, 1], tickFmt: (t) => t * 100 + "%", left: 60, label: "プレーオフ進出確率" });
    }
    if ($("#a-seed")) {
      $("#a-seed").innerHTML = `<div class="table-wrap"><table class="heat"><thead><tr><th style="text-align:left">チーム</th>${[1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<th>${k}位</th>`).join("")}</tr></thead><tbody>
      ${D.standings.map((r) => `<tr><th style="text-align:left">${teamChip(r.team, { short: true })}</th>${D.simulation.teams[r.team].seed.map((v, i) => `<td style="background:${v ? `color-mix(in srgb, var(--accent) ${Math.round(8 + v * 85)}%, var(--surface-1))` : "transparent"};color:${v > 0.45 ? "#fff" : "var(--text-primary)"}" data-tip="${esc(`${tname(r.team)}：最終${i + 1}位 ${pct(v, 1)}`)}">${v >= 0.005 ? Math.round(v * 100) + "%" : v > 0 ? "<1%" : "—"}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>`;
      bindTips($("#a-seed"));
    }
    if ($("#a-standings")) standingsTable($("#a-standings"));
    if ($("#a-after3")) {
      const a = D.after3;
      $("#a-after3").innerHTML = `<div class="table-wrap"><table><thead><tr><th>選手戦（B1〜3）の結果</th><th class="r">その後ROUND勝利</th><th class="r">ROUND敗北</th><th class="r">勝利率</th></tr></thead><tbody>
      ${["3-0", "2-1", "1-2", "0-3"].map((k) => { const v = a[k] || [0, 0]; return `<tr><td><b>${k}</b></td><td class="r num">${v[0]}</td><td class="r num">${v[1]}</td><td class="r num">${pct(v[0] / (v[0] + v[1]), 0)}</td></tr>`; }).join("")}
      </tbody></table></div>`;
    }
  };

  pages.guide = function () {
    const el = $("#rosters");
    if (!el) return;
    el.innerHTML = TEAM_ORDER.map((t) => `<div class="card" style="border-top:3px solid ${tc(t)}"><h3>${teamChip(t)}</h3><ul class="list-plain">${D.roster[t].map((n) => { const p = D.players.find((x) => x.name === n); return `<li class="fixture"><span>${playerLink(n)}</span><span class="muted num">${p.n ? `${p.w}-${p.l}` : "出場なし"}</span></li>`; }).join("")}</ul></div>`).join("");
    const sch = $("#schedule-table");
    if (sch) {
      const days = groupMatchdays(D.matches);
      sch.innerHTML = `<div class="table-wrap"><table><thead><tr><th>節</th><th>日付</th><th>対戦カード</th></tr></thead><tbody>
        ${days.map((d) => `<tr><td class="nowrap">第${d.section}節${d.half ? " " + d.half : ""}</td><td class="nowrap num">${fmtDate(d.date, d.weekday)} ${d.time || ""}</td><td>${d.list.map((m) => `<span class="nowrap">${m.t1} ${m.s1 != null ? `<b>${m.s1}-${m.s2}</b>` : "vs"} ${m.t2}</span>`).join("　/　")}</td></tr>`).join("")}
      </tbody></table></div>`;
    }
  };

  pages.about = function () {};

  // ------------------------------------------------------------------ boot
  document.addEventListener("DOMContentLoaded", () => {
    layout();
    $$("[data-bind]").forEach((el) => {
      const k = el.dataset.bind;
      const map = { last_section: D.meta.last_section, detailed_through: D.meta.detailed_through, generated: D.meta.generated, n_battles: D.meta.n_battles_detailed, n_matches: D.meta.n_matches_played };
      if (k in map) el.textContent = map[k];
    });
    const page = document.body.dataset.page;
    if (pages[page]) pages[page]();
  });
  window.PS = { roundWinProb, pct };
})();
