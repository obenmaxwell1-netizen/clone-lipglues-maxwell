/* Click-only Strawberry Matcha campaign film dialog. */
(function () {
  "use strict";

  var modal = document.getElementById("campaignVideoModal");
  if (!modal) return;

  var dialog = modal.querySelector(".campaign-video__dialog");
  var closeButton = modal.querySelector("[data-campaign-video-close]");
  var backdrop = modal.querySelector("[data-campaign-video-backdrop]");
  var video = modal.querySelector("video");
  var status = modal.querySelector("[data-campaign-video-status]");
  var triggers = document.querySelectorAll("[data-campaign-video-open]");
  if (!dialog || !closeButton || !video || !triggers.length) return;

  var lastFocus = null;
  var previousBodyOverflow = "";
  var inertTargets = [];
  var mediaPrepared = false;

  function setStatus(message) {
    if (status) status.textContent = message || "";
  }

  function prepareMedia() {
    video.removeAttribute("autoplay");
    if (mediaPrepared) return;
    var src = video.getAttribute("data-src");
    var poster = video.getAttribute("data-poster");
    if (src) video.setAttribute("src", src);
    if (poster) video.setAttribute("poster", poster);
    mediaPrepared = true;
    video.load();
  }

  function setPageBehindModalInert(on) {
    var children = Array.prototype.slice.call(document.body.children || []);
    if (on) {
      inertTargets = [];
      children.forEach(function (child) {
        if (child === modal || child.tagName === "SCRIPT" || child.tagName === "NOSCRIPT") return;
        inertTargets.push({
          el: child,
          inert: child.hasAttribute("inert"),
          ariaHidden: child.getAttribute("aria-hidden"),
        });
        child.setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
      });
      return;
    }
    inertTargets.forEach(function (entry) {
      if (!entry.inert) entry.el.removeAttribute("inert");
      if (entry.ariaHidden == null) entry.el.removeAttribute("aria-hidden");
      else entry.el.setAttribute("aria-hidden", entry.ariaHidden);
    });
    inertTargets = [];
  }

  function openModal(event) {
    if (!modal.hasAttribute("hidden")) return;
    lastFocus = event && event.currentTarget ? event.currentTarget : document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    prepareMedia();
    setStatus("");
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    setPageBehindModalInert(true);
    document.dispatchEvent(new CustomEvent("mwah:campaign-video-opened"));
    window.requestAnimationFrame(function () {
      modal.classList.add("is-open");
      closeButton.focus();
    });
    var playRequest = video.play();
    if (playRequest && typeof playRequest.catch === "function") {
      playRequest.catch(function () {
        setStatus("Press play to watch the video.");
      });
    }
  }

  function closeModal() {
    if (modal.hasAttribute("hidden")) return;
    video.pause();
    try {
      video.currentTime = 0;
    } catch (err) {
      console.error("campaign video could not reset", err);
    }
    modal.classList.remove("is-open");
    modal.setAttribute("hidden", "");
    setPageBehindModalInert(false);
    document.body.style.overflow = previousBodyOverflow;
    setStatus("");
    document.dispatchEvent(new CustomEvent("mwah:campaign-video-closed"));
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function onKeydown(event) {
    if (modal.hasAttribute("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    var nodes = dialog.querySelectorAll('button, video, [href], [tabindex]:not([tabindex="-1"])');
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

  for (var i = 0; i < triggers.length; i++) {
    triggers[i].addEventListener("click", openModal);
  }
  closeButton.addEventListener("click", closeModal);
  if (backdrop) backdrop.addEventListener("click", closeModal);
  video.addEventListener("error", function () {
    setStatus("The video could not load. Please try again.");
  });
  document.addEventListener("keydown", onKeydown);
})();
