/*
 * Banluck core engine: rules, hand evaluation, settlement, dealing and
 * hand simulation. Shared by the browser page and the Node solvers.
 *
 * Ranks are encoded 1..10 (1 = Ace, 10 = any ten-value card: 10/J/Q/K).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BanluckCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_RULES = Object.freeze({
    decks: 1,
    playerMinStand: 16,
    dealerMinStand: 16,
    maxCards: 5,
    bothBustPush: true,
    fiveCardBustMult: 2, // 1 = normal bust, 2 = a 5-card bust loses double (player only)
    pay: Object.freeze({ banBan: 3, banLuck: 2, triple7: 7, dragon: 2, dragon21: 3 }),
  });

  function rulesWith(overrides) {
    const r = Object.assign({}, DEFAULT_RULES, overrides || {});
    r.pay = Object.assign({}, DEFAULT_RULES.pay, (overrides && overrides.pay) || {});
    return r;
  }

  // ---- Hand values ---------------------------------------------------------
  // Ace values depend on how many cards are held:
  //   2 cards: Ace = 11 or 10      3 cards: Ace = 10 or 1      4-5 cards: Ace = 1
  // The best total is the highest one that does not exceed 21.

  /** Evaluate from summary counts: n cards, hard sum (Aces as 1), number of Aces. */
  function valueFrom(n, hard, aces) {
    if (aces === 0 || n >= 4) return { total: hard, soft: false };
    if (n === 2) {
      // one Ace: 11 (or 10). Two Aces is Ban-Ban; value it as 21 for display.
      if (aces >= 2) return { total: 21, soft: true };
      return { total: hard + 10, soft: true }; // other card + 11; never exceeds 21
    }
    // n === 3: each Ace may be 1 or 10 -> add 9 per upgraded Ace
    let best = hard;
    let soft = false;
    for (let k = 1; k <= aces; k++) {
      const t = hard + 9 * k;
      if (t <= 21) { best = t; soft = true; }
    }
    return { total: best, soft };
  }

  function summarize(cards) {
    let hard = 0, aces = 0, sevens = 0, tens = 0;
    for (const c of cards) {
      hard += c;
      if (c === 1) aces++;
      if (c === 7) sevens++;
      if (c === 10) tens++;
    }
    return { n: cards.length, hard, aces, sevens, tens };
  }

  /** Two-card instant specials: 'banBan' (A-A), 'banLuck' (A + ten-value), or null. */
  function special2(cards) {
    if (cards.length !== 2) return null;
    const s = summarize(cards);
    if (s.aces === 2) return 'banBan';
    if (s.aces === 1 && s.tens === 1) return 'banLuck';
    return null;
  }

  // Final-hand tiers, best first: 777 > 五龙 21 > 五龙 (Five Dragons) > regular.
  const TIER = { BUST: -1, REGULAR: 0, DRAGON: 1, DRAGON21: 2, TRIPLE7: 3 };

  /** Full evaluation of a final (or in-progress) hand. */
  function evaluate(cards, rules) {
    rules = rules || DEFAULT_RULES;
    const s = summarize(cards);
    const v = valueFrom(s.n, s.hard, s.aces);
    const bust = v.total > 21;
    let tier = TIER.REGULAR, mult = 1, label = String(v.total);
    if (bust) {
      tier = TIER.BUST;
      mult = s.n === 5 ? rules.fiveCardBustMult : 1;
      label = s.n === 5 ? 'Five-card bust' : 'Bust';
    } else if (s.n === 3 && s.sevens === 3) {
      tier = TIER.TRIPLE7; mult = rules.pay.triple7; label = '777';
    } else if (s.n === 5) {
      if (v.total === 21) { tier = TIER.DRAGON21; mult = rules.pay.dragon21; label = 'Five Dragons 21'; }
      else { tier = TIER.DRAGON; mult = rules.pay.dragon; label = 'Five Dragons'; }
    }
    // A hand must stop when bust, at 5 cards, or on 777.
    const terminal = bust || s.n >= 5 || tier === TIER.TRIPLE7;
    return { n: s.n, total: v.total, soft: v.soft, bust, tier, mult, label, terminal };
  }

  /**
   * Settle two finished hands (neither had a 2-card special).
   * Returns the player's result in betting units (+ = player wins).
   */
  function settle(p, d, rules) {
    rules = rules || DEFAULT_RULES;
    if (p.bust) {
      if (d.bust) return rules.bothBustPush ? 0 : -p.mult;
      return -Math.max(p.mult, d.mult);
    }
    if (d.bust) return p.mult;
    if (p.tier !== d.tier) return p.tier > d.tier ? p.mult : -d.mult;
    if (p.tier !== TIER.REGULAR) return 0; // same special tier: push
    return p.total > d.total ? 1 : p.total < d.total ? -1 : 0;
  }

  /** Settle the instant 2-card specials. Returns null if neither side has one. */
  function settleSpecials(pSpec, dSpec, rules) {
    rules = rules || DEFAULT_RULES;
    if (!pSpec && !dSpec) return null;
    const rank = { banBan: 2, banLuck: 1 };
    const pr = pSpec ? rank[pSpec] : 0, dr = dSpec ? rank[dSpec] : 0;
    if (pr === dr) return 0;
    return pr > dr ? rules.pay[pSpec] : -rules.pay[dSpec];
  }

  /** Chart key for a player/dealer decision: "<cards>|<total>|<s|h>". */
  function stateKey(cards) {
    const s = summarize(cards);
    const v = valueFrom(s.n, s.hard, s.aces);
    return s.n + '|' + v.total + '|' + (v.soft ? 's' : 'h');
  }

  // ---- Random numbers & dealing -------------------------------------------
  /** Small fast seeded PRNG (xoshiro128**). */
  function rng(seed) {
    // expand the seed into 128 bits of state with splitmix32
    let z = seed >>> 0;
    const mix = () => {
      z = (z + 0x9e3779b9) | 0;
      let t = z ^ (z >>> 16); t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15; t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
    let a = mix(), b = mix(), c = mix(), d = mix();
    function next() {
      const t = b << 9;
      let r = Math.imul(b, 5); r = Math.imul((r << 7) | (r >>> 25), 9);
      c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
      return (r >>> 0) / 4294967296;
    }
    for (let i = 0; i < 16; i++) next();
    return next;
  }

  function newDeck(decks) {
    const deck = [];
    for (let k = 0; k < (decks || 1); k++)
      for (let r = 1; r <= 10; r++) {
        const copies = r === 10 ? 16 : 4;
        for (let i = 0; i < copies; i++) deck.push(r);
      }
    return deck;
  }

  /** Draws cards without replacement using a lazy Fisher-Yates over a fresh deck. */
  function Shoe(rand, decks) {
    this.rand = rand;
    this.base = newDeck(decks);
    this.cards = this.base.slice();
    this.top = 0;
  }
  Shoe.prototype.shuffle = function () { this.top = 0; };
  Shoe.prototype.draw = function () {
    const a = this.cards, i = this.top + Math.floor(this.rand() * (a.length - this.top));
    const c = a[i]; a[i] = a[this.top]; a[this.top] = c;
    this.top++;
    return c;
  };

  // ---- Policies -------------------------------------------------------------
  // A player policy is fn(cards) -> probability of hitting (only asked when a
  // real choice exists: total >= min stand, < 5 cards, not finished).
  // A dealer policy is fn(cards, playerCardCount) -> probability of hitting.

  function chartPolicy(chart) {
    // chart: { key: hitProbability }
    return (cards) => {
      const p = chart[stateKey(cards)];
      return p === undefined ? 0 : p;
    };
  }
  function dealerChartPolicy(chart) {
    // chart: { "<np>": { key: hitProbability } }
    return (cards, np) => {
      const t = chart[np];
      const p = t && t[stateKey(cards)];
      return p === undefined ? 0 : p;
    };
  }
  const standOnMin = () => 0;

  function mustHit(e, min) { return !e.terminal && e.total < min; }

  /**
   * Play one complete hand. Returns
   * { result, player:[...], dealer:[...], pSpec, dSpec, pEval, dEval }.
   */
  function playHand(shoe, rules, playerPolicy, dealerPolicy) {
    rules = rules || DEFAULT_RULES;
    shoe.shuffle();
    const rand = shoe.rand;
    const player = [shoe.draw(), shoe.draw()];
    const dealer = [shoe.draw(), shoe.draw()];
    const pSpec = special2(player), dSpec = special2(dealer);
    const sp = settleSpecials(pSpec, dSpec, rules);
    if (sp !== null) return { result: sp, player, dealer, pSpec, dSpec, pEval: null, dEval: null };

    let pe = evaluate(player, rules);
    while (!pe.terminal) {
      if (!mustHit(pe, rules.playerMinStand)) {
        const h = playerPolicy(player);
        if (!(h >= 1 || (h > 0 && rand() < h))) break;
      }
      player.push(shoe.draw());
      pe = evaluate(player, rules);
    }
    const np = player.length;
    let de = evaluate(dealer, rules);
    while (!de.terminal) {
      if (!mustHit(de, rules.dealerMinStand)) {
        const h = dealerPolicy(dealer, np);
        if (!(h >= 1 || (h > 0 && rand() < h))) break;
      }
      dealer.push(shoe.draw());
      de = evaluate(dealer, rules);
    }
    return { result: settle(pe, de, rules), player, dealer, pSpec, dSpec, pEval: pe, dEval: de };
  }

  /**
   * Monte Carlo: simulate n hands. Returns mean, standard error and an
   * outcome breakdown. `onProgress(done)` is optional.
   */
  function simulate(opts) {
    const rules = opts.rules || DEFAULT_RULES;
    const rand = rng(opts.seed || 12345);
    const shoe = new Shoe(rand, rules.decks);
    let sum = 0, sumSq = 0, win = 0, loss = 0, push = 0;
    const tally = {};
    const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };
    for (let i = 0; i < opts.hands; i++) {
      const h = playHand(shoe, rules, opts.playerPolicy, opts.dealerPolicy);
      sum += h.result; sumSq += h.result * h.result;
      if (h.result > 0) win++; else if (h.result < 0) loss++; else push++;
      if (opts.tally) {
        if (h.pSpec) bump('player ' + h.pSpec);
        if (h.dSpec) bump('dealer ' + h.dSpec);
        if (h.pEval) {
          bump('player ' + (h.pEval.tier === TIER.REGULAR ? 'regular' : h.pEval.label));
          bump('dealer ' + (h.dEval.tier === TIER.REGULAR ? 'regular' : h.dEval.label));
          if (h.pEval.bust && h.dEval.bust) bump('both bust');
        }
      }
    }
    const n = opts.hands;
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return { hands: n, mean, se: Math.sqrt(variance / n), sd: Math.sqrt(variance), win: win / n, loss: loss / n, push: push / n, tally };
  }

  return {
    DEFAULT_RULES, rulesWith, TIER, valueFrom, summarize, special2, evaluate, settle,
    settleSpecials, stateKey, rng, newDeck, Shoe, chartPolicy, dealerChartPolicy,
    standOnMin, playHand, simulate,
  };
});
