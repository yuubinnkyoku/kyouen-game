# 共円ゲーム 9×9 — 証明済み必勝CPUと対戦

9×9固定の共円ゲームで、完全解析から生成された**証明済み必勝戦略**を参照するCPU（必ず先手・初手は中央）と対戦できるWebアプリです。

- CPUはその場で手を予想しているわけではありません。9×9共円ゲームの完全解析（KYOENC3証明書）から生成された canonical state → witness の戦略テーブルを参照します。CPUが先手のため、合法な手をどう選んでもCPU側には勝ち筋があります。
- 既存の対CPU練習ゲームとは独立した実装で、本作では完全解析から生成した証明済み戦略を使用します。
- そのUnity版のコード・画像・音声・UI素材・レイアウトは一切流用していません。

## 遊び方

- 公開サイト: https://yuubinnkyoku.github.io/kyouen-game/
- CPUが先手で中央（point 40）に打ちます。あなたは後手です。
- 合法手がなくなった側の負け。引き分けはありません。
- 盤面の合法点に打てます。Hint ONで置ける点がハイライトされ、置けない点を押すと共円4点の原因が表示されます。
- Undoは「あなたの1手＋CPUの1手」の1セット単位、Redoで復元できます。

## 技術構成

- Vite + TypeScript + Vanilla DOM/CSS（軽量、フレームワークなし）
- 共円ルール判定: ビルド時に生成する `forbidden-9x9.bin`（危険4点組 29,152 件から作る completion テーブル、約455KB）
- CPU戦略: 8,826,458 WIN records を256 shard（`00.bin`〜`ff.bin`）に分割したバイナリ辞書。ブラウザはCPU手番ごとに必要な1 shardだけ取得し、binary searchでwitnessを引く
- ハッシュ: `shard = mix64(lo ^ (hi * 0x9e3779b97f4a7c15)) & 0xff`（exporterとTypeScriptで同一実装）
- 戦略データはGit履歴に含めず、GitHub Release（`strategy-v1`）のassetとして配布し、Pagesデプロイ時に`dist/strategy/`へ同梱（same-origin配布）します

## 原典（provenance）

- 研究リポジトリ: https://github.com/yuubinnkyoku/kyouen-1-to-9-classification
- ソースcommit: `224f0dae89f95bfafa20290e872d96b9567dc6d7`
- 証明書Release: v1.0.0 `kyouen-certificates-1-to-9-v1.0.0.zip`
  - ZIP SHA-256: `84454543f7e054e42779792b10c430d539ab6dd26c60b46d091cf4770dde7707`
  - 9×9圧縮 `kyouen-9x9.cert.zst` SHA-256: `cbaaaa287696498fa74651fb31526f65c996202854dbe8c9807085eeeb2ad952`
  - 展開後raw SHA-256: `f4282bebbf8240cd0a11fdd5af78ef8b1e33f0b9582f72424574c1bab5ac92e2`
  - nodes 13,457,134（WIN 8,826,458 / LOSS 4,630,676）、forbidden 29,152、root WIN・witness 40
- 戦略Release: `strategy-v1`（manifest.json + 00.bin〜ff.bin = 257 assets、total 8,826,458 records）
- 詳細は `docs/provenance.md`、`docs/strategy-format.md` を参照

## ローカル開発

必要なもの: Node.js 20+、Python 3.11+（`zstandard`, `numpy` はexport/verify時のみ）

```sh
npm ci
npm run dev            # http://localhost:5173/kyouen-game/ （/strategy は .strategy へのプロキシ）
# 戦略つきで動かす場合:
npm run fetch:strategy # .strategy/ に strategy-v1 を取得
node tools/serve-strategy.mjs --dir .strategy --port 8099 &
npm run dev
```

## 戦略の再生成と検証

```sh
# 証明書取得→検証→256shard生成→検証（.strategy-work/ と .strategy/ に出力）
node tools/export-strategy.mjs
# 全WINレコードとshardの照合（時間がかかります）
python tools/verify-strategy.py .strategy-work/kyouen-9x9.cert.zst .strategy
# テスト
npm test
```

## テスト/E2E

```sh
npm run typecheck
npm run lint
npm test            # unit + integration（実shard利用）
npm run e2e         # Playwright（ローカル）
npm run e2e:prod    # 公開Pagesに対するE2E
```
