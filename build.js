#!/usr/bin/env node
/*
 * Builds the single-file site from web/template.html:
 *   index.html          full HTML document (GitHub Pages / open locally)
 *   dist/artifact.html  same page without the document skeleton (for Artifact publishing)
 * Inlines js/core.js, js/exact.js, web/app.js, web/rules.html, web/why.html, web/settings.html and the
 * solver / per-hand / Monte Carlo results.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const sol = JSON.parse(R('data/solution.json'));
const explain = JSON.parse(R('data/explain.json'));
const X = require('./js/exact.js');
let mc = null;
try { mc = JSON.parse(R('data/montecarlo.json')); } catch (e) { console.warn('no data/montecarlo.json; offline table will be empty'); }

const r4 = (x) => +x.toFixed(6);
const data = { generated: sol.generated, compositions: sol.compositions, variants: {}, mc: null };
// Cells used in the Why tab's "same total, different value" comparison.
const WHY_KEYS = ['2|16|h', '3|16|h', '4|16|h', '2|17|h', '3|17|h', '4|17|h'];
for (const [id, v] of Object.entries(sol.variants)) {
  const s = v.smart;
  // Chart EVs: you follow the published chart, the banker follows his, averaged
  // over the hands in each cell. The same numbers the "show the math" panel rebuilds.
  const cells = explain.variants[id];
  const chart = {};
  for (const [k, c] of Object.entries(s.chart)) {
    const list = cells[k] || [], ag = (i) => list.reduce((a, x) => a + x[1] * x[i], 0);
    const st = ag(2), hi = ag(3);
    chart[k] = { hit: c.hit, standEV: r4(st), hitEV: r4(hi), margin: r4(hi - st) };
  }
  const E = X.create(v.rules, s.pureChart, s.dealerChart), why = {};
  for (const k of WHY_KEYS) {
    const a = { stand: 0, hit: 0, bankerBust: 0, banker16: 0, bust: 0, safe: 0, standPay: new Array(9).fill(0), hitPay: new Array(9).fill(0) };
    for (const [cards, w] of cells[k]) {
      const e = E.explain(X.fromRanks(cards.split(' ').map(Number)));
      a.stand += w * e.stand.ev; a.hit += w * e.hit.ev;
      a.bankerBust += w * e.stand.cats[0]; a.banker16 += w * e.stand.cats[1];
      for (const r of e.hit.rows) { if (r.eval.bust) a.bust += w * r.prob; else a.safe += w * r.left; }
      for (let i = 0; i < 9; i++) { a.standPay[i] += w * e.stand.payoff[i]; a.hitPay[i] += w * e.hit.payoff[i]; }
    }
    for (const f of ['stand', 'hit', 'bankerBust', 'banker16', 'bust', 'safe']) a[f] = r4(a[f]);
    a.standPay = a.standPay.map(r4); a.hitPay = a.hitPay.map(r4);
    why[k] = a;
  }
  // The site shows only the equilibrium: both sides play optimally. The solver's
  // fixed-banker results stay in data/solution.json but are not shipped.
  data.variants[id] = {
    rules: v.rules,
    value: r4(s.value), exploitability: s.exploitability,
    chart, pureChart: s.pureChart, hands: cells, why, bankerChart: s.dealerChart, bankerEV: s.dealerEV,
    chartEV: r4(s.pureChartVsEqDealer), chartVsBR: r4(s.pureChartVsDealerBR),
    baselines: Object.fromEntries(Object.entries(s.baselines).map(([k, b]) => [k, { name: b.name, evVsEq: r4(b.evVsEq), evVsBR: r4(b.evVsBR) }])),
    baselineCharts: v.baselineCharts,
  };
}
if (mc) {
  data.mc = { generated: mc.generated, variants: {} };
  for (const [id, runs] of Object.entries(mc.variants))
    data.mc.variants[id] = runs.map((r) => ({ id: r.id, label: r.label, hands: r.hands, mean: r4(r.mean), se: r4(r.se), exact: r4(r.exact), z: +r.z.toFixed(2), win: r4(r.win), loss: r4(r.loss), push: r4(r.push) }));
}

const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');
const core = R('js/core.js'), exact = R('js/exact.js');
let page = R('web/template.html')
  .replace('<!--RULES-->', () => R('web/rules.html'))
  .replace('<!--WHY-->', () => R('web/why.html'))
  .replace('<!--SETTINGS-->', () => R('web/settings.html'))
  .replace('/*__CORE__*/', () => safe(core) + '\nwindow.CORE_SRC = ' + safe(JSON.stringify(core)) + ';')
  .replace('/*__EXACT__*/', () => safe(exact) + '\nwindow.EXACT_SRC = ' + safe(JSON.stringify(exact)) + ';')
  .replace('/*__DATA__*/', () => 'window.BL_DATA = ' + safe(JSON.stringify(data)) + ';')
  .replace('/*__APP__*/', () => safe(R('web/app.js')));

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), page);

const split = page.indexOf('<header class="top">');
const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<meta name="description" content="Solved Banluck (Chinese New Year blackjack) strategy: playable game, Monte Carlo simulator, strategy chart, rules and plain-English explanations.">\n' +
  page.slice(0, split) + '</head>\n<body>\n' + page.slice(split) + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'index.html'), full);
console.log(`built index.html (${(full.length / 1024).toFixed(0)} KB) and dist/artifact.html`);
