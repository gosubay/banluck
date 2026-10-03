/*
 * Exact expected values for one hand, by direct enumeration.
 *
 * This is a second, independent way to get the numbers in the strategy chart:
 * instead of the solver's table passes it walks every card you could draw and
 * every way the banker could play, with exact single-deck card removal. The
 * page uses it for the "show the math" panel and checks it against the solver.
 *
 * Model: you play the published player chart, the banker plays the published
 * banker chart (it sees only how many cards you hold). Your cards are known,
 * and so is the fact that the banker's first two cards were not Ban-Ban or
 * Ban-Luck (those are shown and settled before anyone draws).
 *
 * Ranks are 1..10 (1 = Ace, 10 = any ten-value card). Needs BanluckCore.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.BanluckExact = factory(root.BanluckCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const CNT = [4, 4, 4, 4, 4, 4, 4, 4, 4, 16];
  const DECK = 52;
  // Every result a hand can settle for, in units of the bet.
  const PAYOFFS = [-7, -3, -2, -1, 0, 1, 2, 3, 7];
  const PI = new Map(PAYOFFS.map((v, i) => [v, i]));
  // How the banker's hand can finish.
  const CATS = ['Busts', '16', '17', '18', '19', '20', '21', '五龙', '五龙 21', '777'];

  const pack = (cnt) => { let k = 0; for (let i = 9; i >= 0; i--) k = k * 17 + cnt[i]; return k; };
  const size = (cnt) => cnt.reduce((a, b) => a + b, 0);
  const cardsOf = (cnt) => { const a = []; for (let i = 0; i < 10; i++) for (let k = 0; k < cnt[i]; k++) a.push(i + 1); return a; };
  const fromRanks = (ranks) => { const c = new Array(10).fill(0); for (const r of ranks) c[r - 1]++; return c; };
  const plus = (cnt, r) => { const c = cnt.slice(); c[r]++; return c; };
  const choose2 = (a) => a * (a - 1) / 2;

  function create(rules, playerChart, bankerChart) {
    const evalMemo = new Map();
    const evalCnt = (cnt) => {
      const k = pack(cnt);
      let e = evalMemo.get(k);
      if (!e) { e = C.evaluate(cardsOf(cnt), rules); e.key = e.n + '|' + e.total + '|' + (e.soft ? 's' : 'h'); evalMemo.set(k, e); }
      return e;
    };
    const catOf = (e) => (e.bust ? 0 : e.tier === C.TIER.TRIPLE7 ? 9 : e.tier === C.TIER.DRAGON21 ? 8 : e.tier === C.TIER.DRAGON ? 7 : e.total - 15);
    // A stand-in banker hand for each category, used to settle against yours.
    const catEval = CATS.map((_, i) => (i === 0 ? { bust: true, tier: C.TIER.BUST, mult: 1 }
      : i <= 6 ? { bust: false, tier: C.TIER.REGULAR, total: i + 15, mult: 1 }
        : i === 7 ? { bust: false, tier: C.TIER.DRAGON, mult: rules.pay.dragon }
          : i === 8 ? { bust: false, tier: C.TIER.DRAGON21, mult: rules.pay.dragon21 }
            : { bust: false, tier: C.TIER.TRIPLE7, mult: rules.pay.triple7 }));

    // Banker's finishing distribution, given your cards and his current cards.
    const bankMemo = new Map();
    function bankerDist(pCnt, pk, np, dCnt) {
      let m = bankMemo.get(pk);
      if (!m) { m = new Map(); bankMemo.set(pk, m); }
      const dk = pack(dCnt);
      const hit = m.get(dk);
      if (hit) return hit;
      const e = evalCnt(dCnt), out = new Float64Array(CATS.length);
      if (e.terminal) out[catOf(e)] = 1;
      else {
        const q = e.total < rules.dealerMinStand ? 1 : ((bankerChart[np] || {})[e.key] || 0);
        if (q < 1) out[catOf(e)] += 1 - q;
        if (q > 0) {
          const rem = DECK - np - size(dCnt);
          for (let r = 0; r < 10; r++) {
            const avail = CNT[r] - pCnt[r] - dCnt[r];
            if (avail <= 0) continue;
            const sub = bankerDist(pCnt, pk, np, plus(dCnt, r)), w = q * avail / rem;
            for (let i = 0; i < out.length; i++) out[i] += w * sub[i];
          }
        }
      }
      m.set(dk, out);
      return out;
    }

    // You stand on pCnt: how the banker finishes, and the chance he had no 2-card special.
    const standMemo = new Map();
    function standCats(pCnt) {
      const pk = pack(pCnt);
      const hit = standMemo.get(pk);
      if (hit) return hit;
      const np = size(pCnt), rem = DECK - np, cats = new Float64Array(CATS.length);
      let ok = 0;
      for (let a = 0; a < 10; a++) for (let b = a; b < 10; b++) {
        const xa = CNT[a] - pCnt[a], xb = CNT[b] - pCnt[b];
        const ways = a === b ? choose2(xa) : xa * xb;
        if (ways <= 0) continue;
        if (a === 0 && (b === 0 || b === 9)) continue; // Ban-Ban / Ban-Luck would already be settled
        const d = new Array(10).fill(0); d[a]++; d[b]++;
        const sub = bankerDist(pCnt, pk, np, d);
        for (let i = 0; i < cats.length; i++) cats[i] += ways * sub[i];
        ok += ways;
      }
      for (let i = 0; i < cats.length; i++) cats[i] /= ok;
      const res = { cats, ns: ok / choose2(rem) };
      standMemo.set(pk, res);
      return res;
    }
    function standPayoff(pCnt) {
      const pe = evalCnt(pCnt), { cats } = standCats(pCnt), dist = new Float64Array(PAYOFFS.length);
      for (let i = 0; i < cats.length; i++) if (cats[i] > 0) dist[PI.get(C.settle(pe, catEval[i], rules))] += cats[i];
      return dist;
    }

    // Chance of each next card, given your cards and that the banker has no special.
    function nextCards(pCnt) {
      const ns = standCats(pCnt).ns, rem = DECK - size(pCnt), rows = [];
      for (let r = 0; r < 10; r++) {
        const left = CNT[r] - pCnt[r];
        if (left <= 0) continue;
        const child = plus(pCnt, r);
        rows.push({ rank: r + 1, left, rem, prob: left / rem * standCats(child).ns / ns, child });
      }
      return rows;
    }

    // What you do with a hand: 1 = hit, 0 = stand.
    function hitProb(pCnt) {
      const e = evalCnt(pCnt);
      if (e.terminal) return 0;
      if (e.total < rules.playerMinStand) return 1;
      return playerChart[e.key] || 0;
    }

    // Payoff distribution from here when you follow the chart.
    const valMemo = new Map();
    function value(pCnt) {
      const k = pack(pCnt);
      let v = valMemo.get(k);
      if (v) return v;
      const h = hitProb(pCnt);
      v = new Float64Array(PAYOFFS.length);
      if (h < 1) { const s = standPayoff(pCnt); for (let i = 0; i < v.length; i++) v[i] += (1 - h) * s[i]; }
      if (h > 0) { const x = hitPayoff(pCnt); for (let i = 0; i < v.length; i++) v[i] += h * x[i]; }
      valMemo.set(k, v);
      return v;
    }
    function hitPayoff(pCnt) {
      const dist = new Float64Array(PAYOFFS.length);
      for (const row of nextCards(pCnt)) {
        const sub = value(row.child);
        for (let i = 0; i < dist.length; i++) dist[i] += row.prob * sub[i];
      }
      return dist;
    }

    const ev = (dist) => dist.reduce((a, p, i) => a + p * PAYOFFS[i], 0);

    return {
      evalCnt, standCats, standPayoff, hitPayoff, nextCards, hitProb, value, ev,
      /** Everything the panel shows for one hand. */
      explain(pCnt) {
        const pe = evalCnt(pCnt), st = standPayoff(pCnt);
        // what each way the banker can finish is worth to you
        const catPay = catEval.map((d) => C.settle(pe, d, rules));
        const stand = { cats: standCats(pCnt).cats, catPay, payoff: st, ev: ev(st) };
        if (pe.terminal) return { eval: pe, stand, hit: null };
        const hi = hitPayoff(pCnt);
        const rows = nextCards(pCnt).map((r) => {
          const e = evalCnt(r.child), sub = value(r.child);
          return Object.assign(r, { eval: e, hits: hitProb(r.child), ev: ev(sub) });
        });
        return { eval: pe, stand, hit: { rows, payoff: hi, ev: ev(hi) } };
      },
    };
  }

  return { create, fromRanks, cardsOf, PAYOFFS, CATS, CNT };
});
