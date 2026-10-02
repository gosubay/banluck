#!/usr/bin/env node
/*
 * Monte Carlo verification: deal real shuffled single-deck hands and play the
 * solved charts. Results should match the exact solver within ~2 standard errors.
 *
 * Usage: node solver/montecarlo.js [--hands 20000000] [--in data/solution.json]
 * Writes data/montecarlo.json. Uses one worker thread per CPU core.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const C = require('../js/core.js');

if (!isMainThread) {
  const { rules, playerChart, dealerChart, hands, seed } = workerData;
  const res = C.simulate({
    rules, hands, seed, tally: true,
    playerPolicy: C.chartPolicy(playerChart),
    dealerPolicy: dealerChart ? C.dealerChartPolicy(dealerChart) : C.standOnMin,
  });
  parentPort.postMessage(res);
  return;
}

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const HANDS = +argVal('--hands', 20000000);
const BASE_HANDS = +argVal('--baseline-hands', 4000000);
const IN = argVal('--in', path.join(__dirname, '..', 'data', 'solution.json'));
const OUT = argVal('--out', path.join(__dirname, '..', 'data', 'montecarlo.json'));
const sol = JSON.parse(fs.readFileSync(IN, 'utf8'));
const THREADS = Math.max(1, os.cpus().length);

function runParallel(job, hands, seedBase) {
  const per = Math.ceil(hands / THREADS);
  return Promise.all(Array.from({ length: THREADS }, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { ...job, hands: per, seed: seedBase * 1000 + i + 1 } });
    w.on('message', resolve); w.on('error', reject);
  }))).then((parts) => {
    // merge per-thread means/variances
    const n = parts.reduce((a, p) => a + p.hands, 0);
    const mean = parts.reduce((a, p) => a + p.mean * p.hands, 0) / n;
    const ex2 = parts.reduce((a, p) => a + (p.sd * p.sd + p.mean * p.mean) * p.hands, 0) / n;
    const sd = Math.sqrt(ex2 - mean * mean);
    const tally = {};
    for (const p of parts) for (const [k, v] of Object.entries(p.tally)) tally[k] = (tally[k] || 0) + v;
    for (const k of Object.keys(tally)) tally[k] /= n;
    const avg = (f) => parts.reduce((a, p) => a + p[f] * p.hands, 0) / n;
    return { hands: n, mean, se: sd / Math.sqrt(n), sd, win: avg('win'), loss: avg('loss'), push: avg('push'), tally };
  });
}

(async () => {
  const out = { generated: new Date().toISOString(), threads: THREADS, variants: {} };
  let seed = 1;
  for (const [vid, v] of Object.entries(sol.variants)) {
    const rules = v.rules;
    const runs = [];
    const add = async (id, label, playerChart, dealer, exact, hands) => {
      const t0 = Date.now();
      const mc = await runParallel({ rules, playerChart, dealerChart: dealer }, hands, seed++);
      const z = (mc.mean - exact) / mc.se;
      runs.push({ id, label, dealer: dealer ? 'smart' : 'fixed', exact, ...mc, z, seconds: (Date.now() - t0) / 1000 });
      console.log(`${vid} ${label.padEnd(48)} MC ${mc.mean.toFixed(5)} ± ${mc.se.toFixed(5)}  exact ${exact.toFixed(5)}  z=${z.toFixed(2)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    };
    await add('optimal-fixed', 'Optimal chart vs fixed dealer', v.fixed.pureChart, null, v.fixed.chartEV, HANDS);
    await add('optimal-smart', 'Smart-dealer chart vs smart dealer', v.smart.pureChart, v.smart.dealerChart, v.smart.pureChartVsEqDealer, HANDS);
    for (const [bid, b] of Object.entries(v.fixed.baselines)) {
      await add(bid + '-fixed', b.name + ' vs fixed', v.baselineCharts[bid], null, b.ev, BASE_HANDS);
    }
    out.variants[vid] = runs;
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('wrote', OUT);
})();
