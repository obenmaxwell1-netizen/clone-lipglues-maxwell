/* =========================================================================
   email-signup.js — Wire up any <form data-signup> to the signupWrite CF
   on the gimmemwah-consumer Firebase project. That project owns the
   canonical `signups` collection already read by Nathaniel's Google Sheet
   (Apps Script poll). Homepage/newsletter captures land in the same place
   as launch-event captures — differentiated by the `source` field.

   Pair each form with a data-source="homepage" | "footer" | ... attribute
   so the CF can attribute signups.
   ========================================================================= */
(function () {
  "use strict";

  // Production uses a same-origin Cloudflare Worker so the server can attach
  // an approximate state without asking for location in the form. Firebase
  // mirrors, preview channels, localhost, and edge failures fall back to the
  // direct Function; those signups deliberately retain an unknown state.
  var DIRECT_ENDPOINT = "https://us-central1-gimmemwah-consumer.cloudfunctions.net/signupWrite";
  var SIGNUP_MEMORY_KEY = "mwah_newsletter_subscribed";
  // The three social platforms were one combined "social" answer until
  // 2026-09-18. Splitting them is the whole point of the question — which
  // feed drives signups is what the follow row is trying to move. `social`
  // stays in the allowlist so historical answers still validate; the GA4
  // series breaks at the switch date and should be annotated there.
  // Mirrored in mixpanel.js — change both together or answers are dropped.
  var DISCOVERY_SOURCES = {
    instagram: 1,
    tiktok: 1,
    x: 1,
    search: 1,
    ai_assistant: 1,
    retailer: 1,
    friend: 1,
    other: 1,
    social: 1,
  };

  function edgeEndpoint() {
    if (window.location.hostname === "gimmemwah.com" ||
        window.location.hostname === "www.gimmemwah.com") {
      return window.location.origin + "/api/signup";
    }
    return DIRECT_ENDPOINT;
  }

  function shouldFallbackFromEdge(status) {
    return status === 403 || status === 404 || status === 502 ||
      status === 503 || status === 504;
  }

  async function postSignup(headers, body) {
    var endpoint = edgeEndpoint();
    if (endpoint === DIRECT_ENDPOINT) {
      return fetch(DIRECT_ENDPOINT, {
        method: "POST",
        headers: headers,
        body: body,
      });
    }

    try {
      var edgeResponse = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: body,
      });
      if (!shouldFallbackFromEdge(edgeResponse.status)) return edgeResponse;
    } catch (err) {
      console.error("newsletter edge signup failed; using direct fallback", err);
    }
    return fetch(DIRECT_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: body,
    });
  }

  // Browser memory is intentionally email-free. The server remains the
  // canonical signup record and safely deduplicates by normalized email.
  // This flag only prevents the same browser from seeing the popup again.
  function hasNewsletterSignup() {
    try {
      return window.localStorage.getItem(SIGNUP_MEMORY_KEY) === "1";
    } catch (err) {
      console.error("newsletter signup memory read failed", err);
      return false;
    }
  }

  function rememberNewsletterSignup(source) {
    try {
      window.localStorage.setItem(SIGNUP_MEMORY_KEY, "1");
    } catch (err) {
      console.error("newsletter signup memory write failed", err);
    }
    try {
      document.dispatchEvent(new CustomEvent("mwah:newsletter-subscribed", {
        detail: { source: String(source || "unknown").slice(0, 32) },
      }));
    } catch (err2) {
      console.error("newsletter signup event dispatch failed", err2);
    }
  }

  // setStatus — update the inline status line. ALWAYS removes the
  // visually-hidden class. The element starts hidden (so screen
  // readers don't announce empty strings on page load), but as soon
  // as we have something to say we need it on screen too. Previously
  // only the email-validation-error branch was un-hiding it, which is
  // why every other status update (Submitting, network errors, rate
  // limit) was invisible.
  function setStatus(statusEl, msg, color) {
    if (!statusEl) return;
    statusEl.classList.remove("visually-hidden");
    statusEl.textContent = msg;
    statusEl.style.color = color || "var(--ink)";
  }

  function signupSource(form) {
    return String(form.getAttribute("data-source") || "unknown").slice(0, 32);
  }

  function trackEvent(name, payload) {
    if (window.MW && typeof window.MW.trackEvent === "function") {
      try { window.MW.trackEvent(name, payload || {}); }
      catch (err) { console.error("newsletter analytics failed", err); }
    }
  }

  function attach(form) {
    function prepareSecurity() {
      if (window.MW && typeof window.MW.prepareAppCheck === "function") {
        window.MW.prepareAppCheck();
      }
    }
    form.addEventListener("focusin", prepareSecurity, { once: true });
    form.addEventListener("pointerenter", prepareSecurity, { once: true });
    form.addEventListener("touchstart", prepareSecurity, { once: true, passive: true });
    form.addEventListener("input", function (event) {
      if (event.target && event.target.matches('input[type="email"]')) {
        trackEvent("signup_start", { source: signupSource(form) });
      }
    }, { once: true });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      var emailEl = form.querySelector('input[type="email"]');
      var hpEl = form.querySelector('input[name="hp"]');
      var statusEl = form.querySelector("[data-signup-status]");
      var btnEl = form.querySelector('button[type="submit"]');

      if (!emailEl) return;

      // Client-side format check before we hit the network. The CF does
      // its own validation, but a clear inline error is friendlier than
      // a network round-trip for an obvious typo (Kyle 2026-04-28).
      var emailValue = String(emailEl.value || "").trim();
      // Pragmatic email regex — RFC 5322 is way too permissive for a
      // signup form. This catches the 99% of typos (missing @, no TLD,
      // trailing dot) without false-rejecting valid addresses.
      var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRe.test(emailValue)) {
        trackEvent("flow_error", {
          flow: "newsletter_signup",
          reason: "validation",
          source: signupSource(form),
        });
        setStatus(statusEl, "Please enter a valid email address.", "var(--hot-pink)");
        if (emailEl) emailEl.focus();
        return;
      }
      if (btnEl) btnEl.disabled = true;
      setStatus(statusEl, "Submitting…", "var(--text-mid)");

      // App Check: mint a fresh reCAPTCHA-backed token. Missing or invalid
      // tokens are rejected by signupWrite, so show a clear retry path if
      // Google's reCAPTCHA/App Check client fails to initialize.
      var appCheckToken = null;
      if (window.MW && typeof window.MW.getAppCheckToken === "function") {
        try { appCheckToken = await window.MW.getAppCheckToken(); }
        catch (err) { /* see app-check.js: failure is soft */ }
      }

      var headers = { "Content-Type": "application/json" };
      if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

      try {
        var resp = await postSignup(headers, JSON.stringify({
          email: emailEl.value,
          hp: hpEl ? hpEl.value : "",
          source: form.getAttribute("data-source") || "website_newsletter",
          agreed: true, // age gate + ToS/privacy acceptance implied by submit
          utm: MW.readUTM(),
        }));
        // 429 (rate limit) gets a friendlier message — Kyle was hitting
        // this silently before the visually-hidden fix because the
        // 3/IP/hour cap is easy to trip while testing.
        if (resp.status === 429) {
          trackEvent("flow_error", {
            flow: "newsletter_signup",
            reason: "rate_limited",
            source: signupSource(form),
          });
          setStatus(statusEl, "Too many submits in a row — try again in a minute.", "var(--hot-pink)");
          return;
        }
        if (resp.status === 401) {
          trackEvent("flow_error", {
            flow: "newsletter_signup",
            reason: "security_check",
            source: signupSource(form),
          });
          setStatus(statusEl, "Security check failed. Refresh the page and try again.", "var(--hot-pink)");
          return;
        }
        if (!resp.ok) {
          throw new Error("HTTP " + resp.status);
        }
        // Track the submit BEFORE we replace the form (so the form
        // attribute is still readable). Source attribution lets us see
        // which surface drove the signup (homepage vs footer vs product).
        // No email in the analytics event — that lives in `signups`.
        var source = signupSource(form);
        trackEvent("signup_submit", { source: source });
        form.reset();
        showConfirmation(form, await readSurveyToken(resp));
        rememberNewsletterSignup(source);
      } catch (err) {
        trackEvent("flow_error", {
          flow: "newsletter_signup",
          reason: "network",
          source: signupSource(form),
        });
        setStatus(statusEl, "Something went wrong. Try again?", "var(--hot-pink)");
      } finally {
        if (btnEl) btnEl.disabled = false;
      }
    });
  }

  // signupWrite hands back a short-lived, single-use token so a survey
  // answer can be attached to the signup it came from. The browser never
  // sees the email again — the survey endpoint resolves the token
  // server-side. A missing token just means no survey write; it must
  // never block the confirmation.
  async function readSurveyToken(resp) {
    try {
      var payload = await resp.json();
      if (payload && typeof payload.survey_token === "string") {
        return payload.survey_token;
      }
    } catch (err) {
      console.error("signup response had no readable survey token", err);
    }
    return null;
  }

  // Which extras the confirmation card carries. The popup is the only
  // surface that gets the follow row, and the only one in the A/B split;
  // the homepage section keeps the survey unconditionally so the question
  // never stops being asked while the test runs.
  function confirmContext(form, surveyToken) {
    var inPopup = Boolean(form.closest && form.closest("#signupPopup"));
    if (!inPopup) {
      return { follow: false, survey: true, bucket: "", token: surveyToken };
    }
    var bucket = MW.signupSurveyBucket ? MW.signupSurveyBucket() : "a";
    return {
      follow: true,
      survey: bucket === "b",
      bucket: bucket,
      token: surveyToken,
    };
  }

  // Replace the whole signup section's interior with a branded
  // confirmation card. Keeping it scoped to the .op-signup section
  // means the form's surrounding copy (eyebrow + headline) gets
  // replaced too. Static copy only, no user input rendered.
  function showConfirmation(form, surveyToken) {
    var ctx = confirmContext(form, surveyToken);

    // The popup's form is not wrapped in .op-signup, so without this it
    // took the fallback below and replaced only the <form> — leaving the
    // eyebrow, headline and description stranded above the confirmation.
    // Replace the whole content column instead, the way .op-signup does.
    var popupContent = form.closest(".signup-popup__content");
    if (popupContent) {
      // The column's generous top padding is sized for the form's headline.
      // The confirmation card brings its own rhythm, so it gets tighter
      // padding rather than leaving the dialog 70px taller than it needs.
      popupContent.classList.add("signup-popup__content--confirmed");
      popupContent.innerHTML =
        '<div class="op-signup__confirm op-signup__confirm--inline" role="status" aria-live="polite">' +
        confirmInnerHTML(ctx) + "</div>";
      // The dialog is labelled by the headline we just removed. Re-point
      // it at the confirmation title so it keeps an accessible name, and
      // drop the description reference rather than leave it dangling.
      var dialog = popupContent.closest("[aria-labelledby]");
      var confirmTitle = popupContent.querySelector(".op-signup__confirm-title");
      if (dialog && confirmTitle) {
        confirmTitle.id = dialog.getAttribute("aria-labelledby");
        dialog.removeAttribute("aria-describedby");
      }
      bindConfirmation(popupContent, ctx);
      return;
    }

    var section = form.closest(".op-signup");
    if (!section) {
      // Footer or product-form contexts may not wrap in .op-signup.
      // Fall back to replacing just the form so the user still sees
      // confirmation in those layouts.
      var fallback = document.createElement("div");
      fallback.className = "op-signup__confirm op-signup__confirm--inline";
      fallback.setAttribute("role", "status");
      fallback.setAttribute("aria-live", "polite");
      fallback.innerHTML = confirmInnerHTML(ctx);
      form.parentNode.replaceChild(fallback, form);
      bindConfirmation(fallback, ctx);
      return;
    }
    section.classList.add("op-signup--confirmed");
    section.innerHTML = '<div class="op-signup__confirm" role="status" aria-live="polite">' +
      confirmInnerHTML(ctx) + "</div>";
    bindConfirmation(section, ctx);
  }

  function bindConfirmation(container, ctx) {
    bindSignupDiscovery(container, ctx);
    if (ctx && ctx.follow && typeof MW.bindSignupFollowRow === "function") {
      MW.bindSignupFollowRow(container);
    }
  }

  // Called with no argument by anything that just wants the default card
  // (see window.MW.signupConfirmationHTML). Defaults match the pre-split
  // behaviour: survey on, follow row off.
  function confirmInnerHTML(ctx) {
    var options = ctx || {};
    var parts = [
      '<div class="op-signup__confirm-icon" aria-hidden="true">',
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="m5 12 4 4L19 6"/>',
      "</svg>",
      "</div>",
      '<div class="op-signup__confirm-body">',
      '<h3 class="op-signup__confirm-title">You’re on the list.</h3>',
      '<p class="op-signup__confirm-msg">We’ll send MWAH updates here. Email <a href="mailto:contact@gimmeemwah.com">contact@gimmeemwah.com</a> to unsubscribe.</p>',
      "</div>",
    ];

    // Follow row sits above the survey: the two arms of the test then
    // differ by an addition, not a rearrangement.
    if (options.follow && typeof MW.signupFollowRowHTML === "function") {
      // Muted inside the confirmation card only. This card is itself a
      // polite live region, and bindSignupFollowRow inserts the progress
      // note into this subtree when the visitor returns from a follow —
      // an addition the ancestor region would claim, re-announcing the
      // whole card. The note carries its own role="status", so it is still
      // spoken; this only stops the duplicate. The dismiss offer does the
      // opposite and supplies its own region, because there the swap is
      // the thing that needs announcing.
      //
      // Passed as an option rather than set on a wrapper element. The
      // wrapper shipped in #176 and broke the card's layout: this card is
      // a row flex container, so the extra element became a third flex
      // item beside the tick and the copy, shrank to its content, and left
      // the follow tiles squeezed against the left edge of an empty card.
      parts.push(MW.signupFollowRowHTML({ ariaLive: "off" }));
    }
    if (options.survey !== false) parts.push(discoveryHTML());
    return parts.join("");
  }

  function discoveryHTML() {
    return [
      '<fieldset class="op-signup__discovery" data-signup-discovery>',
      '<legend class="op-signup__discovery-question">How did you hear about MWAH? <span>Optional.</span></legend>',
      '<div class="op-signup__discovery-options">',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="instagram">Instagram</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="tiktok">TikTok</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="x">X</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="search">Google or Bing</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="ai_assistant">ChatGPT or another AI</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="retailer">A dispensary</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="friend">A friend</button>',
      '<button type="button" class="op-signup__discovery-option" data-discovery-source="other">Somewhere else</button>',
      "</div>",
      "</fieldset>",
    ].join("");
  }

  function bindSignupDiscovery(container, ctx) {
    var survey = container && container.querySelector
      ? container.querySelector("[data-signup-discovery]")
      : null;
    if (!survey) return;
    var buttons = survey.querySelectorAll("[data-discovery-source]");
    var answered = false;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (event) {
        if (answered) return;
        var value = event.currentTarget.getAttribute("data-discovery-source") || "";
        if (!DISCOVERY_SOURCES[value]) return;
        answered = true;
        for (var j = 0; j < buttons.length; j++) buttons[j].disabled = true;
        trackEvent("signup_discovery_answer", {
          discovery_source: value,
          variant: (ctx && ctx.bucket) || "",
        });
        if (ctx && ctx.token && typeof MW.submitSignupSurveyAnswer === "function") {
          MW.submitSignupSurveyAnswer(value, ctx.token, ctx.bucket);
        }
        survey.innerHTML = '<p class="op-signup__discovery-thanks" role="status" aria-live="polite">Thanks.</p>';
      });
    }
  }

  function init() {
    MW.$$("form[data-signup]").forEach(attach);
  }

  window.MW = window.MW || {};
  window.MW.hasNewsletterSignup = hasNewsletterSignup;
  window.MW.rememberNewsletterSignup = rememberNewsletterSignup;
  window.MW.signupConfirmationHTML = confirmInnerHTML;
  window.MW.bindSignupDiscovery = bindSignupDiscovery;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
