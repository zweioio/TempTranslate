(() => {
  const BLOCK_SELECTOR = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,td,figcaption';
  const INSERT_CLASS = 'jt-inline-translation';
  const ATTR_ID = 'data-jt-id';
  const seen = new WeakSet();
  let enabled = false;
  let running = false;

  const style = `
.${INSERT_CLASS}{
  margin-top:4px;
  font-size:0.92em;
  line-height:1.6;
  color:#374151;
}
`;
  function injectStyle() {
    if (document.getElementById('jt-inline-style')) return;
    const s = document.createElement('style');
    s.id = 'jt-inline-style';
    s.textContent = style;
    document.documentElement.appendChild(s);
  }

  function isSkippable(el) {
    if (!el) return true;
    if (el.closest('script,style,noscript,svg,canvas,math,textarea,input,iframe,pre,code,kbd,samp,[contenteditable]')) return true;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return true;
    return false;
  }

  function* collectBlocks(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const t = n.nodeValue?.trim() || '';
        if (t.length < 8) return NodeFilter.REJECT;
        if (!/[A-Za-z]/.test(t) || /[\u4e00-\u9fa5]/.test(t)) return NodeFilter.REJECT;
        const p = n.parentElement;
        if (!p || isSkippable(p)) return NodeFilter.REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const map = new Map();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const block = node.parentElement.closest(BLOCK_SELECTOR);
      if (!block || isSkippable(block)) continue;
      if (block.querySelector(`:scope > .${INSERT_CLASS}`)) continue;
      const raw = (block.innerText || '').trim();
      const text = raw.replace(/\s+/g, ' ');
      if (text && text.length >= 8) map.set(block, text);
    }
    for (const [el, text] of map) yield { el, text };
  }

  async function translateBatch(items) {
    const { engine = 'google', toLang = 'zh' } = await chrome.storage.sync.get(['engine','toLang']);
    const from = 'en'; // MVP：只处理英文网页块
    const to = toLang || 'zh';
    if (engine === 'ai') {
      return await aiBatch(items, from, to);
    }
    return await googleBatch(items, from, to);
  }

  async function googleBatch(items, from, to) {
    // 简化：串行请求，MVP 可行；后续可并行+合并
    const out = {};
    for (const it of items) {
      const sl = from === 'zh' ? 'zh-CN' : from;
      const tl = to === 'zh' ? 'zh-CN' : to;
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(it.text)}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        out[it.id] = (data && data[0]) ? data[0].map(d=>d[0]).join('') : '';
      } catch {
        out[it.id] = '';
      }
    }
    return out;
  }

  async function aiBatch(items, from, to) {
    const out = {};
    for (const it of items) {
      const fromLang = from === 'zh' ? 'zh-CN' : from;
      const toLang = to === 'zh' ? 'zh-CN' : to;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(it.text)}&langpair=${fromLang}|${toLang}`;
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        out[it.id] = data?.responseData?.translatedText || '';
        if (!out[it.id]) {
          // fallback google
          const g = await googleBatch([it], from, to);
          out[it.id] = g[it.id] || '';
        }
      } catch {
        const g = await googleBatch([it], from, to);
        out[it.id] = g[it.id] || '';
      }
    }
    return out;
  }

  function insertAfter(el, zh, engine) {
    if (!zh) return;
    if (seen.has(el)) return;
    const div = document.createElement('div');
    div.className = INSERT_CLASS;
    div.setAttribute('lang','zh-CN');
    div.setAttribute('data-engine', engine);
    div.textContent = zh;
    el.insertAdjacentElement('afterend', div);
    seen.add(el);
  }

  async function processViewport() {
    if (!enabled || running) return;
    running = true;
    try {
      injectStyle();
      const batch = [];
      for (const {el, text} of collectBlocks()) {
        const id = crypto.randomUUID();
        el.setAttribute(ATTR_ID, id);
        batch.push({ id, text });
        if (batch.length >= 24) break;
      }
      if (!batch.length) return;
      const { engine='google' } = await chrome.storage.sync.get(['engine']);
      const result = await translateBatch(batch);
      for (const b of batch) {
        const node = document.querySelector(`[${ATTR_ID}="${b.id}"]`);
        if (node && !node.querySelector?.(`:scope > .${INSERT_CLASS}`)) {
          insertAfter(node, result[b.id], engine);
        }
      }
    } finally {
      running = false;
    }
  }

  function removeAllInserted() {
    document.querySelectorAll(`.${INSERT_CLASS}`).forEach(n=>n.remove());
  }

  async function init() {
    const { dualEnabled=false } = await chrome.storage.sync.get(['dualEnabled']);
    enabled = !!dualEnabled;
    if (!enabled) return;
    injectStyle();
    processViewport();
    const obs = new MutationObserver(() => processViewport());
    obs.observe(document.body, { childList:true, subtree:true, characterData:false });
    window.addEventListener('scroll', () => processViewport(), { passive:true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.dualEnabled) return;
      enabled = !!changes.dualEnabled.newValue;
      if (!enabled) {
        removeAllInserted();
      } else {
        processViewport();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
