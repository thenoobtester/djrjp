/*!
 * chinese-tokenizer.browser.js
 *
 * Exposes: window.ChineseTokenizer
 * - Loads the ESM build of `chinese-tokenizer` from a CDN (esm.sh)
 * - Intended for browsers
 *
 * Usage:
 *   <script src="./chinese-tokenizer.browser.js"></script>
 *   <script>
 *     await ChineseTokenizer.ready;
 *     const tokenize = ChineseTokenizer.load(cedictText);
 *     console.log(tokenize("我是中国人。"));
 *   </script>
 */
(function (global) {
  "use strict";

  const CDN_URL = "https://esm.sh/chinese-tokenizer@2.4.0";

  const api = {
    // Will be replaced after load:
    load() {
      throw new Error(
        "ChineseTokenizer not ready yet. Await ChineseTokenizer.ready first."
      );
    },

    // A promise you can await before calling load()
    ready: null,

    // Expose where we loaded it from (handy for debugging)
    cdn: CDN_URL,
  };

  api.ready = (async () => {
    // Dynamic import works in all modern browsers.
    // Note: this file must be served over http(s) (not file://) in most browsers.
    const mod = await import(CDN_URL);

    // esm.sh typically exports CommonJS defaults as `default`.
    // If it exports named, we fall back to the namespace.
    const exported = mod && (mod.default || mod);

    if (!exported || typeof exported.load !== "function") {
      throw new Error(
        "Failed to load chinese-tokenizer from CDN, or unexpected export shape."
      );
    }

    api.load = exported.load.bind(exported);
    return api;
  })();

  global.ChineseTokenizer = api;
})(typeof window !== "undefined" ? window : globalThis);
