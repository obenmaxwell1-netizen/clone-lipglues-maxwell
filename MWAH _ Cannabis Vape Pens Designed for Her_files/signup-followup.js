/* =========================================================================
   signup-followup.js — Everything that happens AFTER a successful
   newsletter signup: the social follow row, the A/B bucket that decides
   whether the discovery survey is shown, and the write that sends a
   survey answer to the `signupSurveys` collection on gimmemwah-consumer.

   email-signup.js owns the form → signupWrite path and calls into here to
   build and bind the confirmation card's extras. Keeping the two apart
   holds both files under the 500-line soft cap and keeps the signup POST
   path readable.

   The follow links deliberately open in a new tab. A same-tab navigation
   would unload the page, and the popup cannot come back: signup-popup.js
   suppresses it for the rest of the session once seen, and permanently
   once subscribed. See agent_docs/analytics-events.md for the
   social_link_click contract (analytics.js binds it off the data
   attributes, so no explicit trackEvent call is needed here).
   ========================================================================= */
(function () {
  "use strict";

  var MW = window.MW = window.MW || {};

  var SURVEY_ENDPOINT = "https://us-central1-gimmemwah-consumer.cloudfunctions.net/surveyWrite";
  var SURVEY_BUCKET_KEY = "mwah_signup_survey_bucket";

  var FOLLOW_ACCOUNTS = [
    {
      platform: "instagram",
      label: "INSTAGRAM",
      name: "Instagram",
      href: "https://instagram.com/gimmemwah",
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>' +
        '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>' +
        '<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>' +
        "</svg>",
    },
    {
      platform: "tiktok",
      label: "TIKTOK",
      name: "TikTok",
      href: "https://www.tiktok.com/@gimmemwah",
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">' +
        '<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.51a8.16 8.16 0 0 0 4.77 1.52V6.59a4.85 4.85 0 0 1-1.84.1Z"/>' +
        "</svg>",
    },
    {
      platform: "x",
      label: "X",
      name: "X",
      href: "https://x.com/gimmemwah",
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
        '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z"/>' +
        "</svg>",
    },
  ];

  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" ' +
    'stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>';

  // Bucket A = follow row only. Bucket B = follow row + discovery survey.
  // Assigned on first confirmation render (never on page load, so visitors
  // who don't subscribe stay out of the denominator) and remembered so a
  // repeat visitor keeps the same arm. Storage throws in private mode —
  // failing to the control arm keeps a broken read from inflating B.
  function surveyBucket() {
    try {
      var stored = window.localStorage.getItem(SURVEY_BUCKET_KEY);
      if (stored === "a" || stored === "b") return stored;
      var assigned = Math.random() < 0.5 ? "a" : "b";
      window.localStorage.setItem(SURVEY_BUCKET_KEY, assigned);
      return assigned;
    } catch (err) {
      console.error("signup survey bucket unavailable; using control", err);
      return "a";
    }
  }

  // `location` distinguishes the two hosts in analytics — a follow earned
  // after subscribing and one earned off a dismissal are different
  // outcomes, and lumping them together would hide which surface works.
  function followRowHTML(options) {
    var location = (options && options.location) || "signup_popup";
    // Set on this element rather than a wrapper. .op-signup__confirm is a
    // row flex container, so an extra <div> around this row becomes a
    // third flex item next to the tick and the copy, shrinks to its
    // content instead of filling, and leaves the tiles stranded against
    // the left edge with the rest of the card empty. Putting the
    // attribute here keeps the DOM exactly the shape the CSS was written
    // against — including
    // `.op-signup__confirm--inline > .op-signup__follow:first-child`,
    // which a wrapper silently stops matching.
    var ariaLive = (options && options.ariaLive)
      ? ' aria-live="' + options.ariaLive + '"'
      : "";
    var links = FOLLOW_ACCOUNTS.map(function (account) {
      return '<a class="op-signup__follow-link" href="' + account.href + '"' +
        ' target="_blank" rel="noopener noreferrer"' +
        ' data-follow-platform="' + account.platform + '"' +
        ' data-analytics-platform="' + account.platform + '"' +
        ' data-analytics-location="' + location + '"' +
        ' aria-label="Follow MWAH on ' + account.name + ' (opens in new tab)">' +
        account.icon +
        "<span>" + account.label + "</span>" +
        '<span class="op-signup__follow-check" aria-hidden="true">' + CHECK_SVG + "</span>" +
        "</a>";
    }).join("");

    // No aria-live here. This block is rendered into two different hosts,
    // and the live-region decision belongs to each of them: the
    // confirmation card wraps it in a polite region, and so does the
    // dismiss offer. Hardcoding aria-live="off" — which was written to
    // stop the ✓ re-announcing the confirmation card — silenced the
    // dismiss offer entirely. The ✓ is kept quiet by the tick element
    // being aria-hidden and the progress note owning its own role=status.
    //
    // One voice for both surfaces. Copy locked with Kyle 2026-09-19.
    return '<div class="op-signup__follow" data-signup-follow' + ariaLive + ">" +
      '<p class="op-signup__follow-eyebrow">FOR ALL THE BADDIES</p>' +
      '<h2 class="op-signup__follow-title">Follow us on our socials.</h2>' +
      '<div class="op-signup__follow-list">' + links + "</div>" +
      "</div>";
  }

  // Built as a node rather than a markup string: the only variable part is
  // an integer we computed, and textContent keeps it that way by
  // construction instead of by inspection.
  function createNote(count) {
    var remaining = FOLLOW_ACCOUNTS.length - count;
    var tail = remaining === 0
      ? "That's all three."
      : (remaining === 1 ? "One to go." : String(remaining) + " to go.");

    var note = document.createElement("p");
    note.className = "op-signup__follow-note";
    note.setAttribute("role", "status");

    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "12");
    icon.setAttribute("height", "12");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "3");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m5 13 4 4L19 7");
    icon.appendChild(path);

    note.appendChild(icon);
    note.appendChild(document.createTextNode(tail));
    return note;
  }

  // A tap opens a new tab, so the popup is still mounted when the visitor
  // comes back. Confirming on visibilitychange (rather than on click)
  // means the ✓ reflects "you actually went there", and a cancelled tab
  // switch doesn't leave a false positive.
  function bindFollowRow(container) {
    var row = container && container.querySelector
      ? container.querySelector("[data-signup-follow]")
      : null;
    if (!row) return;

    var links = row.querySelectorAll("[data-follow-platform]");
    var opened = {};
    var openedCount = 0;
    var pending = null;

    function confirmPending() {
      if (document.visibilityState !== "visible" || !pending) return;
      var link = pending;
      pending = null;
      var platform = link.getAttribute("data-follow-platform") || "";
      if (opened[platform]) return;
      opened[platform] = true;
      openedCount += 1;
      link.classList.add("is-opened");

      var existing = row.querySelector(".op-signup__follow-note");
      if (existing) existing.remove();
      row.insertBefore(createNote(openedCount), row.firstChild);
    }

    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (event) {
        // No stopPropagation here. It was added to "keep the click off the
        // popup backdrop", but the backdrop is a sibling of the dialog
        // (index.html:497 vs :498), not an ancestor — a tile click never
        // propagated through it, so there was nothing to stop and the
        // call only risked muting listeners further up.
        pending = event.currentTarget;
      });
    }

    document.addEventListener("visibilitychange", confirmPending);
    window.addEventListener("focus", confirmPending);
  }

  // Fire-and-forget: the answer is a nice-to-have, and the visitor has
  // already seen "Thanks." by the time this resolves. Never surface a
  // failure — but never swallow it silently either.
  function submitSurveyAnswer(answer, token, bucket) {
    if (!token) return;
    var body = JSON.stringify({
      token: String(token),
      answer: String(answer),
      variant: String(bucket || ""),
    });

    function post(headers) {
      fetch(SURVEY_ENDPOINT, {
        method: "POST",
        headers: headers,
        body: body,
        keepalive: true,
      }).then(function (resp) {
        if (!resp.ok) console.error("survey answer rejected", resp.status);
      }).catch(function (err) {
        console.error("survey answer write failed", err);
      });
    }

    var headers = { "Content-Type": "application/json" };
    if (MW && typeof MW.getAppCheckToken === "function") {
      MW.getAppCheckToken().then(function (appCheckToken) {
        if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
        post(headers);
      }).catch(function (err) {
        console.error("survey App Check token unavailable", err);
        post(headers);
      });
      return;
    }
    post(headers);
  }

  MW.signupFollowRowHTML = followRowHTML;
  MW.signupSurveyBucket = surveyBucket;
  MW.bindSignupFollowRow = bindFollowRow;
  MW.submitSignupSurveyAnswer = submitSurveyAnswer;
})();
