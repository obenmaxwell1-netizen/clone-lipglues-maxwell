/* MWAH Find Us widget. Loaded lazily by locator-loader.js. */
(function () {
  "use strict";

  // --- Configure ---
  var FEED_URL = "https://storelocatorfeed-uo6346avea-uc.a.run.app";
  // Nabis-derived non-WA (CA) stores. Stable cloudfunctions.net alias is
  // already allowed by the CSP connect-src in firebase.json.
  var NABIS_FEED_URL = "https://us-central1-gimmemwah-website.cloudfunctions.net/nabisStoreFeed";

  var DEFAULT_CENTER = [47.4, -121.3];
  var DEFAULT_ZOOM = 7;
  var USER_ZOOM = 11;
  var MOBILE_USER_ZOOM = 10;

  // OpenFreeMap Positron vector style. It preserves the light grayscale
  // visual without CARTO's new API-key requirement.
  var BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
  var BASEMAP_ATTR = '<a href="https://openfreemap.org/">OpenFreeMap</a> '
    + '<a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a> '
    + 'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  // --- State ---
  var map = null;
  var markerCluster = null;
  var markerById = {};
  var stores = [];
  var origin = null;
  var filteredStores = [];
  var sortedStores = [];
  var activeFilter = "all";
  var activeState = "all";
  var nameFilter = "";
  var listFilteredToMap = false;
  var mapListTimer = null;
  var renderedListSignature = null;
  var activeStoreId = null;
  var initialized = false;

  // --- Utilities ---
  function escapeHTML(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeAttr(s) { return escapeHTML(s); }
  function $(sel) { return document.querySelector(sel); }
  function isMobileViewport() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  }
  function trackEvent(name, payload) {
    if (!window.MW || typeof window.MW.trackEvent !== "function") return;
    try { window.MW.trackEvent(name, payload || {}); }
    catch (err) { console.error("[locator] analytics failed", err); }
  }
  var _statusTimer = null;
  function setStatus(msg) {
    var el = $("#locSearchStatus");
    if (!el) return;
    el.textContent = msg || "";
    if (msg) {
      el.classList.add("loc-search__status--visible");
      if (_statusTimer) clearTimeout(_statusTimer);
      _statusTimer = setTimeout(function () { clearStatus(); }, 6000);
    } else {
      el.classList.remove("loc-search__status--visible");
    }
  }
  function clearStatus() {
    var el = $("#locSearchStatus");
    if (!el) return;
    el.textContent = "";
    el.classList.remove("loc-search__status--visible");
    if (_statusTimer) { clearTimeout(_statusTimer); _statusTimer = null; }
  }

  function toRad(d) { return d * Math.PI / 180; }
  function distanceMiles(lat1, lng1, lat2, lng2) {
    var R = 3958.8;
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function daysAgo(iso) {
    if (!iso) return null;
    var p = String(iso).split("-");
    if (p.length !== 3) return null;
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(d.getTime())) return null;
    // Anchor "now" to today's local midnight so the diff is in whole days
    // regardless of time-of-day. Without this, rounding against Date.now()
    // produces off-by-one after noon — a "today" delivery would render as
    // "RESTOCKED YESTERDAY" by the afternoon.
    var n = new Date();
    var today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    return Math.max(0, Math.round((today - d.getTime()) / 86400000));
  }
  // Format a YYYY-MM-DD date string like "MMM DD" (e.g. "APR 24") for
  // the "NEXT · APR 24" pill. Returns "" on bad input so callers can
  // fall back to a generic SOON label.
  function shortDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return "";
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(d.getTime())) return "";
    var months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return months[d.getMonth()] + " " + d.getDate();
  }
  function ensureHttp(url) { return url && !/^https?:\/\//i.test(url) ? "https://" + url : url; }
  function safeHost(url) {
    if (!url) return "";
    try { return new URL(ensureHttp(url)).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  // Build the chip stack for a store card (RESTOCKED + future-delivery).
  // Pure function — no DOM, no closures over module state — so it can be
  // exercised directly by tests/unit/locator-chips.test.js.
  function chipsFor(s) {
    if (!s) return "";
    var badges = [];
    if (s.lastDeliveryDate) {
      var da = daysAgo(s.lastDeliveryDate);
      if (da != null) {
        var lbl = da === 0 ? "RESTOCKED TODAY"
          : da === 1 ? "RESTOCKED YESTERDAY"
          : "RESTOCKED " + da + "D AGO";
        badges.push('<span class="loc-pill">' + escapeHTML(lbl) + "</span>");
      }
    }
    if (s.availabilityStatus === "sold-here" && !s.lastDeliveryDate) {
      badges.push('<span class="loc-pill">SOLD HERE</span>');
    }
    if (s.availabilityStatus === "coming-soon") {
      badges.push('<span class="loc-pill loc-pill--pink">COMING SOON</span>');
    }
    // Upcoming-delivery pill. Prefer the actual date when the feed ships
    // nextDeliveryDate (Figma 293:18 "NEXT · APR 24"). Falls back to a
    // generic "DELIVERY SOON" label when only the boolean flag is present.
    var nextDate = shortDate(s.nextDeliveryDate);
    if (nextDate) {
      badges.push('<span class="loc-pill loc-pill--pink">NEXT &middot; ' + escapeHTML(nextDate) + '</span>');
    } else if (s.hasUpcomingDelivery) {
      badges.push('<span class="loc-pill loc-pill--pink">DELIVERY SOON</span>');
    }
    return badges.join("");
  }

  function telHref(phone) {
    if (!phone) return "";
    var d = String(phone).replace(/[^\d+]/g, "");
    return d ? "tel:" + d : "";
  }

  function directionsUrl(lat, lng) {
    var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    var dest = lat + "," + lng;
    return isIOS
      ? "https://maps.apple.com/?daddr=" + encodeURIComponent(dest) + "&dirflg=d"
      : "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest);
  }

  function isStocked(s) {
    if (s && s.availabilityStatus === "sold-here") return true;
    var d = daysAgo(s.lastDeliveryDate);
    return d != null && d >= 0;
  }
  // SOON = first MWAH drop is pending or scheduled; repeat drops stay STOCKED.
  function isSoon(s) {
    return (!!s.hasPendingOrder) || (!!s.hasUpcomingDelivery && s.lastDeliveryDate == null);
  }

  // --- Map ---
  function initMap() {
    if (!window.MW || typeof window.MW.createLocatorMap !== "function") return false;
    var result = window.MW.createLocatorMap({
      selector: "#locMap",
      elementId: "locMap",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 19,
      style: BASEMAP_STYLE,
      attribution: BASEMAP_ATTR,
      onMoveEnd: queueMapListRefresh,
      onRetry: function () {
        if (window.MW && typeof window.MW.retryLocatorMapAssets === "function") {
          window.MW.retryLocatorMapAssets();
        } else {
          retryLocatorMap();
        }
      },
    });
    if (!result) return false;
    map = result.map;
    markerCluster = result.markerCluster;
    return true;
  }

  function retryLocatorMap() {
    if (map) return true;
    var ready = initMap();
    if (ready && stores.length) refresh();
    return ready;
  }

  function pinIcon(variant) {
    var cls = "loc-pin" + (variant === "soon" ? " loc-pin--soon" : variant === "active" ? " loc-pin--active" : "");
    var size = variant === "active" ? 36 : 28;
    return L.divIcon({
      className: cls,
      html: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  }

  function popupHTML(s) {
    var addr = [s.address, s.city].filter(Boolean).join(", ");
    var pieces = [];
    pieces.push('<span class="loc-popup__name">' + escapeHTML(s.name) + "</span>");
    if (addr) pieces.push('<span class="loc-popup__addr">' + escapeHTML(addr) + "</span>");
    if (s.lastDeliveryDate) {
      var da = daysAgo(s.lastDeliveryDate);
      if (da != null) pieces.push('<span class="loc-popup__addr">' + (da === 0 ? "Restocked today" : "Restocked " + da + " day" + (da === 1 ? "" : "s") + " ago") + "</span>");
    }
    var tel = telHref(s.phone);
    if (tel) {
      pieces.push('<a class="loc-popup__link" href="' + escapeAttr(tel) + '" data-locator-target="phone" data-store-id="' + escapeAttr(s.id) + '">' + escapeHTML(s.phone) + "</a>");
    }
    var host = safeHost(s.website);
    if (host) {
      pieces.push('<a class="loc-popup__link" href="' + escapeAttr(ensureHttp(s.website)) + '" target="_blank" rel="noopener noreferrer" data-locator-target="website" data-store-id="' + escapeAttr(s.id) + '">' + escapeHTML(host) + " ↗</a>");
    }
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      pieces.push('<a class="loc-popup__link loc-popup__link--cta" href="' + escapeAttr(directionsUrl(s.lat, s.lng)) + '" target="_blank" rel="noopener noreferrer" data-locator-target="directions" data-store-id="' + escapeAttr(s.id) + '">Get directions →</a>');
    }
    return pieces.join("<br>");
  }

  function renderMarkers(list) {
    if (!markerCluster) return;
    markerCluster.clearLayers();
    markerById = {};
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
      var variant = isStocked(s) ? "stocked" : (isSoon(s) ? "soon" : "default");
      var m = L.marker([s.lat, s.lng], { icon: pinIcon(variant), title: s.name });
      // Keep long addresses and contact links from collapsing into the
      // narrow default popup width on small map viewports.
      m.bindPopup(popupHTML(s), { minWidth: 210, maxWidth: 240 });
      (function (id) {
        m.on("click", function () {
          activeStoreId = id;
          highlightCard(id);
          trackEvent("find_us_store_tap", { storeId: String(id).slice(0, 64) });
        });
      })(s.id);
      markerCluster.addLayer(m);
      markerById[s.id] = m;
    }
  }

  // --- List ---
  function cardHTML(s, isActive) {
    var isSoonFlag = isSoon(s);
    var pinCls = "loc-row__pin" + (isSoonFlag ? " loc-row__pin--soon" : "");

    var distanceText = "";
    if (typeof s._distance === "number") {
      distanceText = s._distance < 0.1 ? "< 0.1 MI" : s._distance.toFixed(1) + " MI";
    }

    var addr = [s.address, s.city].filter(Boolean).join(", ");
    var phone = s.phone || "";
    var hostLine = safeHost(s.website);
    var metaParts = [addr, phone].filter(Boolean);
    if (hostLine) metaParts.push(hostLine);
    var meta = metaParts.join(" · ");

    var badgesHtml = chipsFor(s);

    var actions = "";
    if (isActive) {
      var acts = [];
      if (typeof s.lat === "number" && typeof s.lng === "number") {
        acts.push('<button type="button" class="loc-link loc-link--map" data-id="' + escapeAttr(s.id) + '">VIEW ON MAP</button>');
        acts.push('<a class="loc-link loc-link--primary" href="' + escapeAttr(directionsUrl(s.lat, s.lng)) + '" target="_blank" rel="noopener noreferrer" data-locator-target="directions">DIRECTIONS →</a>');
      }
      var tel = telHref(phone);
      if (tel) acts.push('<a class="loc-link" href="' + escapeAttr(tel) + '" data-locator-target="phone">CALL</a>');
      if (s.website) {
        acts.push('<a class="loc-link" href="' + escapeAttr(ensureHttp(s.website)) + '" target="_blank" rel="noopener noreferrer" data-locator-target="website">WEBSITE</a>');
      }
      if (acts.length) actions = '<div class="loc-row__actions">' + acts.join("") + "</div>";
    }

    var inner =
      '<div class="loc-row__top">' +
        '<div class="loc-row__left">' +
          '<span class="' + pinCls + '"></span>' +
          '<h3 class="loc-row__name">' + escapeHTML(s.name) + "</h3>" +
        "</div>" +
        (distanceText ? '<span class="loc-row__dist">' + escapeHTML(distanceText) + "</span>" : "") +
      "</div>" +
      (meta ? '<p class="loc-row__addr">' + escapeHTML(meta) + "</p>" : "") +
      (badgesHtml ? '<div class="loc-row__badges">' + badgesHtml + "</div>" : "");

    var ariaLabel = "Show details for " + s.name;
    var select = '<button type="button" class="loc-row__select" data-id="' + escapeAttr(s.id) + '" aria-expanded="' + (isActive ? "true" : "false") + '" aria-label="' + escapeAttr(ariaLabel) + '">' + inner + "</button>";
    if (isActive) {
      return '<article class="loc-row loc-row--active" data-id="' + escapeAttr(s.id) + '"><div class="loc-row__card">' + select + actions + "</div></article>";
    }
    return '<article class="loc-row" data-id="' + escapeAttr(s.id) + '">' + select + "</article>";
  }

  function listSignature(list) {
    var ids = [];
    for (var i = 0; i < list.length; i++) ids.push(list[i].id);
    return ids.join("|");
  }

  function updateListCount(list) {
    var countEl = $("#locListCount");
    if (!countEl) return;
    var isMobileCount = isMobileViewport();
    countEl.textContent = listFilteredToMap
      ? (isMobileCount ? list.length + " in view" : list.length + " stores in view")
      : isMobileCount
      ? (origin ? list.length + " nearest" : list.length + " stores")
      : list.length + " stores near you";
  }

  function renderList(list, force) {
    var container = $("#locList");
    if (!container) return;
    updateListCount(list);
    var signature = listSignature(list);
    if (!force && signature === renderedListSignature) return;
    renderedListSignature = signature;
    if (!list.length) {
      var msg = filteredStores.length && listFilteredToMap
        ? "No stores in this map view. Pan or zoom out."
        : "No stores match. Try a different ZIP or city.";
      container.innerHTML = '<div class="loc-empty">' + escapeHTML(msg) + '</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < list.length; i++) {
      var isActive = activeStoreId
        ? list[i].id === activeStoreId
        : i === 0 && !!origin;
      html += cardHTML(list[i], isActive);
    }
    container.innerHTML = html;
    container.scrollTop = 0;

    var cards = container.querySelectorAll(".loc-row__select");
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener("click", onCardClick);
    }
    var mapButtons = container.querySelectorAll(".loc-link--map");
    for (var k = 0; k < mapButtons.length; k++) {
      mapButtons[k].addEventListener("click", onViewMapClick);
    }
    var links = container.querySelectorAll("a.loc-link");
    for (var m = 0; m < links.length; m++) {
      links[m].addEventListener("click", onStoreLinkClick);
    }
  }

  function onCardClick(e) {
    var card = e.currentTarget;
    var id = card.getAttribute("data-id");
    if (!id) return;

    var marker = markerById[id];
    var isMobile = isMobileViewport();
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (marker && map && !isMobile) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13), { animate: !reduceMotion });
      marker.openPopup();
    }
    activeStoreId = id;
    highlightCard(id, true);
    trackEvent("find_us_store_tap", { storeId: String(id).slice(0, 64) });
  }

  function onViewMapClick(e) {
    var id = e.currentTarget.getAttribute("data-id");
    var marker = id ? markerById[id] : null;
    if (!id || !marker || !map) return;
    activeStoreId = id;
    map.invalidateSize();
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: false });
    var mapEl = $("#locMap");
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (mapEl && mapEl.scrollIntoView) {
      mapEl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
    if (mapEl && mapEl.focus) mapEl.focus({ preventScroll: true });
    var popup = marker.getPopup ? marker.getPopup() : null;
    if (popup && popup.setLatLng && popup.openOn) {
      popup.setLatLng(marker.getLatLng()).openOn(map);
    } else {
      marker.openPopup();
    }
  }

  function onStoreLinkClick(e) {
    var anchor = e.currentTarget;
    var row = anchor.closest(".loc-row");
    var id = row
      ? row.getAttribute("data-id")
      : anchor.getAttribute("data-store-id") || "";
    var target = anchor.getAttribute("data-locator-target") || "";
    if (id && target) {
      trackEvent("find_us_external_click", { storeId: String(id).slice(0, 64), target: target });
    }
  }

  function highlightCard(id, restoreFocus) {
    renderList(sortedStores, true);
    var target = document.querySelector('.loc-row[data-id="' + CSS.escape(id) + '"]');
    if (target) {
      var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
      if (restoreFocus) {
        var select = target.querySelector(".loc-row__select");
        if (select) select.focus({ preventScroll: true });
      }
    }
  }

  // --- Filter / sort ---
  function filterStores(list) {
    var out = list;
    if (activeState !== "all") {
      out = out.filter(function (s) {
        return window.MW.matchesStoreMarket(s, activeState);
      });
    }
    if (activeFilter === "stocked") out = out.filter(isStocked);
    else if (activeFilter === "soon") out = out.filter(isSoon);
    // Pure ZIP input means "near here"; geocoder + distance sort handles it.
    if (nameFilter && !/^\d+$/.test(nameFilter)) {
      var q = nameFilter;
      out = out.filter(function (s) {
        return window.MW.matchesStoreSearch(s, q);
      });
    }
    return out;
  }

  function computeSorted() {
    var list = stores.slice();
    if (origin) {
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        s._distance = (typeof s.lat === "number" && typeof s.lng === "number")
          ? distanceMiles(origin.lat, origin.lng, s.lat, s.lng)
          : Infinity;
      }
      list.sort(function (a, b) { return (a._distance || 0) - (b._distance || 0); });
    } else {
      for (var k = 0; k < list.length; k++) delete list[k]._distance;
    }
    filteredStores = filterStores(list);
    return filteredStores;
  }

  function refresh() {
    var list = computeSorted();
    renderMarkers(list);
    fitMap(list);
    renderViewportList();
  }

  function fitMap(list) {
    if (!map) return;
    if (origin) {
      map.setView([origin.lat, origin.lng], isMobileViewport() ? MOBILE_USER_ZOOM : USER_ZOOM, { animate: false });
      return;
    }
    var bounds = L.latLngBounds([]);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (typeof s.lat === "number" && typeof s.lng === "number") bounds.extend([s.lat, s.lng]);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10, animate: false });
    else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  function storesInBounds(list, bounds) {
    if (!bounds || !list || !list.length) return list || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
      if (bounds.contains([s.lat, s.lng])) out.push(s);
    }
    return out;
  }

  function storesInMapView(list) {
    if (!map || !map.getBounds) return list;
    return storesInBounds(list, map.getBounds());
  }

  function renderViewportList() {
    var list = storesInMapView(filteredStores);
    listFilteredToMap = list.length !== filteredStores.length;
    sortedStores = list;
    renderList(sortedStores);
  }

  function queueMapListRefresh() {
    if (!filteredStores.length) return;
    if (mapListTimer) clearTimeout(mapListTimer);
    mapListTimer = setTimeout(function () {
      renderViewportList();
    }, 80);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Your browser doesn't support location. Try entering a ZIP.");
      trackEvent("find_us_geolocation_failed", { reason: "unavailable" });
      return;
    }
    var btn = $("#locGeoBtn");
    if (btn) btn.disabled = true;
    clearStatus();
    navigator.geolocation.getCurrentPosition(function (pos) {
      updateStateControls(window.MW.resolveLocatorMarket(activeState, ""));
      nameFilter = "";
      var input = $("#locSearchInput");
      if (input) input.value = "";
      if (window.MW.syncLocatorAction) window.MW.syncLocatorAction();
      origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Your location" };
      if (btn) btn.disabled = false;
      trackEvent("find_us_geolocation");
      refresh();
      scrollToFindUs();
    }, function (err) {
      if (btn) btn.disabled = false;
      setStatus("Couldn't get your location. Try a ZIP code.");
      var reason = err && err.code === 1 ? "permission_denied"
        : err && err.code === 3 ? "timeout" : "unavailable";
      trackEvent("find_us_geolocation_failed", { reason: reason });
      console.warn("geo error", err);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 });
  }

  // Bring the map+list into view after a successful search/GPS.
  function scrollToFindUs() {
    var body = document.querySelector(".op-find-body");
    if (body && body.scrollIntoView) {
      var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      body.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  var LICENSED_MARKET_VIEWBOX = "-124.8,49.0,-114.1,32.4";

  function searchQuery(q) {
    q = String(q || "").trim();
    if (!q) return;
    clearStatus();
    // Track the search. ZIP if 5 digits, else city. Lowercase + capped
    // at 32 chars to satisfy the server payload schema. One event per
    // submit, NOT per keystroke.
    var isZip = /^\d{5}$/.test(q);
    var qNorm = q.toLowerCase().slice(0, 32);
    trackEvent("find_us_search", isZip ? { zip: qNorm } : { city: qNorm });
    var url = "https://nominatim.openstreetmap.org/search"
      + "?countrycodes=us"
      + "&viewbox=" + LICENSED_MARKET_VIEWBOX
      + "&bounded=1"
      + "&format=json"
      + "&limit=1"
      + "&q=" + encodeURIComponent(q);
    fetch(url, {
      headers: { Accept: "application/json" },
      referrerPolicy: "no-referrer",
    })
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr) || !arr.length) {
          trackEvent("find_us_search_no_results", { searchType: isZip ? "zip" : "text" });
          setStatus("Couldn't find \"" + q + "\". Try another ZIP or city.");
          return;
        }
        var hit = arr[0];
        var lat = parseFloat(hit.lat);
        var lng = parseFloat(hit.lon);
        if (isNaN(lat) || isNaN(lng)) return;
        updateStateControls(window.MW.resolveLocatorMarket(activeState, ""));
        origin = { lat: lat, lng: lng, label: hit.display_name || q };
        refresh();
        scrollToFindUs();
      })
      .catch(function (err) {
        console.warn("search error", err);
        trackEvent("flow_error", { flow: "locator", reason: "network" });
        setStatus("Search failed. Try again.");
      });
  }

  // --- Native filter dropdowns ---
  function updateStateControls(state) {
    activeState = window.MW.resolveLocatorMarket("all", state);
    var stateSelect = $("#locStateFilter");
    if (stateSelect) stateSelect.value = activeState;
  }

  function setState(state) {
    updateStateControls(state);
    origin = null;
    activeStoreId = null;
    nameFilter = "";
    var input = $("#locSearchInput");
    if (input) input.value = "";
    if (window.MW.syncLocatorAction) window.MW.syncLocatorAction();
    setStatus(activeState === "all" ? "Showing all stores." : "Showing " + activeState + " stores.");
    trackEvent("find_us_filter_change", { group: "market", value: String(activeState).toLowerCase() });
    refresh();
  }

  function setFilter(filter) {
    activeFilter = filter === "stocked" || filter === "soon" ? filter : "all";
    var statusSelect = $("#locStatusFilter");
    if (statusSelect) statusSelect.value = activeFilter;
    trackEvent("find_us_filter_change", { group: "availability", value: activeFilter });
    refresh();
  }

  // --- Data load ---
  // Merge WA + Nabis feeds; one source failing never blanks the other.
  function fetchFeed(feedUrl) {
    return fetch(feedUrl, { method: "GET", headers: { Accept: "application/json" }, referrerPolicy: "no-referrer" })
      .then(function (r) { if (!r.ok) throw new Error("Feed " + r.status); return r.json(); });
  }
  function loadFeed() {
    var list = $("#locList");
    Promise.allSettled([fetchFeed(FEED_URL), window.MW.californiaAvailabilityEnabled === true ? fetchFeed(NABIS_FEED_URL) : Promise.resolve(null)]).then(function (results) {
      if (results[0].status === "rejected") console.error("WA feed load failed", results[0].reason);
      if (results[1].status === "rejected") console.error("Nabis feed load failed", results[1].reason);
      if (results[0].status === "rejected" || results[1].status === "rejected") {
        var feedReason = results[0].status === "rejected" && results[1].status === "rejected"
          ? "unavailable" : "partial_feed";
        trackEvent("flow_error", { flow: "locator", reason: feedReason });
      }
      var waJson = results[0].status === "fulfilled" ? results[0].value : null;
      var nabisJson = results[1].status === "fulfilled" ? results[1].value : null;
      stores = window.MW.mergeStoreFeeds(waJson, nabisJson);
      var subEl = document.querySelector(".op-find-header__sub");
      if (subEl && stores.length) {
        var isMobileSub = isMobileViewport();
        subEl.textContent = isMobileSub
          ? stores.length + " dispensaries. Search your city or explore the map."
          : "The nearest store is almost always closer than you think. Find MWAH at " + stores.length + " dispensaries near you — restocked weekly.";
      }
      if (!stores.length) {
        if (list) list.innerHTML = '<div class="loc-empty">No stores available right now. Check back soon.</div>';
        var countEl = $("#locListCount");
        if (countEl) countEl.textContent = "0 stores";
        return;
      }
      refresh();
    })
    .catch(function (err) {
      console.error("locator load failed", err);
      if (list) list.innerHTML = '<div class="loc-empty">Couldn\'t load the store list. Please try again in a moment.</div>';
    });
  }

  function readUrlParams() {
    return window.MW.parseLocatorParams(window.location.search, window.location.hash);
  }

  // --- Public init (called by locator-loader.js after deps load) ---
  function init() {
    if (initialized) return;
    initialized = true;

    initMap();
    var mapEl = $("#locMap");
    if (mapEl) {
      mapEl.addEventListener("click", function (event) {
        var anchor = event.target && event.target.closest
          ? event.target.closest("a.loc-popup__link[data-locator-target]")
          : null;
        if (anchor) onStoreLinkClick({ currentTarget: anchor });
      });
    }

    var form = $("#locSearchForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = $("#locSearchInput");
        if (input) searchQuery(input.value);
      });
    }
    // Live name filter is local; geocoding stays submit-only for Nominatim.
    var searchInput = $("#locSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        clearStatus();
        nameFilter = String(searchInput.value || "").trim().toLowerCase();
        refresh();
      });
    }

    var handoff = readUrlParams();
    var stateSelect = $("#locStateFilter");
    if (stateSelect) {
      if (window.MW.californiaAvailabilityEnabled === true) stateSelect.add(new Option("CA", "CA"));
      stateSelect.addEventListener("change", function () {
        setState(stateSelect.value);
      });
    }
    var statusSelect = $("#locStatusFilter");
    if (statusSelect) {
      statusSelect.addEventListener("change", function () {
        setFilter(statusSelect.value);
      });
    }
    if (window.__pendingLocatorState) {
      setState(window.__pendingLocatorState);
      window.__pendingLocatorState = null;
    } else if (handoff.state) {
      updateStateControls(handoff.state);
    } else {
      updateStateControls(activeState);
    }
    if (window.__pendingLocatorFilter) {
      setFilter(window.__pendingLocatorFilter);
      window.__pendingLocatorFilter = null;
    } else if (handoff.status) {
      activeFilter = handoff.status === "stocked" || handoff.status === "soon" ? handoff.status : "all";
      if (statusSelect) statusSelect.value = activeFilter;
    } else if (statusSelect) {
      statusSelect.value = activeFilter;
    }

    if (window.__pendingLocatorQuery || window.__pendingLocatorGeo) { handoff.q = ""; handoff.geo = false; }
    if (handoff.q) {
      if (searchInput) searchInput.value = handoff.q;
      searchQuery(handoff.q);
    } else if (handoff.geo || window.__pendingLocatorGeo) {
      window.__pendingLocatorGeo = false;
      useMyLocation();
    } else if (window.__pendingLocatorQuery) {
      searchQuery(window.__pendingLocatorQuery);
      window.__pendingLocatorQuery = null;
    } else if (searchInput && String(searchInput.value || "").trim()) {
      // Fallback path — input has a value but no explicit pending flag
      // (e.g. browser autofilled the field, or the form-submit trigger
      // ran without setting __pendingLocatorQuery). Replay anyway.
      searchQuery(searchInput.value);
    }

    if (window.MW.syncLocatorAction) window.MW.syncLocatorAction();
    window.addEventListener("resize", function () {
      if (map) {
        map.invalidateSize();
        queueMapListRefresh();
      }
    });

    loadFeed();
  }

  window.MW = window.MW || {};
  window.MW.initLocator = init;
  window.MW.locatorLocate = useMyLocation;
  window.MW.locatorSearch = function (q) { searchQuery(q); };
  window.MW.locatorSetState = function (state) { setState(state); };
  window.MW.locatorSetFilter = function (filter) { setFilter(filter); };
  window.MW.locatorChipsFor = chipsFor;
  window.MW.locatorIsStocked = isStocked;
  window.MW.locatorStoresInBounds = storesInBounds;
  window.MW.retryLocatorMap = retryLocatorMap;
})();
