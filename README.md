# シャドバPS アナリティクス

「Shadowverse Premier Series 26-27」（シャドバPS／プレミアシリーズ）の試合結果を集計・解析した**非公式**のファンサイトです。『Shadowverse: Worlds Beyond』の公式チームリーグを、解説・ポータル・まとめ・データベースの4つの切り口で読み解きます。

- 収録範囲：**第10節（2026/11/1）まで**のチームスコア、**第9節まで**の全156バトルの詳細（選手、候補デッキ、使用クラス、先攻後攻、配信の該当時刻）
- 公開先：GitHub Pages（`site/` をそのまま配信）

## ページ構成

| ページ | 内容 |
|---|---|
| `index.html` ポータル | 順位表、今週の見出し、最新の結果、次節の試算勝率、順位推移 |
| `analysis.html` 解説 | 第10節終了時点のシーズン総括。勝敗の構造、全8チームの寸評、個人成績、クラス環境の変化、プレーオフ展望 |
| `results.html` 試合結果 | 全ROUNDのバトル内訳（チーム・節で絞り込み、映像リンク付き） |
| `teams.html` チーム分析 | 全チーム比較表（枠別・先攻後攻・フルセット）、チームごとの順位推移、クラス別成績、直接対決、所属選手 |
| `players.html` 選手DB | 全37選手の個人成績（並べ替え・検索）、95%信頼区間グラフ、選手ごとの対戦ログ |
| `classes.html` クラス分析 | 使用率、勝率、先攻後攻差、選択率、相性表、節ごとの推移、チーム×クラス |
| `guide.html` 大会ガイド | 大会概要、試合形式、順位決定方法、ドラフト、ロスター、全日程、用語集 |
| `about.html` データについて | 出典、検証、指標の定義、データのダウンロード |

## 主な分析結果（第10節終了時点）

- **DFMが8勝2敗で首位。** 8勝のうち6勝が3-2で、5バトルまでもつれた試合は6勝1敗、BATTLE 5は5勝1敗。
- **選手戦で2-1にしたチームのROUND勝率は85%（22勝4敗）。** 0-2からの逆転は3回で、そのうち2回がDFM。
- **先攻勝率は54.5%**（95%信頼区間 46.7〜62.1%）。前期57.0%、後期51.4%。
- **第9弾追加（8/27）後、ドラゴン（41%→60%）とエルフ（50%→62%）が上昇し、ウィッチ（52%→33%）とロイヤル（63%→45%）が下落。**
- **ZETAとLVHが入れ替わった。** 第5節終了時点ではZETAが1勝4敗、LVHが4勝1敗。第6節以降はZETAが4勝1敗、LVHが1勝4敗。
- **プレーオフ進出確率（10万回の試算）：** DFM 99%、CR 91%、MRG 90%、ZETA 73%、LVH 38%、RDL 5%、REJECT 3%、VARREL <1%。

## リポジトリ構成

```
data/
  raw/               集計元のCSV（schedule / battle_details / match_results / players / result.json）
  manual/            バトル詳細が未収録の節のチームスコア（手入力・出典付き）
  ps.json            生成された集計結果
scripts/
  build_data.py      集計・検証・シミュレーションを行い data/ps.json と site/assets/ps-data.js を生成
site/                静的サイト本体（外部ライブラリなし。グラフは自前のSVG）
.github/workflows/pages.yml   GitHub Pages への自動デプロイ
```

## 更新手順

1. `data/raw/` のCSVを新しいものに差し替える。または `data/manual/round_scores.csv` に新しい節のスコアを追記する。
2. `python3 scripts/build_data.py` を実行する（標準ライブラリのみで動きます）。
   - バトル詳細から再計算したスコアと公式スコアが一致しない場合や、第9節時点の順位が公式の `result.json` と一致しない場合は、エラーで止まります。
3. `site/index.html` をブラウザで開いて確認する（`file://` でも動きます）。
4. push すると GitHub Pages（Settings → Pages の Source：Deploy from a branch / `main` / root）が自動で更新されます。ルートの `index.html` が `site/` に転送します。Source を「GitHub Actions」に切り替える場合は、`.github/workflows/pages.yml` を手動実行してください。

解説ページ（`analysis.html`）と、ポータルの「今週の見出し」は手書きの文章です。データを更新したら内容も見直してください。

## 出典

- [Shadowverse Premier Series 26-27 公式サイト](https://ps.shadowverse-wb.com/26-27/)（日程、スコア、ルールブック）
- [hirobosu-staff/svps-data](https://github.com/hirobosu-staff/svps-data)：公式サイトとシャドラボの公開情報を集計した公開データ（第1〜9節）
- GameWith、シャドバPS公式X、MURASH GAMING公式X（第10節スコア）
- 4Gamer.net、ファミ通.com、シャドラボ、Shadowverse Magazine、esports4.net ほか（大会概要、ドラフト）

チーム名・選手名・ゲーム名は各権利者に帰属します。本サイトはCygamesおよび各チームとは関係ありません。
