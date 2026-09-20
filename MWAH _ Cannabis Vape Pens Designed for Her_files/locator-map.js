/* Map renderer and degraded-state UI for the homepage store locator. */
(function () {
  "use strict";

  function renderUnavailable(options) {
    var mapEl = document.querySelector(options.selector);
    if (!mapEl) return;
    if (mapEl.classList) mapEl.classList.remove("leaflet-container");
    mapEl.setAttribute("role", "group");
    mapEl.setAttribute("aria-label", "Store map unavailable");

    var loading = mapEl.querySelector(".loc-map__loading");
    if (!loading) {
      loading = document.createElement("div");
      loading.className = "loc-map__loading";
      loading.setAttribute("role", "status");
      mapEl.appendChild(loading);
    }
    loading.textContent = "";
    var message = document.createElement("span");
    message.textContent = "Map unavailable. Browse stores in the list.";
    loading.appendChild(message);
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "loc-link loc-link--primary";
    retry.textContent = "Retry map";
    retry.addEventListener("click", function () {
      retry.disabled = true;
      retry.textContent = "Retrying";
      options.onRetry();
    });
    loading.appendChild(retry);
  }

  function createLocatorMap(options) {
    var leaflet = window.L;
    if (
      !leaflet ||
      typeof leaflet.map !== "function" ||
      typeof leaflet.markerClusterGroup !== "function" ||
      typeof leaflet.maplibreGL !== "function"
    ) {
      renderUnavailable(options);
      return null;
    }

    var map = null;
    try {
      map = leaflet.map(options.elementId, {
        center: options.center,
        zoom: options.zoom,
        maxZoom: options.maxZoom,
        scrollWheelZoom: true,
        zoomControl: false,
      });
      leaflet.control.zoom({ position: "bottomright" }).addTo(map);
      leaflet.maplibreGL({
        style: options.style,
        attributionControl: { customAttribution: options.attribution },
      }).addTo(map);
      var markerCluster = leaflet.markerClusterGroup({
        maxClusterRadius: 48,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
      });
      map.addLayer(markerCluster);
      map.on("moveend zoomend", options.onMoveEnd);
      var mapEl = document.querySelector(options.selector);
      if (mapEl) {
        mapEl.setAttribute("role", "application");
        mapEl.setAttribute("aria-label", "Map of stores");
        mapEl.setAttribute("aria-describedby", "locMapInstructions");
      }
      return { map: map, markerCluster: markerCluster };
    } catch (err) {
      console.error("[locator] map renderer unavailable", err);
      if (map && typeof map.remove === "function") {
        try { map.remove(); }
        catch (removeErr) { console.error("[locator] map cleanup failed", removeErr); }
      }
      renderUnavailable(options);
      return null;
    }
  }

  window.MW = window.MW || {};
  window.MW.createLocatorMap = createLocatorMap;
})();
