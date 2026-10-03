# Banluck Strategy Lab

Solved hit/stand strategy for **Banluck** (the blackjack variant played over Chinese New Year in Singapore and Malaysia), with a playable game, an in-browser Monte Carlo simulator, a detailed strategy chart, the rule set compared with casino blackjack, and a plain-English explanation of why the strategy works.

Open `index.html` in a browser. It is a single self-contained file.

## Rules simulated

- 1 deck, fresh shuffle every hand, one player against the banker; all cards face down.
- Ace = 11 or 10 on two cards, 10 or 1 on three cards, 1 on four or five cards.
- Player and banker must both reach 16; maximum five cards.
- Ban-Ban (A-A) 3×, Ban-Luck (A + ten-value) 2×, settled immediately. 777 pays 7×, 五龙 (Five Dragons: five cards, 21 or less) 2×, or 3× if exactly 21. The banker collects these too.
- Both bust = push.
- Five-card bust: two variants are solved, **lose 1×** and **lose 2×** (player only).
- Both sides play optimally. The banker sees how many cards the player holds and decides whether to open them or keep drawing; the game is solved as a two-player game with CFR+, the same way poker is solved.

## Headline results (banker's edge per hand, both sides optimal)

| Variant | Game value | Player using the chart (no mixing) |
|---|---|---|
| 5-card bust loses 1× | 1.04% | 0.99% |
| 5-card bust loses 2× | 3.10% | 3.06% |

The player's chart for the 2× variant fits in one line: stand on **two-card hard 16**, **hard 17** with three or four cards, **19 with two cards and an Ace**, and **20 with three cards and an Ace**. Hit everything below. The banker's chart (when to open each player, by their card count) is on the Strategy chart tab.

## Reproduce

```sh
node solver/solve.js        # exact single-deck solve + CFR+  -> data/solution.json (~5 min)
node solver/explain.js      # per-hand EVs for every cell    -> data/explain.json
node solver/montecarlo.js   # 20M-hand Monte Carlo check     -> data/montecarlo.json (~30 s on 4 cores)
node build.js               # inline everything             -> index.html, dist/artifact.html
```

## Layout

- `js/core.js`: rules engine, hand evaluation, settlement, dealing and simulation (shared by Node and the browser).
- `solver/solve.js`: exact solver. Enumerates all 2,983 hand compositions with exact card-removal odds. The game is solved by CFR+ to < 0.002% exploitability. The solver also computes a reference banker who always stands on 16+; those numbers stay in `data/solution.json` but are not shown on the site.
- `solver/explain.js`: lists every hand in every chart cell with its weight and exact stand/hit EVs, for the page's "show the math" panel.
- `js/exact.js`: an independent exact calculator (direct enumeration of every next card and every banker play) that the page runs in a worker to rebuild any cell from scratch, show the chance of each outcome and the EV sum, and check the result against the solver. It agrees with the solver on all 340 hands to within 1e-6.
- `solver/montecarlo.js`: multi-threaded Monte Carlo verification of the solved charts against the solved banker.
- `web/`: page template, app logic, and the Rules, Why-it-works and Settings copy (`rules.html`, `why.html`, `settings.html`); `build.js` assembles `index.html`.
