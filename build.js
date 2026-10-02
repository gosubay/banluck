#!/usr/bin/env node
/*
 * Builds the single-file site from web/template.html:
 *   index.html          full HTML document (GitHub Pages / open locally)
 *   dist/artifact.html  same page without the document skeleton (for Artifact publishing)
 * Inlines js/core.js, web/app.js, web/rules.html, web/why.html, web/settings.html and the solver / Monte Carlo results.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const sol = JSON.parse(R('data/solution.json'));
let mc = null;
try { mc = JSON.parse(R('data/montecarlo.json')); } catch (e) { console.warn('no data/montecarlo.json; offline table will be empty'); }

const r4 = (x) => +x.toFixed(6);
const data = { generated: sol.generated, compositions: sol.compositions, variants: {}, mc: null };
for (const [id, v] of Object.entries(sol.variants)) {
  const s = v.smart;
  data.variants[id] = {
    rules: v.rules,
    fixed: {
      optimalEV: r4(v.fixed.optimalEV), chartEV: r4(v.fixed.chartEV), chart: v.fixed.chart, pureChart: v.fixed.pureChart,
      baselines: Object.fromEntries(Object.entries(v.fixed.baselines).map(([k, b]) => [k, { name: b.name, ev: r4(b.ev) }])),
    },
    smart: {
      value: r4(s.value), exploitability: s.exploitability, chart: s.chart, pureChart: s.pureChart, dealerChart: s.dealerChart,
      pureChartVsEqDealer: r4(s.pureChartVsEqDealer), pureChartVsDealerBR: r4(s.pureChartVsDealerBR),
      pureChartVsFixedDealer: r4(s.pureChartVsFixedDealer), fixedChartVsEqDealer: r4(s.fixedChartVsEqDealer),
      fixedChartVsDealerBR: r4(s.fixedChartVsDealerBR),
      baselines: Object.fromEntries(Object.entries(s.baselines).map(([k, b]) => [k, { name: b.name, evVsEq: r4(b.evVsEq), evVsBR: r4(b.evVsBR) }])),
    },
    baselineCharts: v.baselineCharts,
  };
}
if (mc) {
  data.mc = { generated: mc.generated, variants: {} };
  for (const [id, runs] of Object.entries(mc.variants))
    data.mc.variants[id] = runs.map((r) => ({ id: r.id, label: r.label, dealer: r.dealer, hands: r.hands, mean: r4(r.mean), se: r4(r.se), exact: r4(r.exact), z: +r.z.toFixed(2), win: r4(r.win), loss: r4(r.loss), push: r4(r.push) }));
}

const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');
const core = R('js/core.js');
let page = R('web/template.html')
  .replace('<!--RULES-->', () => R('web/rules.html'))
  .replace('<!--WHY-->', () => R('web/why.html'))
  .replace('<!--SETTINGS-->', () => R('web/settings.html'))
  .replace('/*__CORE__*/', () => safe(core) + '\nwindow.CORE_SRC = ' + safe(JSON.stringify(core)) + ';')
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
