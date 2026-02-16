chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Edge Token Cache
let edgeToken = '';
let edgeTokenExpiry = 0;

// Translation Cache (LRU-like simple implementation)
const CACHE_SIZE = 500;
const translationCache = new Map();

function getCacheKey(text, from, to, engine) {
  return `${engine}:${from}:${to}:${text}`;
}

function getCachedTranslation(text, from, to, engine) {
  const key = getCacheKey(text, from, to, engine);
  if (translationCache.has(key)) {
    // Refresh key to mark as recently used
    const val = translationCache.get(key);
    translationCache.delete(key);
    translationCache.set(key, val);
    return val;
  }
  return null;
}

function setCachedTranslation(text, from, to, engine, result) {
  const key = getCacheKey(text, from, to, engine);
  if (translationCache.has(key)) {
    translationCache.delete(key);
  } else if (translationCache.size >= CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
  translationCache.set(key, result);
}

async function getEdgeToken() {
  if (edgeToken && Date.now() < edgeTokenExpiry) return edgeToken;
  try {
    const res = await fetch('https://edge.microsoft.com/translate/auth');
    if (res.ok) {
      const text = await res.text();
      edgeToken = text.trim();
      edgeTokenExpiry = Date.now() + 5 * 60 * 1000; // 5 mins cache
      return edgeToken;
    }
  } catch (e) {
    console.error('Edge Auth Error:', e);
  }
  return null;
}

// Unified Translation Service
async function translateService(items, from, to, engine) {
  const out = {};
  const missingItems = [];

  // 1. Check Cache
  for (const item of items) {
    const cached = getCachedTranslation(item.text, from, to, engine);
    if (cached) {
      out[item.id] = cached;
    } else {
      missingItems.push(item);
    }
  }

  if (missingItems.length === 0) return out;

  // 2. Try AI (Edge) if selected
  if (engine === 'ai') {
    const edgeOut = await fetchEdgeBatch(missingItems, from, to);
    if (edgeOut) {
      // Merge results and cache them
      for (const item of missingItems) {
        if (edgeOut[item.id]) {
          out[item.id] = edgeOut[item.id];
          setCachedTranslation(item.text, from, to, engine, edgeOut[item.id]);
        }
      }
      return out; // Return whatever we got, even if partial (Edge rarely fails partially)
    }
    // If Edge fails completely, fall through to Google
  }

  // 3. Google Fallback (or primary if engine is google)
  // Google Translate API doesn't support batching in this free endpoint way easily without multiple requests,
  // so we process concurrently.
  const sl = from === 'zh' ? 'zh-CN' : from;
  const tl = to === 'zh' ? 'zh-CN' : to;
  const limit = 4;
  let i = 0;
  
  async function worker() {
    while (i < missingItems.length) {
      const it = missingItems[i++];
      try {
        // Double check cache before request (rare race condition but good practice)
        // const cached = getCachedTranslation(it.text, from, to, 'google');
        
        const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(it.text)}`;
        const gResp = await fetch(gUrl);
        const gData = await gResp.json();
        const resText = (gData && gData[0]) ? gData[0].map(d => d[0]).join('') : '';
        
        if (resText) {
          out[it.id] = resText;
          // Cache Google results too
          setCachedTranslation(it.text, from, to, engine, resText);
        } else {
          out[it.id] = '';
        }
      } catch (e) {
        out[it.id] = '';
      }
    }
  }
  
  await Promise.all(Array.from({length: Math.min(limit, missingItems.length)}, () => worker()));
  
  return out;
}

// Edge Batch Translate
async function fetchEdgeBatch(items, from, to) {
  const token = await getEdgeToken();
  if (!token) return null;

  const fromLang = (from === 'zh' || from === 'zh-CN') ? 'zh-Hans' : from;
  const toLang = (to === 'zh' || to === 'zh-CN') ? 'zh-Hans' : to;

  // Edge supports max 1000 items or 50k chars per request.
  const body = items.map(it => ({ Text: it.text }));
  
  try {
    const url = `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${fromLang}&to=${toLang}&includeSentenceLength=true`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      const out = {};
      data.forEach((item, index) => {
        if (item && item.translations && item.translations[0]) {
          out[items[index].id] = item.translations[0].text;
        }
      });
      return out;
    }
  } catch (e) {
    console.error('Edge Translate Error:', e);
  }
  return null;
}

// 消息监听
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'jt_translate_batch') {
    (async () => {
      const { engine = 'google', from = 'en', to = 'zh', items = [] } = msg;
      const out = await translateService(items, from, to, engine);
      sendResponse(out);
    })();
    return true; // keep channel open
  }
  
  if (msg && msg.type === 'jt_translate_text') {
    (async () => {
      const { engine = 'google', from = 'en', to = 'zh', text = '' } = msg;
      // Reuse the service with a single item
      const items = [{ id: 'single', text }];
      const out = await translateService(items, from, to, engine);
      sendResponse({ text: out['single'] || '' });
    })();
    return true;
  }
});
