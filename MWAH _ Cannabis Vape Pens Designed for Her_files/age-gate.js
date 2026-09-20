/* =========================================================================
   age-gate.js — 21+ age verification overlay
   Required on every page per WA cannabis advertising rules (RCW 69.50.369).
   See agent_docs/compliance.md for the full spec.

   Behavior:
   - Renders immediately on page load (before any content is visible)
   - Session cookie only (dies on tab close) — strictest safe default
   - "I am 21+" → set cookie, dismiss overlay, reveal page
   - "Under 21" → redirect to samhsa.gov (appropriate resource, not Google)
   - Bot crawlers (Googlebot, Bingbot, etc.) bypass the gate so SEO works
   - Keyboard accessible (Tab between buttons, Enter to confirm, focus trap)
   - No bypass via URL or normal UI (DevTools bypass is out of scope —
     demonstrating good-faith gating satisfies the regulatory requirement)
   ========================================================================= */

(function () {
  "use strict";

  var COOKIE_NAME = "mwah_ageok";
  var REDIRECT_UNDER_21 = "https://www.samhsa.gov/";
  var inertTargets = [];

  // First-paint hide: this script loads in <head>, but document.body
  // doesn't exist yet, so we cannot insert the overlay until DOMContentLoaded.
  // Without this, the browser paints the page content first, then the
  // overlay drops on top — a classic flash of unauthenticated content.
  // Hide the document at the documentElement layer immediately. We restore
  // visibility in the cookie-set / bot bypass paths, or once the overlay
  // is in place. If something goes wrong (script error, CSP block) the
  // safety-net <noscript>/timeout below restores visibility so we never
  // leave a permanently blank page for real users.
  var rootEl = document.documentElement;
  var hadHidden = rootEl.style.visibility;
  rootEl.style.visibility = "hidden";

  function reveal() {
    rootEl.style.visibility = hadHidden || "";
  }

  // Safety net: if anything below throws / never runs, ensure the page
  // becomes visible within ~1s rather than staying blank forever.
  var revealFallback = setTimeout(reveal, 1000);

  // If the cookie is set for this session, skip the gate entirely.
  if (document.cookie.split(";").some(function (c) {
    return c.trim().indexOf(COOKIE_NAME + "=1") === 0;
  })) {
    clearTimeout(revealFallback);
    reveal();
    return;
  }

  // Bot bypass — crawlers see content so we stay indexable. Covers classic
  // search bots plus the AI search/training fetchers (2026-06-10 plan §3:
  // most AI fetchers don't run JS so the gate never triggers for them
  // anyway, but the ones that render get the same treatment as Googlebot).
  var ua = navigator.userAgent || "";
  var BOT_RE = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Applebot|Amazonbot|meta-externalagent/i;
  if (BOT_RE.test(ua)) {
    clearTimeout(revealFallback);
    reveal();
    return;
  }

  // Render overlay immediately. Note: documentElement stays visibility:hidden
  // until insertOverlay() finishes — at which point the overlay covers the
  // page so revealing visibility doesn't expose content prematurely.
  document.documentElement.style.overflow = "hidden";

  var overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "age-gate-title");
  overlay.setAttribute("aria-describedby", "age-gate-desc");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:var(--ink)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    "color:var(--white)",
  ].join(";");

  overlay.innerHTML = [
    '<div style="background:var(--ink);max-width:480px;width:100%;padding:40px 32px;text-align:center;display:flex;flex-direction:column;gap:24px">',
    '<img src="/assets/img/mwah-logo.png?v=1" alt="MWAH" width="131" height="28" style="height:28px;width:auto;display:block;margin:0 auto">',
    // color must be explicit: global.css sets h1 { color: var(--ink) }, which
    // beats the inherited overlay color and rendered this black-on-black.
    '<h1 id="age-gate-title" style="font-weight:800;font-size:36px;letter-spacing:-0.02em;line-height:1.05;margin:0;color:var(--white)">Are you 21 or older?</h1>',
    '<p id="age-gate-desc" style="font-weight:400;font-size:14px;line-height:1.5;margin:0;color:rgba(255,255,255,0.75)">You must be 21 or older to enter this site.</p>',
    '<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">',
    '<button type="button" id="age-gate-yes" style="padding:16px 24px;background:var(--hot-pink);color:var(--ink);border:0;border-radius:999px;font:inherit;font-weight:700;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer">I am 21 or older</button>',
    '<button type="button" id="age-gate-no" style="padding:16px 24px;background:transparent;color:var(--white);border:1px solid rgba(255,255,255,0.35);border-radius:999px;font:inherit;font-weight:600;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer">I am under 21</button>',
    '</div>',
    '<p style="font-weight:400;font-size:11px;line-height:1.4;color:rgba(255,255,255,0.5);margin-top:8px">This product has intoxicating effects and may be habit forming. For use only by adults 21+.</p>',
    '</div>',
  ].join("");

  // Insert as the FIRST child of <body> so it renders before anything else.
  function insertOverlay() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", insertOverlay, { once: true });
      return;
    }
    document.body.insertBefore(overlay, document.body.firstChild);
    setPageInert(true);
    // Now the overlay is on top of any content; safe to reveal the
    // document. The user sees the gate, not whatever was behind it.
    clearTimeout(revealFallback);
    reveal();
    wireUp();
  }

  function setPageInert(on) {
    var children = Array.prototype.slice.call(document.body.children || []);
    if (on) {
      inertTargets = [];
      children.forEach(function (child) {
        if (child === overlay) return;
        if (child.tagName === "SCRIPT" || child.tagName === "NOSCRIPT") return;
        inertTargets.push({
          el: child,
          inert: child.hasAttribute("inert"),
          ariaHidden: child.getAttribute("aria-hidden"),
        });
        child.setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
      });
      return;
    }
    inertTargets.forEach(function (entry) {
      if (!entry.inert) entry.el.removeAttribute("inert");
      if (entry.ariaHidden == null) entry.el.removeAttribute("aria-hidden");
      else entry.el.setAttribute("aria-hidden", entry.ariaHidden);
    });
    inertTargets = [];
  }

  function wireUp() {
    var yes = document.getElementById("age-gate-yes");
    var no = document.getElementById("age-gate-no");

    yes.addEventListener("click", accept);
    no.addEventListener("click", decline);

    // Focus trap — keep Tab inside the modal
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") return; // no escape — can't dismiss without choosing
      if (e.key !== "Tab") return;
      var focusable = [yes, no];
      var idx = focusable.indexOf(document.activeElement);
      if (e.shiftKey) {
        e.preventDefault();
        focusable[(idx - 1 + focusable.length) % focusable.length].focus();
      } else {
        e.preventDefault();
        focusable[(idx + 1) % focusable.length].focus();
      }
    });

    // Default focus to the YES button
    setTimeout(function () { yes.focus(); }, 0);
  }

  function accept() {
    // Session cookie — no max-age, no expires, dies on tab close.
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = COOKIE_NAME + "=1; Path=/; SameSite=Lax" + secure;
    document.documentElement.style.overflow = "";
    setPageInert(false);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    // Notify other scripts (analytics.js) that consent has just been granted,
    // so they can boot post-gate without requiring a navigation.
    try { document.dispatchEvent(new CustomEvent("mwah:age-accepted")); } catch (e) { /* ignore */ }
    // Track consent grant. Consent-exempt in MW.trackEvent (age_gate_*
    // events fire regardless of cookie state — they ARE the consent
    // moment). Empty payload, no PII.
    if (window.MW && typeof window.MW.trackEvent === "function") {
      try { window.MW.trackEvent("age_gate_enter"); } catch (e) { /* ignore */ }
    }
  }

  function decline() {
    // Track the bounce BEFORE redirect. analytics.js uses fetch +
    // keepalive: true with a CORS-safelisted Content-Type so the POST
    // fires without a preflight and survives the location.replace()
    // navigation below. Consent-exempt in MW.trackEvent (age_gate_*
    // events fire regardless of cookie state — they ARE the consent
    // moment).
    if (window.MW && typeof window.MW.trackEvent === "function") {
      try { window.MW.trackEvent("age_gate_exit"); } catch (e) { /* ignore */ }
    }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    location.replace(REDIRECT_UNDER_21);
  }

  insertOverlay();
})();
