/* =========================================================================
   home.js — Light interactivity for home page (no data fetching).
   - Pause non-focal product videos to save battery
   - Click a card → make it focal (mark with .card--focal, play its video)
   - Continuous product loop; intersection observer keeps videos paused
     when off-screen.
   Depends on global.js (window.MW.*).
   ========================================================================= */
(function () {
  "use strict";

  // Disable browser scroll restoration so the page always lands at the
  // top on a fresh visit. On mobile, restored scroll positions made the
  // page open mid-products instead of at the hero (Kyle 2026-04-28).
  // Skipped when the URL has an explicit hash so #products / #find-us
  // anchor links still work.
  if (history.scrollRestoration) {
    history.scrollRestoration = "manual";
  }
  if (!location.hash) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { window.scrollTo(0, 0); }, { once: true });
    } else {
      window.scrollTo(0, 0);
    }
  }

  // Browsers can attempt a cross-page anchor jump while the age gate still
  // has document scrolling locked, or before late media settles the page
  // height. Re-apply the explicit target after load and after age acceptance
  // so detail-page CTAs reliably land on the requested homepage section.
  function restoreHashTarget() {
    var hash = String(location.hash || "").split(/[?&]/)[0];
    if (!hash || hash.charAt(0) !== "#") return;
    var id;
    try { id = decodeURIComponent(hash.slice(1)); }
    catch (err) {
      console.error("[home] invalid anchor", err);
      return;
    }
    var target = document.getElementById(id);
    if (!target || !target.scrollIntoView) return;
    target.scrollIntoView({ behavior: "auto", block: "start" });
  }

  if (location.hash) {
    if (document.readyState === "complete") {
      requestAnimationFrame(restoreHashTarget);
    } else {
      window.addEventListener("load", restoreHashTarget, { once: true });
    }
    document.addEventListener("mwah:age-accepted", function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(restoreHashTarget);
      });
    }, { once: true });
    window.addEventListener("hashchange", restoreHashTarget);
  }

  function initProductCoverflow() {
    var row = document.querySelector(".op-cards__row");
    if (!row) return;
    var cards = [].slice.call(row.querySelectorAll(".op-card"));
    if (!cards.length) return;

    var progressFill = document.querySelector(".op-progress__fill");
    var progressCount = document.querySelector(".op-progress__count");
    var total = cards.length;
    var originals = cards.slice();
    var mediaVisible = false;
    var mediaObserversArmed = false;
    var motionPreference = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    var reduceMotion = Boolean(motionPreference && motionPreference.matches);

    // One visual lap on either side keeps native touch/trackpad scrolling
    // continuous. Only the original eight links belong in the tab order and
    // accessibility tree. Repeats retain the same product detail destinations.
    function repeatCard(card) {
      var copy = card.cloneNode(true);
      copy.classList.remove("is-focal");
      copy.removeAttribute("id");
      copy.setAttribute("aria-hidden", "true");
      [].forEach.call(copy.querySelectorAll("[id]"), function (node) { node.removeAttribute("id"); });
      [].forEach.call(copy.querySelectorAll("a, button, input, select, textarea, [tabindex]"), function (node) {
        node.setAttribute("tabindex", "-1");
      });
      return copy;
    }
    if (total > 1) {
      var endSpacer = row.lastElementChild;
      originals.forEach(function (card) { row.insertBefore(repeatCard(card), originals[0]); });
      originals.forEach(function (card) { row.insertBefore(repeatCard(card), endSpacer); });
      cards = [].slice.call(row.querySelectorAll(".op-card"));
    }

    function pad2(n) { return (n < 10 ? "0" : "") + n; }

    // Videos ship with preload="none" + a poster image so non-focal cards
    // never request a single byte of mp4 (cuts decoder pressure on iOS,
    // which historically caps concurrent video decoders and was leaving
     // mango/peach blank for some Chrome iOS users — Kyle 2026-04-28).
    // When a card becomes focal we flip preload→auto, kick load(), then
    // play(). If play() rejects (Low Power Mode, Reduce Motion, locked
    // tab), the poster stays visible — better than the previous empty
    // black frame.
    function ensurePoster(v) {
      if (!v || v.getAttribute("poster") || !v.getAttribute("data-poster")) return;
      v.setAttribute("poster", v.getAttribute("data-poster"));
    }

    function ensureSource(v) {
      if (!v || v.getAttribute("src") || !v.getAttribute("data-src")) return;
      v.setAttribute("src", v.getAttribute("data-src"));
    }

    function playVideo(v) {
      if (!v) return;
      ensurePoster(v);
      if (reduceMotion) {
        pauseVideo(v);
        return;
      }
      ensureSource(v);
      try {
        if (v.preload !== "auto") v.preload = "auto";
        if (v.readyState < 2) v.load();
      } catch (e) { console.error("[home] video load failed", e); }
      var p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch(function (err) { console.error("[home] video play rejected", err); });
      }
    }

    // Belt-and-suspenders loop: the <video loop> attribute is unreliable
    // for short clips (≤3s) on Safari/iOS — playback can stop on first
    // ended event instead of restarting. Force-replay on ended for the
    // focal video so the spin keeps going.
    function bindLoop(v) {
      if (!v) return;
      v.addEventListener("ended", function () {
        // Only restart if this is still the focal — pause/currentTime=0
        // on focal change runs first, so a non-focal "ended" is benign.
        if (!reduceMotion && mediaVisible && v.closest(".op-card.is-focal")) {
          try {
            v.currentTime = 0;
            var p = v.play();
            if (p && p.catch) p.catch(function (err) { console.error("[home] forced loop play rejected", err); });
          } catch (e) { console.error("[home] forced loop play failed", e); }
        }
      });
    }
    cards.forEach(function (c) { bindLoop(c.querySelector(".op-card__video")); });

    function pauseVideo(v) {
      if (!v) return;
      try { v.pause(); v.currentTime = 0; } catch (e) { console.error("[home] video pause failed", e); }
    }

    if (motionPreference && typeof motionPreference.addEventListener === "function") {
      motionPreference.addEventListener("change", function () {
        reduceMotion = motionPreference.matches;
        cards.forEach(function (card) { pauseVideo(card.querySelector(".op-card__video")); });
        if (!reduceMotion && mediaVisible && focalIdx >= 0) {
          playVideo(cards[focalIdx].querySelector(".op-card__video"));
        }
      });
    }

    var focalIdx = -1;
    function updateFocal() {
      var rowRect = row.getBoundingClientRect();
      var centerX = rowRect.left + rowRect.width / 2;
      var bestIdx = 0;
      var bestDist = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var r = cards[i].getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var dist = Math.abs(cx - centerX);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      if (bestIdx !== focalIdx) {
        if (focalIdx >= 0 && cards[focalIdx]) {
          cards[focalIdx].classList.remove("is-focal");
          pauseVideo(cards[focalIdx].querySelector(".op-card__video"));
        }
        focalIdx = bestIdx;
        cards[focalIdx].classList.add("is-focal");
        if (mediaVisible) playVideo(cards[focalIdx].querySelector(".op-card__video"));
        var productNumber = (focalIdx % total) + 1;
        if (progressFill) progressFill.style.width = (productNumber / total * 100) + "%";
        if (progressCount) progressCount.textContent = pad2(productNumber) + " / " + pad2(total);
      }
    }

    // Pause all videos on init — focal's will play once updateFocal runs
    cards.forEach(function (c) { pauseVideo(c.querySelector(".op-card__video")); });

    var settleTimer;
    var pointerDown = false;
    var resetting = false;
    var keyboardFocus = null;
    var scrollTarget = null;

    function settleLoop() {
      clearTimeout(settleTimer);
      if (pointerDown || resetting || focalIdx < 0) return;
      updateFocal();
      scrollTarget = null;
      var current = cards[focalIdx];
      var original = originals[focalIdx % total];
      var restoreFocus = (keyboardFocus && keyboardFocus === document.activeElement) || current.contains(document.activeElement);
      keyboardFocus = null;
      if (current !== original) {
        resetting = true;
        row.classList.add("is-loop-resetting");
        // Carry the already-loaded video, not a fresh decoder at frame zero.
        // Both cards represent the same product; their posters and sources
        // are interchangeable, and the existing video listeners move with it.
        var currentVideo = current.querySelector(".op-card__video");
        var originalVideo = original.querySelector(".op-card__video");
        if (currentVideo && originalVideo) {
          var videoParent = currentVideo.parentNode;
          var videoNext = currentVideo.nextSibling;
          if (currentVideo.getAttribute("poster")) ensurePoster(originalVideo);
          originalVideo.parentNode.replaceChild(currentVideo, originalVideo);
          videoParent.insertBefore(originalVideo, videoNext);
        }
        // Preserve the exact visual position, including subpixel offsets.
        // Never animate backwards across a whole lap at the join.
        row.scrollTo({ left: row.scrollLeft + original.offsetLeft - current.offsetLeft, behavior: "instant" });
        updateFocal();
        // Commit the identical focal styles before re-enabling transitions.
        row.getBoundingClientRect();
        requestAnimationFrame(function () {
          row.classList.remove("is-loop-resetting");
          resetting = false;
        });
      }
      if (restoreFocus) {
        var link = original.querySelector(".op-card__detail");
        if (link && document.activeElement !== link) link.focus({ preventScroll: true });
      }
    }

    function scheduleSettle() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settleLoop, 180);
    }
    row.addEventListener("scrollend", settleLoop);
    row.addEventListener("pointerdown", function () { pointerDown = true; scrollTarget = null; keyboardFocus = null; });
    row.addEventListener("wheel", function () { scrollTarget = null; keyboardFocus = null; }, { passive: true });
    window.addEventListener("pointerup", function () { pointerDown = false; scheduleSettle(); });
    window.addEventListener("pointercancel", function () { pointerDown = false; scheduleSettle(); });

    // Throttled scroll listener
    var ticking = false;
    row.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(function () { updateFocal(); ticking = false; });
        ticking = true;
      }
      // Fallback for browsers without scrollend. A full repeated lap on each
      // side lets momentum finish before any invisible position correction.
      if (!resetting) scheduleSettle();
    }, { passive: true });

    // Click a non-focal card → scroll it to center.
    // Use offsetWidth (layout width, 416) not getBoundingClientRect().width
    // (which is the *scaled* visual width, 324 for non-focal) — otherwise
    // the centering math is off by ~46px and scroll-snap pulls the wrong card focal.
    function scrollCardToCenter(card) {
      scrollTarget = card;
      var rowRect = row.getBoundingClientRect();
      var target = card.offsetLeft - (rowRect.width / 2) + (card.offsetWidth / 2);
      row.scrollTo({ left: target, behavior: reduceMotion ? "instant" : "smooth" });
      scheduleSettle();
    }
    cards.forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("a")) return;
        if (!card.classList.contains("is-focal")) scrollCardToCenter(card);
      });
      var detailLink = card.querySelector(".op-card__detail");
      if (detailLink) {
        detailLink.addEventListener("focus", function () {
          if (!card.classList.contains("is-focal")) scrollCardToCenter(card);
        });
      }
    });

    row.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey || focalIdx < 0 || total < 2) return;
      event.preventDefault();
      var direction = event.key === "ArrowRight" ? 1 : -1;
      var currentIdx = scrollTarget ? cards.indexOf(scrollTarget) : focalIdx;
      var next = cards[currentIdx + direction];
      if (!next) return;
      keyboardFocus = document.activeElement;
      scrollCardToCenter(next);
    });

    function armMediaObservers() {
      if (mediaObserversArmed) return;
      mediaObserversArmed = true;
      if (!("IntersectionObserver" in window)) {
        mediaVisible = true;
        cards.forEach(function (card) { ensurePoster(card.querySelector(".op-card__video")); });
        if (focalIdx >= 0) playVideo(cards[focalIdx].querySelector(".op-card__video"));
        return;
      }

      // Posters load card-by-card as they approach either the vertical or
      // horizontal viewport. Off-screen carousel cards stay byte-free.
      var posterObserver = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          ensurePoster(entries[i].target.querySelector(".op-card__video"));
          posterObserver.unobserve(entries[i].target);
        }
      }, { rootMargin: "200px" });
      cards.forEach(function (card) { posterObserver.observe(card); });

      // Video playback waits until the carousel itself is actually visible.
      var playbackObserver = new IntersectionObserver(function (entries) {
        if (!entries.length) return;
        mediaVisible = entries[0].isIntersecting;
        if (mediaVisible && focalIdx >= 0) {
          playVideo(cards[focalIdx].querySelector(".op-card__video"));
        } else if (!mediaVisible) {
          cards.forEach(function (card) { pauseVideo(card.querySelector(".op-card__video")); });
        }
      }, { threshold: 0.05 });
      playbackObserver.observe(row);
    }

    function hasAgeCookie() {
      return document.cookie.split(";").some(function (c) {
        return c.trim().indexOf("mwah_ageok=1") === 0;
      });
    }
    if (hasAgeCookie()) armMediaObservers();
    else document.addEventListener("mwah:age-accepted", armMediaObservers, { once: true });

    // Start on the first original product. Repeated laps already provide
    // a neighboring card on both sides, including before product one.
    var initialized = false;
    function initialPaint() {
      // rAF defers the measurement to the next paint frame so layout
      // is fully settled before we query offsetLeft (mobile Safari
      // sometimes reports stale offsets immediately after `load`).
      requestAnimationFrame(function () {
        if (initialized) return;
        initialized = true;
        var rowRect = row.getBoundingClientRect();
        var startIdx = total > 1 ? total : 0;
        row.scrollTo({ left: cards[startIdx].offsetLeft - (rowRect.width / 2) + (cards[startIdx].offsetWidth / 2), behavior: "instant" });
        updateFocal();
      });
    }
    if (document.readyState === "complete") {
      initialPaint();
    } else {
      window.addEventListener("load", initialPaint, { once: true });
    }
    // Do not wait on unrelated page media before positioning the carousel.
    // The load event must not reset a selection made after this fallback.
    setTimeout(initialPaint, 250);

    // rAF-throttle: mobile browsers fire resize on URL-bar hide/show so the
    // raw handler can run many times per scroll gesture.
    var resizePending = false;
    window.addEventListener("resize", function () {
      if (resizePending) return;
      resizePending = true;
      window.requestAnimationFrame(function () {
        if (focalIdx >= 0 && cards[focalIdx]) scrollCardToCenter(cards[focalIdx]);
        updateFocal();
        resizePending = false;
      });
    });
  }

  function initSearchPill() {
    // Selectors match the Figma-ported markup (op-search-pill__*). The stub
    // just logs — real locator wire-up lands in the storeLocatorFeed PR.
    var input = MW.$(".op-search-pill__input");
    var gps = MW.$(".op-search-pill__gps");
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          console.log("[home] search submit:", input.value);
        }
      });
    }
    if (gps) {
      gps.addEventListener("click", function () {
        console.log("[home] GPS button clicked (stub)");
      });
    }
  }

  function init() {
    try { initProductCoverflow(); } catch (e) { console.error("[home] product coverflow init failed", e); }
    try { initSearchPill(); } catch (e) { console.error("[home] search pill init failed", e); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
