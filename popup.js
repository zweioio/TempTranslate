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

// 双语对照开关
const dualToggle = document.getElementById('dualToggle');
const dualLabel = document.getElementById('dualToggleLabel');
chrome.storage.sync.get(['dualEnabled'], (r) => {
  const on = !!r.dualEnabled;
  if (dualToggle) dualToggle.checked = on;
  if (dualLabel) dualLabel.textContent = on ? '开启' : '关闭';
});
dualToggle && dualToggle.addEventListener('change', (e) => {
  const on = e.target.checked;
  chrome.storage.sync.set({ dualEnabled: on }, () => {
    if (dualLabel) dualLabel.textContent = on ? '开启' : '关闭';
  });
});

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
}

// 绑定事件
function attachEvents() {
  // 语言切换
  els.fromLang.addEventListener('change', (e) => {
    state.fromLang = e.target.value;
    // 互斥逻辑：如果源语言和目标语言相同，则目标语言切换到另一种
    if (state.fromLang === state.toLang) {
      state.toLang = state.fromLang === 'zh' ? 'en' : 'zh';
      els.toLang.value = state.toLang;
    }
    chrome.storage.local.set({ fromLang: state.fromLang, toLang: state.toLang });
  });
  
  els.toLang.addEventListener('change', (e) => {
    state.toLang = e.target.value;
    // 互斥逻辑：如果目标语言和源语言相同，则源语言切换到另一种
    if (state.toLang === state.fromLang) {
      state.fromLang = state.toLang === 'zh' ? 'en' : 'zh';
      els.fromLang.value = state.fromLang;
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
  list.unshift(item);
  const trimmed = list.slice(0, 20);
  return new Promise((resolve) => {
    chrome.storage.local.set({ history: trimmed }, () => resolve());
  });
}

function renderHistoryItem(item) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '4px';
  wrap.style.background = '#ffffff';
  wrap.style.borderRadius = '12px';
  wrap.style.padding = '12px';
  wrap.style.border = '1px solid #E9EAEB';
  const src = document.createElement('div');
  src.style.color = '#60656B';
  src.style.fontSize = '14px';
  src.style.lineHeight = 'normal';
  src.style.fontWeight = '400';
  src.style.whiteSpace = 'pre-wrap';
  src.style.wordBreak = 'break-word';
  src.innerText = item.src;
  const divider = document.createElement('div');
  divider.style.borderTop = '1px dashed #E9EAEB';
  divider.style.margin = '4px 0';
  const out = document.createElement('div');
  out.style.color = '#919499';
  out.style.fontSize = '14px';
  out.style.lineHeight = 'normal';
  out.style.fontWeight = '400';
  out.style.whiteSpace = 'pre-wrap';
  out.style.wordBreak = 'break-word';
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
  if (state.currentEngine === 'ai') {
    return await fetchAITranslate(text, from, to);
  }
  return await fetchGoogleTranslate(text, from, to);
}

// 谷歌翻译接口
async function fetchGoogleTranslate(text, from, to) {
  try {
    const sl = from === 'zh' ? 'zh-CN' : from;
    const tl = to === 'zh' ? 'zh-CN' : to;
    
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error('API 响应异常');
    
    const data = await res.json();
    
    if (data && data[0] && data[0][0]) {
      return data[0].map(item => item[0]).join('');
    }
    
    throw new Error('未找到翻译结果');
  } catch (err) {
    console.error('Google Translate Error:', err);
    throw err;
  }
}

// 免费 AI 翻译接口 (MyMemory 提供的智能翻译作为 AI 替代)
async function fetchAITranslate(text, from, to) {
  const fromLang = from === 'zh' ? 'zh-CN' : from;
  const toLang = to === 'zh' ? 'zh-CN' : to;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
  
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    throw new Error('AI 引擎暂时不可用');
  } catch (err) {
    console.error('AI Translate Error:', err);
    // 如果 AI 失败，降级到谷歌翻译
    return await fetchGoogleTranslate(text, from, to);
  }
}

// 启动
init();
