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
  const S = { variant: 'bust2', coach: true };
  try {
    const saved = JSON.parse(localStorage.getItem('banluck-lab') || '{}');
    if (saved.variant in D.variants) S.variant = saved.variant;
    if (typeof saved.coach === 'boolean') S.coach = saved.coach;
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem('banluck-lab', JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const V = () => D.variants[S.variant];
  const rules = () => V().rules;
  // Both sides play the solved equilibrium: the player follows the chart, the banker his chart.
  const playerChart = () => V().pureChart;
  const chartInfo = () => V().chart;
  const dealerPolicy = () => C.dealerChartPolicy(V().bankerChart);
  const bustLabel = () => (S.variant === 'bust2' ? 'five-card bust loses 2×' : 'five-card bust loses 1×');

  // The header switch and the Settings option cards set the same choice.
  function bindSegs() {
    $$('#seg-variant button, .opt').forEach((b) => b.addEventListener('click', () => {
      S.variant = b.dataset.v;
      save(); refreshAll();
    }));
  }
  function syncSegs() {
    $$('#seg-variant button, .opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.variant)));
  }

  // ---------------- tabs ----------------
  const TABS = ['play', 'chart', 'rules', 'why', 'settings'];
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

  // ---------------- illustrated cards (inline SVG) ----------------
  const SUIT_SHAPES = {
    '♥': '<path d="M5 9.4C2.2 7.2 0 5.4 0 3.1 0 1.4 1.3 0 2.9 0 3.8 0 4.6.5 5 1.3 5.4.5 6.2 0 7.1 0 8.7 0 10 1.4 10 3.1 10 5.4 7.8 7.2 5 9.4Z"/>',
    '♦': '<path d="M5 0 9 5 5 10 1 5Z"/>',
    '♠': '<path d="M5 0C7.9 2.3 10 4.1 10 6 10 7.5 8.9 8.6 7.5 8.6 6.7 8.6 6 8.2 5.6 7.6L6.3 10H3.7L4.4 7.6C4 8.2 3.3 8.6 2.5 8.6 1.1 8.6 0 7.5 0 6 0 4.1 2.1 2.3 5 0Z"/>',
    '♣': '<circle cx="5" cy="2.7" r="2.4"/><circle cx="2.5" cy="6.1" r="2.4"/><circle cx="7.5" cy="6.1" r="2.4"/><path d="M4.5 6 3.7 10h2.6L5.5 6Z"/>',
  };
  const PIPS = {
    2: [[30, 18], [30, 66]],
    3: [[30, 18], [30, 42], [30, 66]],
    4: [[20, 18], [40, 18], [20, 66], [40, 66]],
    5: [[20, 18], [40, 18], [30, 42], [20, 66], [40, 66]],
    6: [[20, 18], [40, 18], [20, 42], [40, 42], [20, 66], [40, 66]],
    7: [[20, 18], [40, 18], [30, 30], [20, 42], [40, 42], [20, 66], [40, 66]],
    8: [[20, 18], [40, 18], [30, 30], [20, 42], [40, 42], [30, 54], [20, 66], [40, 66]],
    9: [[20, 18], [40, 18], [20, 34], [40, 34], [30, 42], [20, 50], [40, 50], [20, 66], [40, 66]],
    10: [[20, 18], [40, 18], [30, 26], [20, 34], [40, 34], [20, 50], [40, 50], [30, 58], [20, 66], [40, 66]],
  };
  const suitG = (st, cx, cy, size, flip) =>
    `<g transform="translate(${cx} ${cy})${flip ? ' rotate(180)' : ''} scale(${size / 10}) translate(-5 -5)" fill="currentColor">${SUIT_SHAPES[st]}</g>`;
  /** One playing card as an SVG string. label: A,2..10,J,Q,K · st: suit glyph · '?' blank · null back. */
  function cardSvg(label, st, aria) {
    const open = (cls) => `<svg class="pc${cls}" viewBox="0 0 60 84" ${aria ? `role="img" aria-label="${aria}"` : 'aria-hidden="true"'}><rect class="bg" x=".5" y=".5" width="59" height="83" rx="5"/>`;
    if (label === null) {
      return open('') + '<rect class="back" x="4" y="4" width="52" height="76" rx="3"/><rect class="lattice" x="7" y="7" width="46" height="70" rx="2"/>' +
        '<path class="lattice" d="M30 14 50 42 30 70 10 42Z M30 22 44 42 30 62 16 42Z"/><text class="fu" x="30" y="47.5" font-size="14" text-anchor="middle">福</text></svg>';
    }
    if (label === '?') return open(' blank') + '<text class="q" x="30" y="51" font-size="26" text-anchor="middle">?</text></svg>';
    const red = st === '♥' || st === '♦';
    const fs = label === '10' ? 9 : 11;
    const corner = `<text x="7.5" y="13" font-size="${fs}" text-anchor="middle">${label}</text>${suitG(st, 7.5, 19.5, 6)}`;
    let body = '';
    if (label === 'A') body = suitG(st, 30, 42, 22);
    else if (label === 'J' || label === 'Q' || label === 'K') {
      body = `<rect class="face" x="14" y="12" width="32" height="60" rx="3"/>${suitG(st, 30, 21, 7)}${suitG(st, 30, 63, 7, true)}` +
        `<text x="30" y="50" font-size="22" text-anchor="middle">${label}</text>`;
    } else body = PIPS[+label].map(([x, y]) => suitG(st, x, y, 9.5, y > 44)).join('');
    return open(red ? ' red' : '') + corner + `<g transform="rotate(180 30 42)">${corner}</g>` + body + '</svg>';
  }
  // A cute 五龙 dragon, used beside Five Dragons hands.
  const DRAGON_SVG = '<svg viewBox="-8 2 146 96" class="dragon" aria-hidden="true" focusable="false"><path d="M34 56C44 86 70 88 80 66S104 40 114 60" fill="none" stroke="#5b1d12" stroke-width="22" stroke-linecap="round"/><path d="M34 56C44 86 70 88 80 66S104 40 114 60" fill="none" stroke="#d9452f" stroke-width="17" stroke-linecap="round"/><path d="M38 64C48 84 68 84 77 66S102 46 110 60" fill="none" stroke="#f6cf6a" stroke-width="4" stroke-linecap="round" stroke-dasharray="3 4" opacity=".9"/><path d="M112 62c2-9 9-14 17-12-4 2-5 4-5 6 4-2 8-1 10 2-4 0-6 2-6 4 3 0 5 2 5 5-6-2-12-1-17 2-3-1-4-4-4-7z" fill="#f3c24f" stroke="#5b1d12" stroke-width="2" stroke-linejoin="round"/><g fill="#f3c24f" stroke="#5b1d12" stroke-width="1.6" stroke-linejoin="round"><path d="M86 52l2-9 5 7z"/><path d="M96 45l4-8 3 9z"/><path d="M106 46l6-6 1 9z"/></g><g fill="#d9452f" stroke="#5b1d12" stroke-width="2" stroke-linejoin="round"><path d="M54 82c-2 6 0 9 4 9h6c1-3-1-5-4-5l-1-5z"/><path d="M90 68c1 7 4 9 8 8l4-2c0-3-2-4-5-3l-2-5z"/></g><path d="M44 22c8-2 12 4 10 9 5 0 8 5 5 10 4 2 4 8-1 10l-12-6z" fill="#f3c24f" stroke="#5b1d12" stroke-width="2" stroke-linejoin="round"/><g fill="#f6cf6a" stroke="#5b1d12" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M27 22c-2-6-5-9-9-11 4 0 6 1 8 3 0-3 1-5 3-7 0 4 1 8 3 12z"/><path d="M38 21c1-6 4-10 8-12-2 3-2 5-2 7 2-2 4-3 7-3-3 3-6 6-8 10z"/></g><circle cx="34" cy="38" r="19" fill="#d9452f" stroke="#5b1d12" stroke-width="2.4"/><ellipse cx="17" cy="46" rx="13" ry="10" fill="#ec6a4e" stroke="#5b1d12" stroke-width="2.4"/><circle cx="10" cy="43" r="1.8" fill="#5b1d12"/><circle cx="16" cy="42" r="1.8" fill="#5b1d12"/><path d="M9 50c4 4 10 4 14 0" fill="none" stroke="#5b1d12" stroke-width="2" stroke-linecap="round"/><g fill="none" stroke="#f3c24f" stroke-width="2" stroke-linecap="round"><path d="M6 46C-2 46-3 56 3 58"/><path d="M22 52c2 8-4 12-8 10"/></g><ellipse cx="28" cy="32" rx="6" ry="7" fill="#fffaf0" stroke="#5b1d12" stroke-width="1.8"/><ellipse cx="41" cy="32" rx="6" ry="7" fill="#fffaf0" stroke="#5b1d12" stroke-width="1.8"/><circle cx="27" cy="33" r="4" fill="#22140f"/><circle cx="40" cy="33" r="4" fill="#22140f"/><circle cx="25.6" cy="31.4" r="1.5" fill="#fff"/><circle cx="38.6" cy="31.4" r="1.5" fill="#fff"/><ellipse cx="44" cy="44" rx="4" ry="2.4" fill="#ff9a8a" opacity=".85"/><circle cx="6" cy="20" r="5.5" fill="#fff4d0" stroke="#c99a2e" stroke-width="1.6"/><path d="M4 18.5a2 2 0 0 1 2-1.5" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>';
  function hydrateDragons(root) {
    (root || document).querySelectorAll('.dragon-art:empty').forEach((el) => { el.innerHTML = DRAGON_SVG; });
  }
  /** Fill every <span class="hand-art" data-hand="A♠{11} 6♥ XX ??"> with drawn cards. */
  function hydrateHands(root) {
    (root || document).querySelectorAll('.hand-art[data-hand]').forEach((el) => {
      const toks = el.dataset.hand.trim().split(/\s+/);
      const fan = el.classList.contains('fan'), n = toks.length;
      const names = [];
      el.innerHTML = toks.map((t, i) => {
        let svg, tag = '';
        if (t === 'XX') { svg = cardSvg(null); names.push('face-down card'); }
        else if (t === '??') { svg = cardSvg('?'); names.push('any card'); }
        else {
          const m = /^(10|[2-9AJQK])([♠♥♦♣])(?:\{([^}]*)\})?$/.exec(t);
          if (!m) return '';
          svg = cardSvg(m[1], m[2]); names.push(m[1] + m[2]);
          if (m[3] !== undefined) tag = `<span class="tag">${esc(m[3])}</span>`;
        }
        const rot = fan ? ((i - (n - 1) / 2) * 5).toFixed(1) : 0;
        return `<span class="slot${tag ? ' hl' : ''}" style="--rot:${rot}deg">${tag}${svg}</span>`;
      }).join('');
      if (!el.hasAttribute('aria-label')) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', names.join(', ')); }
    });
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
    const tmp = document.createElement('span');
    tmp.innerHTML = faceDown ? cardSvg(null, null, 'face-down card') : cardSvg(c.label, c.suit, c.label + c.suit);
    return tmp.firstChild;
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
    const pe = G.p.length === 5 ? C.evaluate(ranks(G.p), rules()) : null;
    const dragon = pe && !pe.bust ? `<span class="dragon-art msg">${DRAGON_SVG}</span>` : '';
    setMsg(`${badge}${dragon}<span>${esc(text)}</span>`);
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
      why.textContent = `Advice follows the strategy chart with ${bustLabel()}.`;
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
        detail = `The solver hits ${Math.round(info.hit * 100)}% of the time here, so the banker can't read you. The difference is ${Math.abs(info.margin).toFixed(3)} units.`;
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
    var dp = C.dealerChartPolicy(m.dealerChart);
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
    return id === 'chart' ? V().pureChart : V().baselineCharts[id];
  }
  function exactFor(id) {
    return id === 'chart' ? V().chartEV : V().baselines[id].evVsEq;
  }
  function refreshMcLabels() {
    $('#mc-against').textContent = `The banker plays his optimal chart · ${bustLabel()}. Change the rule at the top.`;
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
    worker.postMessage({ rules: rules(), playerChart: strategyChart(id), dealerChart: V().bankerChart, hands, seed: (Math.random() * 2 ** 31) | 0 });
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
    const H = rec === 1, mixed = info.hit > 0.1 && info.hit < 0.9;
    const strong = Math.abs(info.margin) >= 0.1;
    const name = cellName(`${n}|${t}|${s}`);
    const title = `${name}: ${H ? 'hit' : 'stand'}. Hit ${fmt(info.hitEV)}, stand ${fmt(info.standEV)} units per hand.` + (mixed ? ` The solver hits ${Math.round(info.hit * 100)}% of the time.` : '');
    const label = mixed ? (H ? 'Hit*' : 'Stand*') : H ? 'Hit' : 'Stand';
    const hb = info.hitEV >= info.standEV;
    const evs = `<span class="evs"><span${hb ? ' class="b"' : ''}>H ${fmt(info.hitEV, 2)}</span><span${hb ? '' : ' class="b"'}>S ${fmt(info.standEV, 2)}</span></span>`;
    return `<td><div class="cell ${H ? 'H' : 'S'}${strong ? ' strong' : ''}${mixed ? ' mixed' : ''}" title="${esc(title)}">${label}${evs}</div></td>`;
  }
  function renderChart() {
    const v = V(), info = chartInfo(), pure = playerChart();
    $('#chart-title').textContent = `Basic strategy (${bustLabel()})`;

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

    // banker chart: when to open each player (equilibrium banker strategy)
    const dc = v.bankerChart, dev = v.bankerEV || {};
    $('#banker-note').textContent = `For each of his hands, open or keep drawing depending on how many cards the player holds (${bustLabel()}). This is also how the banker plays in the Play tab.`;
    const NAMES = { 2: 'Two cards', 3: 'Three cards', 4: 'Four cards' };
    let bh = '';
    for (const n of [2, 3, 4]) {
      const rows = [];
      for (const s of ['h', 's']) {
        const ks = [];
        for (let t = 16; t <= 21; t++) { const k = `${n}|${t}|${s}`; if ([2, 3, 4, 5].some((np) => dc[np][k] !== undefined)) ks.push(k); }
        if (ks.length) rows.push({ head: s === 'h' ? 'Hard' : 'Ace counted high' }, ...ks.map((k) => ({ k })));
      }
      bh += `<div class="box"><div class="eyebrow">Banker holds ${NAMES[n].toLowerCase()}</div><div class="scroll"><table class="bank"><thead><tr><th></th><th colspan="4">Player holds</th></tr><tr><th></th><th>2 cards</th><th>3 cards</th><th>4 cards</th><th>5 cards</th></tr></thead><tbody>`;
      for (const r of rows) {
        if (r.head) { bh += `<tr class="group"><th colspan="5">${r.head}</th></tr>`; continue; }
        const [, t, s] = r.k.split('|');
        bh += `<tr><th class="rowh">${s === 's' ? 'A·' : ''}${t}</th>`;
        for (const np of [2, 3, 4, 5]) {
          const p = dc[np][r.k], ev = dev[np] && dev[np][r.k];
          if (p === undefined) { bh += '<td><div class="cell na">·</div></td>'; continue; }
          const draw = p >= 0.5, mixed = p > 0.1 && p < 0.9;
          const strong = ev ? Math.abs(ev[0] - ev[1]) >= 0.1 : !mixed;
          const lab = mixed ? (draw ? `Draw ${Math.round(p * 100)}%` : `Open ${Math.round((1 - p) * 100)}%`) : draw ? 'Draw' : 'Open';
          const evs = ev ? `<span class="evs"><span${ev[0] >= ev[1] ? ' class="b"' : ''}>O ${fmt(ev[0], 2)}</span><span${ev[1] > ev[0] ? ' class="b"' : ''}>D ${fmt(ev[1], 2)}</span></span>` : '';
          const title = `Banker ${n}-card ${s === 's' ? 'Ace-high ' : ''}${t} vs a player holding ${np} cards: ` +
            (mixed ? `draw ${Math.round(p * 100)}% of the time, open otherwise.` : draw ? 'keep drawing.' : 'open them now.') +
            (ev ? ` Banker's average: open ${fmt(ev[0], 3)}, draw ${fmt(ev[1], 3)}.` : '');
          bh += `<td><div class="cell ${draw ? 'H' : 'S'}${strong && !mixed ? ' strong' : ''}${mixed ? ' mixed' : ''}" title="${esc(title)}">${lab}${evs}</div></td>`;
        }
        bh += '</tr>';
      }
      bh += '</tbody></table></div></div>';
    }
    $('#banker').innerHTML = bh;
  }

  // ---------------- who has the edge ----------------
  const STRATS = [
    ['chart', 'The strategy chart'],
    ['standAtMin', 'Copy the banker: stand on 16+'],
    ['casino17', 'Casino habit: hit 16, stand 17+'],
    ['dragonChaser', 'Dragon chaser: always hit 4 cards'],
  ];
  function edgeFor(v, sid, col) {
    if (col === 'eq') return sid === 'chart' ? v.chartEV : v.baselines[sid].evVsEq;
    return sid === 'chart' ? v.chartVsBR : v.baselines[sid].evVsBR;
  }
  const edgeText = (x) => `${Math.abs(x * 100).toFixed(2)}%`;
  function renderEdge() {
    const v = V(), best = v.chartEV;
    $('#edge-ctx').textContent = `Both sides playing optimally · ${bustLabel()}`;
    const who = $('#edge-who'), val = $('#edge-val');
    who.textContent = best >= 0 ? "Player's edge" : "Banker's edge";
    val.textContent = edgeText(best);
    val.className = 'num ' + (best >= 0 ? 'pos' : 'neg');
    const amt = Math.abs(best);
    $('#edge-money').textContent = `Betting $10 a hand, you ${best >= 0 ? 'win' : 'lose'} about $${(amt * 10).toFixed(2)} a hand on average: roughly $${Math.round(amt * 1000)} over 100 hands.`;
    const run = D.mc && D.mc.variants[S.variant] && D.mc.variants[S.variant].find((r) => r.id === 'optimal');
    if (run) {
      const w = run.win * 100, pu = run.push * 100, l = run.loss * 100;
      $('#edge-wlp').innerHTML = `<div class="seg-win" style="flex:${w}"></div><div class="seg-push" style="flex:${pu}"></div><div class="seg-lose" style="flex:${l}"></div>`;
      $('#edge-wlp').setAttribute('aria-label', `You win ${w.toFixed(1)}% of hands, push ${pu.toFixed(1)}%, lose ${l.toFixed(1)}%.`);
      $('#edge-wlp-key').innerHTML = `<li><i class="seg-win"></i>You win <span class="mono">${w.toFixed(1)}%</span></li><li><i class="seg-push"></i>Push <span class="mono">${pu.toFixed(1)}%</span></li><li><i class="seg-lose"></i>You lose <span class="mono">${l.toFixed(1)}%</span></li>`;
    }
    const oid = S.variant === 'bust2' ? 'bust1' : 'bust2', o = D.variants[oid];
    $('#edge-other').textContent = `Hands won and lost from ${(run ? run.hands / 1e6 : 20).toFixed(0)} million simulated hands. Bonus multiples sit on top of these counts. With the other rule (five-card bust ${oid === 'bust2' ? '2×' : '1×'}), the edge is ${edgeText(o.chartEV)} for the ${o.chartEV >= 0 ? 'player' : 'banker'}.`;

    const cols = [['eq', 'Optimal banker'], ['br', 'Banker who knows your strategy']];
    let max = 0;
    for (const [sid] of STRATS) for (const [c] of cols) max = Math.max(max, Math.abs(edgeFor(v, sid, c)));
    let html = '<thead><tr><th>Your strategy</th>' + cols.map(([c, n]) => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
    for (const [sid, nm] of STRATS) {
      const name = nm;
      html += `<tr><td>${esc(name)}</td>`;
      for (const [c] of cols) {
        const x = edgeFor(v, sid, c), w = (Math.abs(x) / max * 50).toFixed(1);
        html += `<td class="${c === 'eq' ? 'cur' : ''}"><div class="ebar"><div class="track"><div class="bar ${x >= 0 ? 'p' : 'b'}" style="${x >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%"></div></div>` +
          `<span class="v ${x >= 0 ? 'pos' : 'neg'}">${edgeText(x)}<small>${x >= 0 ? 'player' : 'banker'}</small></span></div></td>`;
      }
      html += '</tr>';
    }
    $('#edge-table').innerHTML = html + '</tbody>';
    const copy = -v.baselines.standAtMin.evVsEq;
    $('#edge-bank').textContent = `Holding the bank? Read the table from the other side. Playing the banker's chart, you keep ${edgeText(copy)} of every bet from players who copy the banker. With four of them betting $10 each, that is about $${(copy * 40).toFixed(2)} a round. "Knows your strategy" is a banker who has watched you long enough to exploit your exact chart.`;
  }

  // ---------------- EV bars (why tab) and EV dumbbell (chart tab) ----------------
  function evTitle(key) {
    const [n, t, s] = key.split('|'), N = { 2: 'Two', 3: 'Three', 4: 'Four' }[n];
    if (s === 's') return n === '2' ? `A-${t - 11} (${t})` : `${N} cards, Ace as 10: ${t}`;
    return `${N}-card hard ${t}`;
  }
  function renderEvBars() {
    const info = chartInfo();
    $$('.evbars[data-ev]').forEach((el) => {
      const k = el.dataset.ev, x = info[k];
      if (!x) { el.innerHTML = ''; return; }
      const hb = x.hitEV >= x.standEV;
      const row = (lab, cls, val, best) => {
        const w = (Math.min(1, Math.abs(val)) * 50).toFixed(1);
        return `<div class="evrow${best ? ' best' : ''}"><span class="lab">${lab}</span><div class="evtrack"><div class="evbar ${cls}" style="${val >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%"></div></div><span class="val">${fmt(val, 2)}</span></div>`;
      };
      el.innerHTML = `<div class="ev-title">${esc(evTitle(k))}</div>` + row('Stand', 'S', x.standEV, !hb) + row('Hit', 'H', x.hitEV, hb) +
        `<div class="ev-note">${Math.abs(x.hitEV - x.standEV) < 0.005 ? 'A dead heat' : `${hb ? 'Hitting' : 'Standing'} is better by ${Math.abs(x.hitEV - x.standEV).toFixed(2)} units`} · ${bustLabel()}</div>`;
    });
  }
  function renderDumbbell() {
    const info = chartInfo(), pure = playerChart();
    const W = 320, L = 52, R = 14, T = 26, RH = 19, lo = -1.6, hi = 1.0;
    const x = (v) => L + (W - L - R) * (v - lo) / (hi - lo);
    const facets = [[2, 'Two cards'], [3, 'Three cards'], [4, 'Four cards']];
    $('#dumb').innerHTML = facets.map(([n, title]) => {
      const rows = [];
      for (const s of ['h', 's']) {
        const ks = [];
        for (let t = 16; t <= 21; t++) if (info[`${n}|${t}|${s}`]) ks.push(`${n}|${t}|${s}`);
        if (ks.length) rows.push({ head: s === 'h' ? 'Hard' : 'Ace high' }, ...ks.map((k) => ({ k })));
      }
      const H = T + rows.length * RH + 6;
      let g = '';
      for (const v of [-1.5, -1, -0.5, 0, 0.5, 1]) {
        g += `<line x1="${x(v)}" x2="${x(v)}" y1="${T - 6}" y2="${H - 4}" style="stroke:var(--${v === 0 ? 'muted' : 'line'})" stroke-width="1"/>` +
          `<text x="${x(v)}" y="${T - 12}" text-anchor="middle" font-size="10" style="fill:var(--muted)" font-family="var(--font-mono)">${v === 0 ? '0' : fmt(v, 1)}</text>`;
      }
      rows.forEach((r, i) => {
        const y = T + i * RH + RH / 2;
        if (r.head) { g += `<text x="0" y="${y + 4}" font-size="10.5" font-weight="600" style="fill:var(--muted)" letter-spacing=".04em">${r.head.toUpperCase()}</text>`; return; }
        const d = info[r.k], hitIt = pure[r.k] === 1, t = r.k.split('|')[1];
        const xs = x(d.standEV), xh = x(d.hitEV);
        const tip = `${evTitle(r.k)}: hit ${fmt(d.hitEV, 3)}, stand ${fmt(d.standEV, 3)}. Chart: ${hitIt ? 'hit' : 'stand'}.`;
        g += `<text x="${L - 10}" y="${y + 4}" text-anchor="end" font-size="11.5" style="fill:var(--ink)" font-family="var(--font-mono)">${r.k.endsWith('s') ? 'A·' : ''}${t}</text>` +
          `<line x1="${xs}" x2="${xh}" y1="${y}" y2="${y}" style="stroke:var(--muted)" stroke-width="2" stroke-linecap="round"/>` +
          `<circle cx="${xs}" cy="${y}" r="${hitIt ? 3.5 : 6}" style="fill:var(--stand);stroke:var(--surface)" stroke-width="2"/>` +
          `<circle cx="${xh}" cy="${y}" r="${hitIt ? 6 : 3.5}" style="fill:var(--cinnabar);stroke:var(--surface)" stroke-width="2"/>` +
          `<rect class="rowhit" x="0" y="${y - RH / 2}" width="${W}" height="${RH}" data-tip="${esc(tip)}"/>`;
      });
      return `<figure><figcaption class="eyebrow">${title}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: expected value of hitting and standing for each total">${g}</svg><div class="tip" hidden></div></figure>`;
    }).join('');
    $$('#dumb figure').forEach((fig) => {
      const tip = fig.querySelector('.tip'), svg = fig.querySelector('svg');
      fig.querySelectorAll('.rowhit').forEach((r) => {
        const show = () => {
          const fr = fig.getBoundingClientRect(), rr = r.getBoundingClientRect();
          tip.textContent = r.dataset.tip; tip.hidden = false;
          tip.style.left = Math.min(Math.max(fr.width / 2, 120), fr.width - 120) + 'px';
          tip.style.top = (rr.top - fr.top) + 'px';
        };
        r.addEventListener('pointerenter', show);
        r.addEventListener('click', show);
      });
      svg.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }

  // ---------------- dynamic numbers in rules / why ----------------
  function renderNumbers() {
    const v = V();
    const edge = v.chartEV;
    $('#rules-edge').textContent = `${edge >= 0 ? 'No house edge: the player keeps' : 'The banker keeps'} ${Math.abs(edge * 100).toFixed(1)}% per hand with both sides playing optimally (${bustLabel()}).`;
    const tok = $('#rules-edge-tok');
    tok.textContent = pct(edge, 1);
    tok.className = 'tok ' + (edge >= 0 ? 'pos' : 'neg');
    $$('[data-num], [data-numv]').forEach((el) => {
      const path = el.dataset.numv ? [S.variant, ...el.dataset.numv.split('.')] : el.dataset.num.split('.');
      let x = D.variants;
      for (const p of path) x = x == null ? undefined : x[p];
      if (typeof x !== 'number') return;
      const dp = el.dataset.dp ? +el.dataset.dp : 1;
      el.textContent = el.dataset.fmt === 'units' ? fmt(x, 3) : el.dataset.fmt === 'edge' ? Math.abs(x * 100).toFixed(dp) + '%' : pct(x, dp);
      if (el.dataset.fmt === 'edge') el.classList.toggle('neg', x < 0), el.classList.toggle('pos', x >= 0);
    });
  }

  function refreshAll() {
    syncSegs();
    renderHands();
    refreshMcLabels();
    renderChart();
    renderEdge();
    renderDumbbell();
    renderEvBars();
    renderNumbers();
  }

  hydrateHands(); hydrateDragons();
  bindSegs(); bindTabs(); bindGame();
  $('#mc-run').addEventListener('click', runMc);
  $('#mc-stop').addEventListener('click', () => { stopMc(); $('#mc-status').textContent = 'Stopped.'; });
  $('#mc-strategy').addEventListener('change', refreshMcLabels);
  renderOffline();
  refreshAll();
  renderStats();
  drawMcChart();
})();
