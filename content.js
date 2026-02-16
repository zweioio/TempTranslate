(() => {
  const BLOCK_SELECTOR = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,td,figcaption';
  const INSERT_CLASS = 'jt-inline-translation';
  const ATTR_ID = 'data-jt-id';
  const seen = new WeakSet();
  let enabled = false;
  let mode = 'bilingual'; // 'bilingual' | 'translated'
  let observersInstalled = false;
  let running = false;
  let pageIsEnglish = true;

  const style = `
.${INSERT_CLASS}{margin-top:4px;display:block}
.${INSERT_CLASS}.loading{opacity:.9}
.${INSERT_CLASS}.loading .jt-spinner{display:inline-block;width:12px;height:12px;border:2px solid rgba(3,149,255,.25);border-top-color:#0395FF;border-radius:50%;animation:jtspin .8s linear infinite;transform:translateY(2px)}
@keyframes jtspin{to{transform:rotate(360deg)}}
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
        if (pageIsEnglish) {
          if (!/[A-Za-z]/.test(t)) return NodeFilter.REJECT;
        } else {
          if (!/[\u4e00-\u9fa5]/.test(t)) return NodeFilter.REJECT;
        }
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
      if (block.getAttribute('data-jt-has-translation') === '1') continue;
      // 如果紧邻的下一个元素已经是译文，也跳过
      const next = block.nextElementSibling;
      if (next && next.classList && next.classList.contains(INSERT_CLASS)) continue;
      const raw = (block.innerText || '').trim();
      const text = raw.replace(/\s+/g, ' ');
      if (text && text.length >= 8) map.set(block, text);
    }
    for (const [el, text] of map) yield { el, text };
  }

  function copyTextStyles(fromEl, toEl) {
    const cs = getComputedStyle(fromEl);
    const props = ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textTransform','color','wordBreak','whiteSpace'];
    props.forEach(p => { try { toEl.style[p] = cs[p]; } catch(_){} });
  }

  async function translateBatch(items) {
    const { engine = 'google' } = await chrome.storage.sync.get(['engine']);
    const from = pageIsEnglish ? 'en' : 'zh';
    const to = pageIsEnglish ? 'zh' : 'en';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'jt_translate_batch', engine, from, to, items });
      if (res && typeof res === 'object') return res;
    } catch (e) {
      // ignore; will return empty map
    }
    // 兜底：返回空映射（不插入）
    return Object.fromEntries(items.map(i => [i.id, '']));
  }

  function createPlaceholder(el) {
    const div = document.createElement('div');
    div.className = INSERT_CLASS + ' loading';
    div.setAttribute('lang', pageIsEnglish ? 'zh-CN' : 'en');
    div.textContent = '';
    const spin = document.createElement('span');
    spin.className = 'jt-spinner';
    div.appendChild(spin);
    copyTextStyles(el, div);
    el.insertAdjacentElement('afterend', div);
    el.setAttribute('data-jt-has-translation', '1');
    if (mode === 'translated') {
      if (!el.getAttribute('data-jt-prev-display')) {
        el.setAttribute('data-jt-prev-display', el.style.display || '');
      }
      el.style.display = 'none';
    }
    return div;
  }

  function applyResult(placeholder, text, engine) {
    if (!placeholder) return;
    placeholder.classList.remove('loading');
    placeholder.setAttribute('data-engine', engine || '');
    placeholder.innerHTML = '';
    placeholder.textContent = text || '';
  }

  const BATCH_SIZE = 24;
  let debounceTimer = null;
  let cachedEngine = 'google';

  // ... (style definitions) ...

  function debounce(func, wait) {
    return function(...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // ... (helper functions) ...
  
  function removeAllInserted() {
    document.querySelectorAll(`.${INSERT_CLASS}`).forEach(n=>n.remove());
    document.querySelectorAll(BLOCK_SELECTOR).forEach(el=>{
      if (el.getAttribute && el.getAttribute('data-jt-has-translation') === '1') {
        el.removeAttribute('data-jt-has-translation');
        const prev = el.getAttribute('data-jt-prev-display');
        if (prev !== null) {
          el.style.display = prev;
          el.removeAttribute('data-jt-prev-display');
        }
      }
    });
  }

  async function processViewport() {
    if (!enabled || running) return;
    running = true;
    try {
      injectStyle();
      const batch = [];
      const placeholders = new Map();
      // collectBlocks now only scans what's needed, but ideally we limit scope.
      // For now, we rely on the generator yielding items.
      for (const {el, text} of collectBlocks()) {
        const id = crypto.randomUUID();
        el.setAttribute(ATTR_ID, id);
        const ph = createPlaceholder(el);
        placeholders.set(id, ph);
        batch.push({ id, text });
        if (batch.length >= BATCH_SIZE) break;
      }
      if (!batch.length) return;
      
      const result = await translateBatch(batch);
      for (const b of batch) {
        const ph = placeholders.get(b.id);
        applyResult(ph, result[b.id], cachedEngine);
      }
    } finally {
      running = false;
      // If we filled a batch, there might be more to translate.
      // Schedule another run shortly to continue processing the page.
      if (document.querySelectorAll(`${BLOCK_SELECTOR}:not([data-jt-has-translation])`).length > 0) {
         setTimeout(processViewport, 100);
      }
    }
  }

  // ... (other functions) ...

  function setupObservers() {
    if (observersInstalled) return;
    const processDebounced = debounce(processViewport, 200);
    
    const obs = new MutationObserver((mutations) => {
      // Simple optimization: check if relevant nodes were added
      let shouldProcess = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          shouldProcess = true; 
          break;
        }
      }
      if (shouldProcess) processDebounced();
    });
    
    obs.observe(document.body, { childList:true, subtree:true, characterData:false });
    window.addEventListener('scroll', processDebounced, { passive:true });
    observersInstalled = true;
  }

  // ... (rest of the file) ...

  async function init() {
    const { dualEnabled=false, dualMode='bilingual', engine='google' } =
      await chrome.storage.sync.get(['dualEnabled','dualMode', 'engine']);
    mode = dualMode || 'bilingual';
    cachedEngine = engine;
    pageIsEnglish = pageSeemsEnglish();
    enabled = !!dualEnabled;
    if (enabled) {
      injectStyle();
      processViewport();
      setupObservers();
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.engine) {
        cachedEngine = changes.engine.newValue;
      }
      if (changes.dualEnabled) {
        enabled = !!changes.dualEnabled.newValue;
        if (!enabled) {
          removeAllInserted();
        } else {
          injectStyle();
          setupObservers();
          processViewport();
        }
      }
      // ... (rest of logic) ...
    });
  }

  function pageSeemsEnglish() {
    const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.startsWith('en')) return true;
    const sample = (document.body.innerText || '').slice(0, 2000);
    const letters = (sample.match(/[A-Za-z]/g) || []).length;
    const cjk = (sample.match(/[\u4e00-\u9fa5]/g) || []).length;
    return letters > cjk * 1.5;
  }

  function applyModeToExisting() {
    const list = document.querySelectorAll(`.${INSERT_CLASS}`);
    list.forEach(node => {
      const original = node.previousElementSibling;
      if (!original) return;
      if (mode === 'translated') {
        if (!original.getAttribute('data-jt-prev-display')) {
          original.setAttribute('data-jt-prev-display', original.style.display || '');
        }
        original.style.display = 'none';
      } else {
        const prev = original.getAttribute('data-jt-prev-display');
        original.style.display = prev ?? '';
        original.removeAttribute('data-jt-prev-display');
      }
    });
  }

  async function init() {
    const { dualEnabled=false, dualMode='bilingual' } =
      await chrome.storage.sync.get(['dualEnabled','dualMode']);
    mode = dualMode || 'bilingual';
    pageIsEnglish = pageSeemsEnglish();
    enabled = !!dualEnabled;
    if (enabled) {
      injectStyle();
      processViewport();
      setupObservers();
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.dualEnabled) {
        enabled = !!changes.dualEnabled.newValue;
        if (!enabled) {
          removeAllInserted();
        } else {
          injectStyle();
          setupObservers();
          processViewport();
        }
      }
      if (changes.dualMode) {
        mode = changes.dualMode.newValue || 'bilingual';
        applyModeToExisting();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
