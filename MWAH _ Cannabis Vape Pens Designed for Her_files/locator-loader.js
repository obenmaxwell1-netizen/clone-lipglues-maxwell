/* =========================================================================
   locator-loader.js — lazy-loads Leaflet + MarkerCluster + MapLibre + locator.js
   when the user is about to hit the #find-us or #store-locator section, or when the page
   was deep-linked with locator parameters, or when the user focuses the search
   input. Keeps the map libraries off the homepage's first-paint critical
   path so the LCP/TBT stay clean for visitors who never scroll past
   the hero.

   Triggers (any one fires the load exactly once):
     1. IntersectionObserver — section within 800px of viewport.
     2. Deep-link: the URL has q, geo, state, or status parameters.
     3. Search input gets focus — user is typing, load now so the
        submit handler exists by the time they hit Enter.
     4. Direct hash jump to #find-us or #store-locator (anchor link from another page) —
        the browser scrolls instantly, which can outrun the IO callback.

   The native filter dropdowns explicitly trigger the bundle on focus and
   preserve a selection made before loading finishes. Pagination no longer
   exists. GPS has its own early click handoff below.

   SRI: every script + stylesheet pulled from unpkg ships with an
   integrity hash + crossorigin="anonymous". Matches the protection the
   deleted /find-us static page had. CSP allows unpkg.com for script-src
   and style-src, so SRI is the only line of defence against a CDN
   compromise serving tainted bytes to the public site.
   ========================================================================= */
(function () {
  "use strict";

  var section = document.getElementById("find-us");
  if (!section) return;

  var loaded = false;

  function loadLocator() {
    if (loaded) return;
    loaded = true;

    var head = document.head;
    // home-locator.css ships eagerly in <head> so the locator surface
    // renders styled before the user scrolls into view (otherwise the
    // tabs/chips/list paint as bare browser defaults). Only the heavy
    // Leaflet, MarkerCluster, and MapLibre CSS lazy-loads here.
    // SRI hashes computed from the actual unpkg payloads via:
    //   curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A
    // If MarkerCluster ever publishes a new patch under the same version,
    // the hashes will mismatch and the load will fail (the right behavior
    // for a regulated public site — fail closed, never silently execute
    // unverified code).
    var cssAssets = [
      {
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
        integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
      },
      {
        href: "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
        integrity: "sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV",
      },
      {
        href: "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
        integrity: "sha384-wgw+aLYNQ7dlhK47ZPK7FRACiq7ROZwgFNg0m04avm4CaXS+Z9Y7nMu8yNjBKYC+",
      },
      {
        href: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css",
        integrity: "sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK",
      },
    ];
    cssAssets.forEach(function (asset) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = asset.href;
      link.crossOrigin = "anonymous";
      if (asset.integrity) link.integrity = asset.integrity;
      head.appendChild(link);
    });

    // The store list is the primary utility, so load its same-origin code
    // independently from the optional map renderer. A blocked CDN or missing
    // WebGL must not leave the retailer list stuck on "Loading."
    loadLocatorCode();
    loadMapAssets();
  }

  function loadLocatorCode() {
    loadScript({ src: "/assets/js/locator-data.js?v=6" }, function (dataLoaded) {
      if (!dataLoaded) { loaded = false; return; }
      loadScript({ src: "/assets/js/locator-map.js?v=1" }, function () {
        loadScript({ src: "/assets/js/locator.js?v=28" }, function (locatorLoaded) {
          if (!locatorLoaded) { loaded = false; return; }
          if (window.MW && typeof window.MW.initLocator === "function") {
            window.MW.initLocator();
          }
        });
      });
    });
  }

  var mapAssetsLoading = false;
  function loadMapAssets() {
    if (mapAssetsLoading) return;
    mapAssetsLoading = true;
    var allLoaded = true;

    loadScriptIfMissing(function () {
      return window.L && typeof window.L.map === "function";
    }, {
      src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
      integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
    }, function (leafletLoaded) {
      allLoaded = allLoaded && leafletLoaded;
      loadScriptIfMissing(function () {
        return window.L && typeof window.L.markerClusterGroup === "function";
      }, {
        src: "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
        integrity: "sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr",
      }, function (clusterLoaded) {
        allLoaded = allLoaded && clusterLoaded;
        loadScriptIfMissing(function () {
          return !!window.maplibregl;
        }, {
          src: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
          integrity: "sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp",
        }, function (maplibreLoaded) {
          allLoaded = allLoaded && maplibreLoaded;
          loadScriptIfMissing(function () {
            return window.L && typeof window.L.maplibreGL === "function";
          }, {
            src: "https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js",
            integrity: "sha384-tXYNKOHx4T02jMP7YYCtBxPIv1B5gaA5mcVPBzqMp6d7VzWzxJgI2aWF/nJLrQdS",
          }, function (bridgeLoaded) {
            allLoaded = allLoaded && bridgeLoaded;
            mapAssetsLoading = false;
            if (
              allLoaded &&
              window.MW &&
              typeof window.MW.retryLocatorMap === "function"
            ) window.MW.retryLocatorMap();
          });
        });
      });
    });
  }

  function loadScriptIfMissing(isReady, asset, onComplete) {
    if (isReady()) { onComplete(true); return; }
    loadScript(asset, onComplete);
  }

  function loadScript(asset, onComplete) {
    var s = document.createElement("script");
    s.src = asset.src;
    s.async = false;
    s.crossOrigin = "anonymous";
    if (asset.integrity) s.integrity = asset.integrity;
    s.onload = function () { onComplete(true); };
    s.onerror = function () {
      console.error("locator-loader: failed to load", asset.src);
      onComplete(false);
    };
    document.body.appendChild(s);
  }

  window.MW = window.MW || {};
  window.MW.retryLocatorMapAssets = loadMapAssets;

  var triggersArmed = false;
  function armLocatorTriggers() {
    if (triggersArmed) return;
    triggersArmed = true;

    // Trigger 1: scroll proximity. Mobile gets a deliberately tight margin
    // so the map/feed do not become first-load work merely because the page is
    // short. Desktop keeps a little more runway for the two-column locator.
    if ("IntersectionObserver" in window) {
      var mobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { loadLocator(); io.disconnect(); break; }
        }
      }, { rootMargin: mobile ? "120px 0px" : "400px 0px" });
      io.observe(section);
    } else {
      // Legacy browsers cannot observe proximity, so load after age
      // acknowledgement rather than leaving the locator permanently empty.
      loadLocator();
    }

    // Trigger 2: deep-link. Check both ?search and #hash because Firebase
    // Hosting's redirect from /find-us appends the source query AFTER our
    // /#find-us fragment (browser parses it as part of the hash, not the
    // search). See readUrlParams() in locator.js for the same workaround.
    if (
      /[?&](q|geo|state|status)=/.test(window.location.search) ||
      /[?&](q|geo|state|status)=/.test(window.location.hash)
    ) loadLocator();

    checkHash();
    window.addEventListener("hashchange", checkHash);
  }

  // Trigger 3: search input focus (user is about to type a ZIP)
  var searchInput = document.getElementById("locSearchInput");
  if (searchInput) {
    searchInput.addEventListener("focus", loadLocator, { once: true });
  }

  // Trigger 5: explicit Enter keydown on the input + magnifier-button
  // click. Some browsers (older Safari, certain accessibility tools)
  // don't reliably fire "submit" on a <form> when Enter is pressed
  // inside <input type="search">. Catching keydown directly works
  // everywhere. We then both (a) start the locator load, and
  // (b) stash the query so locator.js's init() runs searchQuery on it
  // immediately after attaching its handlers.
  function triggerSearch(query) {
    var trimmed = String(query || "").trim();
    window.__pendingLocatorGeo = false;
    if (trimmed) window.__pendingLocatorQuery = trimmed;
    if (window.MW && typeof window.MW.locatorSearch === "function") {
      // locator.js already loaded — run it directly. Clear the pending
      // flag so init() doesn't double-fire on a subsequent re-init.
      window.MW.locatorSearch(trimmed);
      window.__pendingLocatorQuery = null;
    } else {
      loadLocator();
    }
  }
  if (searchInput) {
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        triggerSearch(searchInput.value);
      }
    });
    // Auto-fire when the user finishes typing a valid US ZIP (5 digits,
    // or 5+4). searchQuery() in locator.js already geocodes the ZIP via
    // Nominatim and re-sorts the list by distance from that point, so
    // the auto-fire double-duties as a "GPS yourself to that ZIP"
    // (Kyle 2026-04-28). Debounced so we don't fire mid-typing if the
    // user is heading toward a 5+4 or just paused. Tracks last-fired
    // value to avoid re-querying when focus blurs and the value is
    // unchanged.
    var lastAutoFired = null;
    var autoFireTimer = null;
    var ZIP_RE = /^\d{5}(-\d{4})?$/;
    searchInput.addEventListener("input", function () {
      var value = String(searchInput.value || "").trim();
      if (autoFireTimer) { clearTimeout(autoFireTimer); autoFireTimer = null; }
      if (!ZIP_RE.test(value)) return;
      if (value === lastAutoFired) return;
      autoFireTimer = setTimeout(function () {
        lastAutoFired = value;
        triggerSearch(value);
      }, 350);
    });
  }
  var searchForm = document.getElementById("locSearchForm");
  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      triggerSearch(searchInput && searchInput.value);
    });
  }
  var submitBtn = document.getElementById("locSearchBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", function (e) {
      e.preventDefault();
      triggerSearch(searchInput && searchInput.value);
    });
  }
  // One owner for the contextual button, before and after lazy loading.
  var gpsBtn = document.getElementById("locGeoBtn");
  var locationIcon = gpsBtn ? gpsBtn.innerHTML : "";
  var searchIcon = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="2"/><path d="M14 14l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var actionHasQuery = null;
  function syncLocatorAction() {
    if (!gpsBtn) return;
    var hasQuery = !!(searchInput && String(searchInput.value || "").trim());
    if (hasQuery === actionHasQuery) return;
    actionHasQuery = hasQuery;
    gpsBtn.setAttribute("aria-label", hasQuery ? "Search stores" : "Use my location");
    gpsBtn.innerHTML = hasQuery ? searchIcon : locationIcon;
  }
  window.MW.syncLocatorAction = syncLocatorAction;
  if (searchInput) {
    searchInput.addEventListener("input", syncLocatorAction);
    searchInput.addEventListener("change", syncLocatorAction);
  }
  syncLocatorAction();
  if (gpsBtn) {
    gpsBtn.addEventListener("click", function () {
      syncLocatorAction();
      if (searchInput && String(searchInput.value || "").trim()) {
        triggerSearch(searchInput.value);
      } else {
        window.__pendingLocatorQuery = null;
        if (typeof window.MW.locatorLocate === "function") {
          window.MW.locatorLocate();
        } else {
          window.__pendingLocatorGeo = true;
          loadLocator();
        }
      }
    });
  }

  function armFilter(selectId, pendingKey, hookName) {
    var select = document.getElementById(selectId);
    if (!select) return;
    select.addEventListener("focus", loadLocator, { once: true });
    select.addEventListener("change", function () {
      if (window.MW && typeof window.MW[hookName] === "function") return;
      window[pendingKey] = select.value;
      loadLocator();
    });
  }
  armFilter("locStateFilter", "__pendingLocatorState", "locatorSetState");
  armFilter("locStatusFilter", "__pendingLocatorFilter", "locatorSetFilter");

  // Trigger 4: hash jump to #find-us or #store-locator. The latter is the
  // exact map/list destination used by product-page FIND A STORE links.
  function checkHash() {
    if (
      window.location.hash === "#find-us" ||
      /^#find-us[?&]/.test(window.location.hash) ||
      window.location.hash === "#store-locator" ||
      /^#store-locator[?&]/.test(window.location.hash)
    ) {
      loadLocator();
    }
  }
  function hasAgeCookie() {
    return document.cookie.split(";").some(function (c) {
      return c.trim().indexOf("mwah_ageok=1") === 0;
    });
  }
  if (hasAgeCookie()) armLocatorTriggers();
  else document.addEventListener("mwah:age-accepted", armLocatorTriggers, { once: true });
})();
