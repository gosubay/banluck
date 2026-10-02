/* Banluck Strategy Lab: page logic. Needs BanluckCore, BL_DATA and CORE_SRC globals. */
(function () {
  'use strict';
  const C = window.BanluckCore, D = window.BL_DATA;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const fmt = (x, d = 3) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  const pct = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(d) + '%';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- settings ----------------
  const S = { variant: 'bust2', dealer: 'fixed', coach: true };
  try {
    const saved = JSON.parse(localStorage.getItem('banluck-lab') || '{}');
    if (saved.variant in D.variants) S.variant = saved.variant;
    if (saved.dealer === 'fixed' || saved.dealer === 'smart') S.dealer = saved.dealer;
    if (typeof saved.coach === 'boolean') S.coach = saved.coach;
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem('banluck-lab', JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const V = () => D.variants[S.variant];
  const rules = () => V().rules;
  const playerChart = () => (S.dealer === 'fixed' ? V().fixed.pureChart : V().smart.pureChart);
  const chartInfo = () => (S.dealer === 'fixed' ? V().fixed.chart : V().smart.chart);
  const dealerPolicy = () => (S.dealer === 'fixed' ? C.standOnMin : C.dealerChartPolicy(V().smart.dealerChart));
  const bustLabel = () => (S.variant === 'bust2' ? 'five-card bust loses 2×' : 'five-card bust loses 1×');
  const dealerLabel = () => (S.dealer === 'fixed' ? 'fixed dealer' : 'smart dealer');

  function bindSegs() {
    $$('#seg-variant button').forEach((b) => b.addEventListener('click', () => { S.variant = b.dataset.v; save(); refreshAll(); }));
    $$('#seg-dealer button').forEach((b) => b.addEventListener('click', () => { S.dealer = b.dataset.d; save(); refreshAll(); }));
  }
  function syncSegs() {
    $$('#seg-variant button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.variant)));
    $$('#seg-dealer button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.d === S.dealer)));
  }

  // ---------------- tabs ----------------
  const TABS = ['play', 'chart', 'rules', 'why'];
  function showTab(id, focus) {
    if (!TABS.includes(id)) id = 'play';
    TABS.forEach((t) => {
      $('#' + t).hidden = t !== id;
      $('#t-' + t).setAttribute('aria-selected', String(t === id));
      $('#t-' + t).tabIndex = t === id ? 0 : -1;
    });
    if (focus) $('#t-' + id).focus();
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
  }
  function bindTabs() {
    TABS.forEach((t, i) => {
      const b = $('#t-' + t);
      b.addEventListener('click', () => showTab(t));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
          showTab(TABS[n], true);
        }
      });
    });
    window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
    showTab(location.hash.slice(1) || 'play');
  }

  // ---------------- describing hands ----------------
  function describeState(ranks) {
    const e = C.evaluate(ranks, rules());
    const hasAce = ranks.includes(1);
    let how = '';
    if (hasAce && !e.bust) {
      if (e.n === 2) how = 'Ace counted as 11';
      else if (e.n === 3) how = e.soft ? 'Ace counted as 10' : 'Ace counted as 1';
      else how = 'Ace counted as 1';
    }
    return { e, how };
  }
  function cellName(key) {
    const [n, t, s] = key.split('|');
    return `${n} cards, ${s === 's' ? (n === '2' ? 'Ace (11) + ' + (t - 11) : 'Ace counted as 10, total ' + t) : 'total ' + t}`;
  }

  // ---------------- the game ----------------
  const SUITS = ['♠', '♥', '♦', '♣'];
  const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const G = { deck: [], p: [], d: [], phase: 'idle', reveal: false, timer: null, decisions: [], stats: null };
  const freshStats = () => ({ hands: 0, net: 0, decisions: 0, matches: 0, cost: 0 });
  G.stats = freshStats();

  function newDeck() {
    const deck = [];
    for (const s of SUITS) LABELS.forEach((l, i) => deck.push({ label: l, suit: s, r: Math.min(10, i + 1) }));
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    return deck;
  }
  const ranks = (h) => h.map((c) => c.r);

  function cardEl(c, faceDown) {
    const el = document.createElement('div');
    if (faceDown) { el.className = 'card back'; el.setAttribute('aria-label', 'face-down card'); return el; }
    const red = c.suit === '♥' || c.suit === '♦';
    el.className = 'card' + (red ? ' red' : '');
    el.setAttribute('aria-label', c.label + c.suit);
    el.innerHTML = `<span class="tl">${c.label}<small>${c.suit}</small></span><span class="mid">${c.suit}</span>`;
    return el;
  }
  function renderHands() {
    const ph = $('#p-hand'), dh = $('#d-hand');
    ph.replaceChildren(...G.p.map((c) => cardEl(c, false)));
    dh.replaceChildren(...G.d.map((c) => cardEl(c, !G.reveal)));
    if (G.p.length) {
      const { e, how } = describeState(ranks(G.p));
      const sp = C.special2(ranks(G.p));
      $('#p-total').textContent = sp ? (sp === 'banBan' ? 'Ban-Ban' : 'Ban-Luck')
        : e.tier > 0 || e.bust ? `${e.label} (${e.total})` : `${e.total}${how ? ' · ' + how : ''}`;
    } else $('#p-total').textContent = '';
    if (G.d.length) {
      if (G.reveal) {
        const sp = C.special2(ranks(G.d));
        const e = C.evaluate(ranks(G.d), rules());
        $('#d-total').textContent = sp ? (sp === 'banBan' ? 'Ban-Ban' : 'Ban-Luck') : e.tier > 0 || e.bust ? `${e.label} (${e.total})` : String(e.total);
      } else $('#d-total').textContent = `${G.d.length} cards, face down`;
    } else $('#d-total').textContent = '';
    const playing = G.phase === 'player';
    const e = G.p.length ? C.evaluate(ranks(G.p), rules()) : null;
    $('#b-hit').disabled = !playing;
    $('#b-stand').disabled = !playing || (e && e.total < rules().playerMinStand);
    $('#b-deal').disabled = G.phase === 'player' || G.phase === 'dealer';
    renderCoach();
  }
  function setMsg(html) { $('#msg').innerHTML = html; }

  function deal() {
    clearTimeout(G.timer);
    G.deck = newDeck();
    G.p = [G.deck.pop(), G.deck.pop()];
    G.d = [G.deck.pop(), G.deck.pop()];
    G.reveal = false; G.decisions = [];
    const ps = C.special2(ranks(G.p)), ds = C.special2(ranks(G.d));
    const sp = C.settleSpecials(ps, ds, rules());
    if (sp !== null) {
      G.reveal = true;
      const name = (x) => (x === 'banBan' ? 'Ban-Ban' : 'Ban-Luck');
      let text;
      if (sp === 0) text = `Both sides have ${name(ps)}. Push.`;
      else if (sp > 0) text = `You have ${name(ps)}${ds ? ', which beats the banker\'s ' + name(ds) : ''}! Paid straight away.`;
      else text = `The banker turns over ${name(ds)}${ps ? ', which beats your ' + name(ps) : ''}. Settled straight away.`;
      finish(sp, text);
      return;
    }
    G.phase = 'player';
    setMsg('Your move. The banker has no Ban-Ban or Ban-Luck.');
    renderHands();
  }

  function recordDecision(action) {
    const e = C.evaluate(ranks(G.p), rules());
    if (e.terminal || e.total < rules().playerMinStand) return;
    const key = C.stateKey(ranks(G.p));
    const info = chartInfo()[key];
    const rec = playerChart()[key];
    if (!info) return;
    const mixed = info.hit > 0.1 && info.hit < 0.9;
    const ok = mixed || (rec === 1) === (action === 'hit');
    G.stats.decisions++;
    if (ok) G.stats.matches++;
    else G.stats.cost += Math.abs(info.margin);
    G.decisions.push({ key, action, ok, margin: info.margin, mixed });
  }

  function hit() {
    recordDecision('hit');
    G.p.push(G.deck.pop());
    const e = C.evaluate(ranks(G.p), rules());
    if (e.terminal) { dealerTurn(e.bust ? 'You bust. Your cards stay face down while the banker plays.' : e.n === 5 ? 'Five cards. Your hand is finished.' : '777!'); return; }
    renderHands();
  }
  function stand() { recordDecision('stand'); dealerTurn('You stand.'); }

  function dealerTurn(lead) {
    G.phase = 'dealer';
    renderHands();
    const np = G.p.length;
    const policy = dealerPolicy();
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 60 : 520;
    let drew = 0;
    const step = () => {
      const r = ranks(G.d), e = C.evaluate(r, rules());
      let draw = false;
      if (!e.terminal) {
        if (e.total < rules().dealerMinStand) draw = true;
        else { const h = policy(r, np); draw = h >= 1 || (h > 0 && Math.random() < h); }
      }
      if (draw) {
        G.d.push(G.deck.pop()); drew++;
        setMsg(`${lead} The banker draws (${G.d.length} cards)…`);
        renderHands();
        G.timer = setTimeout(step, delay);
      } else {
        G.reveal = true;
        const pe = C.evaluate(ranks(G.p), rules()), de = C.evaluate(ranks(G.d), rules());
        finish(C.settle(pe, de, rules()), resultText(pe, de, drew));
      }
    };
    setMsg(`${lead} The banker is thinking…`);
    G.timer = setTimeout(step, delay);
  }

  function handName(e) {
    if (e.bust) return e.n === 5 ? `five-card bust (${e.total})` : `bust (${e.total})`;
    if (e.tier > 0) return e.label;
    return String(e.total);
  }
  function resultText(pe, de, drew) {
    const dn = `The banker ${drew ? 'drew ' + drew + ' and ' : ''}shows ${handName(de)}`;
    if (pe.bust && de.bust) return `${dn}. You both bust, so it's a push.`;
    if (pe.bust) return `${dn}. You went ${handName(pe)}${pe.mult > 1 ? ', which costs double' : ''}.`;
    if (de.bust) return `${dn}. You win with ${handName(pe)}.`;
    return `${dn} against your ${handName(pe)}.`;
  }

  function finish(result, text) {
    G.phase = 'done';
    G.stats.hands++; G.stats.net += result;
    const badge = result > 0 ? `<span class="badge win">+${result}</span>` : result < 0 ? `<span class="badge loss">−${-result}</span>` : '<span class="badge">push</span>';
    setMsg(`${badge}<span>${esc(text)}</span>`);
    const wrong = G.decisions.filter((d) => !d.ok);
    $('#s-last').textContent = !G.decisions.length ? 'No real choices that hand: every move was forced.'
      : wrong.length ? `Off-chart that hand: ${wrong.map((d) => `${d.action} on ${cellName(d.key)} (costs ${Math.abs(d.margin).toFixed(3)})`).join('; ')}.`
        : 'Every decision that hand matched the chart.';
    renderHands();
    renderStats();
  }
  function renderStats() {
    const s = G.stats;
    $('#s-hands').textContent = s.hands;
    const net = $('#s-net');
    net.textContent = (s.net > 0 ? '+' : '') + s.net;
    net.className = 'v ' + (s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : '');
    $('#s-acc').textContent = s.decisions ? Math.round(100 * s.matches / s.decisions) + '%' : '–';
    $('#s-cost').textContent = s.cost.toFixed(2);
  }
  function renderCoach() {
    const rec = $('#coach-rec'), why = $('#coach-why');
    if (G.phase !== 'player') {
      rec.innerHTML = '<span class="pill forced">Waiting</span><span>' + (G.phase === 'dealer' ? 'Banker is playing.' : 'Deal a hand.') + '</span>';
      why.textContent = `Advice follows the chart for the ${dealerLabel()} with ${bustLabel()}.`;
      $('#b-hit').classList.remove('suggest'); $('#b-stand').classList.remove('suggest');
      return;
    }
    const r = ranks(G.p), e = C.evaluate(r, rules());
    let pill, line, detail, sug = null;
    if (e.terminal || !chartInfo()[C.stateKey(r)] && e.total >= rules().playerMinStand) {
      pill = '<span class="pill forced">Done</span>'; line = 'Your hand is finished.'; detail = ''; sug = null;
    } else if (e.total < rules().playerMinStand) {
      pill = '<span class="pill forced">Must hit</span>'; line = `${e.total} is under 16.`;
      detail = 'You cannot stand below 16. No decision to make.'; sug = 'hit';
    } else {
      const key = C.stateKey(r), info = chartInfo()[key], hitIt = playerChart()[key] === 1;
      const mixed = info.hit > 0.1 && info.hit < 0.9;
      sug = hitIt ? 'hit' : 'stand';
      if (mixed) {
        pill = `<span class="pill mix">Either</span>`; line = `Close call on ${cellName(key)}.`;
        detail = `Against the smart dealer the solver hits ${Math.round(info.hit * 100)}% of the time here, so the banker can't read you. The difference is ${Math.abs(info.margin).toFixed(3)} units.`;
      } else {
        pill = `<span class="pill ${sug}">${sug}</span>`; line = `${cellName(key)}.`;
        detail = `Hitting here averages ${fmt(info.margin)} units compared with standing.`;
      }
    }
    if (!S.coach) { rec.innerHTML = '<span class="pill forced">Hidden</span><span>Advice is off.</span>'; why.textContent = 'Turn advice back on below, or check the session panel after the hand.'; sug = null; }
    else { rec.innerHTML = pill + `<span>${esc(line)}</span>`; why.textContent = detail; }
    $('#b-hit').classList.toggle('suggest', sug === 'hit');
    $('#b-stand').classList.toggle('suggest', sug === 'stand');
  }

  function bindGame() {
    $('#b-deal').addEventListener('click', deal);
    $('#b-hit').addEventListener('click', hit);
    $('#b-stand').addEventListener('click', stand);
    $('#b-reset').addEventListener('click', () => { G.stats = freshStats(); renderStats(); $('#s-last').textContent = 'Stats reset.'; });
    const co = $('#coach-on');
    co.checked = S.coach;
    co.addEventListener('change', () => { S.coach = co.checked; save(); renderCoach(); });
    document.addEventListener('keydown', (e) => {
      if ($('#play').hidden || e.target.closest('input,select,textarea')) return;
      if (e.key === 'h' && !$('#b-hit').disabled) hit();
      else if (e.key === 's' && !$('#b-stand').disabled) stand();
      else if ((e.key === 'd' || e.key === 'Enter') && !$('#b-deal').disabled && document.activeElement.tagName !== 'BUTTON') deal();
    });
  }

  // ---------------- Monte Carlo (web worker) ----------------
  const WORKER_SRC = `${window.CORE_SRC}
  onmessage = function (e) {
    var C = self.BanluckCore, m = e.data;
    var shoe = new C.Shoe(C.rng(m.seed), m.rules.decks);
    var pp = C.chartPolicy(m.playerChart);
    var dp = m.dealerChart ? C.dealerChartPolicy(m.dealerChart) : C.standOnMin;
    var sum = 0, sq = 0, w = 0, l = 0, pu = 0, t = {}, i = 0;
    var chunk = Math.max(5000, Math.floor(m.hands / 120));
    function bump(k) { t[k] = (t[k] || 0) + 1; }
    while (i < m.hands) {
      var end = Math.min(m.hands, i + chunk);
      for (; i < end; i++) {
        var h = C.playHand(shoe, m.rules, pp, dp), r = h.result;
        sum += r; sq += r * r;
        if (r > 0) w++; else if (r < 0) l++; else pu++;
        if (h.pSpec) bump('You: ' + (h.pSpec === 'banBan' ? 'Ban-Ban' : 'Ban-Luck'));
        if (h.dSpec) bump('Banker: ' + (h.dSpec === 'banBan' ? 'Ban-Ban' : 'Ban-Luck'));
        if (h.pEval) {
          if (h.pEval.tier > 0) bump('You: ' + h.pEval.label);
          if (h.dEval.tier > 0) bump('Banker: ' + h.dEval.label);
          if (h.pEval.bust) bump(h.pEval.n === 5 ? 'You: five-card bust' : 'You: bust');
          if (h.dEval.bust) bump('Banker: bust');
          if (h.pEval.bust && h.dEval.bust) bump('Both bust (push)');
        }
      }
      var mean = sum / i, v = sq / i - mean * mean;
      postMessage({ type: 'progress', done: i, mean: mean, se: Math.sqrt(v / i) });
    }
    postMessage({ type: 'done', done: i, mean: sum / i, se: Math.sqrt((sq / i - (sum / i) * (sum / i)) / i), win: w / i, loss: l / i, push: pu / i, tally: t });
  };`;
  let worker = null, workerUrl = null;
  const MC = { points: [], exact: 0, total: 0 };

  function strategyChart(id) {
    if (id === 'chartFixed') return V().fixed.pureChart;
    if (id === 'chartSmart') return V().smart.pureChart;
    return V().baselineCharts[id];
  }
  function exactFor(id) {
    const v = V();
    if (S.dealer === 'fixed') {
      if (id === 'chartFixed') return v.fixed.chartEV;
      if (id === 'chartSmart') return v.smart.pureChartVsFixedDealer;
      return v.fixed.baselines[id].ev;
    }
    if (id === 'chartFixed') return v.smart.fixedChartVsEqDealer;
    if (id === 'chartSmart') return v.smart.pureChartVsEqDealer;
    return v.smart.baselines[id].evVsEq;
  }
  function refreshMcLabels() {
    $('#mc-against').textContent = `Against: ${dealerLabel()} · ${bustLabel()}. Change these at the top.`;
    MC.exact = exactFor($('#mc-strategy').value);
    $('#mc-exact').textContent = fmt(MC.exact, 4) + ` (${pct(MC.exact)})`;
  }
  function stopMc() {
    if (worker) { worker.terminate(); worker = null; }
    $('#mc-run').disabled = false; $('#mc-stop').disabled = true;
  }
  function runMc() {
    stopMc();
    refreshMcLabels();
    const hands = +$('#mc-hands').value, id = $('#mc-strategy').value;
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    try { worker = new Worker(workerUrl); } catch (e) { $('#mc-status').textContent = 'This browser blocked the background worker, so the simulation cannot run here.'; return; }
    MC.points = []; MC.total = hands;
    $('#mc-run').disabled = true; $('#mc-stop').disabled = false;
    $('#mc-status').textContent = 'Dealing…';
    $('#mc-breakdown').innerHTML = '';
    const t0 = performance.now();
    worker.onmessage = (ev) => {
      const m = ev.data;
      MC.points.push({ n: m.done, mean: m.mean, se: m.se });
      $('#mc-bar').style.width = (100 * m.done / hands).toFixed(1) + '%';
      $('#mc-mean').textContent = fmt(m.mean, 4);
      $('#mc-ci').textContent = `per hand after ${m.done.toLocaleString()} hands · 95% range ${fmt(m.mean - 1.96 * m.se, 4)} to ${fmt(m.mean + 1.96 * m.se, 4)}`;
      drawMcChart();
      if (m.type === 'done') {
        const secs = (performance.now() - t0) / 1000;
        const z = (m.mean - MC.exact) / m.se;
        $('#mc-status').textContent = `The simulation landed ${Math.abs(z).toFixed(2)} standard errors from the exact answer${Math.abs(z) < 2 ? ', so they agree' : ''}. ${Math.round(m.done / secs).toLocaleString()} hands per second.`;
        renderBreakdown(m);
        stopMc();
      }
    };
    worker.postMessage({ rules: rules(), playerChart: strategyChart(id), dealerChart: S.dealer === 'smart' ? V().smart.dealerChart : null, hands, seed: (Math.random() * 2 ** 31) | 0 });
  }
  function renderBreakdown(m) {
    const rows = [['Hands won', m.win], ['Hands lost', m.loss], ['Pushes', m.push]];
    const t = Object.entries(m.tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / m.done]);
    $('#mc-breakdown').innerHTML = '<thead><tr><th>Outcome</th><th class="n">How often</th><th class="n">About 1 in</th></tr></thead><tbody>' +
      rows.concat(t).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${(v * 100).toFixed(2)}%</td><td class="n">${v > 0 ? Math.round(1 / v).toLocaleString() : '–'}</td></tr>`).join('') + '</tbody>';
  }

  function drawMcChart() {
    const svg = $('#mc-chart'), W = 560, H = 220, L = 56, R = 70, T = 14, B = 30;
    const pts = MC.points, ex = MC.exact;
    if (!pts.length) { svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)" font-size="13">Run a simulation to watch the average converge.</text>`; return; }
    const first = pts[Math.min(2, pts.length - 1)];
    const spread = Math.max(4 * first.se, 0.004);
    let lo = ex - spread, hi = ex + spread;
    pts.forEach((p) => { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); });
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const x = (n) => L + (W - L - R) * (n / MC.total);
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    // nice y ticks
    const step = niceStep((hi - lo) / 4);
    let ticks = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
      ticks += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>` +
        `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--font-mono)">${fmt(v, step < 0.001 ? 4 : 3)}</text>`;
    }
    let xt = '';
    [0, 0.5, 1].forEach((f) => {
      const n = MC.total * f;
      xt += `<text x="${x(n)}" y="${H - 8}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" font-size="11" fill="var(--muted)" font-family="var(--font-mono)">${abbrev(n)}</text>`;
    });
    // 95% funnel around the exact value, using the per-hand spread
    const sd = pts[pts.length - 1].se * Math.sqrt(pts[pts.length - 1].n);
    let up = '', dn = '';
    const steps = 60;
    for (let i = 1; i <= steps; i++) {
      const n = Math.max(pts[0].n, MC.total * i / steps), w = 1.96 * sd / Math.sqrt(n);
      up += `${i === 1 ? 'M' : 'L'}${x(n).toFixed(1)},${y(Math.min(hi, ex + w)).toFixed(1)}`;
      dn = `L${x(n).toFixed(1)},${y(Math.max(lo, ex - w)).toFixed(1)}` + dn;
    }
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.n).toFixed(1)},${y(p.mean).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    svg.innerHTML = ticks + xt +
      `<path d="${up}${dn}Z" fill="var(--stand)" fill-opacity="0.12" stroke="none"/>` +
      `<line x1="${L}" x2="${W - R}" y1="${y(ex)}" y2="${y(ex)}" stroke="var(--stand)" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      `<text x="${W - R + 6}" y="${y(ex) + 4}" font-size="11" fill="var(--ink)">Exact</text>` +
      `<path d="${line}" fill="none" stroke="var(--cinnabar)" stroke-width="2" stroke-linejoin="round"/>` +
      `<circle cx="${x(last.n)}" cy="${y(last.mean)}" r="4" fill="var(--cinnabar)" stroke="var(--surface)" stroke-width="2"/>` +
      `<text x="${L}" y="${T - 2}" font-size="11" fill="var(--muted)">Running average, units per hand · shaded band: 95% range around exact</text>` +
      `<line id="mc-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>` +
      `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="mc-hit"/>`;
    const hitR = svg.querySelector('#mc-hit'), cross = svg.querySelector('#mc-cross'), tip = $('#mc-tip');
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width;
      const n = (sx - L) / (W - L - R) * MC.total;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p.n - n) < Math.abs(best.n - n)) best = p;
      cross.setAttribute('x1', x(best.n)); cross.setAttribute('x2', x(best.n)); cross.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.style.left = (x(best.n) * r.width / W) + 'px';
      tip.style.top = (y(best.mean) * r.height / H) + 'px';
      tip.textContent = `${best.n.toLocaleString()} hands: ${fmt(best.mean, 4)}`;
    };
    hitR.addEventListener('pointermove', move);
    hitR.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function abbrev(n) { return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)); }

  function renderOffline() {
    const mc = D.mc;
    if (!mc) { $('#mc-offline').innerHTML = '<tbody><tr><td>No offline results bundled.</td></tr></tbody>'; return; }
    let html = '<thead><tr><th>Rules</th><th>Matchup</th><th class="n">Hands</th><th class="n">Simulated</th><th class="n">Exact</th><th class="n">z</th></tr></thead><tbody>';
    for (const [vid, runs] of Object.entries(mc.variants)) for (const r of runs) {
      html += `<tr><td>${vid === 'bust2' ? '5-card bust 2×' : '5-card bust 1×'}</td><td>${esc(r.label)}</td><td class="n">${(r.hands / 1e6).toFixed(0)}M</td>` +
        `<td class="n">${fmt(r.mean, 4)} ± ${r.se.toFixed(4)}</td><td class="n">${fmt(r.exact, 4)}</td><td class="n">${r.z.toFixed(2)}</td></tr>`;
    }
    $('#mc-offline').innerHTML = html + '</tbody>';
  }

  // ---------------- strategy chart tab ----------------
  function cellHtml(info, rec, n, t, s) {
    if (!info) return '<td><div class="cell na" title="This hand cannot happen">—</div></td>';
    const H = rec === 1, mixed = S.dealer === 'smart' && info.hit > 0.1 && info.hit < 0.9;
    const strong = Math.abs(info.margin) >= 0.1;
    const name = cellName(`${n}|${t}|${s}`);
    const title = `${name}: ${H ? 'hit' : 'stand'}. Hitting averages ${fmt(info.margin)} units vs standing.` + (mixed ? ` The solver hits ${Math.round(info.hit * 100)}% of the time.` : '');
    const label = mixed ? (H ? 'Hit*' : 'Stand*') : H ? 'Hit' : 'Stand';
    return `<td><div class="cell ${H ? 'H' : 'S'}${strong ? ' strong' : ''}${mixed ? ' mixed' : ''}" title="${esc(title)}">${label}<small>${fmt(info.margin, 2)}</small></div></td>`;
  }
  function renderChart() {
    const v = V(), info = chartInfo(), pure = playerChart();
    $('#chart-title').textContent = `Basic strategy vs the ${dealerLabel()} (${bustLabel()})`;
    const best = S.dealer === 'fixed' ? v.fixed.chartEV : v.smart.pureChartVsEqDealer;
    const base = S.dealer === 'fixed' ? v.fixed.baselines : Object.fromEntries(Object.entries(v.smart.baselines).map(([k, b]) => [k, { name: b.name, ev: b.evVsEq }]));
    let chips = `<div class="chip"><span class="k">Your edge with this chart</span><span class="v ${best >= 0 ? 'pos' : 'neg'}">${pct(best)}</span></div>`;
    for (const b of Object.values(base)) chips += `<div class="chip"><span class="k">${esc(b.name)}</span><span class="v ${b.ev >= 0 ? 'pos' : 'neg'}">${pct(b.ev)}</span></div>`;
    $('#chart-summary').innerHTML = chips;

    let html = '<thead><tr><th></th><th>2 cards</th><th>3 cards</th><th>4 cards</th></tr></thead><tbody>';
    html += '<tr class="group"><th colspan="4">Hard hands: no Ace, or every Ace counted as 1</th></tr>';
    html += `<tr><th class="rowh">15 or less</th>${[2, 3, 4].map(() => '<td><div class="cell forced">Must hit</div></td>').join('')}</tr>`;
    for (let t = 16; t <= 21; t++) {
      html += `<tr><th class="rowh">${t}</th>`;
      for (const n of [2, 3, 4]) { const k = `${n}|${t}|h`; html += cellHtml(info[k], pure[k], n, t, 'h'); }
      html += '</tr>';
    }
    html += '<tr class="group"><th colspan="4">Ace counted high: 11 on two cards, 10 on three</th></tr>';
    for (let t = 16; t <= 21; t++) {
      const sub = t <= 20 ? `A + ${t - 11} on two cards` : 'three cards only';
      html += `<tr><th class="rowh">${t}<small>${sub}</small></th>`;
      for (const n of [2, 3]) { const k = `${n}|${t}|s`; html += cellHtml(info[k], pure[k], n, t, 's'); }
      html += '<td><div class="cell na" title="On four cards an Ace is always 1">—</div></td></tr>';
    }
    html += '<tr class="group"><th colspan="4">Five cards: your hand stops automatically</th></tr></tbody>';
    $('#strat').innerHTML = html;
    $('#legend-mix').hidden = S.dealer !== 'smart';

    // banker chart (smart dealer equilibrium)
    const dc = v.smart.dealerChart;
    $('#banker-note').textContent = S.dealer === 'fixed'
      ? 'The fixed dealer ignores you and stands on 16+. A smart banker does better by watching how many cards you hold. This is the solved banker strategy (it is the same in both modes).'
      : 'This is the banker you are playing against. Each table shows what the banker does on 16+, depending on how many cards you hold.';
    let bh = '';
    for (const np of [2, 3, 4, 5]) {
      bh += `<div><div class="eyebrow">You hold ${np} cards</div><table class="mini"><thead><tr><th></th><th>2c</th><th>3c</th><th>4c</th></tr></thead><tbody>`;
      const rows = [];
      for (let t = 16; t <= 21; t++) rows.push(['h', t]);
      for (let t = 16; t <= 21; t++) rows.push(['s', t]);
      for (const [s, t] of rows) {
        bh += `<tr><th class="rowh">${s === 's' ? 'A·' : ''}${t}</th>`;
        for (const n of [2, 3, 4]) {
          const p = dc[np][`${n}|${t}|${s}`];
          if (p === undefined) { bh += '<td><div class="cell na">·</div></td>'; continue; }
          const H = p >= 0.5, mixed = p > 0.1 && p < 0.9;
          bh += `<td><div class="cell ${H ? 'H' : 'S'}${mixed ? ' mixed' : ' strong'}" title="Banker hits ${Math.round(p * 100)}% of the time">${mixed ? Math.round(p * 100) + '%' : H ? 'H' : 'S'}</div></td>`;
        }
        bh += '</tr>';
      }
      bh += '</tbody></table></div>';
    }
    $('#banker').innerHTML = bh;
  }

  // ---------------- dynamic numbers in rules / why ----------------
  function renderNumbers() {
    const v = V();
    const edge = S.dealer === 'fixed' ? v.fixed.chartEV : v.smart.pureChartVsEqDealer;
    $('#rules-edge').textContent = `${edge >= 0 ? 'No house edge: you gain' : 'The banker gains'} about ${Math.abs(edge * 100).toFixed(1)}% per hand (${dealerLabel()}, ${bustLabel()})`;
    $$('[data-num]').forEach((el) => {
      const path = el.dataset.num.split('.');
      let x = D.variants;
      for (const p of path) x = x == null ? undefined : x[p];
      if (typeof x === 'number') el.textContent = el.dataset.fmt === 'units' ? fmt(x, 3) : pct(x, el.dataset.dp ? +el.dataset.dp : 1);
    });
  }

  function refreshAll() {
    syncSegs();
    renderHands();
    refreshMcLabels();
    renderChart();
    renderNumbers();
  }

  bindSegs(); bindTabs(); bindGame();
  $('#mc-run').addEventListener('click', runMc);
  $('#mc-stop').addEventListener('click', () => { stopMc(); $('#mc-status').textContent = 'Stopped.'; });
  $('#mc-strategy').addEventListener('change', refreshMcLabels);
  renderOffline();
  refreshAll();
  renderStats();
  drawMcChart();
})();
