#!/usr/bin/env node
/*
 * Exact Banluck solver (single deck, card-removal exact, heads-up).
 *
 *  - Fixed dealer: dealer hits below 16 and stands on 16+. The player's best
 *    response is found by backward induction over every possible hand
 *    composition.
 *  - Smart dealer: the dealer sees how many cards the player holds (cards are
 *    face down, but the count is visible) and adapts. This is a two-player
 *    zero-sum imperfect-information game; we solve it with CFR+ and report
 *    exploitability.
 *
 * Usage: node solver/solve.js [--iters 400] [--out data/solution.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/core.js');

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAX_ITERS = +argVal('--iters', 400);
const TARGET_GAP = +argVal('--gap', 2e-5);
const OUT = argVal('--out', path.join(__dirname, '..', 'data', 'solution.json'));

const CNT = [4, 4, 4, 4, 4, 4, 4, 4, 4, 16]; // rank index 0 = Ace ... 9 = ten-value
const DECK = 52;

// ---- Enumerate every hand composition of 2..5 cards ------------------------
const comps = [];
const index = new Map();
const packKey = (cnt) => { let k = 0; for (let i = 9; i >= 0; i--) k = k * 17 + cnt[i]; return k; };
(function gen() {
  const cur = new Array(10).fill(0);
  function rec(i, left, size) {
    if (i === 10) {
      if (left === 0) comps.push({ cnt: Uint8Array.from(cur), n: size });
      return;
    }
    for (let k = 0; k <= Math.min(left, CNT[i]); k++) { cur[i] = k; rec(i + 1, left - k, size); }
    cur[i] = 0;
  }
  for (let s = 2; s <= 5; s++) rec(0, s, s);
})();
comps.forEach((c, i) => index.set(packKey(c.cnt), i));
const NC = comps.length;

const cardsOf = (cnt) => { const a = []; for (let i = 0; i < 10; i++) for (let k = 0; k < cnt[i]; k++) a.push(i + 1); return a; };
const SIZE = new Uint8Array(NC);
const CNTS = new Uint8Array(NC * 10);
const CHILD = new Int32Array(NC * 10).fill(-1);
const KEY = new Array(NC);
const SPEC = new Array(NC); // 2-card special name or null
for (let i = 0; i < NC; i++) {
  const c = comps[i];
  SIZE[i] = c.n;
  CNTS.set(c.cnt, i * 10);
  const cards = cardsOf(c.cnt);
  KEY[i] = C.stateKey(cards);
  SPEC[i] = C.special2(cards);
  if (c.n < 5) for (let r = 0; r < 10; r++) {
    if (c.cnt[r] + 1 > CNT[r]) continue;
    const nc = Uint8Array.from(c.cnt); nc[r]++;
    CHILD[i * 10 + r] = index.get(packKey(nc));
  }
}
const bySize = [[], [], [], [], [], []];
for (let i = 0; i < NC; i++) bySize[SIZE[i]].push(i);
const PL = [null, null, bySize[2].filter((i) => !SPEC[i]), bySize[3], bySize[4], bySize[5]];
const PLPOS = new Int32Array(NC).fill(-1);
for (let np = 2; np <= 5; np++) PL[np].forEach((ci, j) => { PLPOS[ci] = j; });
const DORDER = [...bySize[5], ...bySize[4], ...bySize[3], ...bySize[2].filter((i) => !SPEC[i])];
const D2NS = bySize[2].filter((i) => !SPEC[i]);
const D2ALL = bySize[2];

const FALL = []; // FALL[a][k] = a (a-1) ... (a-k+1)
for (let a = 0; a <= DECK; a++) { FALL[a] = [1]; for (let k = 1; k <= 5; k++) FALL[a][k] = FALL[a][k - 1] * Math.max(0, a - k + 1); }
const choose2 = (a) => a * (a - 1) / 2;

function feasible(p, d) {
  for (let r = 0; r < 10; r++) if (CNTS[p * 10 + r] + CNTS[d * 10 + r] > CNT[r]) return false;
  return true;
}
/** Probability of one specific ordered draw of composition d from the deck minus p. */
function pseq(p, d) {
  const n = SIZE[d], rem = DECK - (p >= 0 ? SIZE[p] : 0);
  let num = 1;
  for (let r = 0; r < 10; r++) {
    const k = CNTS[d * 10 + r];
    if (k) num *= FALL[CNT[r] - (p >= 0 ? CNTS[p * 10 + r] : 0)][k];
  }
  return num / FALL[rem][n];
}
/** Probability that a 2-card hand is exactly composition d (unordered), given p removed. */
function pcomp2(p, d) {
  const rem = DECK - (p >= 0 ? SIZE[p] : 0);
  let num = 1;
  for (let r = 0; r < 10; r++) {
    const k = CNTS[d * 10 + r];
    if (!k) continue;
    const a = CNT[r] - (p >= 0 ? CNTS[p * 10 + r] : 0);
    num *= k === 1 ? a : choose2(a);
  }
  return num / choose2(rem);
}

// ---- Rules-dependent tables ----------------------------------------------
function buildTables(rules) {
  const EV = comps.map((c) => C.evaluate(cardsOf(c.cnt), rules));
  const TERM = new Uint8Array(NC), FORCED_P = new Uint8Array(NC), FORCED_D = new Uint8Array(NC);
  for (let i = 0; i < NC; i++) {
    TERM[i] = EV[i].terminal ? 1 : 0;
    FORCED_P[i] = !EV[i].terminal && EV[i].total < rules.playerMinStand ? 1 : 0;
    FORCED_D[i] = !EV[i].terminal && EV[i].total < rules.dealerMinStand ? 1 : 0;
  }
  // payoff[np][pos(P) * NC + D], -128 = impossible combination
  const PAY = [null, null];
  for (let np = 2; np <= 5; np++) {
    const arr = new Int8Array(PL[np].length * NC).fill(-128);
    PL[np].forEach((p, j) => {
      for (const d of DORDER) if (feasible(p, d)) arr[j * NC + d] = C.settle(EV[p], EV[d], rules);
    });
    PAY.push(arr);
  }
  return { rules, EV, TERM, FORCED_P, FORCED_D, PAY };
}

// ---- Dealer pass ----------------------------------------------------------
/*
 * For players holding np cards: V[pos(P)*NC + D] = player's expected result
 * when the player stopped on P and the dealer currently holds D.
 * sigmaD[np*NC + D] = dealer hit probability at decision points.
 * If reachStop is given, counterfactual values per dealer decision are
 * accumulated (for CFR / best response). br = true picks the dealer's best
 * response (minimising the player's result) at every decision.
 */
function dealerPass(T, np, sigmaD, reachStop, br) {
  const pl = PL[np], NP = pl.length;
  const V = new Float64Array(NP * NC);
  const cfH = new Float64Array(NC), cfS = new Float64Array(NC);
  const PAY = T.PAY[np];
  const hitV = new Float64Array(NP), standV = new Float64Array(NP);
  for (const d of DORDER) {
    const nd = SIZE[d];
    const term = T.TERM[d], forced = T.FORCED_D[d];
    const decision = !term && !forced;
    const rem = DECK - np - nd;
    let sumH = 0, sumS = 0;
    for (let j = 0; j < NP; j++) {
      const pay = PAY[j * NC + d];
      if (pay === -128) continue;
      if (term) { V[j * NC + d] = pay; continue; }
      const p = pl[j];
      let h = 0;
      for (let r = 0; r < 10; r++) {
        const avail = CNT[r] - CNTS[p * 10 + r] - CNTS[d * 10 + r];
        if (avail > 0) h += avail * V[j * NC + CHILD[d * 10 + r]];
      }
      h /= rem;
      if (forced) { V[j * NC + d] = h; continue; }
      hitV[j] = h; standV[j] = pay;
      if (reachStop) {
        const rs = reachStop[p];
        if (rs > 0) {
          const w = rs * pseq(p, d);
          sumH += w * h; sumS += w * pay;
        }
      }
    }
    if (!decision) continue;
    cfH[d] = sumH; cfS[d] = sumS;
    let s = sigmaD[np * NC + d];
    if (br) s = sumH < sumS ? 1 : 0;
    for (let j = 0; j < NP; j++) {
      if (PAY[j * NC + d] === -128) continue;
      V[j * NC + d] = s * hitV[j] + (1 - s) * standV[j];
    }
    if (br) sigmaD[np * NC + d] = s;
  }
  return { V, cfH, cfS };
}

// ---- Player pass ----------------------------------------------------------
/*
 * U[P] = E[result * 1{dealer had no 2-card special} | player holds P], with
 * the dealer's two cards drawn from the deck minus P. By exchangeability the
 * player's future draws may be taken from the deck minus P first.
 */
function playerPass(T, Vs, sigmaP, br) {
  const U = new Float64Array(NC), UH = new Float64Array(NC), US = new Float64Array(NC);
  for (let s = 5; s >= 2; s--) {
    for (const p of bySize[s]) {
      if (s === 2 && SPEC[p]) continue;
      const V = Vs[s], j = PLPOS[p];
      let st = 0;
      for (const d of D2NS) {
        const pay = T.PAY[s][j * NC + d];
        if (pay === -128) continue;
        st += pcomp2(p, d) * V[j * NC + d];
      }
      US[p] = st;
      if (T.TERM[p]) { U[p] = st; continue; }
      const rem = DECK - s;
      let h = 0;
      for (let r = 0; r < 10; r++) {
        const avail = CNT[r] - CNTS[p * 10 + r];
        if (avail > 0) h += avail * U[CHILD[p * 10 + r]];
      }
      h /= rem;
      UH[p] = h;
      if (T.FORCED_P[p]) { U[p] = h; continue; }
      let sg = sigmaP[p];
      if (br) { sg = h > st ? 1 : 0; sigmaP[p] = sg; }
      U[p] = sg * h + (1 - sg) * st;
    }
  }
  return { U, UH, US };
}

/** Whole-game expected value per hand for the player. */
function gameValue(T, U) {
  let ev = 0;
  for (const p of D2ALL) {
    const pp = pcomp2(-1, p);
    if (!SPEC[p]) ev += pp * U[p];
    for (const d of D2ALL) {
      if (!feasible(p, d)) continue;
      const sp = C.settleSpecials(SPEC[p], SPEC[d], T.rules);
      if (sp === null) continue;
      ev += pp * pcomp2(p, d) * sp;
    }
  }
  return ev;
}

/** Player reach probabilities under sigmaP (chance included). */
function playerReach(T, sigmaP) {
  const reach = new Float64Array(NC), stop = new Float64Array(NC);
  for (const p of D2NS) reach[p] = pcomp2(-1, p);
  for (let s = 2; s <= 5; s++) for (const p of bySize[s]) {
    const rp = reach[p];
    if (!rp) continue;
    const h = T.TERM[p] ? 0 : T.FORCED_P[p] ? 1 : sigmaP[p];
    stop[p] = rp * (1 - h);
    if (h > 0) {
      const rem = DECK - s;
      for (let r = 0; r < 10; r++) {
        const avail = CNT[r] - CNTS[p * 10 + r];
        if (avail > 0) reach[CHILD[p * 10 + r]] += rp * h * avail / rem;
      }
    }
  }
  return { reach, stop };
}

/** Dealer own-reach (chance from full deck included) for averaging. */
function dealerReach(T, sigmaD, np) {
  const reach = new Float64Array(NC);
  for (const d of D2NS) reach[d] = pcomp2(-1, d);
  for (let s = 2; s < 5; s++) for (const d of bySize[s]) {
    const rd = reach[d];
    if (!rd || T.TERM[d]) continue;
    const h = T.FORCED_D[d] ? 1 : sigmaD[np * NC + d];
    if (h <= 0) continue;
    const rem = DECK - s;
    for (let r = 0; r < 10; r++) {
      const avail = CNT[r] - CNTS[d * 10 + r];
      if (avail > 0) reach[CHILD[d * 10 + r]] += rd * h * avail / rem;
    }
  }
  return reach;
}

const isPDecision = (T, p) => !(SIZE[p] === 2 && SPEC[p]) && !T.TERM[p] && !T.FORCED_P[p];
const isDDecision = (T, d) => !(SIZE[d] === 2 && SPEC[d]) && !T.TERM[d] && !T.FORCED_D[d];

function allDealerPasses(T, sigmaD, reachStop, br) {
  const Vs = [null, null], cf = [null, null];
  for (let np = 2; np <= 5; np++) {
    const r = dealerPass(T, np, sigmaD, reachStop, br);
    Vs.push(r.V); cf.push(r);
  }
  return { Vs, cf };
}

/** Evaluate a (player sigma, dealer sigma) pair exactly. */
function evaluatePair(T, sigmaP, sigmaD) {
  const { Vs } = allDealerPasses(T, sigmaD, null, false);
  const pp = playerPass(T, Vs, sigmaP, false);
  return { ev: gameValue(T, pp.U), pp };
}
/** Player best response vs a dealer sigma. */
function playerBR(T, sigmaD) {
  const { Vs } = allDealerPasses(T, sigmaD, null, false);
  const sigmaP = new Float64Array(NC);
  const pp = playerPass(T, Vs, sigmaP, true);
  return { ev: gameValue(T, pp.U), sigmaP, pp };
}
/** Dealer best response vs a player sigma. */
function dealerBR(T, sigmaP) {
  const { stop } = playerReach(T, sigmaP);
  const sigmaD = new Float64Array(6 * NC);
  const { Vs } = allDealerPasses(T, sigmaD, stop, true);
  const pp = playerPass(T, Vs, sigmaP, false);
  return { ev: gameValue(T, pp.U), sigmaD };
}

// ---- Chart aggregation ----------------------------------------------------
function playerChart(T, sigmaP, pp) {
  const { reach } = playerReach(T, sigmaP);
  const agg = {};
  for (let p = 0; p < NC; p++) {
    if (!isPDecision(T, p)) continue;
    // weight by reach under the strategy; fall back to raw likelihood if unreachable
    const w = reach[p] > 1e-15 ? reach[p] : 1e-9 * pseq(-1, p);
    let ns = 0;
    for (const d of D2NS) if (feasible(p, d)) ns += pcomp2(p, d);
    const k = KEY[p];
    const a = agg[k] || (agg[k] = { w: 0, hit: 0, margin: 0, standEV: 0, hitEV: 0, comps: 0, pure: 0, reach: 0 });
    a.w += w; a.hit += w * sigmaP[p]; a.comps++;
    a.margin += w * (pp.UH[p] - pp.US[p]) / ns;
    a.standEV += w * pp.US[p] / ns; a.hitEV += w * pp.UH[p] / ns;
    a.reach += reach[p];
  }
  const out = {};
  for (const k of Object.keys(agg)) {
    const a = agg[k];
    out[k] = {
      hit: +(a.hit / a.w).toFixed(4),
      margin: +(a.margin / a.w).toFixed(4),
      standEV: +(a.standEV / a.w).toFixed(4),
      hitEV: +(a.hitEV / a.w).toFixed(4),
      reach: +a.reach.toExponential(4),
    };
  }
  return out;
}
function dealerChart(T, sigmaD) {
  const out = {};
  for (let np = 2; np <= 5; np++) {
    const reach = dealerReach(T, sigmaD, np);
    const agg = {};
    for (let d = 0; d < NC; d++) {
      if (!isDDecision(T, d)) continue;
      const w = reach[d] > 1e-15 ? reach[d] : 1e-9 * pseq(-1, d);
      const a = agg[KEY[d]] || (agg[KEY[d]] = { w: 0, hit: 0 });
      a.w += w; a.hit += w * sigmaD[np * NC + d];
    }
    out[np] = {};
    for (const k of Object.keys(agg)) out[np][k] = +(agg[k].hit / agg[k].w).toFixed(4);
  }
  return out;
}
/** Expand a key-level chart back into per-composition sigmas. */
const sigmaFromPlayerChart = (T, chart) => {
  const s = new Float64Array(NC);
  for (let p = 0; p < NC; p++) if (isPDecision(T, p)) s[p] = chart[KEY[p]] ?? 0;
  return s;
};
const sigmaFromDealerChart = (T, chart) => {
  const s = new Float64Array(6 * NC);
  for (let np = 2; np <= 5; np++) for (let d = 0; d < NC; d++) if (isDDecision(T, d)) s[np * NC + d] = chart[np][KEY[d]] ?? 0;
  return s;
};
const pureOf = (chart) => Object.fromEntries(Object.entries(chart).map(([k, v]) => [k, v.hit >= 0.5 ? 1 : 0]));

// ---- Baseline strategies (key -> hit probability) -------------------------
function baselineCharts(T) {
  const keys = new Set();
  for (let p = 0; p < NC; p++) if (isPDecision(T, p)) keys.add(KEY[p]);
  const mk = (fn) => Object.fromEntries([...keys].map((k) => { const [n, t, s] = k.split('|'); return [k, fn(+n, +t, s === 's') ? 1 : 0]; }));
  return {
    standAtMin: { name: 'Stand on 16+ (copy the dealer)', chart: mk(() => false) },
    casino17: { name: 'Casino habit: hit 16, stand 17+', chart: mk((n, t) => t < 17) },
    charlieHunter: { name: 'Charlie chaser: always hit 4 cards', chart: mk((n, t) => n === 4) },
  };
}

// ---- CFR+ for the smart dealer --------------------------------------------
function solveSmart(T, log) {
  const sigmaP = new Float64Array(NC).fill(0.5);
  const sigmaD = new Float64Array(6 * NC).fill(0.5);
  const rPH = new Float64Array(NC), rPS = new Float64Array(NC);
  const rDH = new Float64Array(6 * NC), rDS = new Float64Array(6 * NC);
  const avgPN = new Float64Array(NC), avgPD = new Float64Array(NC);
  const avgDN = new Float64Array(6 * NC), avgDD = new Float64Array(6 * NC);
  const avgP = () => { const s = new Float64Array(NC); for (let i = 0; i < NC; i++) s[i] = avgPD[i] > 0 ? avgPN[i] / avgPD[i] : sigmaP[i]; return s; };
  const avgD = () => { const s = new Float64Array(6 * NC); for (let i = 0; i < 6 * NC; i++) s[i] = avgDD[i] > 0 ? avgDN[i] / avgDD[i] : sigmaD[i]; return s; };
  const rm = (h, s) => (h + s > 0 ? h / (h + s) : 0.5);
  let gap = Infinity, lo = NaN, hi = NaN, iters = 0;
  const history = [];
  for (let t = 1; t <= MAX_ITERS; t++) {
    iters = t;
    // Player update vs current dealer strategy
    {
      const { reach } = playerReach(T, sigmaP);
      const { Vs } = allDealerPasses(T, sigmaD, null, false);
      const pp = playerPass(T, Vs, sigmaP, false);
      for (let p = 0; p < NC; p++) {
        if (!isPDecision(T, p)) continue;
        const v = sigmaP[p] * pp.UH[p] + (1 - sigmaP[p]) * pp.US[p];
        avgPN[p] += t * reach[p] * sigmaP[p]; avgPD[p] += t * reach[p];
        rPH[p] = Math.max(0, rPH[p] + pp.UH[p] - v);
        rPS[p] = Math.max(0, rPS[p] + pp.US[p] - v);
        sigmaP[p] = rm(rPH[p], rPS[p]);
      }
    }
    // Dealer update vs updated player strategy (alternating CFR+)
    {
      const { stop } = playerReach(T, sigmaP);
      const { cf } = allDealerPasses(T, sigmaD, stop, false);
      for (let np = 2; np <= 5; np++) {
        const dr = dealerReach(T, sigmaD, np);
        for (let d = 0; d < NC; d++) {
          if (!isDDecision(T, d)) continue;
          const i = np * NC + d, s = sigmaD[i];
          const h = cf[np].cfH[d], st = cf[np].cfS[d];
          const v = s * h + (1 - s) * st;
          avgDN[i] += t * dr[d] * s; avgDD[i] += t * dr[d];
          rDH[i] = Math.max(0, rDH[i] + (v - h)); // dealer minimises
          rDS[i] = Math.max(0, rDS[i] + (v - st));
          sigmaD[i] = rm(rDH[i], rDS[i]);
        }
      }
    }
    if (t % 20 === 0 || t === MAX_ITERS) {
      const ap = avgP(), ad = avgD();
      hi = playerBR(T, ad).ev;
      lo = dealerBR(T, ap).ev;
      gap = hi - lo;
      history.push({ iter: t, playerBR: hi, dealerBR: lo, gap });
      log(`  iter ${t}: value in [${lo.toFixed(6)}, ${hi.toFixed(6)}]  exploitability ${gap.toExponential(2)}`);
      if (gap < TARGET_GAP) break;
    }
  }
  const sp = avgP(), sd = avgD();
  return { sigmaP: sp, sigmaD: sd, value: evaluatePair(T, sp, sd).ev, bounds: [lo, hi], gap, iters, history };
}

// ---- Main -----------------------------------------------------------------
function solveVariant(fiveCardBustMult) {
  const rules = C.rulesWith({ fiveCardBustMult });
  const t0 = Date.now();
  const log = (m) => console.log(m);
  log(`\n=== Variant: 5-card bust loses ${fiveCardBustMult}x ===`);
  const T = buildTables(rules);
  log(`tables built (${NC} compositions) in ${Date.now() - t0} ms`);
  const baselines = baselineCharts(T);
  const result = { rules, fixed: {}, smart: {} };

  // Fixed dealer
  const fixedD = new Float64Array(6 * NC); // all zero: stand on 16+
  const brF = playerBR(T, fixedD);
  const chartF = playerChart(T, brF.sigmaP, brF.pp);
  const pureF = pureOf(chartF);
  const pureFEval = evaluatePair(T, sigmaFromPlayerChart(T, pureF), fixedD).ev;
  log(`fixed dealer: optimal EV ${brF.ev.toFixed(6)}  chart EV ${pureFEval.toFixed(6)}  (${Date.now() - t0} ms)`);
  result.fixed = { optimalEV: brF.ev, chartEV: pureFEval, chart: chartF, pureChart: pureF, baselines: {} };
  for (const [id, b] of Object.entries(baselines))
    result.fixed.baselines[id] = { name: b.name, ev: evaluatePair(T, sigmaFromPlayerChart(T, b.chart), fixedD).ev };

  // Smart dealer
  log('smart dealer: CFR+ ...');
  const sm = solveSmart(T, log);
  const ppEq = playerPass(T, allDealerPasses(T, sm.sigmaD, null, false).Vs, sm.sigmaP, false);
  const chartS = playerChart(T, sm.sigmaP, ppEq);
  const dChartS = dealerChart(T, sm.sigmaD);
  const pureS = pureOf(chartS);
  const keyDealer = sigmaFromDealerChart(T, dChartS);
  const pureSigma = sigmaFromPlayerChart(T, pureS);
  const pureVsEq = evaluatePair(T, pureSigma, keyDealer).ev;
  const pureVsBR = dealerBR(T, pureSigma).ev;
  const fixedChartVsSmartBR = dealerBR(T, sigmaFromPlayerChart(T, pureF)).ev;
  const fixedChartVsEq = evaluatePair(T, sigmaFromPlayerChart(T, pureF), keyDealer).ev;
  const eqVsFixedDealer = evaluatePair(T, pureSigma, fixedD).ev;
  // dealer's equilibrium chart vs the naive "stand on 16+" player
  log(`smart dealer: game value ${sm.value.toFixed(6)} (gap ${sm.gap.toExponential(2)} after ${sm.iters} iters)`);
  log(`  pure chart vs eq dealer ${pureVsEq.toFixed(6)}, vs dealer best response ${pureVsBR.toFixed(6)}`);
  result.smart = {
    value: sm.value, bounds: sm.bounds, exploitability: sm.gap, iters: sm.iters, history: sm.history,
    chart: chartS, pureChart: pureS, dealerChart: dChartS,
    pureChartVsEqDealer: pureVsEq, pureChartVsDealerBR: pureVsBR, pureChartVsFixedDealer: eqVsFixedDealer,
    fixedChartVsEqDealer: fixedChartVsEq, fixedChartVsDealerBR: fixedChartVsSmartBR,
    baselines: {},
  };
  for (const [id, b] of Object.entries(baselines)) {
    const s = sigmaFromPlayerChart(T, b.chart);
    result.smart.baselines[id] = { name: b.name, evVsEq: evaluatePair(T, s, keyDealer).ev, evVsBR: dealerBR(T, s).ev };
  }
  result.baselineCharts = Object.fromEntries(Object.entries(baselines).map(([k, b]) => [k, b.chart]));
  result.seconds = (Date.now() - t0) / 1000;
  return result;
}

const out = { generated: new Date().toISOString(), compositions: NC, variants: {} };
for (const m of [1, 2]) out.variants['bust' + m] = solveVariant(m);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
