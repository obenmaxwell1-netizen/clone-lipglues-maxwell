/* =========================================================================
   signup-popup.js - Delayed homepage newsletter invitation.

   The mandatory 21+ gate always gets the first interaction. Once age is
   acknowledged, the popup becomes eligible after 25 seconds or when the
   visitor reaches 50% of the page. Successful signup is remembered in
   localStorage by email-signup.js. A dismissal pauses the popup for 14 days.
   No email address is ever stored in browser memory.
   ========================================================================= */
(function () {
  "use strict";

  var POPUP_ID = "signupPopup";
  var AGE_COOKIE = "mwah_ageok";
  var DISMISSED_UNTIL_KEY = "mwah_newsletter_popup_dismissed_until";
  var SEEN_SESSION_KEY = "mwah_newsletter_popup_seen";
  var DISMISS_DAYS = 14;
  var OPEN_DELAY_MS = 10000;
  var SCROLL_THRESHOLD = 0.5;

  var popup = null;
  var lastFocus = null;
  var timerId = null;
  var retryId = null;
  var armed = false;
  var followOfferShown = false;
  var dismissalRecorded = false;
  var popupInertTargets = [];
  var previousBodyOverflow = "";

  function readStorage(storage, key) {
    try {
      return storage.getItem(key);
    } catch (err) {
      console.error("signup popup memory read failed", err);
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (err) {
      console.error("signup popup memory write failed", err);
      return false;
    }
  }

  function hasAgeCookie() {
    return document.cookie.split(";").some(function (part) {
      return part.trim().indexOf(AGE_COOKIE + "=1") === 0;
    });
  }

  function isDismissed(dismissedUntil, now) {
    var value = Number(dismissedUntil || 0);
    return Number.isFinite(value) && value > now;
  }

  function hasReachedScrollThreshold(scrollTop, viewportHeight, pageHeight) {
    if (!pageHeight || pageHeight <= viewportHeight) return true;
    var scrollableDistance = pageHeight - viewportHeight;
    return scrollTop >= scrollableDistance * SCROLL_THRESHOLD;
  }

  function shouldSuppress(subscribed, dismissedUntil, seen, now) {
    return subscribed || seen === "1" || isDismissed(dismissedUntil, now);
  }

  function hasNewsletterSignup() {
    return Boolean(window.MW &&
      typeof window.MW.hasNewsletterSignup === "function" &&
      window.MW.hasNewsletterSignup());
  }

  function trackEvent(name, extra) {
    if (window.MW && typeof window.MW.trackEvent === "function") {
      var payload = { source: "popup" };
      if (extra) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) payload[key] = extra[key];
        }
      }
      try { window.MW.trackEvent(name, payload); }
      catch (err) { console.error("signup popup analytics failed", err); }
    }
  }

  function isSuppressed() {
    var subscribed = hasNewsletterSignup();
    var dismissedUntil = readStorage(window.localStorage, DISMISSED_UNTIL_KEY);
    var seen = readStorage(window.sessionStorage, SEEN_SESSION_KEY);
    return shouldSuppress(subscribed, dismissedUntil, seen, Date.now());
  }

  function shouldBlockPopup(requestOpen, navOpen, campaignVideoOpen) {
    return requestOpen || navOpen || campaignVideoOpen;
  }

  function hasBlockingSurface() {
    var requestModal = document.getElementById("reqScrim");
    var navDrawer = document.getElementById("navDrawer");
    var campaignVideo = document.getElementById("campaignVideoModal");
    var requestOpen = Boolean(requestModal && requestModal.classList.contains("is-open"));
    var navOpen = Boolean(navDrawer && !navDrawer.hasAttribute("hidden"));
    var campaignVideoOpen = Boolean(campaignVideo && !campaignVideo.hasAttribute("hidden"));
    return shouldBlockPopup(requestOpen, navOpen, campaignVideoOpen);
  }

  function clearTriggers() {
    if (timerId) clearTimeout(timerId);
    if (retryId) clearTimeout(retryId);
    timerId = null;
    retryId = null;
    window.removeEventListener("scroll", onScroll);
  }

  function setPageBehindPopupInert(on) {
    var children = Array.prototype.slice.call(document.body.children || []);
    if (on) {
      popupInertTargets = [];
      children.forEach(function (child) {
        if (child === popup || child.tagName === "SCRIPT" || child.tagName === "NOSCRIPT") return;
        popupInertTargets.push({
          el: child,
          inert: child.hasAttribute("inert"),
          ariaHidden: child.getAttribute("aria-hidden"),
        });
        child.setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
      });
      return;
    }
    popupInertTargets.forEach(function (entry) {
      if (!entry.inert) entry.el.removeAttribute("inert");
      if (entry.ariaHidden == null) entry.el.removeAttribute("aria-hidden");
      else entry.el.setAttribute("aria-hidden", entry.ariaHidden);
    });
    popupInertTargets = [];
  }

  // The ask state is hidden, never destroyed. email-signup.js binds the
  // submit handler once at DOMContentLoaded, to this exact form node.
  // Replacing the column's innerHTML would build a form that looks
  // identical and has no listener, so preventDefault would never run and
  // the browser would fall through to a native GET submit — putting the
  // visitor's email address in the URL, their history, and the Referer of
  // every subsequent request. Hiding keeps that handler, the App Check
  // pre-warm and the signup_start binding intact.
  var askState = null;
  var offerHost = null;

  function restoreAskState() {
    if (offerHost && offerHost.parentNode) offerHost.parentNode.removeChild(offerHost);
    offerHost = null;
    if (askState) askState.hidden = false;
    var content = popup && popup.querySelector(".signup-popup__content");
    if (content) content.classList.remove("signup-popup__content--confirmed");
    var dialog = content && content.closest("[aria-labelledby]");
    if (dialog) {
      dialog.setAttribute("aria-labelledby", "signupPopupTitle");
      dialog.setAttribute("aria-describedby", "signupPopupDescription");
    }
  }

  function openPopup() {
    if (!popup || !popup.hasAttribute("hidden")) return;
    if (isSuppressed()) {
      clearTriggers();
      return;
    }
    if (hasBlockingSurface()) {
      retryId = setTimeout(openPopup, 1000);
      return;
    }

    clearTriggers();
    // Clearing the flags without putting the ask state back would be a
    // lie: the column still shows the offer. Unreachable today because the
    // session key blocks reopening, which is exactly how long a stale flag
    // survives before a later change makes it reachable.
    if (followOfferShown) restoreAskState();
    followOfferShown = false;
    dismissalRecorded = false;
    writeStorage(window.sessionStorage, SEEN_SESSION_KEY, "1");
    lastFocus = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    popup.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    setPageBehindPopupInert(true);
    trackEvent("signup_prompt_view");
    window.requestAnimationFrame(function () {
      popup.classList.add("is-open");
    });

    var email = popup.querySelector('input[type="email"]');
    if (email) setTimeout(function () { email.focus(); }, 80);
  }

  // Everyone who dismisses without subscribing gets one follow offer before
  // the popup goes away. It is the same block the confirmation card renders,
  // one step earlier, so nothing new competes with the email field — this
  // only runs once the visitor has already declined it.
  //
  // Returns true when the dismissal was converted into the offer, which
  // means the caller should not close.
  function showFollowOffer() {
    if (followOfferShown) return false;
    if (hasNewsletterSignup()) return false;
    if (!window.MW || typeof window.MW.signupFollowRowHTML !== "function") return false;

    var content = popup.querySelector(".signup-popup__content");
    if (!content) return false;

    // Build first, latch after. Latching before the render meant a throw
    // from signupFollowRowHTML would leave the flag set, the form still on
    // screen, and the visitor's click doing nothing at all.
    var markup;
    try {
      markup = window.MW.signupFollowRowHTML({ location: "signup_popup_dismiss" });
    } catch (err) {
      console.error("signup popup follow offer render failed", err);
      return false;
    }

    followOfferShown = true;
    content.classList.add("signup-popup__content--confirmed");

    // The region goes in empty and is filled on the next frame. A live
    // region created already-populated in a single assignment is the
    // canonical non-announcing pattern in NVDA and JAWS: the mutation
    // happens before the region is in the accessibility tree.
    offerHost = document.createElement("div");
    offerHost.className = "op-signup__confirm op-signup__confirm--inline";
    offerHost.setAttribute("role", "status");
    offerHost.setAttribute("aria-live", "polite");
    content.appendChild(offerHost);
    if (askState) askState.hidden = true;

    // setTimeout, not requestAnimationFrame. rAF does not fire while the
    // tab is backgrounded, which would leave the card visibly empty when
    // the visitor came back — a worse failure than the one the deferral
    // fixes. A timer still yields a turn of the event loop, which is all
    // the live region needs to be in the accessibility tree first.
    setTimeout(function () {
      offerHost.innerHTML = markup;

      // The dialog was labelled by the headline we just hid, so re-point it
      // at the offer's own title.
      var dialog = content.closest("[aria-labelledby]");
      var title = offerHost.querySelector(".op-signup__follow-title");
      if (dialog && title) {
        title.id = "signupPopupFollowTitle";
        dialog.setAttribute("aria-labelledby", "signupPopupFollowTitle");
        dialog.removeAttribute("aria-describedby");
      }

      if (typeof window.MW.bindSignupFollowRow === "function") {
        window.MW.bindSignupFollowRow(offerHost);
      }

      // Focus the heading, not the first link. The visitor just pressed ✕
      // to leave; parking focus on "Follow MWAH on Instagram" means a
      // second reflexive Enter opens Instagram instead of closing.
      if (title) {
        title.setAttribute("tabindex", "-1");
        if (typeof title.focus === "function") title.focus();
      }
    }, 0);

    trackEvent("signup_prompt_follow_offer");
    return true;
  }

  // Recording the dismissal is separate from closing the dialog, because
  // the visitor has declined the moment they first dismiss — whether or
  // not they then look at the follow offer. Folding the two together meant
  // someone who dismissed, tapped a tile and never returned to the tab was
  // never suppressed, and saw the popup again the next day. It also kept
  // signup_prompt_dismiss meaning what it has always meant, so the
  // existing 30-day series stays continuous.
  function recordDismissal() {
    if (dismissalRecorded) return;
    dismissalRecorded = true;
    var dismissUntil = Date.now() + (DISMISS_DAYS * 24 * 60 * 60 * 1000);
    writeStorage(window.localStorage, DISMISSED_UNTIL_KEY, String(dismissUntil));
    if (!hasNewsletterSignup()) trackEvent("signup_prompt_dismiss");
  }

  // Reads the ✓ state the follow row maintains, so this reflects follows
  // the visitor actually completed — bindFollowRow only marks a tile once
  // the tab comes back, not on the click. Three buckets rather than a
  // count: a fourth account would make "3" mean "all" on one surface and
  // "most" on another, and an unlisted count is exactly the value that
  // safeEnum drops on the floor.
  function followOutcome() {
    if (!offerHost || typeof offerHost.querySelectorAll !== "function") return "none";
    var total = offerHost.querySelectorAll(".op-signup__follow-link").length;
    var opened = offerHost.querySelectorAll(".op-signup__follow-link.is-opened").length;
    if (!opened) return "none";
    return opened >= total ? "all" : "partial";
  }

  function closePopup(rememberDismissal, skipFollowOffer) {
    if (!popup || popup.hasAttribute("hidden")) return;
    if (rememberDismissal) recordDismissal();
    // First dismiss shows the offer instead of closing. The second always
    // closes — a third beat would make this the thing people hate.
    // Escape opts out entirely; see onKeydown.
    if (rememberDismissal && !skipFollowOffer && showFollowOffer()) return;
    // Closing while the offer is on screen is the second dismissal, and
    // the only way to tell "saw the socials ask and left" apart from
    // "wandered off with the tab still open" — without it, both read as
    // an offer view with no follow, which is the number this whole
    // surface exists to move.
    //
    // No latch of its own, unlike recordDismissal. That one needs one
    // because the first close deliberately does not hide the popup, so
    // closePopup runs twice per cycle. This line sits after the early
    // return, so it is only reached by the call that hides — and the
    // hidden guard at the top stops any later call dead. openPopup resets
    // followOfferShown, so a reopen starts a fresh prompt and is counted
    // as one.
    if (followOfferShown) {
      trackEvent("signup_prompt_offer_dismiss", { followed: followOutcome() });
    }
    popup.classList.remove("is-open");
    popup.setAttribute("hidden", "");
    setPageBehindPopupInert(false);
    document.body.style.overflow = previousBodyOverflow;
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function onScroll() {
    var root = document.documentElement;
    var body = document.body;
    var pageHeight = Math.max(
      root ? root.scrollHeight : 0,
      body ? body.scrollHeight : 0
    );
    var scrollTop = window.scrollY || (root && root.scrollTop) || 0;
    if (hasReachedScrollThreshold(scrollTop, window.innerHeight || 0, pageHeight)) {
      openPopup();
    }
  }

  function onKeydown(event) {
    if (!popup || popup.hasAttribute("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      // Escape always closes, first press, without the follow offer.
      // The ARIA dialog pattern promises that, and a keyboard user who
      // has asked to leave should not be handed another offer to read
      // before the key works. The offer belongs to the ✕ and the
      // backdrop, where a second tap is right there.
      closePopup(true, true);
      return;
    }
    if (event.key !== "Tab") return;

    // The backdrop is a <button> with tabindex="-1" that fills the
    // viewport, so it passes the offsetParent visibility check and used to
    // land at the front of the cycle — Tab-wrapping focused an invisible
    // element. Excluding tabindex="-1" drops it. With the form replaced by
    // the follow offer the cycle is short enough that one dead stop is a
    // fifth of it.
    var nodes = popup.querySelectorAll(
      'button:not([tabindex="-1"]), [href]:not([tabindex="-1"]), ' +
      'input:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
    );
    var focusable = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].offsetParent !== null && !nodes[i].disabled) focusable.push(nodes[i]);
    }
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onSubscribed(event) {
    clearTriggers();
    if (!popup || popup.hasAttribute("hidden")) return;
    if (!event.detail || event.detail.source !== "popup") closePopup(false);
  }

  function armTriggers() {
    if (armed || isSuppressed()) return;
    armed = true;
    timerId = setTimeout(openPopup, OPEN_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function init() {
    popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    // Wrap the authored ask markup so it can be hidden as a unit. Doing
    // it here rather than in index.html keeps the served HTML unchanged
    // for anyone reading it, and the wrapper never has to be maintained
    // in two places.
    var column = popup.querySelector(".signup-popup__content");
    if (column) {
      askState = document.createElement("div");
      askState.className = "signup-popup__ask";
      while (column.firstChild) askState.appendChild(column.firstChild);
      column.appendChild(askState);
    }

    var closeButton = popup.querySelector("[data-signup-popup-close]");
    var backdrop = popup.querySelector("[data-signup-popup-backdrop]");
    if (closeButton) {
      closeButton.addEventListener("click", function () { closePopup(true); });
    }
    if (backdrop) {
      backdrop.addEventListener("click", function () { closePopup(true); });
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("mwah:newsletter-subscribed", onSubscribed);

    if (hasAgeCookie()) armTriggers();
    else document.addEventListener("mwah:age-accepted", armTriggers, { once: true });
  }

  window.MW = window.MW || {};
  window.MW.signupPopupIsDismissed = isDismissed;
  window.MW.signupPopupReachedScroll = hasReachedScrollThreshold;
  window.MW.signupPopupShouldSuppress = shouldSuppress;
  window.MW.signupPopupShouldBlock = shouldBlockPopup;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
