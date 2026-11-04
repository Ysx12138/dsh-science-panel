// Chinese localization layer for the Claude Science web UI.
// Runs inside the WKWebView: rewrites rendered text and UI attributes using the
// dictionary in window.__SCI_ZH, then keeps watching for re-renders.
(function () {
  const dict = window.__SCI_ZH;
  if (!dict || dict.__applied) return;
  dict.__applied = true;

  const rawExact = dict.exact || {};
  const exact = {};
  Object.keys(rawExact).forEach(function (k) {
    exact[k.replace(/\s+/g, ' ').trim()] = rawExact[k];
  });
  const clauses = dict.clauses || {};
  const rules = (dict.rules || []).map(function (r) {
    return [new RegExp(r[0]), r[1]];
  });
  // Longest-first so "ran {n} commands" is tried before "ran a command".
  const clauseKeys = Object.keys(clauses).sort(function (a, b) { return b.length - a.length; });

  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  const SKIP_SELECTOR = 'pre, code, textarea, input, .prose, [contenteditable="true"], [data-zh-skip]';
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-placeholder'];
  const GLYPH = /[\uE000-\uF8FF]/g;

  function applyRules(s) {
    for (let i = 0; i < rules.length; i++) {
      const m = s.match(rules[i][0]);
      if (m) return s.replace(rules[i][0], rules[i][1]);
    }
    return null;
  }

  function clauseRegex(key) {
    const parts = key.split('{n}').map(function (p) {
      return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp('^' + parts.join('(\\d+)') + '$');
  }

  const clauseMatchers = clauseKeys.map(function (k) { return [clauseRegex(k), clauses[k], k]; });

  function clauseTranslate(s) {
    const parts = s.split(', ').map(function (p) { return p.charAt(0).toLowerCase() + p.slice(1); });
    if (parts.length < 2 || parts.length > 6) return null;
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let hit = null;
      for (let k = 0; k < clauseMatchers.length; k++) {
        const m = p.match(clauseMatchers[k][0]);
        if (m) {
          hit = clauseMatchers[k][1];
          if (m[1] !== undefined) hit = hit.replace('{n}', m[1]);
          break;
        }
      }
      if (!hit) return null;
      out.push(hit);
    }
    return out.join('、');
  }

  function translate(s, isOwnText) {
    if (!isOwnText) return null;
    const core = s.replace(GLYPH, '').trim();
    if (!core) return null;
    // Exact hits may be long paragraphs; pattern rules stay short-text only so they
    // never touch prose the model wrote.
    const norm = core.replace(/\s+/g, ' ');
    if (Object.prototype.hasOwnProperty.call(exact, norm)) return exact[norm];
    if (core.length > 90) return null;
    const byClause = clauseTranslate(core);
    if (byClause) return byClause;
    return applyRules(core);
  }

  function replaceNode(node) {
    const parent = node.parentElement;
    if (!parent) return;
    if (SKIP_TAGS[parent.tagName] || parent.closest(SKIP_SELECTOR)) return;
    const raw = node.nodeValue;
    if (!raw) return;
    const out = translate(raw, true);
    if (out == null || out === raw) return;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + out + trail;
    dict.__count = (dict.__count || 0) + 1;
  }

  function replaceAttrs(el) {
    if (!el.getAttribute) return;
    if (SKIP_TAGS[el.tagName] && el.tagName !== 'TEXTAREA') return;
    if (el.closest('[data-zh-skip]')) return;
    for (let i = 0; i < ATTRS.length; i++) {
      const a = ATTRS[i];
      const v = el.getAttribute(a);
      if (!v) continue;
      const out = translate(v, true);
      if (out != null && out !== v) { el.setAttribute(a, out); dict.__count = (dict.__count || 0) + 1; }
    }
  }

  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(replaceNode);

  const all = (document.body || document.documentElement).querySelectorAll('[placeholder],[aria-label],[title],[alt],[data-placeholder]');
  all.forEach(replaceAttrs);


  // 「Reviewing」指示器常常停住不消失（复查已结束、状态没回位）。
  // 这里给它限时：出现超过 ui.reviewingTimeoutMs 就隐藏，等状态文字变了再出现。
  (function () {
    const ms = (dict.ui && dict.ui.reviewingTimeoutMs) || 0;
    if (!ms) return;
    const seen = new WeakMap();
    const hiddenBoxes = new Set();
    function tick(nowOverride) {
      const now = typeof nowOverride === 'number' ? nowOverride : Date.now();
      // 状态换了（图标不再是 verifying）就把隐藏撤销，避免把同一个节点永久藏住
      hiddenBoxes.forEach(function (box) {
        if (!document.contains(box) || !box.querySelector('svg.shield-verifying')) {
          box.style.visibility = '';
          hiddenBoxes.delete(box);
        }
      });
      const icons = document.querySelectorAll('svg.shield-verifying');
      let hidden = 0;
      icons.forEach(function (icon) {
        let box = icon;
        for (let i = 0; i < 4 && box.parentElement; i++) {
          const p = box.parentElement;
          if ((p.textContent || '').trim().length > 14) break;
          box = p;
        }
        if (!seen.has(box)) seen.set(box, now);
        if (now - seen.get(box) > ms) { box.style.visibility = 'hidden'; hiddenBoxes.add(box); hidden++; }
        else { box.style.visibility = ''; }
      });
      return hidden;
    }
    window.__reviewTick = tick;
    setInterval(function () { tick(); }, 500);
  })();

  if (!dict.__observer) {
    // Attributes are deliberately not observed: rewriting an attribute inside an
    // observed subtree can ping-pong with the app's own renders and hang the
    // renderer. Attribute text is refreshed when new nodes appear instead.
    dict.__observer = new MutationObserver(function (records) {
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.type === 'characterData') { replaceNode(r.target); continue; }
        for (let j = 0; j < r.addedNodes.length; j++) {
          const n = r.addedNodes[j];
          if (n.nodeType === 3) { replaceNode(n); }
          else if (n.nodeType === 1) {
            replaceAttrs(n);
            const tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null);
            const inner = [];
            while (tw.nextNode()) inner.push(tw.currentNode);
            inner.forEach(replaceNode);
            n.querySelectorAll('[placeholder],[aria-label],[title],[alt],[data-placeholder]').forEach(replaceAttrs);
          }
        }
      }
    });
    dict.__observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true, characterData: true
    });
  }
  return 'zh-applied:' + (dict.__count || 0);
})();
