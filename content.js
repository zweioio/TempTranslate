let bubble;
let translating = false;
function ensureBubble() {
  if (bubble) return bubble;
  bubble = document.createElement("div");
  bubble.style.position = "fixed";
  bubble.style.zIndex = "2147483647";
  bubble.style.background = "#111827";
  bubble.style.color = "#fff";
  bubble.style.fontSize = "14px";
  bubble.style.lineHeight = "1.3";
  bubble.style.borderRadius = "10px";
  bubble.style.boxShadow = "0 6px 20px rgba(0,0,0,0.2)";
  bubble.style.padding = "10px 12px";
  bubble.style.maxWidth = "360px";
  bubble.style.display = "none";
  bubble.style.gap = "8px";
  bubble.style.alignItems = "center";
  bubble.style.pointerEvents = "auto";
  const btn = document.createElement("button");
  btn.textContent = "翻译";
  btn.style.background = "#0395FF";
  btn.style.border = "none";
  btn.style.color = "#fff";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "8px";
  btn.style.cursor = "pointer";
  btn.style.marginRight = "8px";
  const text = document.createElement("div");
  text.style.whiteSpace = "pre-wrap";
  text.style.wordBreak = "break-word";
  text.style.maxHeight = "180px";
  text.style.overflow = "auto";
  const close = document.createElement("span");
  close.textContent = "×";
  close.style.cursor = "pointer";
  close.style.marginLeft = "8px";
  close.style.opacity = "0.7";
  close.onclick = () => {
    bubble.style.display = "none";
  };
  btn.onclick = async () => {
    if (translating) return;
    const sel = window.getSelection();
    const s = sel ? sel.toString().trim() : "";
    if (!s) return;
    translating = true;
    btn.disabled = true;
    const prev = text.textContent;
    text.textContent = "正在翻译...";
    try {
      const { fromLang, toLang } = await new Promise((resolve) => {
        chrome.storage.local.get(["fromLang", "toLang"], (r) => {
          resolve({
            fromLang: r.fromLang || "auto",
            toLang: r.toLang || "zh"
          });
        });
      });
      chrome.runtime.sendMessage(
        { type: "translateRequest", text: s, from: fromLang || "auto", to: toLang },
        (resp) => {
          if (resp && resp.ok) {
            text.textContent = resp.result || "";
          } else {
            text.textContent = "翻译失败";
          }
          btn.disabled = false;
          translating = false;
        }
      );
    } catch (e) {
      text.textContent = prev;
      btn.disabled = false;
      translating = false;
    }
  };
  bubble.appendChild(btn);
  bubble.appendChild(text);
  bubble.appendChild(close);
  document.documentElement.appendChild(bubble);
  return bubble;
}
function placeBubble() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    if (bubble) bubble.style.display = "none";
    return;
  }
  const s = sel.toString().trim();
  if (!s) {
    if (bubble) bubble.style.display = "none";
    return;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const b = ensureBubble();
  b.style.display = "flex";
  b.style.top = Math.max(8, rect.top + window.scrollY - 44) + "px";
  b.style.left = Math.min(
    window.scrollX + rect.right - 200,
    window.scrollX + document.documentElement.clientWidth - 380
  ) + "px";
  b.querySelector("div").textContent = "";
}
document.addEventListener("mouseup", () => setTimeout(placeBubble, 0));
document.addEventListener("keyup", () => setTimeout(placeBubble, 0));
document.addEventListener("scroll", () => {
  if (bubble && bubble.style.display !== "none") placeBubble();
}, true);
