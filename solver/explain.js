#!/usr/bin/env node
/*
 * Per-hand breakdown of every chart cell, for the "show the math" panel.
 *
 * For each decision cell (e.g. three-card hard 16) this lists every hand
 * composition that lands in it, how often it happens, and its exact stand and
 * hit EVs when you play the published player chart against the published
 * banker chart. The page recomputes the same numbers with its own enumeration
 * (js/exact.js), so the two can be checked against each other.
 *
 * Usage: node solver/explain.js [--in data/solution.json] [--out data/explain.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./solve.js');

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const IN = argVal('--in', path.join(__dirname, '..', 'data', 'solution.json'));
const OUT = argVal('--out', path.join(__dirname, '..', 'data', 'explain.json'));
const sol = JSON.parse(fs.readFileSync(IN, 'utf8'));

const r6 = (x) => +x.toFixed(6);
const out = { generated: new Date().toISOString(), variants: {} };
for (const [vid, v] of Object.entries(sol.variants)) {
  const T = S.buildTables(v.rules);
  const sigmaP = S.sigmaFromPlayerChart(T, v.smart.pureChart);
  const sigmaD = S.sigmaFromDealerChart(T, v.smart.dealerChart);
  const { pp } = S.evaluatePair(T, sigmaP, sigmaD);
  const { reach } = S.playerReach(T, sigmaP);
  const cells = {};
  for (let p = 0; p < S.NC; p++) {
    if (!S.isPDecision(T, p)) continue;
    // chance the banker's two cards are not Ban-Ban / Ban-Luck, given your cards
    let ns = 0;
    for (const d of S.D2NS) if (S.feasible(p, d)) ns += S.pcomp2(p, d);
    const w = reach[p] * ns;
    const k = S.KEY[p];
    (cells[k] || (cells[k] = [])).push([S.cardsOf(S.comps[p].cnt).join(' '), w, r6(pp.US[p] / ns), r6(pp.UH[p] / ns)]);
  }
  for (const k of Object.keys(cells)) {
    const list = cells[k], tot = list.reduce((a, c) => a + c[1], 0);
    // share of the cell; hands you never reach with the chart keep a tiny weight
    for (const c of list) c[1] = tot > 0 ? r6(c[1] / tot) : 0;
    list.sort((a, b) => b[1] - a[1]);
  }
  out.variants[vid] = cells;
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
