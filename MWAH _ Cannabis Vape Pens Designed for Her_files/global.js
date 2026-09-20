/* =========================================================================
   global.js — Shared utilities loaded on every page
   Depends on nothing. Exposes window.MW.* for page-specific scripts.
   ========================================================================= */
(function () {
  "use strict";

  /** Escape HTML to prevent XSS when injecting strings into the DOM. */
  function escapeHTML(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Escape a value for use inside an inline onclick= attribute. */
  function escapeAttr(s) {
    return escapeHTML(s);
  }

  /** Shorthand querySelector. */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** Fetch JSON with a timeout + sensible defaults. */
  function fetchJSON(url, opts) {
    opts = opts || {};
    var controller = new AbortController();
    var t = setTimeout(function () { controller.abort(); }, opts.timeoutMs || 10000);
    return fetch(url, Object.assign({}, opts, { signal: controller.signal }))
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  /** Read a UTM object from the current URL. */
  function readUTM() {
    var p = new URLSearchParams(location.search);
    return {
      source: p.get("utm_source") || null,
      medium: p.get("utm_medium") || null,
      campaign: p.get("utm_campaign") || null,
    };
  }

  window.MW = window.MW || {};
  window.MW.escapeHTML = escapeHTML;
  window.MW.escapeAttr = escapeAttr;
  window.MW.$ = $;
  window.MW.$$ = $$;
  window.MW.fetchJSON = fetchJSON;
  window.MW.readUTM = readUTM;
})();
