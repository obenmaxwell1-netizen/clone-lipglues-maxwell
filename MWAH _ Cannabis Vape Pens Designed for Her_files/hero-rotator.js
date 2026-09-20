(function () {
  "use strict";

  var root = document.querySelector("[data-hero-rotator]");
  if (!root) return;

  var viewport = root.querySelector(".sm-hero__viewport");
  var slides = [].slice.call(root.querySelectorAll(".sm-hero__slide"));
  var playback = root.querySelector("[data-hero-playback]");
  var dots = [].slice.call(root.querySelectorAll(".sm-hero__dot"));
  if (!viewport || slides.length < 2 || slides.length !== dots.length) return;

  var AUTO_DELAY = 6000;
  var LOAD_RETRY_DELAY = 250;
  var SCROLL_SETTLE_DELAY = 140;
  var activeIndex = 0;
  var timer = null;
  var scrollTimer = null;
  var hovered = false;
  var focused = false;
  var campaignVideoOpen = false;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var pausedByUser = reduceMotion.matches;
  var PAUSE_KEY = "mwah_hero_paused";
  try {
    pausedByUser = pausedByUser || window.sessionStorage.getItem(PAUSE_KEY) === "true";
  } catch (err) {
    console.error("Hero playback preference could not be read", err);
  }

  function syncPlayback() {
    if (!playback) return;
    playback.hidden = reduceMotion.matches;
    var label = pausedByUser ? "Play slideshow" : "Pause slideshow";
    playback.setAttribute("aria-label", label);
    playback.setAttribute("title", label);
    playback.setAttribute("data-paused", String(pausedByUser));
  }

  function stopTimer() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = null;
  }

  function isReady(index) {
    var image = slides[index].querySelector("img");
    return !image || (image.complete && image.naturalWidth > 0);
  }

  function canAdvance() {
    return !pausedByUser && !reduceMotion.matches && !hovered && !focused && !campaignVideoOpen && !document.hidden;
  }

  function syncState(index) {
    activeIndex = index;
    slides.forEach(function (slide, slideIndex) {
      var active = slideIndex === index;
      slide.classList.toggle("is-active", active);
      if (active) {
        slide.removeAttribute("inert");
        slide.removeAttribute("aria-hidden");
      } else {
        slide.setAttribute("inert", "");
        slide.setAttribute("aria-hidden", "true");
      }
    });
    dots.forEach(function (dot, dotIndex) {
      var active = dotIndex === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function closestSlideIndex() {
    var bestIndex = 0;
    var bestDistance = Infinity;
    slides.forEach(function (slide, index) {
      var distance = Math.abs(slide.offsetLeft - viewport.scrollLeft);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function schedule() {
    stopTimer();
    if (!canAdvance()) return;
    timer = window.setTimeout(function () {
      timer = null;
      attemptAdvance((activeIndex + 1) % slides.length);
    }, AUTO_DELAY);
  }

  function selectSlide(index, shouldScroll) {
    if (index < 0 || index >= slides.length) return;
    syncState(index);
    if (shouldScroll && viewport.scrollTo) {
      viewport.scrollTo({
        left: slides[index].offsetLeft,
        behavior: reduceMotion.matches ? "auto" : "smooth",
      });
    }
    schedule();
  }

  function attemptAdvance(index) {
    if (!canAdvance()) return;
    if (!isReady(index)) {
      timer = window.setTimeout(function () {
        timer = null;
        attemptAdvance(index);
      }, LOAD_RETRY_DELAY);
      return;
    }
    selectSlide(index, true);
  }

  if (playback) {
    playback.addEventListener("click", function () {
      pausedByUser = !pausedByUser;
      try {
        window.sessionStorage.setItem(PAUSE_KEY, String(pausedByUser));
      } catch (err) {
        console.error("Hero playback preference could not be saved", err);
      }
      syncPlayback();
      schedule();
    });
  }

  dots.forEach(function (dot, index) {
    dot.addEventListener("click", function () {
      selectSlide(index, true);
    });
  });

  viewport.addEventListener("scroll", function () {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(function () {
      scrollTimer = null;
      syncState(closestSlideIndex());
      schedule();
    }, SCROLL_SETTLE_DELAY);
  }, { passive: true });

  root.addEventListener("mouseenter", function () {
    hovered = true;
    stopTimer();
  });
  root.addEventListener("mouseleave", function () {
    hovered = false;
    schedule();
  });
  root.addEventListener("focusin", function () {
    focused = true;
    stopTimer();
  });
  root.addEventListener("focusout", function () {
    window.requestAnimationFrame(function () {
      focused = Boolean(document.activeElement && root.contains && root.contains(document.activeElement));
      schedule();
    });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopTimer();
    else schedule();
  });
  document.addEventListener("mwah:campaign-video-opened", function () {
    campaignVideoOpen = true;
    stopTimer();
  });
  document.addEventListener("mwah:campaign-video-closed", function () {
    campaignVideoOpen = false;
    schedule();
  });
  if (typeof reduceMotion.addEventListener === "function") {
    reduceMotion.addEventListener("change", function () {
      if (reduceMotion.matches) pausedByUser = true;
      syncPlayback();
      schedule();
    });
  }

  syncPlayback();
  syncState(0);
  schedule();
})();
