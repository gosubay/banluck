# Banluck Strategy Lab

Solved hit/stand strategy for **Banluck** (the blackjack variant played over Chinese New Year in Singapore and Malaysia), with a playable game, an in-browser Monte Carlo simulator, a detailed strategy chart, the rule set compared with casino blackjack, and a plain-English explanation of why the strategy works.

Open `index.html` in a browser. It is a single self-contained file.

## Rules simulated

- 1 deck, fresh shuffle every hand, one player against the banker; all cards face down.
- Ace = 11 or 10 on two cards, 10 or 1 on three cards, 1 on four or five cards.
- Player and banker must both reach 16; maximum five cards.
- Ban-Ban (A-A) 3×, Ban-Luck (A + ten-value) 2×, settled immediately. 777 pays 7×, Five-card Charlie 2× (3× if exactly 21). The banker collects these too.
- Both bust = push.
- Five-card bust: two variants are solved, **lose 1×** and **lose 2×** (player only).
- Two dealer models: **fixed** (stands on any 16+) and **smart** (sees how many cards the player holds; solved as a two-player game with CFR+).

## Headline results (EV per hand for the player)

| Variant | vs fixed dealer | vs smart dealer (game value) |
|---|---|---|
| 5-card bust loses 1× | +4.66% | −1.04% |
| 5-card bust loses 2× | +2.60% | −3.10% |

The strategy chart for the 2× variant against a fixed dealer fits in one line: stand on **hard 17**, on **19 with two cards and an Ace**, and on **20 with three cards and an Ace**. Hit everything below.

## Reproduce

```sh
node solver/solve.js        # exact single-deck solve + CFR+  -> data/solution.json (~5 min)
node solver/montecarlo.js   # 20M-hand Monte Carlo check     -> data/montecarlo.json (~30 s on 4 cores)
node build.js               # inline everything             -> index.html, dist/artifact.html
```

## Layout

- `js/core.js`: rules engine, hand evaluation, settlement, dealing and simulation (shared by Node and the browser).
- `solver/solve.js`: exact solver. Enumerates all 2,983 hand compositions with exact card-removal odds. The fixed dealer is solved by backward induction; the smart dealer by CFR+ to < 0.002% exploitability.
- `solver/montecarlo.js`: multi-threaded Monte Carlo verification of the solved charts.
- `web/`: page template, app logic and explanation copy; `build.js` assembles `index.html`.
