// 状态管理
const state = {
  fromLang: 'en',
  toLang: 'zh',
  inputText: '',
  outputText: '',
  backTranslation: '',
  isTranslating: false,
  currentEngine: 'google' // 默认谷歌
};

// DOM 元素
const els = {
  fromLang: document.getElementById('fromLang'),
  toLang: document.getElementById('toLang'),
  swapBtn: document.getElementById('swapBtn'),
  inputText: document.getElementById('inputText'),
  placeholderLayer: document.getElementById('placeholderLayer'),
  pasteBtn: document.getElementById('pasteBtnReal'),
  clearInput: document.getElementById('clearInput'),
  translateBtn: document.getElementById('translateBtn'),
  outputText: document.getElementById('outputText'),
  backTranslation: document.getElementById('backTranslation'),
  outputActions: document.getElementById('outputActions'),
  speakBtn: document.getElementById('speakBtn'),
  copyBtn: document.getElementById('copyBtn'),
  clearOutput: document.getElementById('clearOutput'),
  engineSelector: document.getElementById('engineSelector')
};

// 引擎切换逻辑
const engineTags = els.engineSelector.querySelectorAll('.engine-tag');

// 初始化状态
chrome.storage.sync.get(['engine'], (result) => {
  if (result.engine) {
    state.currentEngine = result.engine;
  }
  updateEngineUI();
});

// 开关：网页对照翻译（滑动开关）
const dualToggle = document.getElementById('dualToggle');
chrome.storage.sync.get(['dualEnabled','dualMode'], (r) => {
  if (dualToggle) dualToggle.checked = !!r.dualEnabled;
  const mode = r.dualMode || 'bilingual';
  setSegMode(mode);
});
dualToggle && dualToggle.addEventListener('change', (e) => {
  chrome.storage.sync.set({ dualEnabled: !!e.target.checked });
});

// 模式切换（分段控件）
function setSegMode(mode){
  const bi = document.getElementById('segBilingual');
  const tr = document.getElementById('segTranslated');
  if (!bi || !tr) return;
  bi.classList.toggle('active', mode === 'bilingual');
  tr.classList.toggle('active', mode === 'translated');
}
document.getElementById('segBilingual')?.addEventListener('click', ()=>{
  setSegMode('bilingual');
  chrome.storage.sync.set({ dualMode: 'bilingual' });
});
document.getElementById('segTranslated')?.addEventListener('click', ()=>{
  setSegMode('translated');
  chrome.storage.sync.set({ dualMode: 'translated' });
});

// 删除自动翻译相关逻辑（入口已移除）

function updateEngineUI() {
  engineTags.forEach(tag => {
    if (tag.dataset.engine === state.currentEngine) {
      tag.classList.add('active');
    } else {
      tag.classList.remove('active');
    }
  });
}

els.engineSelector.addEventListener('click', (e) => {
    const tag = e.target.closest('.engine-tag');
    if (tag && !tag.classList.contains('active')) {
      state.currentEngine = tag.dataset.engine;
      chrome.storage.sync.set({ engine: state.currentEngine });
      updateEngineUI();
      // 如果输入框有内容，切换引擎后重新翻译
      if (els.inputText.value.trim()) {
        performTranslation();
      }
    }
  });

  // 初始化
function init() {
  loadSettings();
  attachEvents();
  setupLangDropdowns();
  syncLangLabels();
}

// 加载设置
async function loadSettings() {
  const settings = await chrome.storage.local.get(['fromLang', 'toLang']);
  if (settings.fromLang) {
    els.fromLang.value = settings.fromLang;
    state.fromLang = settings.fromLang;
  }
  if (settings.toLang) {
    els.toLang.value = settings.toLang;
    state.toLang = settings.toLang;
  }
  syncLangLabels();
}

// 绑定事件
function attachEvents() {
  // 语言切换
  els.fromLang.addEventListener('change', (e) => {
    state.fromLang = e.target.value;
    syncLangLabels();
    // 互斥逻辑：如果源语言和目标语言相同，则目标语言切换到另一种
    if (state.fromLang === state.toLang) {
      state.toLang = state.fromLang === 'zh' ? 'en' : 'zh';
      els.toLang.value = state.toLang;
      syncLangLabels();
    }
    chrome.storage.local.set({ fromLang: state.fromLang, toLang: state.toLang });
  });
  
  els.toLang.addEventListener('change', (e) => {
    state.toLang = e.target.value;
    syncLangLabels();
    // 互斥逻辑：如果目标语言和源语言相同，则源语言切换到另一种
    if (state.toLang === state.fromLang) {
      state.fromLang = state.toLang === 'zh' ? 'en' : 'zh';
      els.fromLang.value = state.fromLang;
      syncLangLabels();
    }
    chrome.storage.local.set({ fromLang: state.fromLang, toLang: state.toLang });
  });

  // 互换语言
  els.swapBtn.addEventListener('click', () => {
    const newFrom = els.toLang.value;
    const newTo = els.fromLang.value;
    
    els.fromLang.value = newFrom;
    els.toLang.value = newTo;
    
    state.fromLang = newFrom;
    state.toLang = newTo;
    syncLangLabels();
    
    chrome.storage.local.set({ fromLang: state.fromLang, toLang: state.toLang });
  });

  // 输入监听
  els.inputText.addEventListener('input', (e) => {
    const val = e.target.value;
    els.clearInput.classList.toggle('hidden', !val);
    // 控制占位层显示隐藏
    els.placeholderLayer.style.display = val ? 'none' : 'flex';
    // 动态控制翻译按钮状态
    els.translateBtn.disabled = !val.trim();

    // 自动调整高度逻辑
    els.inputText.style.height = '48px'; // 先重置为初始高度
    const scrollHeight = els.inputText.scrollHeight;
    if (scrollHeight > 48) {
      els.inputText.style.height = Math.min(scrollHeight, 240) + 'px';
    }
    // 处理滚动条显示
    els.inputText.style.overflowY = scrollHeight > 240 ? 'auto' : 'hidden';
  });

  // 粘贴功能
  els.pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputAndTranslate(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  });

  // 清空输入
  els.clearInput.addEventListener('click', () => {
    els.inputText.value = '';
    els.clearInput.classList.add('hidden');
    els.placeholderLayer.style.display = 'flex';
    els.translateBtn.disabled = true;
    
    // 重置高度
    els.inputText.style.height = '48px';
    els.inputText.style.overflowY = 'hidden';

    // 同时清空翻译结果区域
    els.outputText.innerText = '翻译结果将在这里展示';
    els.outputText.style.color = 'var(--text-gray)';
    els.backTranslation.classList.add('hidden');
    els.outputActions.classList.add('hidden');
    
    els.inputText.focus();
  });

  // 翻译触发
  els.translateBtn.addEventListener('click', performTranslation);

  // 回车翻译
  els.inputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performTranslation();
    }
  });

  // 结果操作：复制
  els.copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(els.outputText.innerText);
    const originalSvg = els.copyBtn.innerHTML;
    els.copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';
    setTimeout(() => els.copyBtn.innerHTML = originalSvg, 2000);
  });

  // 结果操作：朗读
  const speakIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  const stopIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

  els.speakBtn.addEventListener('click', () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      els.speakBtn.innerHTML = speakIcon;
      return;
    }

    const text = els.outputText.innerText;
    if (!text || text === '翻译结果将在这里展示') return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = els.toLang.value === 'zh' ? 'zh-CN' : 'en-US';
    
    utterance.onstart = () => {
      els.speakBtn.innerHTML = stopIcon;
    };

    utterance.onend = () => {
      els.speakBtn.innerHTML = speakIcon;
    };

    utterance.onerror = () => {
      els.speakBtn.innerHTML = speakIcon;
    };

    window.speechSynthesis.speak(utterance);
  });
}

function setInputAndTranslate(text) {
  els.inputText.value = text;
  els.clearInput.classList.remove('hidden');
  els.placeholderLayer.style.display = 'none';
  els.translateBtn.disabled = false;
  els.inputText.style.height = '48px';
  const scrollHeight = els.inputText.scrollHeight;
  els.inputText.style.height = Math.min(Math.max(scrollHeight, 48), 240) + 'px';
  els.inputText.style.overflowY = scrollHeight > 240 ? 'auto' : 'hidden';
  els.inputText.focus();
  performTranslation();
}

function detectLang(text) {
  const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const enCount = (text.match(/[A-Za-z]/g) || []).length;
  if (zhCount === 0 && enCount === 0) return null;
  return zhCount >= enCount ? 'zh' : 'en';
}

function maybeAdjustLangByInput(text) {
  const detected = detectLang(text);
  if (!detected) return;
  if (detected === 'zh') {
    if (els.fromLang.value !== 'zh' || els.toLang.value === 'zh') {
      els.fromLang.value = 'zh';
      els.toLang.value = 'en';
      state.fromLang = 'zh';
      state.toLang = 'en';
      chrome.storage.local.set({ fromLang: state.fromLang, toLang: state.toLang });
    }
  } else if (detected === 'en') {
    if (els.fromLang.value !== 'en' || els.toLang.value === 'en') {
      els.fromLang.value = 'en';
      els.toLang.value = 'zh';
      state.fromLang = 'en';
      state.toLang = 'zh';
      chrome.storage.local.set({ fromLang: state.fromLang, toLang: state.toLang });
    }
  }
}

// 去掉与背景/面板的主动消息联动监听

async function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['history'], (r) => {
      resolve(Array.isArray(r.history) ? r.history : []);
    });
  });
}

async function addHistory(item) {
  const list = await getHistory();
  const withTime = item && item.t ? item : { ...item, t: Date.now() };
  list.unshift(withTime);
  const trimmed = list.slice(0, 20);
  return new Promise((resolve) => {
    chrome.storage.local.set({ history: trimmed }, () => resolve());
  });
}

function formatHistoryTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function renderHistoryItem(item) {
  const wrap = document.createElement('div');
  wrap.className = 'history-card';
  const timeText = formatHistoryTime(item.t);
  if (timeText) {
    const time = document.createElement('div');
    time.className = 'history-timestamp';
    time.innerText = timeText;
    wrap.appendChild(time);
  }
  const src = document.createElement('div');
  src.className = 'history-src';
  src.innerText = item.src;
  const divider = document.createElement('div');
  divider.className = 'history-divider';
  const out = document.createElement('div');
  out.className = 'history-out';
  out.innerText = item.out;
  wrap.appendChild(src);
  wrap.appendChild(divider);
  wrap.appendChild(out);
  return wrap;
}

async function renderHistory() {
  const list = await getHistory();
  const container = document.getElementById('historyList');
  if (!container) return;
  container.innerHTML = '';
  list.forEach((i) => container.appendChild(renderHistoryItem(i)));
}

document.addEventListener('DOMContentLoaded', () => {
  const clearHistory = document.getElementById('clearHistory');
  if (clearHistory) {
    clearHistory.addEventListener('click', () => {
      chrome.storage.local.set({ history: [] }, () => renderHistory());
    });
  }
  const historyHeader = document.getElementById('historyLeft');
  const historyContainer = document.getElementById('historyContainer');
  const toggleIcon = document.getElementById('historyToggleIcon');
  let collapsed = true;
  if (historyHeader && historyContainer && toggleIcon) {
    historyHeader.addEventListener('click', () => {
      collapsed = !collapsed;
      historyContainer.style.display = collapsed ? 'none' : 'block';
      toggleIcon.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(180deg)';
    });
  }
  const clearBtn = document.getElementById('clearHistory');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  renderHistory();
});
// 执行翻译核心逻辑
async function performTranslation() {
  const currentText = els.inputText.value.trim();
  if (!currentText || state.isTranslating) return;

  maybeAdjustLangByInput(currentText);

  state.isTranslating = true;
  els.translateBtn.disabled = true;
  els.translateBtn.classList.add('loading');
  els.outputText.innerText = '正在翻译...';
  els.outputText.style.color = 'var(--text-dark)';
  els.backTranslation.classList.add('hidden');
  els.outputActions.classList.add('hidden');

  try {
    // 1. 主翻译
    const mainResult = await fetchTranslate(currentText, els.fromLang.value, els.toLang.value);
    
    // 检查：如果在请求期间输入框被清空了，则不再渲染结果
    if (!els.inputText.value.trim()) return;

    els.outputText.innerText = mainResult;
    
    // 2. 显示操作栏
    els.outputActions.classList.remove('hidden');

    // 3. 执行回译 (Back Translation) - 用来核对意思是否正确
    const backFrom = els.toLang.value;
    const backTo = (backFrom === 'zh' || backFrom === 'zh-CN') ? 'en' : 'zh';
    
    const backResult = await fetchTranslate(mainResult, backFrom, backTo);
    
    // 再次检查输入框状态
    if (!els.inputText.value.trim()) return;

    els.backTranslation.innerText = backResult;
    els.backTranslation.classList.remove('hidden');

    await addHistory({
      t: Date.now(),
      from: els.fromLang.value,
      to: els.toLang.value,
      src: currentText,
      out: mainResult
    });
    renderHistory();
  } catch (err) {
    // 只有在输入框仍有内容时才显示错误
    if (els.inputText.value.trim()) {
      els.outputText.innerText = '翻译失败，请切换翻译引擎或检查网络';
      els.outputText.style.color = '#F53F3F';
      els.backTranslation.classList.add('hidden');
      els.outputActions.classList.add('hidden');
    }
  } finally {
    state.isTranslating = false;
    els.translateBtn.disabled = !els.inputText.value.trim();
    els.translateBtn.classList.remove('loading');
  }
}

// 统一翻译接口
async function fetchTranslate(text, from, to) {
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'jt_translate_text',
      engine: state.currentEngine, // 'google' or 'ai'
      from,
      to,
      text
    });
    
    if (res && res.text) {
      return res.text;
    }
    if (res && res.error) {
      throw new Error(res.error);
    }
    throw new Error('未返回翻译结果');
  } catch (err) {
    console.error('Translation Error:', err);
    throw err;
  }
}

// 启动
init();

// ===== 自定义门户式下拉（视觉样式） =====
function syncLangLabels() {
  const map = { zh: '中文（简体）', en: '英文' };
  const fromLabel = document.getElementById('fromLabel');
  const toLabel = document.getElementById('toLabel');
  if (fromLabel) fromLabel.textContent = map[els.fromLang.value] || '中文（简体）';
  if (toLabel) toLabel.textContent = map[els.toLang.value] || '中文（简体）';
}

function setupLangDropdowns() {
  const fromBox = document.getElementById('fromBox');
  const toBox = document.getElementById('toBox');
  fromBox && fromBox.addEventListener('click', (e) => {
    e.stopPropagation();
    openPortalDropdown('from', fromBox);
  });
  toBox && toBox.addEventListener('click', (e) => {
    e.stopPropagation();
    openPortalDropdown('to', toBox);
  });
}

function openPortalDropdown(which, anchorEl) {
  closePortalDropdown();
  const rect = anchorEl.getBoundingClientRect();
  const mask = document.createElement('div');
  mask.className = 'jt-dd-mask';
  const panel = document.createElement('div');
  panel.className = 'jt-dd';
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.width = `${rect.width}px`;
  const options = [
    { value: 'zh', label: '中文（简体）' },
    { value: 'en', label: '英文' }
  ];
  const current = which === 'from' ? els.fromLang.value : els.toLang.value;
  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'jt-dd-item' + (opt.value === current ? ' active' : '');
    item.textContent = opt.label;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const select = which === 'from' ? els.fromLang : els.toLang;
      if (select.value !== opt.value) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closePortalDropdown();
    });
    panel.appendChild(item);
  });
  document.body.appendChild(mask);
  document.body.appendChild(panel);
  requestAnimationFrame(()=> panel.classList.add('show'));
  setTimeout(() => {
    const closer = (ev) => {
      if (!panel.contains(ev.target)) {
        closePortalDropdown();
        document.removeEventListener('click', closer, true);
      }
    };
    document.addEventListener('click', closer, true);
  }, 0);
  window.__jt_dd_mask = mask;
  window.__jt_dd_panel = panel;
}

function closePortalDropdown() {
  if (window.__jt_dd_panel) {
    window.__jt_dd_panel.remove();
    window.__jt_dd_panel = null;
  }
  if (window.__jt_dd_mask) {
    window.__jt_dd_mask.remove();
    window.__jt_dd_mask = null;
  }
}
