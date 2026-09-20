/* =========================================================================
   analytics.js — GA4 + Firestore + Mixpanel event coordination.

   Strategy locked 2026-04-21 (agent_docs/analytics-events.md):
   - GA4 owns standard traffic / SEO (sessions, pageviews, referrers).
   - Firestore `consumerAnalyticsEvents` owns MWAH-specific BI (per-ZIP
     searches, store taps, product external clicks). Server schema is
     enforced in functions/consumer-analytics.js — keep this client in
     sync with that allowlist.
   - Mixpanel owns explicit, privacy-minimized customer journey funnels.
     The direct sender lives in mixpanel.js. It receives only allowlisted,
     low-cardinality properties and never receives search values, store IDs,
     URLs, referrers, email addresses, or IP-derived location.

   GA4 and Mixpanel are gated behind the age-gate cookie. The first-party
   Firestore age_gate_enter / age_gate_exit events are consent-exempt so the
   team can measure the mandatory gate itself. No under-21 decline is sent
   to either third-party analytics provider.

   No-PII rule: do NOT pass email, name, full UA, or any free-text user
   input through MW.trackEvent. Server enforces ≤5 keys / ≤64 chars per
   value as a defense in depth, but the client is the first line.
   ========================================================================= */
(function () {
  "use strict";

  var GA4_ID = "G-ZKP3T65H6F";
  var EVENT_ENDPOINT = "https://us-central1-gimmemwah-website.cloudfunctions.net/consumerAnalyticsEvent";

  // Client-side mirror of the server allowlist in functions/consumer-analytics.js.
  // First line of defense; the server still enforces. Keep in sync — adding a
  // new event requires updating BOTH the server allowlist AND this set AND
  // agent_docs/analytics-events.md in the same PR.
  var EVENT_ALLOWLIST = {
    "section_view": 1,
    "cta_click": 1,
    "social_link_click": 1,
    "find_us_search": 1,
    "find_us_geolocation": 1,
    "find_us_search_no_results": 1,
    "find_us_geolocation_failed": 1,
    "find_us_filter_change": 1,
    "find_us_store_tap": 1,
    "find_us_external_click": 1,
    "store_request_open": 1,
    "store_request_already_stocked": 1,
    "store_request_submit": 1,
    "product_view": 1,
    "product_external_click": 1,
    "signup_prompt_view": 1,
    "signup_start": 1,
    "signup_prompt_dismiss": 1,
    "signup_prompt_follow_offer": 1,
    "signup_prompt_offer_dismiss": 1,
    "signup_submit": 1,
    "signup_confirm": 1,
    "signup_discovery_answer": 1,
    "flow_error": 1,
    "age_gate_enter": 1,
    "age_gate_exit": 1,
  };
  var FIRESTORE_EVENT_ALLOWLIST = {
    "find_us_search": 1,
    "find_us_store_tap": 1,
    "find_us_external_click": 1,
    "store_request_open": 1,
    "store_request_already_stocked": 1,
    "store_request_submit": 1,
    "product_view": 1,
    "product_external_click": 1,
    "signup_submit": 1,
    "signup_confirm": 1,
    "age_gate_enter": 1,
    "age_gate_exit": 1,
  };
  var DISCOVERY_SOURCES = {
    "social": 1,
    "search": 1,
    "ai_assistant": 1,
    "retailer": 1,
    "friend": 1,
    "other": 1,
  };

  // ----- Age gate gate ---------------------------------------------------
  function isAgeAcknowledged() {
    return document.cookie.split(";").some(function (c) {
      return c.trim().indexOf("mwah_ageok=1") === 0;
    });
  }

  // ----- GA4 bootstrap ---------------------------------------------------
  // Load GA4 after age gate clears. On the first visit the cookie is set
  // AFTER this script runs, so listen for the age-gate accept event and
  // boot then. Idempotent — only loads once.
  var ga4Loaded = false;
  function loadGA4() {
    if (ga4Loaded) return;
    if (!GA4_ID || GA4_ID === "G-TODO") return;
    ga4Loaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA4_ID, { anonymize_ip: true });
  }

  function loadMixpanel() {
    if (window.MWAHMixpanel && typeof window.MWAHMixpanel.init === "function") {
      window.MWAHMixpanel.init();
    }
  }

  function loadThirdPartyAnalytics() {
    loadGA4();
    loadMixpanel();
  }

  if (isAgeAcknowledged()) {
    loadThirdPartyAnalytics();
  } else {
    document.addEventListener("mwah:age-accepted", loadThirdPartyAnalytics, { once: true });
  }

  // ----- Session ID ------------------------------------------------------
  // UUID v4 minted once per tab session. Stored in sessionStorage so it dies
  // on tab close (matches the age-gate cookie's session scope). Used by the
  // Firestore pipe to bucket events for the per-session rate limit. Not used
  // by GA4 — that has its own client_id.
  //
  // crypto.randomUUID is available in all modern browsers (Chrome 92+,
  // Firefox 95+, Safari 15.4+). Older browsers will hit the fallback which
  // is technically not a v4 but the server only validates shape, not entropy
  // source. If this fallback ever becomes a problem we can drop support.
  function makeUUIDv4() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    // RFC 4122 §4.4 manual v4 generation. Math.random is fine for analytics
    // bucketing — not a security boundary.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getSessionId() {
    try {
      var existing = window.sessionStorage.getItem("mwah_sid");
      if (existing) return existing;
      var fresh = makeUUIDv4();
      window.sessionStorage.setItem("mwah_sid", fresh);
      return fresh;
    } catch (err) {
      // Private mode, sessionStorage disabled, etc. Return a fresh ID per
      // call — server will see them as separate sessions, that's OK.
      return makeUUIDv4();
    }
  }

  // Two events are deliberately exempt from the age-gate consent check:
  // age_gate_enter / age_gate_exit. They ARE the consent moment, so gating
  // them on consent would mean we can never measure the bounce-at-gate rate.
  // They carry no PII (empty payload). On acceptance, age-gate.js first emits
  // mwah:age-accepted, which boots GA4, and then tracks age_gate_enter through
  // both GA4 and Firestore. On decline, GA4 never boots, so age_gate_exit
  // reaches Firestore only. Never add or reconcile the two stores' counts.
  var CONSENT_EXEMPT = {
    "age_gate_enter": 1,
    "age_gate_exit": 1,
  };

  // GA4 reserves acquisition names such as source and medium. Signup forms
  // use source to describe the form surface in the first-party signup record,
  // so rename that field only for GA4. Mixpanel and Firestore continue to
  // receive the canonical payload documented for those systems.
  function ga4EventPayload(eventName, payload) {
    var clean = {};
    Object.keys(payload || {}).forEach(function (key) {
      clean[key] = payload[key];
    });
    var isSignup = eventName.indexOf("signup_") === 0;
    var isSignupError = eventName === "flow_error" && clean.flow === "newsletter_signup";
    if ((isSignup || isSignupError) && clean.source) {
      clean.signup_surface = clean.source;
      delete clean.source;
    }
    return clean;
  }

  // ----- Public API ------------------------------------------------------
  // window.MW.trackEvent(eventName, payload?)
  //   eventName: must be in EVENT_ALLOWLIST.
  //   payload:   optional object, ≤4 string-valued keys, ≤64 chars per value.
  //              Numbers/bools must be stringified at the call site.
  //
  // Silently no-ops if:
  //   - User has not passed the age gate (no consent yet) — UNLESS the
  //     event is in CONSENT_EXEMPT (the two age_gate_* events).
  //   - eventName is not in the allowlist (bug; will surface in console).
  //
  // Fire-and-forget. Never blocks the caller. Best-effort delivery via
  // fetch + keepalive: true with a CORS-safelisted Content-Type so the
  // browser does NOT send a preflight OPTIONS — critical for
  // age_gate_exit, which fires immediately before location.replace()
  // and would lose any preflighted POST to the navigation. The body is
  // a JSON string with Content-Type: text/plain; the Cloud Function
  // explicitly JSON.parses it server-side.
  window.MW = window.MW || {};
  window.MW.trackEvent = function (eventName, payload) {
    if (!isAgeAcknowledged() && !CONSENT_EXEMPT[eventName]) return;
    if (!EVENT_ALLOWLIST[eventName]) {
      // eslint-disable-next-line no-console
      console.warn("MW.trackEvent: unknown event", eventName);
      return;
    }
    if (eventName === "signup_discovery_answer") {
      var discoverySource = String(payload && payload.discovery_source || "");
      if (!DISCOVERY_SOURCES[discoverySource]) return;
      payload = { discovery_source: discoverySource };
    }

    // GA4 event — also gated by GA4 having loaded (gtag exists).
    if (window.gtag) {
      try { window.gtag("event", eventName, ga4EventPayload(eventName, payload)); } catch (e) { /* ignore */ }
    }

    // Mixpanel receives a separately mapped event with a much smaller
    // property set. mixpanel.js never forwards raw search values, store
    // identifiers, email addresses, URLs, or free text.
    if (window.MWAHMixpanel && typeof window.MWAHMixpanel.trackSource === "function") {
      window.MWAHMixpanel.trackSource(eventName, payload || {});
    }

    // Firestore event via Cloud Function. Fire-and-forget.
    if (!EVENT_ENDPOINT || !FIRESTORE_EVENT_ALLOWLIST[eventName]) return;
    var body = JSON.stringify({
      event: eventName,
      sessionId: getSessionId(),
      payload: payload || {},
    });

    // History note: this used sendBeacon(url, Blob<application/json>) —
    // browsers silently dropped the POST after a successful preflight.
    // Switched to fetch+keepalive with text/plain. text/plain is one of
    // three CORS-safelisted Content-Types (application/x-www-form-
    // urlencoded, multipart/form-data, text/plain) per the Fetch spec,
    // which means the browser sends the POST directly with no
    // preflight OPTIONS. That eliminates the race for age_gate_exit
    // (decline → trackEvent → location.replace) where a preflight
    // would never resolve before the navigation cancels in-flight
    // requests. keepalive: true keeps the body alive through unload.
    // Server (functions/consumer-analytics.js) JSON.parses the string
    // body explicitly since req.body for text/plain is the raw string.
    try {
      fetch(EVENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body,
        keepalive: true,
      }).catch(function () { /* analytics drops are fine */ });
    } catch (e) {
      /* ignore — analytics drops are fine */
    }
  };

  // Product pages use an explicit code-defined attribute for the primary
  // Find A Store CTA. This is intentional event tracking, not DOM text or
  // generic click capture.
  function bindProductFindStoreLinks() {
    var links = document.querySelectorAll("[data-product-find-store]");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (event) {
        var productSlug = event.currentTarget.getAttribute("data-product-find-store") || "";
        window.MW.trackEvent("product_external_click", {
          productSlug: productSlug,
          location: event.currentTarget.getAttribute("data-product-find-store-location") || "",
        });
      });
    }
  }

  function bindTaggedActions() {
    // Capture phase. This listener sits on `document`, so in bubble phase
    // any component that called stopPropagation() — or that removed the
    // clicked element from the DOM inside its own handler, which the
    // signup popup does when a dismiss swaps the content column — could
    // silence its own tracking with no error and no missing-event
    // warning. Capture runs before any target handler, so a tagged element
    // is counted regardless of what its component does next.
    //
    // No component currently calls stopPropagation on a tagged element;
    // this is defence against the failure being silent, not a fix for a
    // present bug.
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.closest
        ? event.target.closest("[data-analytics-action], [data-analytics-platform]")
        : null;
      if (!target) return;
      var platform = target.getAttribute("data-analytics-platform");
      if (platform) {
        window.MW.trackEvent("social_link_click", {
          platform: platform,
          location: target.getAttribute("data-analytics-location") || "",
        });
        return;
      }
      window.MW.trackEvent("cta_click", {
        action: target.getAttribute("data-analytics-action") || "",
        location: target.getAttribute("data-analytics-location") || "",
        productSlug: target.getAttribute("data-analytics-product") || "",
      });
    }, true);
  }

  function bindSectionViews() {
    if (typeof window.IntersectionObserver !== "function") return;
    var sections = document.querySelectorAll("[data-analytics-section]");
    if (!sections.length) return;
    var observer = new window.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting || entries[i].intersectionRatio < 0.25) continue;
        var section = entries[i].target.getAttribute("data-analytics-section") || "";
        window.MW.trackEvent("section_view", { section: section });
        observer.unobserve(entries[i].target);
      }
    }, { threshold: [0.25] });
    for (var i = 0; i < sections.length; i++) observer.observe(sections[i]);
  }

  function trackProductPageView() {
    var match = String(window.location.pathname || "").toLowerCase()
      .match(/^\/products\/([a-z0-9-]+)(?:\.html)?\/?$/);
    if (!match) return;
    window.MW.trackEvent("product_view", { productSlug: match[1] });
  }

  function bindCoverageEvents() {
    bindProductFindStoreLinks();
    bindTaggedActions();
    if (isAgeAcknowledged()) {
      bindSectionViews();
      trackProductPageView();
    } else {
      document.addEventListener("mwah:age-accepted", function () {
        bindSectionViews();
        trackProductPageView();
      }, { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCoverageEvents, { once: true });
  } else {
    bindCoverageEvents();
  }
})();
