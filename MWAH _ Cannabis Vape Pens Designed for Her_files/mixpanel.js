/* =========================================================================
   mixpanel.js - Privacy-minimized Mixpanel sender for gimmeemwah.com.

   This is intentionally a small direct sender rather than the Mixpanel
   browser SDK. It has no autocapture, session replay, heatmaps, identify(),
   user profiles, automatic page URLs, referrers, UTM values, or IP-based
   geolocation. It accepts only the explicit events and low-cardinality
   properties documented in agent_docs/analytics-events.md.

   Browser project tokens are public identifiers, not secrets. Never put a
   Mixpanel service-account secret or any Firebase credential in this file.
   ========================================================================= */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createConsumerMixpanel: factory };
  }
  if (root) root.MWAHMixpanel = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function createConsumerMixpanel(root, configOverride) {
  "use strict";

  var INGEST_URL = "https://api-js.mixpanel.com/track?verbose=1&ip=0";
  var SESSION_ID_KEY = "mwah_mixpanel_session_id";
  var SESSION_STARTED_KEY = "mwah_mixpanel_session_started";
  var DEFAULT_CONFIG = {
    enabled: true,
    productionHost: "gimmeemwah.com",
    productionToken: "4f4c26bbe771809ab092cb26dddaf1d6",
    qaToken: "128fe91ec644461e714adc29b2e96573",
    qaHosts: [
      "gimmemwah-website.web.app",
      "gimmemwah-website.firebaseapp.com",
    ],
  };
  var SITE_EVENTS = {
    "site_session_started": 1,
    "site_page_viewed": 1,
    "site_age_gate_accepted": 1,
    "site_section_viewed": 1,
    "site_cta_clicked": 1,
    "site_social_link_clicked": 1,
    "site_store_search_submitted": 1,
    "site_store_search_no_results": 1,
    "site_store_geolocation_failed": 1,
    "site_store_filter_changed": 1,
    "site_store_selected": 1,
    "site_retailer_contact_clicked": 1,
    "site_store_request_started": 1,
    "site_store_request_existing_store": 1,
    "site_store_request_submitted": 1,
    "site_product_viewed": 1,
    "site_find_store_from_product_clicked": 1,
    "site_signup_prompt_viewed": 1,
    "site_signup_started": 1,
    "site_signup_prompt_dismissed": 1,
    "site_signup_follow_offer_viewed": 1,
    "site_signup_follow_offer_dismissed": 1,
    "site_signup_completed": 1,
    "site_signup_confirmed": 1,
    "site_signup_discovery_answered": 1,
    "site_flow_error": 1,
  };
  var SOURCE_EVENT_MAP = {
    "age_gate_enter": "site_age_gate_accepted",
    "section_view": "site_section_viewed",
    "cta_click": "site_cta_clicked",
    "social_link_click": "site_social_link_clicked",
    "find_us_search": "site_store_search_submitted",
    "find_us_geolocation": "site_store_search_submitted",
    "find_us_search_no_results": "site_store_search_no_results",
    "find_us_geolocation_failed": "site_store_geolocation_failed",
    "find_us_filter_change": "site_store_filter_changed",
    "find_us_store_tap": "site_store_selected",
    "find_us_external_click": "site_retailer_contact_clicked",
    "store_request_open": "site_store_request_started",
    "store_request_already_stocked": "site_store_request_existing_store",
    "store_request_submit": "site_store_request_submitted",
    "product_view": "site_product_viewed",
    "product_external_click": "site_find_store_from_product_clicked",
    "signup_prompt_view": "site_signup_prompt_viewed",
    "signup_start": "site_signup_started",
    "signup_prompt_dismiss": "site_signup_prompt_dismissed",
    "signup_prompt_follow_offer": "site_signup_follow_offer_viewed",
    "signup_prompt_offer_dismiss": "site_signup_follow_offer_dismissed",
    "signup_submit": "site_signup_completed",
    "signup_confirm": "site_signup_confirmed",
    "signup_discovery_answer": "site_signup_discovery_answered",
    "flow_error": "site_flow_error",
  };
  var PAGE_TYPES = {
    "home": 1,
    "about": 1,
    "products_catalog": 1,
    "product_detail": 1,
    "washington_hub": 1,
    "california_hub": 1,
    "privacy": 1,
    "terms": 1,
    "signup_confirmation": 1,
    "follow": 1,
    "not_found": 1,
    "other": 1,
  };
  var PRODUCT_SLUGS = {
    "strawberry-matcha": 1,
    "watermelon-wifey": 1,
    "berry-baddie": 1,
    "glow-up-grape": 1,
    "its-giving-guava": 1,
    "mango-mamacita": 1,
    "peach-perfection": 1,
    "she-ate-strawberry": 1,
  };
  var SECTIONS = { "products": 1, "find_us": 1, "newsletter": 1 };
  var CTA_ACTIONS = {
    "view_products": 1,
    "view_product": 1,
    "find_store": 1,
    "view_about": 1,
    "watch_video": 1,
    "follow_complete": 1,
    "event_raffle_entry_received": 1,
  };
  // Every `data-analytics-location` literal the site emits must appear
  // here. safeEnum returns "" for anything missing and eventProperties
  // then drops the key entirely, so an unlisted location does not arrive
  // as a wrong value — it arrives as no value, which is much harder to
  // notice. tests/unit/analytics-locations.test.js enumerates the emitters
  // and fails if one is absent.
  var CTA_LOCATIONS = {
    "hero": 1,
    "navigation": 1,
    "navigation_drawer": 1,
    "footer": 1,
    "signup_popup": 1,
    "signup_popup_dismiss": 1,
    "product_card": 1,
    "products_header": 1,
    "products_catalog": 1,
    "product_hero": 1,
    "product_faq": 1,
    "about": 1,
    "washington_hub": 1,
    "california_hub": 1,
    // Emitted by public/kiss-labs/what-is-a-pennifer.html. Predates this
    // guard and had been silently dropping its location.
    "kiss_labs_pennifer": 1,
    "follow_page": 1, "follow_phacebeauty": 1, "follow_facebyann": 1,
    "follow_publichouseseattle": 1, "follow_gimmemwah_instagram": 1,
    "follow_gimmemwah_tiktok": 1,
    "follow_gimmemwah_x": 1,
  };
  var PLATFORMS = { "instagram": 1, "x": 1, "tiktok": 1 };
  // How much of the follow row the visitor actually took up before
  // closing. Buckets, not a count, so adding a fourth account does not
  // start emitting a value this allowlist drops.
  var FOLLOW_OUTCOMES = { "none": 1, "partial": 1, "all": 1 };
  var TARGETS = { "website": 1, "phone": 1, "directions": 1 };
  var SEARCH_TYPES = { "zip": 1, "text": 1, "geolocation": 1 };
  var FILTER_GROUPS = { "market": 1, "availability": 1 };
  var FILTER_VALUES = {
    "all": 1,
    "wa": 1,
    "ca": 1,
    "stocked": 1,
    "soon": 1,
  };
  var SIGNUP_SOURCES = {
    "homepage": 1,
    "footer": 1,
    "product": 1,
    "popup": 1,
    "unknown": 1,
  };
  // Mirrors DISCOVERY_SOURCES in email-signup.js — an answer that isn't
  // listed here is stripped to "" and the event is dropped, so the two
  // lists change together. "social" is the pre-2026-09-18 combined answer,
  // kept so historical values still validate.
  var DISCOVERY_SOURCES = {
    "instagram": 1,
    "tiktok": 1,
    "x": 1,
    "search": 1,
    "ai_assistant": 1,
    "retailer": 1,
    "friend": 1,
    "other": 1,
    "social": 1,
  };
  // A = follow row only, B = follow row + survey. Empty for the homepage
  // signup section, which sits outside the test.
  var SURVEY_VARIANTS = {
    "a": 1,
    "b": 1,
  };
  var FLOWS = {
    "locator": 1,
    "store_request": 1,
    "newsletter_signup": 1,
    "signup_confirmation": 1,
  };
  var ERROR_REASONS = {
    "validation": 1,
    "no_results": 1,
    "permission_denied": 1,
    "unavailable": 1,
    "timeout": 1,
    "rate_limited": 1,
    "security_check": 1,
    "network": 1,
    "invalid": 1,
    "expired": 1,
    "partial_feed": 1,
  };
  var state = {
    initialized: false,
    ready: false,
    disabled: false,
    environment: "",
    token: "",
    sessionStarted: false,
    productViewSent: false,
  };

  function config() {
    return configOverride || (root && root.MWAH_MIXPANEL_CONFIG) || DEFAULT_CONFIG;
  }

  function host() {
    return root && root.location && root.location.hostname
      ? String(root.location.hostname).toLowerCase()
      : "";
  }

  function isLocalHost(value) {
    return value === "localhost" || value === "127.0.0.1" || value === "::1";
  }

  function isQaHost(value, settings) {
    if ((settings.qaHosts || []).indexOf(value) !== -1) return true;
    return /^gimmemwah-website--[a-z0-9-]+\.web\.app$/.test(value);
  }

  function project() {
    var settings = config();
    var currentHost = host();
    if (settings.enabled !== true || isLocalHost(currentHost)) return null;
    if (currentHost === String(settings.productionHost || "gimmeemwah.com").toLowerCase()) {
      return settings.productionToken
        ? { token: settings.productionToken, environment: "production" }
        : null;
    }
    if (isQaHost(currentHost, settings) && settings.qaToken) {
      return { token: settings.qaToken, environment: "qa" };
    }
    return null;
  }

  function safeEnum(value, allowed, fallback) {
    value = String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    return allowed[value] ? value : fallback;
  }

  function pageContext() {
    var path = root && root.location ? String(root.location.pathname || "/").toLowerCase() : "/";
    var declaredPageType = root && root.document && root.document.body
      ? String(root.document.body.getAttribute("data-page-type") || "").toLowerCase()
      : "";
    if (PAGE_TYPES[declaredPageType]) return { page_type: declaredPageType };
    var productMatch = path.match(/^\/products\/([a-z0-9-]+)(?:\.html)?\/?$/);
    if (productMatch) {
      return {
        page_type: "product_detail",
        product_slug: safeEnum(productMatch[1], PRODUCT_SLUGS, ""),
      };
    }
    if (path === "/" || path === "/index.html") return { page_type: "home" };
    if (path === "/products" || path === "/products/" || path === "/products/index.html") {
      return { page_type: "products_catalog" };
    }
    if (path === "/about" || path === "/about.html") return { page_type: "about" };
    if (path === "/washington" || path === "/washington/" || path === "/washington/index.html") {
      return { page_type: "washington_hub" };
    }
    if (path === "/california" || path === "/california/" || path === "/california/index.html") {
      return { page_type: "california_hub" };
    }
    if (path === "/follow" || path === "/follow.html") return { page_type: "follow" };
    if (path === "/privacy" || path === "/privacy.html") return { page_type: "privacy" };
    if (path === "/terms" || path === "/terms.html") return { page_type: "terms" };
    if (path === "/confirm-signup" || path === "/confirm-signup.html") {
      return { page_type: "signup_confirmation" };
    }
    if (path === "/404" || path === "/404.html") return { page_type: "not_found" };
    return { page_type: "other" };
  }

  function safeSourceProperties(sourceName, input) {
    var payload = input || {};
    if (sourceName === "section_view") {
      return { section: safeEnum(payload.section, SECTIONS, "") };
    }
    if (sourceName === "cta_click") {
      var cta = {
        action: safeEnum(payload.action, CTA_ACTIONS, ""),
        location: safeEnum(payload.location, CTA_LOCATIONS, ""),
      };
      var ctaProduct = safeEnum(payload.productSlug, PRODUCT_SLUGS, "");
      if (ctaProduct) cta.product_slug = ctaProduct;
      return cta;
    }
    if (sourceName === "social_link_click") {
      return {
        platform: safeEnum(payload.platform, PLATFORMS, ""),
        location: safeEnum(payload.location, CTA_LOCATIONS, ""),
      };
    }
    if (sourceName === "find_us_search") {
      return { search_type: payload.zip ? "zip" : "text" };
    }
    if (sourceName === "find_us_geolocation") {
      return { search_type: "geolocation" };
    }
    if (sourceName === "find_us_search_no_results") {
      return {
        search_type: safeEnum(payload.searchType, SEARCH_TYPES, payload.zip ? "zip" : "text"),
      };
    }
    if (sourceName === "find_us_geolocation_failed") {
      return { reason: safeEnum(payload.reason, ERROR_REASONS, "unavailable") };
    }
    if (sourceName === "find_us_filter_change") {
      return {
        filter_group: safeEnum(payload.group, FILTER_GROUPS, ""),
        filter_value: safeEnum(payload.value, FILTER_VALUES, "all"),
      };
    }
    if (sourceName === "find_us_external_click") {
      return { target: safeEnum(payload.target, TARGETS, "website") };
    }
    if (sourceName === "product_view" || sourceName === "product_external_click") {
      var productSlug = safeEnum(payload.productSlug, PRODUCT_SLUGS, "");
      var productOutput = productSlug ? { product_slug: productSlug } : {};
      if (sourceName === "product_external_click") {
        var productLocation = safeEnum(payload.location, CTA_LOCATIONS, "");
        if (productLocation) productOutput.location = productLocation;
      }
      return productOutput;
    }
    if (sourceName === "signup_submit" || sourceName === "signup_confirm") {
      return { source: safeEnum(payload.source, SIGNUP_SOURCES, "unknown") };
    }
    if (sourceName === "signup_discovery_answer") {
      return {
        discovery_source: safeEnum(payload.discovery_source, DISCOVERY_SOURCES, ""),
        variant: safeEnum(payload.variant, SURVEY_VARIANTS, ""),
      };
    }
    if (
      sourceName === "signup_prompt_view" ||
      sourceName === "signup_start" ||
      sourceName === "signup_prompt_dismiss" ||
      sourceName === "signup_prompt_follow_offer"
    ) {
      return { source: safeEnum(payload.source, SIGNUP_SOURCES, "unknown") };
    }
    if (sourceName === "signup_prompt_offer_dismiss") {
      return {
        source: safeEnum(payload.source, SIGNUP_SOURCES, "unknown"),
        followed: safeEnum(payload.followed, FOLLOW_OUTCOMES, "none"),
      };
    }
    if (sourceName === "flow_error") {
      var errorOutput = {
        flow: safeEnum(payload.flow, FLOWS, ""),
        reason: safeEnum(payload.reason, ERROR_REASONS, "network"),
      };
      var errorSource = safeEnum(payload.source, SIGNUP_SOURCES, "");
      if (errorSource) errorOutput.source = errorSource;
      return errorOutput;
    }
    return {};
  }

  function eventProperties(properties) {
    var input = properties || {};
    var output = {
      environment: state.environment,
      surface: "consumer_website",
    };
    if (input.page_type) output.page_type = safeEnum(input.page_type, PAGE_TYPES, "other");
    if (input.product_slug) {
      var productSlug = safeEnum(input.product_slug, PRODUCT_SLUGS, "");
      if (productSlug) output.product_slug = productSlug;
    }
    if (input.search_type === "zip" || input.search_type === "city") {
      output.search_type = input.search_type;
    }
    if (input.search_type === "text" || input.search_type === "geolocation") {
      output.search_type = input.search_type;
    }
    if (input.section) {
      var section = safeEnum(input.section, SECTIONS, "");
      if (section) output.section = section;
    }
    if (input.action) {
      var action = safeEnum(input.action, CTA_ACTIONS, "");
      if (action) output.action = action;
    }
    if (input.location) {
      var locationValue = safeEnum(input.location, CTA_LOCATIONS, "");
      if (locationValue) output.location = locationValue;
    }
    if (input.platform) {
      var platform = safeEnum(input.platform, PLATFORMS, "");
      if (platform) output.platform = platform;
    }
    if (input.target) output.target = safeEnum(input.target, TARGETS, "website");
    if (input.filter_group) {
      var filterGroup = safeEnum(input.filter_group, FILTER_GROUPS, "");
      if (filterGroup) output.filter_group = filterGroup;
    }
    if (input.filter_value) {
      output.filter_value = safeEnum(input.filter_value, FILTER_VALUES, "all");
    }
    if (input.source) output.source = safeEnum(input.source, SIGNUP_SOURCES, "unknown");
    if (input.followed) output.followed = safeEnum(input.followed, FOLLOW_OUTCOMES, "none");
    if (input.discovery_source) {
      var discoverySource = safeEnum(input.discovery_source, DISCOVERY_SOURCES, "");
      if (discoverySource) output.discovery_source = discoverySource;
    }
    if (input.flow) {
      var flow = safeEnum(input.flow, FLOWS, "");
      if (flow) output.flow = flow;
    }
    if (input.reason) output.reason = safeEnum(input.reason, ERROR_REASONS, "network");
    return output;
  }

  function newSessionId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return "site-" + root.crypto.randomUUID();
    }
    return "site-" + String(Date.now()) + "-" + String(Math.random()).slice(2, 18);
  }

  function sessionId() {
    var storage;
    try {
      storage = root.sessionStorage || null;
      var current = storage && storage.getItem(SESSION_ID_KEY);
      if (current && /^site-[a-z0-9-]{12,80}$/.test(current)) return current;
      var next = newSessionId();
      if (storage) storage.setItem(SESSION_ID_KEY, next);
      return next;
    } catch (error) {
      console.error("Mixpanel session storage unavailable", error);
      return newSessionId();
    }
  }

  function sessionAlreadyStarted() {
    try {
      return root.sessionStorage &&
        root.sessionStorage.getItem(SESSION_STARTED_KEY) === "1";
    } catch (error) {
      console.error("Mixpanel session state unavailable", error);
      return state.sessionStarted;
    }
  }

  function rememberSessionStarted() {
    state.sessionStarted = true;
    try {
      if (root.sessionStorage) root.sessionStorage.setItem(SESSION_STARTED_KEY, "1");
    } catch (error) {
      console.error("Mixpanel session state could not be saved", error);
    }
  }

  function encodePayload(payload) {
    if (!root.btoa) return null;
    return root.btoa(JSON.stringify(payload));
  }

  function send(name, properties) {
    if (!state.ready || !state.token || !SITE_EVENTS[name] || typeof root.fetch !== "function") return;
    var output = eventProperties(properties);
    output.token = state.token;
    output.distinct_id = sessionId();
    output.$ip = 0;
    var encoded = encodePayload([{ event: name, properties: output }]);
    if (!encoded) return;
    root.fetch(INGEST_URL, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(encoded),
    }).catch(function (error) {
      console.error("Mixpanel event delivery failed", error);
    });
  }

  function track(name, properties) {
    if (!SITE_EVENTS[name] || !state.ready) return;
    send(name, properties);
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    var selectedProject = project();
    if (!selectedProject) {
      state.disabled = true;
      return;
    }
    state.environment = selectedProject.environment;
    state.token = selectedProject.token;
    state.ready = true;
    var context = pageContext();
    if (!sessionAlreadyStarted()) {
      rememberSessionStarted();
      track("site_session_started", { page_type: context.page_type });
    } else {
      state.sessionStarted = true;
    }
    track("site_page_viewed", context);
    if (context.page_type === "product_detail" && context.product_slug) {
      state.productViewSent = true;
      track("site_product_viewed", { product_slug: context.product_slug });
    }
  }

  function trackSource(sourceName, payload) {
    if (sourceName === "age_gate_exit") return;
    var mapped = SOURCE_EVENT_MAP[sourceName];
    if (!mapped || !state.ready) return;
    if (mapped === "site_product_viewed" && state.productViewSent) return;
    if (mapped === "site_product_viewed") state.productViewSent = true;
    var properties = safeSourceProperties(sourceName, payload);
    if (sourceName === "signup_discovery_answer" && !properties.discovery_source) return;
    track(mapped, properties);
  }

  return {
    init: init,
    track: track,
    trackSource: trackSource,
    _pageContext: pageContext,
    _safeSourceProperties: safeSourceProperties,
    _state: state,
  };
});
