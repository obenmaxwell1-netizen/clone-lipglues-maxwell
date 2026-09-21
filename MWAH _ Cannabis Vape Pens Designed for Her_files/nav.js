/* =========================================================================
   nav.js — Enhances the served primary-link fallback in <header data-nav>
   with the full shared navigation. Full chrome mirrors Figma 274:5
   (ONE PAGE Desktop).
   - PRODUCTS targets the homepage product section (#products on home,
     /#products elsewhere) so the primary navigation keeps the one-page model.
   - FIND US uses the same anchor pattern (#find-us on home, /#find-us
     elsewhere). The locator's map + store list are now inline on the
     home page (Figma 279:5 Find Us · Body); a separate /find-us page
     is no longer rendered. Backward compat: firebase.json 301-redirects
     /find-us → /#find-us so existing links keep working.
   ========================================================================= */
(function () {
  "use strict";

  var currentPath = location.pathname.replace(/\/$/, "") || "/";
  var isHome = currentPath === "/" || currentPath === "/index.html";
  var drawerInertTargets = [];

  var CENTER = [
    { kind: "anchor", target: "products", label: "PRODUCTS" },
    { kind: "anchor", target: "find-us",  label: "FIND US"  },
  ];

  function linkHTML(l) {
    var href;
    if (l.kind === "page") {
      href = l.href;
    } else {
      href = isHome ? "#" + l.target : "/#" + l.target;
    }
    var action = l.target === "products" ? "view_products" : "find_store";
    return '<a href="' + href + '" class="op-nav__link" data-analytics-action="' + action + '" data-analytics-location="' + location + '">' + MW.escapeHTML(l.label) + '</a>';
  }

  function render() {
    var target = document.querySelector("[data-nav]");
    if (!target) return;

    var centerLinksHTML = CENTER.map(linkHTML).join("");
    // Built per host. The header cluster and the drawer render the same
    // three links, and on mobile both are in the DOM at once — pooling
    // them under one location would make it impossible to tell whether
    // the always-visible header earned a follow or merely moved a tap
    // that would have happened in the drawer anyway.
    function socialsFor(location) { return [
      '<a class="op-nav__ig" href="https://www.tiktok.com/@gimmeemwahh?_r=1&_t=ZP-99u1fW9hVRX" aria-label="TikTok (opens in new tab)" target="_blank" rel="noopener noreferrer" data-analytics-platform="tiktok" data-analytics-location="' + location + '">',
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">',
          '<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.51a8.16 8.16 0 0 0 4.77 1.52V6.59a4.85 4.85 0 0 1-1.84.1Z"/>',
        '</svg>',
      '</a>',
      '<a class="op-nav__ig" href="https://t.me/gimmemwhah" aria-label="Telegram (opens in new tab)" target="_blank" rel="noopener noreferrer" data-analytics-platform="telegram" data-analytics-location="' + location + '">',
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">',
          '<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.278 14.445l-2.937-.924c-.638-.198-.651-.638.136-.944l11.462-4.42c.532-.194.998.13.623 2.091z"/>',
        '</svg>',
      '</a>',
      '<a class="op-nav__ig" href="tel:+9406227259" aria-label="Call Us" data-analytics-platform="phone" data-analytics-location="' + location + '">',
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
          '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
        '</svg>',
      '</a>',
      ].join("");
    }

    var socialsHTML = socialsFor("navigation");
    var drawerSocialsHTML = socialsFor("navigation_drawer");

    target.innerHTML = [
      '<nav class="op-nav" aria-label="Site">',
        '<button type="button" class="op-nav__hamburger" aria-label="Open menu" aria-expanded="false" aria-controls="navDrawer">',
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">',
            '<line x1="4" y1="7" x2="20" y2="7"/>',
            '<line x1="4" y1="12" x2="20" y2="12"/>',
            '<line x1="4" y1="17" x2="20" y2="17"/>',
          '</svg>',
        '</button>',
        '<a href="/" class="op-nav__logo" aria-label="MWAH home">',
          // Inline SVG so the brand uses currentColor and inherits the
          // logo link's hover treatment. Wordmark + ™ from the Figma component
          // (Logo Lockup, 387:5) — matched 1:1 to the Figma source.
          '<svg class="op-nav__wordmark-svg" viewBox="0 0 467 94" fill="currentColor" aria-hidden="true">',
            '<path d="M79.62 93.68V39.31H78.9L52.65 83.06H46.91L20.66 39.31H19.94V93.68H0V0H19.65L50.35 51.36H50.64L81.2 0H100.28V93.68H79.62Z"/>',
            '<path d="M143.06 0L160.99 61.54H161.85L181.07 0H196.13L215.21 61.54H216.07L234.14 0H255.66L225.68 93.68H206.17L188.53 38.02H187.67L170.17 93.68H150.66L120.68 0H143.06Z"/>',
            '<path d="M300.65 0H318.3L361.77 93.68H339.25L330.64 73.88H287.32L278.86 93.68H257.2L300.67 0H300.65ZM294.34 57.67H323.6L309.4 24.53H308.54L294.34 57.67Z"/>',
            '<path d="M381.08 93.68V0H401.74V34.72H445.92V0H466.58V93.68H445.92V52.08H401.74V93.68H381.08Z"/>',
          '</svg>',
          '<svg class="op-nav__tm-svg" viewBox="0 0 42 19" fill="currentColor" aria-hidden="true">',
            '<path d="M15.75 0.0100002V3.12H9.73999V18.8H6.01001V3.12H0V0.0100002H15.75ZM36.05 18.79L35.36 7.74C35.29 6.29 35.29 4.49 35.23 2.49H35.02C34.54 4.15 33.99 6.36 33.43 8.09L30.04 18.52H26.17L22.78 7.81C22.44 6.36 21.89 4.15 21.47 2.49H21.26C21.26 4.22 21.19 6.01 21.12 7.74L20.43 18.79H16.84L18.22 0H23.81L27.06 9.19C27.47 10.64 27.82 12.02 28.3 13.95H28.37C28.85 12.22 29.27 10.64 29.68 9.25L32.93 0H38.32L39.77 18.79H36.04H36.05Z"/>',
          '</svg>',
        '</a>',
        '<div class="op-nav__center">',
          centerLinksHTML,
        '</div>',
        '<div class="op-nav__social">',
          socialsHTML,
        '</div>',
      '</nav>',
      '<div id="navDrawer" class="op-nav__drawer" role="dialog" aria-modal="true" aria-label="Site menu" hidden>',
        '<div class="op-nav__drawer-head">',
          '<span class="op-nav__drawer-brand" aria-hidden="true">MWAH</span>',
          '<button type="button" class="op-nav__drawer-close" aria-label="Close menu">',
            '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">',
              '<line x1="5" y1="5" x2="19" y2="19"/>',
              '<line x1="19" y1="5" x2="5" y2="19"/>',
            '</svg>',
          '</button>',
        '</div>',
        '<div class="op-nav__drawer-links">', centerLinksHTML, '</div>',
        '<div class="op-nav__drawer-social">', drawerSocialsHTML, '</div>',
      '</div>',
    ].join("");

    // Test environment uses a stub target with only innerHTML; skip the
    // hamburger wiring there since there's nothing to bind to.
    if (typeof target.querySelector !== "function") return;
    var hamburger = target.querySelector(".op-nav__hamburger");
    var drawer = target.querySelector("#navDrawer");
    if (hamburger && drawer) {
      var closeButton = drawer.querySelector(".op-nav__drawer-close");

      function setPageBehindDrawerInert(on) {
        var children = Array.prototype.slice.call(document.body.children || []);
        if (on) {
          drawerInertTargets = [];
          children.forEach(function (child) {
            if (child === target || child.tagName === "SCRIPT" || child.tagName === "NOSCRIPT") return;
            drawerInertTargets.push({
              el: child,
              inert: child.hasAttribute("inert"),
              ariaHidden: child.getAttribute("aria-hidden"),
            });
            child.setAttribute("inert", "");
            child.setAttribute("aria-hidden", "true");
          });
          return;
        }
        drawerInertTargets.forEach(function (entry) {
          if (!entry.inert) entry.el.removeAttribute("inert");
          if (entry.ariaHidden == null) entry.el.removeAttribute("aria-hidden");
          else entry.el.setAttribute("aria-hidden", entry.ariaHidden);
        });
        drawerInertTargets = [];
      }

      function openDrawer() {
        drawer.removeAttribute("hidden");
        hamburger.setAttribute("aria-expanded", "true");
        hamburger.setAttribute("aria-label", "Close menu");
        document.body.style.overflow = "hidden";
        setPageBehindDrawerInert(true);
        var firstLink = drawer.querySelector("a");
        if (firstLink) firstLink.focus();
      }
      function closeDrawer(returnFocus) {
        drawer.setAttribute("hidden", "");
        hamburger.setAttribute("aria-expanded", "false");
        hamburger.setAttribute("aria-label", "Open menu");
        document.body.style.overflow = "";
        setPageBehindDrawerInert(false);
        if (returnFocus) hamburger.focus();
      }
      hamburger.addEventListener("click", function () {
        if (drawer.hasAttribute("hidden")) openDrawer();
        else closeDrawer(false);
      });
      hamburger.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        if (drawer.hasAttribute("hidden")) return;
        e.preventDefault();
        closeDrawer(true);
      });
      if (closeButton) {
        closeButton.addEventListener("click", function () { closeDrawer(true); });
      }
      drawer.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeDrawer(true);
          return;
        }
        if (e.key !== "Tab") return;
        var nodes = drawer.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
        var focusable = [];
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].offsetParent !== null && !nodes[i].disabled) focusable.push(nodes[i]);
        }
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
      // Close drawer when a link inside it is clicked (anchor navigation
      // happens regardless; this just hides the panel so the user lands
      // on the section without the drawer covering it).
      drawer.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          closeDrawer(false);
        }
      });
      if (window.matchMedia) {
        var mobileQuery = window.matchMedia("(max-width: 768px)");
        function handleViewportChange(event) {
          if (!event.matches && !drawer.hasAttribute("hidden")) closeDrawer(false);
        }
        if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", handleViewportChange);
        else if (mobileQuery.addListener) mobileQuery.addListener(handleViewportChange);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
