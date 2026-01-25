// chinese-popup.js (ESM)
// Requires: chinese-tokenizer.esm.js (your offline bundle)
// Usage example:
//   import { attachChineseTokenizerPopup } from "./chinese-popup.js";
//   const cedictText = await fetch("./cedict_ts.u8").then(r => r.text());
//   attachChineseTokenizerPopup(document.querySelector("#myEl"), { cedictText });

import { load as loadTokenizer } from "https://raw.githubusercontent.com/thenoobtester/djrjp/main/chinese-tokenizer.esm.js";

const CT_STYLE_ID = "ct-popup-style-v1";

function ensureStyles() {
  if (document.getElementById(CT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = CT_STYLE_ID;
  style.textContent = `
.ct-popup {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "PingFang TC", "PingFang SC", "Microsoft YaHei", sans-serif;
  width: 100%;
  max-width: 1100px;
  background: #f0f0f0;
  border: 1px solid #e3e3e3;
  box-shadow: 0 1px 0 rgba(0,0,0,0.05);
}

.ct-topbar {
  background: #efefef;
  padding: 12px 0;
  display: flex;
  justify-content: center;
}

.ct-toggle {
  display: inline-flex;
  border: 1px solid #d7d7d7;
  background: #f7f7f7;
}

.ct-toggle button {
  border: 0;
  background: transparent;
  padding: 4px 10px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
}

.ct-toggle button + button { border-left: 1px solid #d7d7d7; }
.ct-toggle button[aria-pressed="true"] { background: #dedede; }

.ct-sentence {
  background: #fff;
  padding: 26px 18px 22px 18px;
  position: relative;
}

.ct-pinyin-float {
  position: absolute;
  top: 8px;
  font-size: 12px;
  color: #111;
  pointer-events: none;
  white-space: nowrap;
}

.ct-line {
  font-size: 16px;
  color: #111;
  line-height: 1.4;
  word-break: break-word;
}

.ct-token {
  cursor: pointer;
  padding: 0 1px;
}

.ct-token:hover { background: #ffe800; }
.ct-token.ct-selected { background: #ffe800; }

.ct-detail {
  background: #efefef;
  border-top: 1px solid #e6e6e6;
  padding: 18px;
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.ct-bigword {
  font-size: 34px;
  font-weight: 800;
  color: #111;
  line-height: 1;
  min-width: 92px;
}

.ct-detailtext {
  font-size: 14px;
  color: #222;
  line-height: 1.6;
  padding-top: 6px;
}

.ct-bullet {
  display: inline-block;
  margin: 0 10px 0 0;
  color: #222;
  font-weight: 700;
}

.ct-pinyin-inline {
  margin-right: 14px;
  color: #222;
}

.ct-english {
  color: #222;
}
  `;
  document.head.appendChild(style);
}

function pickBestMatch(token) {
  // Prefer first match (most common in CC-CEDICT ordering)
  return token.matches && token.matches.length ? token.matches[0] : null;
}

function getDisplayText(token, mode /* "simplified" | "traditional" */) {
  if (!token) return "";
  return mode === "traditional" ? token.traditional : token.simplified;
}

function isClickableToken(token) {
  // clickable if it has dictionary matches AND isn't whitespace
  if (!token) return false;
  if (!token.matches || token.matches.length === 0) return false;
  return !/^\s+$/.test(token.text);
}

function findFirstClickable(tokens) {
  for (const t of tokens) if (isClickableToken(t)) return t;
  return tokens.find(t => !/^\s+$/.test(t.text)) || tokens[0] || null;
}

function positionFloatingPinyin(pinyinEl, tokenSpan, sentenceEl) {
  if (!tokenSpan) {
    pinyinEl.style.display = "none";
    return;
  }
  pinyinEl.style.display = "block";

  const spanRect = tokenSpan.getBoundingClientRect();
  const sentRect = sentenceEl.getBoundingClientRect();

  // Place pinyin above the selected token, aligned to its left edge.
  const left = Math.max(0, spanRect.left - sentRect.left);
  pinyinEl.style.left = `${left}px`;
}

/**
 * Attach a popup that looks like the screenshot and tokenizes the element's text.
 *
 * @param {HTMLElement} el - element whose .textContent will be tokenized
 * @param {{cedictText: string}} opts
 * @returns {{ destroy(): void }}
 */
export function attachChineseTokenizerPopup(el, opts) {
  if (!el) throw new Error("attachChineseTokenizerPopup: missing element");
  if (!opts || typeof opts.cedictText !== "string") {
    throw new Error("attachChineseTokenizerPopup: opts.cedictText is required");
  }

  ensureStyles();

  const tokenize = loadTokenizer(opts.cedictText);
  const rawText = el.textContent ?? "";
  const tokens = tokenize(rawText);

  // Build popup DOM
  const popup = document.createElement("div");
  popup.className = "ct-popup";

  const topbar = document.createElement("div");
  topbar.className = "ct-topbar";

  const toggle = document.createElement("div");
  toggle.className = "ct-toggle";

  const btnS = document.createElement("button");
  btnS.type = "button";
  btnS.textContent = "Simplified";
  btnS.setAttribute("aria-pressed", "true");

  const btnT = document.createElement("button");
  btnT.type = "button";
  btnT.textContent = "Traditional";
  btnT.setAttribute("aria-pressed", "false");

  toggle.append(btnS, btnT);
  topbar.append(toggle);

  const sentence = document.createElement("div");
  sentence.className = "ct-sentence";

  const pinyinFloat = document.createElement("div");
  pinyinFloat.className = "ct-pinyin-float";
  sentence.append(pinyinFloat);

  const line = document.createElement("div");
  line.className = "ct-line";
  sentence.append(line);

  const detail = document.createElement("div");
  detail.className = "ct-detail";

  const bigword = document.createElement("div");
  bigword.className = "ct-bigword";

  const detailtext = document.createElement("div");
  detailtext.className = "ct-detailtext";

  const bullet = document.createElement("span");
  bullet.className = "ct-bullet";
  bullet.textContent = "▪";

  const pinyinInline = document.createElement("span");
  pinyinInline.className = "ct-pinyin-inline";

  const english = document.createElement("span");
  english.className = "ct-english";

  detailtext.append(bullet, pinyinInline, english);
  detail.append(bigword, detailtext);

  popup.append(topbar, sentence, detail);

  // Insert popup right after the element (so it “appears” near it like the screenshot)
  el.insertAdjacentElement("afterend", popup);

  // Render tokens
  let mode = "simplified"; // or "traditional"
  const spanByIndex = new Map(); // tokenIndex -> span
  let selectedIndex = -1;

  function renderLine() {
    line.textContent = "";
    spanByIndex.clear();

    tokens.forEach((t, idx) => {
      // Preserve whitespace/punct as plain text when not clickable
      if (!isClickableToken(t)) {
        line.append(document.createTextNode(getDisplayText(t, mode)));
        return;
      }

      const span = document.createElement("span");
      span.className = "ct-token";
      span.textContent = getDisplayText(t, mode);
      span.dataset.idx = String(idx);

      span.addEventListener("mouseenter", () => {
        // hover highlight is handled by CSS, but keep the pinyin float aligned to selected token only
      });

      span.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        selectIndex(idx);
      });

      line.append(span);
      spanByIndex.set(idx, span);
    });

    // Re-apply selection after re-render
    if (selectedIndex >= 0) {
      const span = spanByIndex.get(selectedIndex);
      if (span) span.classList.add("ct-selected");
      updateFloatingPinyin();
    }
  }

  function updateDetail(selectedToken) {
    if (!selectedToken) {
      bigword.textContent = "";
      pinyinInline.textContent = "";
      english.textContent = "";
      pinyinFloat.textContent = "";
      pinyinFloat.style.display = "none";
      return;
    }

    const match = pickBestMatch(selectedToken);
    const wordShown = getDisplayText(selectedToken, mode);

    bigword.textContent = wordShown;

    if (match) {
      // screenshot shows tone-marked pinyin on top and inline
      pinyinInline.textContent = match.pinyinPretty;
      pinyinFloat.textContent = match.pinyinPretty;

      // english list rendered as a single line with commas (similar feel to screenshot)
      english.textContent = match.english.join(", ");
    } else {
      pinyinInline.textContent = "";
      pinyinFloat.textContent = "";
      english.textContent = "";
    }
  }

  function updateFloatingPinyin() {
    const tokenSpan = spanByIndex.get(selectedIndex) || null;
    positionFloatingPinyin(pinyinFloat, tokenSpan, sentence);
  }

  function selectIndex(idx) {
    // remove old selected class
    if (selectedIndex >= 0) {
      const oldSpan = spanByIndex.get(selectedIndex);
      if (oldSpan) oldSpan.classList.remove("ct-selected");
    }

    selectedIndex = idx;

    const newSpan = spanByIndex.get(selectedIndex);
    if (newSpan) newSpan.classList.add("ct-selected");

    const selectedToken = tokens[selectedIndex] || null;
    updateDetail(selectedToken);
    updateFloatingPinyin();
  }

  function setMode(nextMode) {
    mode = nextMode;
    btnS.setAttribute("aria-pressed", mode === "simplified" ? "true" : "false");
    btnT.setAttribute("aria-pressed", mode === "traditional" ? "true" : "false");

    renderLine();
    // Update detail text to match mode (big word and the sentence text)
    updateDetail(tokens[selectedIndex] || null);
    updateFloatingPinyin();
  }

  btnS.addEventListener("click", () => setMode("simplified"));
  btnT.addEventListener("click", () => setMode("traditional"));

  // Keep pinyin aligned on resize/scroll
  const onRelayout = () => updateFloatingPinyin();
  window.addEventListener("resize", onRelayout, { passive: true });
  window.addEventListener("scroll", onRelayout, { passive: true });

  // Initial render + initial selection
  renderLine();
  const first = findFirstClickable(tokens);
  if (first) selectIndex(tokens.indexOf(first));
  else updateDetail(null);

  return {
    destroy() {
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout);
      popup.remove();
    },
  };
}
