/* Pure public-feed normalization for the Find Us locator. */
(function () {
  "use strict";

  function feedStores(json) {
    if (json && Array.isArray(json.stores)) return json.stores;
    if (Array.isArray(json)) return json;
    return [];
  }

  function publicStoreKey(store, prefix, fallbackIndex) {
    if (store && store.id) return String(store.id);
    var seed = [store && store.name, store && store.address, store && store.city,
      store && store.zip, store && store.lat, store && store.lng].join("|");
    var hash = 5381;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    }
    return prefix + "-" + (seed === "|||||" ? fallbackIndex : (hash >>> 0).toString(36));
  }

  function withClientKeys(list, prefix, market) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push(Object.assign({}, list[i], {
        id: publicStoreKey(list[i], prefix, i),
        _market: market,
      }));
    }
    return out;
  }

  function mergeStoreFeeds(waJson, nabisJson) {
    if (window.MW.californiaAvailabilityEnabled !== true) nabisJson = null;
    return withClientKeys(feedStores(waJson), "wa", "WA")
      .concat(withClientKeys(feedStores(nabisJson), "ca", "CA"));
  }

  function matchesStoreSearch(store, query) {
    var q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return true;
    var hay = [store && store.name, store && store.city, store && store.address, store && store.zip]
      .join(" ").toLowerCase().replace(/\s+/g, " ");
    return hay.indexOf(q) !== -1;
  }

  function matchesStoreMarket(store, market) {
    var normalized = String(market || "all").trim().toUpperCase();
    return normalized === "ALL" || (!!store && store._market === normalized);
  }

  function resolveLocatorMarket(currentMarket, requestedMarket) {
    var requested = String(requestedMarket || "").trim().toUpperCase();
    var current = String(currentMarket || "").trim().toUpperCase();
    if (window.MW.californiaAvailabilityEnabled !== true) {
      if (requested === "CA") requested = "";
      if (current === "CA") current = "";
    }
    if (requested === "WA" || requested === "CA") return requested;
    if (current === "WA" || current === "CA") return current;
    return "all";
  }

  function readParams(value) {
    var raw = String(value || "");
    var queryIndex = raw.indexOf("?");
    if (queryIndex !== -1) raw = raw.substring(queryIndex + 1);
    else if (raw.charAt(0) === "?") raw = raw.substring(1);
    else if (raw.charAt(0) === "#") return new URLSearchParams();
    return new URLSearchParams(raw);
  }

  function parseLocatorParams(search, hash) {
    var out = { q: "", geo: false, state: "", status: "" };
    try {
      var query = readParams(search);
      var hashQuery = readParams(hash);
      var q = query.has("q") ? query.get("q") : hashQuery.get("q");
      var geo = query.has("geo") ? query.get("geo") : hashQuery.get("geo");
      var state = query.has("state") ? query.get("state") : hashQuery.get("state");
      var status = query.has("status") ? query.get("status") : hashQuery.get("status");

      out.q = String(q || "").trim();
      out.geo = geo === "1";
      state = String(state || "").trim().toUpperCase();
      status = String(status || "").trim().toLowerCase();
      out.state = state === "WA" || (state === "CA" && window.MW.californiaAvailabilityEnabled === true) ? state : "";
      out.status = status === "stocked" || status === "soon" || status === "all" ? status : "";
    } catch (err) {
      console.error("locator parameters could not be read", err);
    }
    return out;
  }

  window.MW = window.MW || {};
  window.MW.mergeStoreFeeds = mergeStoreFeeds;
  window.MW.matchesStoreSearch = matchesStoreSearch;
  window.MW.matchesStoreMarket = matchesStoreMarket;
  window.MW.parseLocatorParams = parseLocatorParams;
  window.MW.resolveLocatorMarket = resolveLocatorMarket;
})();
