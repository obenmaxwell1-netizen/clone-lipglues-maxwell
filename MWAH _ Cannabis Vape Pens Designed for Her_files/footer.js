/* =========================================================================
   footer.js — Renders shared site footer + LCB legal block into
   <footer data-footer></footer>. Single source of truth per 2026-04-21
   routing lock. Markup mirrors Figma 281:5 (ONE PAGE Desktop).

   Cannabis warning copy is REQUIRED for regulated consumer-facing ads.
   The warning is preserved; the license suffix stays number-free per
   Kyle's direction, but now reflects that MWAH is licensed in both
   Washington and California. Do NOT remove the warning.

   The same warning text is baked statically into every page's
   <footer data-footer> so crawlers / AI fetchers / no-JS visitors see it
   (the rewritten WAC 314-55-155, effective 2026-07-04, requires a 21+
   statement on every ad in any format). If you edit LCB_WARNING, update
   the static block in every public HTML page that carries it too —
   byte-identical, enforced by scripts/qa-audit-hardening.js. Final wording
   pending counsel review of the multi-state launch copy.
   ========================================================================= */
(function () {
  "use strict";

  var LCB_WARNING = "This product has intoxicating effects and may be habit forming. Marijuana can impair concentration, coordination, and judgment. Do not operate a vehicle or machinery under the influence of this drug. There may be health risks associated with consumption of this product. For use only by adults 21 and older. Keep out of reach of children. Marijuana products may be purchased or possessed only by persons 21 and older. MWAH is licensed in Washington and California.";
  // Two-line tagline (Kyle 2026-04-28). Rendered with <br> between
  // sentences so it breaks consistently regardless of viewport width.
  var TAGLINE_LINE_1 = "Cannabis designed for her.";
  var TAGLINE_LINE_2 = "Find us at licensed retailers.";
  var COPYRIGHT_YEAR = new Date().getFullYear();

  function render() {
    var target = document.querySelector("[data-footer]");
    if (!target) return;

    target.innerHTML = [
      '<footer class="op-footer">',
        '<div class="op-footer__top">',
          '<div class="op-footer__brand">',
            '<div class="op-footer__wordmark" aria-label="MWAH">',
              '<svg class="op-footer__wordmark-svg" viewBox="0 0 467 94" fill="currentColor" aria-hidden="true">',
                '<path d="M79.62 93.68V39.31H78.9L52.65 83.06H46.91L20.66 39.31H19.94V93.68H0V0H19.65L50.35 51.36H50.64L81.2 0H100.28V93.68H79.62Z"/>',
                '<path d="M143.06 0L160.99 61.54H161.85L181.07 0H196.13L215.21 61.54H216.07L234.14 0H255.66L225.68 93.68H206.17L188.53 38.02H187.67L170.17 93.68H150.66L120.68 0H143.06Z"/>',
                '<path d="M300.65 0H318.3L361.77 93.68H339.25L330.64 73.88H287.32L278.86 93.68H257.2L300.67 0H300.65ZM294.34 57.67H323.6L309.4 24.53H308.54L294.34 57.67Z"/>',
                '<path d="M381.08 93.68V0H401.74V34.72H445.92V0H466.58V93.68H445.92V52.08H401.74V93.68H381.08Z"/>',
              '</svg>',
              '<svg class="op-footer__tm-svg" viewBox="0 0 42 19" fill="currentColor" aria-hidden="true">',
                '<path d="M15.75 0.0100002V3.12H9.73999V18.8H6.01001V3.12H0V0.0100002H15.75ZM36.05 18.79L35.36 7.74C35.29 6.29 35.29 4.49 35.23 2.49H35.02C34.54 4.15 33.99 6.36 33.43 8.09L30.04 18.52H26.17L22.78 7.81C22.44 6.36 21.89 4.15 21.47 2.49H21.26C21.26 4.22 21.19 6.01 21.12 7.74L20.43 18.79H16.84L18.22 0H23.81L27.06 9.19C27.47 10.64 27.82 12.02 28.3 13.95H28.37C28.85 12.22 29.27 10.64 29.68 9.25L32.93 0H38.32L39.77 18.79H36.04H36.05Z"/>',
              '</svg>',
            '</div>',
            '<p class="op-footer__tagline">' + MW.escapeHTML(TAGLINE_LINE_1) + '<br>' + MW.escapeHTML(TAGLINE_LINE_2) + '</p>',
          '</div>',
          '<div class="op-footer__col">',
            '<p class="op-footer__col-title">SITE</p>',
            '<a href="/#products" class="op-footer__link" data-analytics-action="view_products" data-analytics-location="footer">PRODUCTS</a>',
            '<a href="/#find-us" class="op-footer__link" data-analytics-action="find_store" data-analytics-location="footer">FIND US</a>',
            '<a href="/about" class="op-footer__link" data-analytics-action="view_about" data-analytics-location="footer">ABOUT</a>',
            '<a href="/kiss-labs/" class="op-footer__link" data-analytics-action="view_kiss_labs" data-analytics-location="footer">KISS LABS</a>',
          '</div>',
          '<div class="op-footer__col">',
            '<p class="op-footer__col-title">LEGAL</p>',
            '<a href="/terms" class="op-footer__link">TERMS</a>',
            '<a href="/privacy" class="op-footer__link">PRIVACY</a>',
          '</div>',
          '<div class="op-footer__col">',
            '<p class="op-footer__col-title">FOLLOW</p>',
            '<a href="https://www.tiktok.com/@gimmeemwahh?_r=1&_t=ZP-99u1fW9hVRX" class="op-footer__link" aria-label="TikTok (opens in new tab)" target="_blank" rel="noopener noreferrer" data-analytics-platform="tiktok" data-analytics-location="footer">TIKTOK</a>',
            '<a href="https://t.me/gimmemwhah" class="op-footer__link" aria-label="Telegram (opens in new tab)" target="_blank" rel="noopener noreferrer" data-analytics-platform="telegram" data-analytics-location="footer">TELEGRAM</a>',
            '<a href="tel:+9406227259" class="op-footer__link" aria-label="Call Us" data-analytics-platform="phone" data-analytics-location="footer">CALL US</a>',
          '</div>',
        '</div>',
        '<div class="op-footer__lcb">',
          '<p>' + MW.escapeHTML(LCB_WARNING) + '</p>',
        '</div>',
        '<div class="op-footer__legal">',
          '<p>&copy; ' + COPYRIGHT_YEAR + ' MWAH. All rights reserved.&nbsp;&nbsp;&middot;&nbsp;&nbsp;Patent Pending.</p>',
        '</div>',
      '</footer>',
    ].join("");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
