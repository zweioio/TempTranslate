chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "translate-selection",
      title: "翻译选中文本",
      contexts: ["selection"]
    });
  } catch (e) {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translate-selection" && info.selectionText) {
    try {
      if (tab && tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
        chrome.runtime.sendMessage({ type: "translateText", text: info.selectionText });
      }
    } catch (e) {}
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-side-panel") {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id) {
        await chrome.sidePanel.open({ tabId: activeTab.id });
        chrome.runtime.sendMessage({ type: "focusInput" });
      }
    } catch (e) {}
  }
});

async function fetchGoogleTranslate(text, from, to) {
  const sl = from === "zh" ? "zh-CN" : from;
  const tl = to === "zh" ? "zh-CN" : to;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("bad");
  const data = await res.json();
  if (data && data[0] && data[0][0]) {
    return data[0].map((i) => i[0]).join("");
  }
  throw new Error("none");
}

async function fetchAITranslate(text, from, to) {
  const fromLang = from === "zh" ? "zh-CN" : from;
  const toLang = to === "zh" ? "zh-CN" : to;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.responseData && data.responseData.translatedText) {
    return data.responseData.translatedText;
  }
  return await fetchGoogleTranslate(text, from, to);
}

async function translate(text, from, to) {
  const engineStored = await chrome.storage.sync.get(["engine"]);
  const engine = engineStored.engine || "google";
  if (engine === "ai") {
    return await fetchAITranslate(text, from, to);
  }
  return await fetchGoogleTranslate(text, from, to);
}

async function addHistory(record) {
  const data = await chrome.storage.local.get(["history"]);
  const list = Array.isArray(data.history) ? data.history : [];
  list.unshift(record);
  const trimmed = list.slice(0, 50);
  await chrome.storage.local.set({ history: trimmed });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "translateRequest") {
    translate(msg.text, msg.from || "auto", msg.to || "zh")
      .then((result) => {
        addHistory({
          t: Date.now(),
          from: msg.from || "auto",
          to: msg.to || "zh",
          src: msg.text,
          out: result
        });
        sendResponse({ ok: true, result });
      })
      .catch(() => sendResponse({ ok: false }))
      .finally(() => {});
    return true;
  }
});
