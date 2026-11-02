#!/usr/bin/env python3
"""Shadowverse Premier Series 26-27 解析データ生成スクリプト.

data/raw/ の CSV（公式サイトのバトル結果を集計した公開データ）と
data/manual/ の手入力データ（詳細未収録節のチームスコア等）を読み込み、
サイトが読む data/ps.json を生成する。

    python3 scripts/build_data.py
"""
from __future__ import annotations

import csv
import json
import math
import os
import random
from collections import Counter, defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
MANUAL = os.path.join(ROOT, "data", "manual")
OUT = os.path.join(ROOT, "data", "ps.json")
OUT_JS = os.path.join(ROOT, "site", "assets", "ps-data.js")

TEAMS = {
    "DFM": {"name": "DetonatioN FocusMe", "short": "DFM", "color": "#1f6feb"},
    "MRG": {"name": "MURASH GAMING", "short": "MRG", "color": "#e5534b"},
    "CR": {"name": "Crazy Raccoon", "short": "CR", "color": "#d4a72c"},
    "ZETA": {"name": "ZETA DIVISION", "short": "ZETA", "color": "#8b949e"},
    "VRL": {"name": "VARREL", "short": "VRL", "color": "#a371f7"},
    "LVH": {"name": "レバンガ北海道", "short": "LVH", "color": "#3fb950"},
    "RDL": {"name": "RIDDLE ORDER", "short": "RDL", "color": "#f778ba"},
    "RC": {"name": "REJECT", "short": "RC", "color": "#db6d28"},
}
CLASSES = ["エルフ", "ロイヤル", "ウィッチ", "ドラゴン", "ナイトメア", "ビショップ", "ネメシス"]
# 第9弾「アズヴォルト・レヴナント」追加日（2026-08-27）を境に前期・後期を分ける
PHASE_SPLIT = "2026-08-27"
PHASES = {"pre": "前期（～第5節／クロニクル・オブ・デスティニー期）", "post": "後期（第6節～／アズヴォルト・レヴナント期）"}
REGULAR_SECTIONS = 14
PLAYOFF_SPOTS = 4
SIMS = 100_000


def read_csv(name: str, base: str = RAW) -> list[dict]:
    with open(os.path.join(base, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def half_norm(h: str) -> str:
    return h.replace("戦", "")


def wilson(w: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = w / n
    den = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (round((c - m) / den, 3), round((c + m) / den, 3))


def rate(w: int, n: int) -> float | None:
    return round(w / n, 4) if n else None


# ---------------------------------------------------------------- load
schedule = read_csv("schedule.csv")
details = read_csv("battle_details.csv")
players_csv = read_csv("players.csv")
manual_scores = read_csv("round_scores.csv", MANUAL) if os.path.exists(os.path.join(MANUAL, "round_scores.csv")) else []

# schedule.csv の第3・6節は half が空で round_no 1-4。battle_details 側は 前半戦/後半戦 × 1-2。
def round_key_from_detail(r: dict) -> tuple[int, str, int]:
    sec = int(r["section"])
    half = half_norm(r["half"])
    rn = int(r["round_no"])
    if sec in (3, 6, 10, 12, 14):
        return (sec, "", rn if half == "前半" else rn + 2)
    return (sec, half, rn)


matches: list[dict] = []
mindex: dict[tuple, dict] = {}
for r in schedule:
    sec = int(r["section"])
    half = half_norm(r["half"])
    m = {
        "id": f"S{sec:02d}{('-' + ('A' if half == '前半' else 'B')) if half else ''}-R{r['round_no']}",
        "section": sec,
        "half": half,
        "date": r["date"],
        "weekday": r["weekday"],
        "time": r["time"],
        "round": int(r["round_no"]),
        "t1": r["team1"],
        "t2": r["team2"],
        "s1": int(r["score1"]) if r["score1"] else None,
        "s2": int(r["score2"]) if r["score2"] else None,
        "battles": [],
        "source": "official-schedule" if r["score1"] else None,
    }
    matches.append(m)
    mindex[(sec, half, int(r["round_no"]))] = m

# 手入力スコア（battle_details 未収録の節）
for r in manual_scores:
    sec = int(r["section"])
    key = (sec, r["half"], int(r["round_no"]))
    m = mindex[key]
    assert m["t1"] == r["team1"] and m["t2"] == r["team2"], (key, r)
    m["s1"], m["s2"] = int(r["score1"]), int(r["score2"])
    m["source"] = r["source"]

for r in details:
    key = round_key_from_detail(r)
    m = mindex[key]
    assert m["t1"] == r["team1"] and m["t2"] == r["team2"], (key, r["team1"], r["team2"])
    win1 = r["winlose"] == "WIN"
    m["battles"].append(
        {
            "no": int(r["battle_no"]),
            "p1": r["player1"],
            "p2": r["player2"],
            "c1": r["class1_used"],
            "c2": r["class2_used"],
            "pool1": r["class1_pool"].split("|") if r["class1_pool"] else [],
            "pool2": r["class2_pool"].split("|") if r["class2_pool"] else [],
            "first": 1 if r["fise"] == "先攻" else 2,  # 先攻チーム
            "winner": 1 if win1 else 2,
            "video": r["video_url"],
        }
    )
for m in matches:
    m["battles"].sort(key=lambda b: b["no"])
    if m["battles"]:
        w1 = sum(1 for b in m["battles"] if b["winner"] == 1)
        w2 = len(m["battles"]) - w1
        assert (w1, w2) == (m["s1"], m["s2"]), (m["id"], w1, w2, m["s1"], m["s2"])

played = [m for m in matches if m["s1"] is not None]
detailed = [m for m in played if m["battles"]]
last_section = max(m["section"] for m in played)


def phase_of(d: str) -> str:
    return "pre" if d < PHASE_SPLIT else "post"


# ---------------------------------------------------------------- standings
def compute_standings(ms: list[dict]) -> list[dict]:
    st = {t: {"team": t, "w": 0, "l": 0, "bw": 0, "bl": 0, "played": 0} for t in TEAMS}
    h2h = defaultdict(int)  # (a,b) -> battle diff for a
    for m in ms:
        a, b = m["t1"], m["t2"]
        st[a]["bw"] += m["s1"]; st[a]["bl"] += m["s2"]
        st[b]["bw"] += m["s2"]; st[b]["bl"] += m["s1"]
        st[a]["played"] += 1; st[b]["played"] += 1
        if m["s1"] > m["s2"]:
            st[a]["w"] += 1; st[b]["l"] += 1
        else:
            st[b]["w"] += 1; st[a]["l"] += 1
        h2h[(a, b)] += m["s1"] - m["s2"]
        h2h[(b, a)] += m["s2"] - m["s1"]
    rows = list(st.values())
    for r in rows:
        r["diff"] = r["bw"] - r["bl"]
        r["pts"] = r["bw"]

    # 1.勝ち点 2.バトル勝敗差 3.獲得ポイント 4.直接対決バトル勝敗差
    def key(r):
        return (-r["w"], -r["diff"], -r["pts"])

    rows.sort(key=key)
    # 同順位グループ内を直接対決で並べ替え
    out, i = [], 0
    while i < len(rows):
        j = i
        while j < len(rows) and key(rows[j]) == key(rows[i]):
            j += 1
        grp = rows[i:j]
        if len(grp) > 1:
            names = [g["team"] for g in grp]
            grp.sort(key=lambda g: -sum(h2h[(g["team"], o)] for o in names if o != g["team"]))
        out.extend(grp)
        i = j
    prev = None
    for idx, r in enumerate(out, 1):
        r["rank"] = idx
    return out


standings = compute_standings(played)

# 公式 result.json（第9節終了時点）との突き合わせ
official = json.load(open(os.path.join(RAW, "result.json"), encoding="utf-8"))
OFFICIAL_ID = {1: "CR", 2: "ZETA", 3: "DFM", 4: "VRL", 5: "MRG", 6: "RC", 7: "RDL", 8: "LVH"}
check9 = {r["team"]: r for r in compute_standings([m for m in played if m["section"] <= 9])}
for t in official["teams"]:
    tag = OFFICIAL_ID[t["id"]]
    c = check9[tag]
    assert (c["w"], c["l"], c["diff"], c["pts"]) == (t["win"], t["lose"], t["diff"], t["battlepoint"]), (tag, c, t)

# 節ごとの順位推移
rank_history = {t: [] for t in TEAMS}
wins_history = {t: [] for t in TEAMS}
for s in range(1, last_section + 1):
    sub = [m for m in played if m["section"] <= s]
    for r in compute_standings(sub):
        rank_history[r["team"]].append(r["rank"])
        wins_history[r["team"]].append(r["w"])

# 直近成績・連勝
team_log = defaultdict(list)
for m in sorted(played, key=lambda m: (m["date"], m["round"])):
    for side, t, o in ((1, m["t1"], m["t2"]), (2, m["t2"], m["t1"])):
        my = m["s1"] if side == 1 else m["s2"]
        op = m["s2"] if side == 1 else m["s1"]
        team_log[t].append({"id": m["id"], "section": m["section"], "date": m["date"], "opp": o, "for": my, "against": op, "win": my > op})
for r in standings:
    log = team_log[r["team"]]
    r["form"] = ["W" if x["win"] else "L" for x in log[-5:]]
    streak = 0
    if log:
        last = log[-1]["win"]
        for x in reversed(log):
            if x["win"] == last:
                streak += 1
            else:
                break
        r["streak"] = ("W" if last else "L") + str(streak)
    r["full_5"] = sum(1 for x in log if x["for"] + x["against"] == 5)
    r["full_5_w"] = sum(1 for x in log if x["for"] + x["against"] == 5 and x["win"])
    r["sweeps"] = sum(1 for x in log if x["for"] == 4 and x["against"] == 0)
    r["swept"] = sum(1 for x in log if x["for"] == 0 and x["against"] == 4)

# 直接対決表
h2h = {a: {b: [] for b in TEAMS if b != a} for a in TEAMS}
for m in played:
    h2h[m["t1"]][m["t2"]].append(f"{m['s1']}-{m['s2']}")
    h2h[m["t2"]][m["t1"]].append(f"{m['s2']}-{m['s1']}")

# ---------------------------------------------------------------- battle-level records
battles = []  # flattened, both perspectives where needed
for m in detailed:
    for b in m["battles"]:
        battles.append({**b, "mid": m["id"], "section": m["section"], "date": m["date"], "t1": m["t1"], "t2": m["t2"], "phase": phase_of(m["date"])})

team_battle = {t: {"slot": {n: [0, 0] for n in range(1, 6)}, "first": [0, 0], "second": [0, 0], "indiv": [0, 0], "team": [0, 0]} for t in TEAMS}
for b in battles:
    for side, t in ((1, b["t1"]), (2, b["t2"])):
        win = b["winner"] == side
        tb = team_battle[t]
        tb["slot"][b["no"]][0 if win else 1] += 1
        (tb["first"] if b["first"] == side else tb["second"])[0 if win else 1] += 1
        (tb["indiv"] if b["no"] <= 3 else tb["team"])[0 if win else 1] += 1

for r in standings:
    tb = team_battle[r["team"]]
    r["indiv"] = tb["indiv"]
    r["teambattle"] = tb["team"]
    r["slot"] = {str(k): v for k, v in tb["slot"].items()}
    r["first"] = tb["first"]
    r["second"] = tb["second"]

# first/second overall
fs = [0, 0]
for b in battles:
    fs[0 if b["winner"] == b["first"] else 1] += 1
first_rate = {"first_wins": fs[0], "second_wins": fs[1], "n": len(battles), "rate": rate(fs[0], len(battles)), "ci": wilson(fs[0], len(battles))}
fs_phase = {}
for ph in PHASES:
    bs = [b for b in battles if b["phase"] == ph]
    w = sum(1 for b in bs if b["winner"] == b["first"])
    fs_phase[ph] = {"first_wins": w, "n": len(bs), "rate": rate(w, len(bs))}
first_rate["by_phase"] = fs_phase

# ---------------------------------------------------------------- class stats
def class_block(bs: list[dict]) -> dict:
    cs = {c: {"class": c, "picks": 0, "w": 0, "first_n": 0, "first_w": 0, "second_n": 0, "second_w": 0, "offered": 0, "picked_when_offered": 0} for c in CLASSES}
    mu = {a: {b: [0, 0] for b in CLASSES} for a in CLASSES}
    for b in bs:
        for side in (1, 2):
            c = b[f"c{side}"]; oc = b[f"c{3 - side}"]
            win = b["winner"] == side
            x = cs[c]
            x["picks"] += 1
            x["w"] += win
            if b["first"] == side:
                x["first_n"] += 1; x["first_w"] += win
            else:
                x["second_n"] += 1; x["second_w"] += win
            if c != oc:
                mu[c][oc][0 if win else 1] += 1
            for pc in b[f"pool{side}"]:
                cs[pc]["offered"] += 1
                if pc == c:
                    cs[pc]["picked_when_offered"] += 1
    total = sum(x["picks"] for x in cs.values())
    for x in cs.values():
        x["l"] = x["picks"] - x["w"]
        x["wr"] = rate(x["w"], x["picks"])
        x["ci"] = wilson(x["w"], x["picks"])
        x["share"] = rate(x["picks"], total)
        x["first_wr"] = rate(x["first_w"], x["first_n"])
        x["second_wr"] = rate(x["second_w"], x["second_n"])
        x["pick_rate"] = rate(x["picked_when_offered"], x["offered"])
    return {"classes": [cs[c] for c in CLASSES], "matchups": mu, "n_battles": len(bs)}


class_stats = {"all": class_block(battles)}
for ph in PHASES:
    class_stats[ph] = class_block([b for b in battles if b["phase"] == ph])
class_stats["indiv"] = class_block([b for b in battles if b["no"] <= 3])
class_stats["team"] = class_block([b for b in battles if b["no"] >= 4])
mirror = sum(1 for b in battles if b["c1"] == b["c2"])

# 節ごとのクラス使用数
class_by_section = {c: [0] * last_section for c in CLASSES}
for b in battles:
    class_by_section[b["c1"]][b["section"] - 1] += 1
    class_by_section[b["c2"]][b["section"] - 1] += 1

# チーム別クラス
team_class = {t: {c: [0, 0] for c in CLASSES} for t in TEAMS}
for b in battles:
    for side, t in ((1, b["t1"]), (2, b["t2"])):
        team_class[t][b[f"c{side}"]][0 if b["winner"] == side else 1] += 1

# ---------------------------------------------------------------- players
roster = defaultdict(list)
pmeta = {}
for r in players_csv:
    roster[r["team_tag"]].append(r["player_name"])
    pmeta[r["player_name"]] = {"team": r["team_tag"], "x": r["x_handle"], "slug": r["ps_slug"]}

pstats = {}
for name, meta in pmeta.items():
    pstats[name] = {"name": name, "team": meta["team"], "x": meta["x"], "slug": meta["slug"], "w": 0, "l": 0,
                    "classes": {c: [0, 0] for c in CLASSES}, "slots": {"1": [0, 0], "2": [0, 0], "3": [0, 0]},
                    "first": [0, 0], "second": [0, 0], "log": [], "sections": set(), "vs_team": defaultdict(lambda: [0, 0]),
                    "phase": {"pre": [0, 0], "post": [0, 0]}}
for b in sorted(battles, key=lambda b: (b["date"], b["mid"], b["no"])):
    if b["no"] > 3:
        continue
    for side, t in ((1, b["t1"]), (2, b["t2"])):
        p = b[f"p{side}"]
        if p not in pstats:
            raise SystemExit(f"unknown player {p}")
        s = pstats[p]
        win = b["winner"] == side
        k = 0 if win else 1
        s["w" if win else "l"] += 1
        s["classes"][b[f"c{side}"]][k] += 1
        s["slots"][str(b["no"])][k] += 1
        (s["first"] if b["first"] == side else s["second"])[k] += 1
        s["phase"][b["phase"]][k] += 1
        opp_t = b["t2"] if side == 1 else b["t1"]
        s["vs_team"][opp_t][k] += 1
        s["sections"].add(b["section"])
        s["log"].append({"mid": b["mid"], "section": b["section"], "date": b["date"], "no": b["no"], "cls": b[f"c{side}"],
                         "opp": b[f"p{3 - side}"], "opp_team": opp_t, "opp_cls": b[f"c{3 - side}"],
                         "first": b["first"] == side, "win": win, "video": b["video"]})
player_list = []
for s in pstats.values():
    n = s["w"] + s["l"]
    s["n"] = n
    s["wr"] = rate(s["w"], n)
    s["ci"] = wilson(s["w"], n)
    s["apps"] = len(s["sections"])
    s["sections"] = sorted(s["sections"])
    s["vs_team"] = dict(s["vs_team"])
    # 現在の連勝/連敗
    st = 0
    if s["log"]:
        last = s["log"][-1]["win"]
        for x in reversed(s["log"]):
            if x["win"] == last:
                st += 1
            else:
                break
        s["streak"] = ("W" if last else "L") + str(st)
    else:
        s["streak"] = None
    best = 0; cur = 0
    for x in s["log"]:
        cur = cur + 1 if x["win"] else 0
        best = max(best, cur)
    s["best_streak"] = best
    s["main_class"] = max(s["classes"].items(), key=lambda kv: (kv[1][0] + kv[1][1], kv[1][0]))[0] if n else None
    s["recent"] = ["W" if x["win"] else "L" for x in s["log"][-5:]]
    # ベイズ補正勝率（事前分布 Beta(5,5)）
    s["adj_wr"] = round((s["w"] + 5) / (n + 10), 4)
    player_list.append(s)
player_list.sort(key=lambda s: (-(s["wr"] or -1), -s["w"], s["name"]))

# チーム戦（B4/B5）
teambattle_log = []
for b in battles:
    if b["no"] >= 4:
        teambattle_log.append({"mid": b["mid"], "section": b["section"], "no": b["no"], "t1": b["t1"], "t2": b["t2"], "c1": b["c1"], "c2": b["c2"], "winner": b["winner"]})

# 「勝敗を決めた」バトル（B5）
deciders = [b for b in battles if b["no"] == 5]

# ---------------------------------------------------------------- 状況別：2-2 からの B5、0-2/2-0 からの逆転
comebacks = []
for m in detailed:
    run = [0, 0]
    trailed = {1: False, 2: False}
    for b in m["battles"]:
        run[b["winner"] - 1] += 1
        if run[0] - run[1] <= -2:
            trailed[1] = True
        if run[1] - run[0] <= -2:
            trailed[2] = True
    winner = 1 if m["s1"] > m["s2"] else 2
    if trailed[winner]:
        comebacks.append(m["id"])

# 個人戦3連勝（B1-B3 で 3-0）→ B4 の結果
sweep3 = {"n": 0, "b4_win": 0}
for m in detailed:
    i3 = m["battles"][:3]
    w1 = sum(1 for b in i3 if b["winner"] == 1)
    if w1 in (0, 3):
        side = 1 if w1 == 3 else 2
        sweep3["n"] += 1
        sweep3["b4_win"] += m["battles"][3]["winner"] == side
# 個人戦の結果 → 最終勝敗
after3 = defaultdict(lambda: [0, 0])  # "2-1" -> [そのチームが勝った, 負けた]
for m in detailed:
    i3 = m["battles"][:3]
    w1 = sum(1 for b in i3 if b["winner"] == 1)
    for side, w in ((1, w1), (2, 3 - w1)):
        k = f"{w}-{3 - w}"
        won = (m["s1"] > m["s2"]) == (side == 1)
        after3[k][0 if won else 1] += 1

# ---------------------------------------------------------------- simulation
def team_strength() -> dict[str, float]:
    # 全バトル（R10 はチームスコア）からのベイズ補正バトル勝率
    out = {}
    for r in standings:
        out[r["team"]] = (r["bw"] + 10) / (r["bw"] + r["bl"] + 20)
    return out


def sim_round(pa: float, pb: float, rng: random.Random) -> tuple[int, int]:
    # log5 で 1 バトルの勝率
    p = (pa - pa * pb) / (pa + pb - 2 * pa * pb)
    a = b = 0
    for _ in range(4):
        if rng.random() < p:
            a += 1
        else:
            b += 1
    if a == b:
        if rng.random() < p:
            a += 1
        else:
            b += 1
    return a, b


remaining = [m for m in matches if m["s1"] is None]
strength = team_strength()
rng = random.Random(20261102)
po_count = Counter()
seed_count = {t: Counter() for t in TEAMS}
win_dist = {t: Counter() for t in TEAMS}
for _ in range(SIMS):
    sim = []
    for m in remaining:
        s1, s2 = sim_round(strength[m["t1"]], strength[m["t2"]], rng)
        sim.append({**m, "s1": s1, "s2": s2})
    table = compute_standings(played + sim)
    for r in table:
        seed_count[r["team"]][r["rank"]] += 1
        win_dist[r["team"]][r["w"]] += 1
        if r["rank"] <= PLAYOFF_SPOTS:
            po_count[r["team"]] += 1
simulation = {
    "sims": SIMS,
    "model": "各チームのバトル勝率（事前分布 Beta(10,10) で補正）を log5 で対戦確率に変換し、残り全ROUNDをバトル単位でモンテカルロ。B4 は常に実施、2-2 のときのみ B5。",
    "strength": {t: round(v, 4) for t, v in strength.items()},
    "teams": {t: {"playoff": round(po_count[t] / SIMS, 4),
                  "seed": [round(seed_count[t][k] / SIMS, 4) for k in range(1, 9)],
                  "wins": {str(k): round(v / SIMS, 4) for k, v in sorted(win_dist[t].items())}} for t in TEAMS},
}

# 残り日程の対戦相手強度
sos = {}
for t in TEAMS:
    opps = [m["t2"] if m["t1"] == t else m["t1"] for m in remaining if t in (m["t1"], m["t2"])]
    sos[t] = {"opps": opps, "avg_strength": round(sum(strength[o] for o in opps) / len(opps), 4) if opps else None}

# ---------------------------------------------------------------- output
data = {
    "meta": {
        "generated": date.today().isoformat(),
        "season": "Shadowverse Premier Series 26-27",
        "last_section": last_section,
        "detailed_through": max(m["section"] for m in detailed),
        "phase_split": PHASE_SPLIT,
        "phases": PHASES,
        "regular_sections": REGULAR_SECTIONS,
        "playoff_spots": PLAYOFF_SPOTS,
        "n_matches_played": len(played),
        "n_battles_detailed": len(battles),
        "mirror_battles": mirror,
    },
    "teams": TEAMS,
    "classes": CLASSES,
    "roster": roster,
    "matches": matches,
    "standings": standings,
    "rank_history": rank_history,
    "wins_history": wins_history,
    "team_log": team_log,
    "h2h": h2h,
    "first_rate": first_rate,
    "class_stats": class_stats,
    "class_by_section": class_by_section,
    "team_class": team_class,
    "players": player_list,
    "teambattles": teambattle_log,
    "comebacks": comebacks,
    "sweep3": sweep3,
    "after3": dict(after3),
    "simulation": simulation,
    "sos": sos,
}
os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("// 自動生成: scripts/build_data.py\nwindow.PS_DATA = ")
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
# サイトからダウンロードできるようにデータを複製
import shutil

SITE_DATA = os.path.join(ROOT, "site", "data")
for sub, src in (("raw", RAW), ("manual", MANUAL)):
    dst = os.path.join(SITE_DATA, sub)
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        if name.endswith((".csv", ".json")):
            shutil.copy2(os.path.join(src, name), os.path.join(dst, name))
shutil.copy2(OUT, os.path.join(SITE_DATA, "ps.json"))

print(f"matches played={len(played)} detailed={len(detailed)} battles={len(battles)} -> {OUT}")
