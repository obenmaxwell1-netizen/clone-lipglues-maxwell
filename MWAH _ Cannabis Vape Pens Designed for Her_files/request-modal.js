/* =========================================================================
   request-modal.js — "Request MWAH at your shop" (Find Us).

   A persistent CTA in the Find Us section opens a modal picker over the
   stocked WA + CA feeds UNIONED with the CRM storeDirectoryFeed (the full WA
   licensed book). Known-store picks show an "already stocks MWAH"
   affirmation; directory picks are the ones actually worth requesting. A
   manual fallback still covers anything missing. No email / no PII captured.

   Pure helpers (buildPickerIndex / filterPickerIndex) are exposed on
   window.MW for unit tests; init() is null-safe so the file loads headless.
   ========================================================================= */
(function () {
  "use strict";

  var WA_FEED_URL = "https://storelocatorfeed-uo6346avea-uc.a.run.app";
  var CA_FEED_URL = "https://us-central1-gimmemwah-website.cloudfunctions.net/nabisStoreFeed";
  // Manual leads accept any US state so out-of-market demand is captured as
  // expansion signal. HOME_MARKETS lists enabled website markets. It
  // drives the confirmation copy, because we cannot promise to nudge a shop
  // for a market whose availability is not currently listed.
  var US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY";
  var HOME_MARKETS = "WA";
  // Shoppers type a state name into a datalist; accept the name or the code.
  var STATE_NAMES = "AL:Alabama,AK:Alaska,AZ:Arizona,AR:Arkansas,CA:California,CO:Colorado,CT:Connecticut,DE:Delaware,DC:District of Columbia,FL:Florida,GA:Georgia,HI:Hawaii,ID:Idaho,IL:Illinois,IN:Indiana,IA:Iowa,KS:Kansas,KY:Kentucky,LA:Louisiana,ME:Maine,MD:Maryland,MA:Massachusetts,MI:Michigan,MN:Minnesota,MS:Mississippi,MO:Missouri,MT:Montana,NE:Nebraska,NV:Nevada,NH:New Hampshire,NJ:New Jersey,NM:New Mexico,NY:New York,NC:North Carolina,ND:North Dakota,OH:Ohio,OK:Oklahoma,OR:Oregon,PA:Pennsylvania,RI:Rhode Island,SC:South Carolina,SD:South Dakota,TN:Tennessee,TX:Texas,UT:Utah,VT:Vermont,VA:Virginia,WA:Washington,WV:West Virginia,WI:Wisconsin,WY:Wyoming";
  var stateByName = null;
  var MICRO_DEFAULT = "We'll pass this to our team and nudge the store.";
  // Full WA licensed book from the CRM — stores we do NOT stock. Without it
  // the picker only ever contained shops that already carry MWAH, so a
  // shopper could never find the shop they wanted to request.
  var DIRECTORY_URL = "https://us-central1-gimmemwah-crm.cloudfunctions.net/storeDirectoryFeed";
  // Below this the picker prompts instead of listing. With 600+ stores an
  // empty box would otherwise render an arbitrary alphabetical slice that
  // reads as a curated list. Tunable.
  var MIN_QUERY_CHARS = 2;
  var RESULT_CAP = 6;
  // Intake endpoint (gimmemwah-consumer).
  var ENDPOINT = "https://us-central1-gimmemwah-consumer.cloudfunctions.net/requestWrite";

  function escapeHTML(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---- Pure picker logic (unit-tested via vm sandbox) -------------------
  function cleanText(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  }

  function normalizeState(value) {
    var raw = cleanText(value);
    var code = raw.toUpperCase();
    if ((" " + US_STATES + " ").indexOf(" " + code + " ") !== -1) return code;
    if (!stateByName) {
      stateByName = {};
      STATE_NAMES.split(",").forEach(function (pair) {
        var bits = pair.split(":");
        stateByName[bits[1].toLowerCase()] = bits[0];
      });
    }
    return stateByName[raw.toLowerCase()] || "";
  }

  function stateLabel(code) {
    var wanted = cleanText(code).toUpperCase(), pairs = STATE_NAMES.split(","), i;
    for (i = 0; i < pairs.length; i++) {
      var bits = pairs[i].split(":");
      if (bits[0] === wanted) return bits[1];
    }
    return wanted;
  }

  function stateOptionsHTML() {
    return STATE_NAMES.split(",").map(function (pair) {
      var name = pair.split(":")[1];
      return '<option value="' + escapeHTML(name) + '"></option>';
    }).join("");
  }

  function isHomeMarket(code) {
    if (cleanText(code).toUpperCase() === "CA") return window.MW.californiaAvailabilityEnabled === true;
    return (" " + HOME_MARKETS + " ").indexOf(" " + cleanText(code).toUpperCase() + " ") !== -1;
  }

  function keyPart(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function publicFieldKey(store, prefix, fallbackIndex) {
    var seed = [store && store.name, store && store.address, store && store.city,
      store && store.zip, store && store.lat, store && store.lng].join("|");
    var hash = 5381;
    for (var i = 0; i < seed.length; i++) hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    return prefix + ":" + (seed === "|||||" ? fallbackIndex : (hash >>> 0).toString(36));
  }

  function isFeedStoreVisible(store, market) {
    if (!store || store.isDeleted === true || store.isRetailLocation === false) return false;
    if (cleanText(store.status).toLowerCase() === "closed") return false;
    if (market === "CA") {
      if (window.MW.californiaAvailabilityEnabled !== true) return false;
      var availability = cleanText(store.availabilityStatus).toLowerCase();
      if (availability && availability !== "sold-here") return false;
    }
    return true;
  }

  function feedStore(store, market, index, stocked) {
    if (!isFeedStoreVisible(store, market)) return null;
    // Join on id, never on licence. id is the immutable CRM doc id and is the
    // only field both WA feeds share; storeLocatorFeed emits no licence at
    // all, and 10 stores that renewed in place have a licence that differs
    // from their id. Keying on licence would list those shops twice — once
    // stocked, once not.
    var id = market === "WA" && store.id ? cleanText(store.id) : "";
    var key = id ? "wa:" + id : publicFieldKey(store, market.toLowerCase(), index);
    // Submit the currently displayed licence when the feed carries one.
    var license = market === "WA" ? (cleanText(store.license) || id) : "";
    return {
      key: key,
      license: license,
      name: cleanText(store.name),
      address: cleanText(store.address),
      city: cleanText(store.city),
      market: market,
      zip: cleanText(store.zip).slice(0, 10),
      stocked: stocked !== false,
      manual: false,
    };
  }

  function buildPickerIndex(waStores, caStores, directoryStores) {
    // Stocked feeds first so a store we already carry wins the key and shows
    // the "already stocks MWAH" affirmation; the directory fills in the rest.
    var byKey = {}, out = [], sources = [
      { stores: waStores || [], market: "WA", stocked: true },
      { stores: caStores || [], market: "CA", stocked: true },
      { stores: directoryStores || [], market: "WA", stocked: false },
    ];
    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      var source = sources[sourceIndex];
      for (var i = 0; i < source.stores.length; i++) {
        var record = feedStore(source.stores[i], source.market, i, source.stocked);
        if (!record || !record.name || byKey[record.key]) continue;
        byKey[record.key] = true;
        out.push(record);
      }
    }
    return out;
  }

  function manualStoreFromFields(fields) {
    fields = fields || {};
    var name = cleanText(fields.name), city = cleanText(fields.city);
    var market = normalizeState(fields.market);
    var zip = cleanText(fields.zip);
    if (name.length < 2 || !keyPart(name) || city.length < 2 || !keyPart(city)) return null;
    if (!market) return null;
    // ZIP is optional — a shopper naming a shop they want MWAH in often does
    // not know it, and blocking on it lost the request. Still validated when
    // supplied so a half-typed ZIP is not stored as fact.
    if (zip && !/^\d{5}$/.test(zip)) return null;
    return {
      // Keyed on city rather than ZIP: ZIP typos used to split one store into
      // separate requests, and there is no ZIP to key on now.
      key: "manual:" + market + ":" + keyPart(name) + ":" + keyPart(city),
      license: "",
      name: name,
      address: cleanText(fields.address),
      city: city,
      market: market,
      zip: zip,
      stocked: false,
      manual: true,
      homeMarket: isHomeMarket(market),
    };
  }

  // ~40 directory rows have no ZIP and address is optional on manual leads,
  // so build the line from the parts that are actually present.
  function storeMetaLine(store) {
    store = store || {};
    var locality = [cleanText(store.city), cleanText(store.market), cleanText(store.zip)]
      .filter(Boolean).join(" ");
    return [cleanText(store.address), locality].filter(Boolean).join(" \u00b7 ");
  }

  function filterPickerIndex(index, q, limit) {
    q = String(q || "").trim().toLowerCase();
    var cap = limit || 6, stocked = [], requestable = [];
    // Stop only once BOTH groups can fill the cap. Bounding on the combined
    // total instead would let a broad query ("cannabis") fill entirely with
    // stocked matches before the scan ever reached the directory rows, which
    // is the exact failure this balance exists to prevent.
    for (var i = 0; i < index.length && (stocked.length < cap || requestable.length < cap); i++) {
      var s = index[i];
      var hay = (s.name + " " + s.address + " " + s.city + " " + s.market + " " + s.zip).toLowerCase();
      if (hay.indexOf(q) === -1) continue;
      (s.stocked ? stocked : requestable).push(s);
    }
    // The index is stocked-first, so a broad query ("green") would otherwise
    // fill every slot with shops that already carry MWAH — leaving a shopper
    // unable to see the one they came to request. Reserve up to half the
    // slots for requestable shops when there are any.
    var reserved = Math.min(requestable.length, Math.floor(cap / 2));
    var out = stocked.slice(0, Math.min(stocked.length, cap - reserved));
    return out.concat(requestable.slice(0, cap - out.length));
  }

  function countPickerMatches(index, q) {
    q = String(q || "").trim().toLowerCase();
    var n = 0;
    for (var i = 0; i < index.length; i++) {
      var s = index[i];
      var hay = (s.name + " " + s.address + " " + s.city + " " + s.market + " " + s.zip).toLowerCase();
      if (hay.indexOf(q) !== -1) n++;
    }
    return n;
  }

  // What the results area should show. Kept pure so the prompt / list / empty
  // decision and the truncation total are unit-tested rather than eyeballed.
  function pickerView(index, q, limit) {
    var query = String(q || "").trim();
    var cap = limit || RESULT_CAP;
    if (query.length < MIN_QUERY_CHARS) return { mode: "prompt", matches: [], total: 0 };
    var matches = filterPickerIndex(index, query, cap);
    if (!matches.length) return { mode: "empty", matches: [], total: 0 };
    return { mode: "list", matches: matches, total: countPickerMatches(index, query) };
  }

  // ---- DOM state ---------------------------------------------------------
  var index = null, picked = null, lastFocus = null, loading = false, feedFailures = 0;
  var modalInertTargets = [];

  function $(sel) { return document.querySelector(sel); }
  function trackEvent(name, payload) {
    if (window.MW && typeof window.MW.trackEvent === "function") {
      try { window.MW.trackEvent(name, payload || {}); } catch (e) { /* ignore */ }
    }
  }

  function openModal() {
    var scrim = $("#reqScrim");
    if (!scrim) return;
    lastFocus = document.activeElement;
    scrim.classList.add("is-open");
    document.body.style.overflow = "hidden";
    setPageBehindModalInert(scrim, true);
    showForm();
    clearPick();
    trackEvent("store_request_open", {});
    if (window.MW && typeof window.MW.prepareAppCheck === "function") {
      window.MW.prepareAppCheck();
    }
    ensureIndex();
    var input = $("#reqSearch");
    if (input) setTimeout(function () { input.focus(); }, 60);
  }

  function closeModal() {
    var scrim = $("#reqScrim");
    if (!scrim) return;
    scrim.classList.remove("is-open");
    document.body.style.overflow = "";
    setPageBehindModalInert(scrim, false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setPageBehindModalInert(scrim, on) {
    var children = Array.prototype.slice.call(document.body.children || []);
    if (on) {
      modalInertTargets = [];
      children.forEach(function (child) {
        if (child === scrim || child.tagName === "SCRIPT" || child.tagName === "NOSCRIPT") return;
        modalInertTargets.push({
          el: child,
          inert: child.hasAttribute("inert"),
          ariaHidden: child.getAttribute("aria-hidden"),
        });
        child.setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
      });
      return;
    }
    modalInertTargets.forEach(function (entry) {
      if (!entry.inert) entry.el.removeAttribute("inert");
      if (entry.ariaHidden == null) entry.el.removeAttribute("aria-hidden");
      else entry.el.setAttribute("aria-hidden", entry.ariaHidden);
    });
    modalInertTargets = [];
  }

  function showForm() {
    var f = $("#reqForm"), s = $("#reqSuccess");
    if (f) f.style.display = "";
    if (s) s.classList.remove("is-shown");
  }

  function ensureIndex() {
    if (index) { renderResults(""); return; }
    if (loading) return;
    loading = true;
    Promise.allSettled([fetchFeed(WA_FEED_URL), window.MW.californiaAvailabilityEnabled === true ? fetchFeed(CA_FEED_URL) : Promise.resolve([]), fetchFeed(DIRECTORY_URL)]).then(function (res) {
      feedFailures = 0;
      var waStores = res[0].status === "fulfilled" ? res[0].value : [];
      var caStores = res[1].status === "fulfilled" ? res[1].value : [];
      var directoryStores = res[2].status === "fulfilled" ? res[2].value : [];
      if (res[0].status === "rejected") { feedFailures++; console.error("request-modal WA feed load failed", res[0].reason); }
      if (res[1].status === "rejected") { feedFailures++; console.error("request-modal CA feed load failed", res[1].reason); }
      if (res[2].status === "rejected") { feedFailures++; console.error("request-modal directory feed load failed", res[2].reason); }
      index = buildPickerIndex(waStores, caStores, directoryStores);
      loading = false;
      renderResults("");
      if (feedFailures) setStatus("Some known stores couldn't load. You can still add your shop.", false);
    }).catch(function (err) {
      loading = false;
      console.error("request-modal directory load failed", err);
      var list = $("#reqResults");
      if (list) list.innerHTML = '<div class="req-empty">Couldn\'t load dispensaries. Try again in a moment.</div>';
    });
  }

  function fetchFeed(url) {
    return fetch(url, { headers: { Accept: "application/json" }, referrerPolicy: "no-referrer" })
      .then(function (response) {
        if (!response.ok) throw new Error("Feed " + response.status);
        return response.json();
      })
      .then(function (json) { return json && Array.isArray(json.stores) ? json.stores : (Array.isArray(json) ? json : []); });
  }

  function renderResults(q) {
    var list = $("#reqResults");
    if (!list) return;
    if (!index) { list.innerHTML = '<div class="req-empty">Loading dispensaries\u2026</div>'; return; }
    var state = pickerView(index, q, RESULT_CAP);
    if (state.mode === "prompt") {
      list.innerHTML = '<div class="req-empty">Start typing a dispensary name, city, or ZIP.</div>';
      return;
    }
    if (state.mode === "empty") {
      list.innerHTML = '<div class="req-empty">No known match. Add this shop below and we\'ll pass it to our team.</div>';
      return;
    }
    var matches = state.matches, html = "";
    for (var i = 0; i < matches.length; i++) {
      var s = matches[i];
      var pinCls = "req-opt__pin" + (s.stocked ? " is-stocked" : "");
      var badge = s.stocked ? '<span class="req-opt__badge">&#10003; ALREADY STOCKS MWAH</span>' : '';
      html += '<button type="button" class="req-opt" data-key="' + escapeHTML(s.key) + '">' +
        '<span class="' + pinCls + '"></span>' +
        '<span class="req-opt__text">' +
          '<span class="req-opt__name">' + escapeHTML(s.name) + '</span>' +
          '<span class="req-opt__meta">' + escapeHTML(storeMetaLine(s)) + '</span>' +
          badge +
        '</span></button>';
    }
    // Never truncate silently: a shopper who thinks their shop is missing
    // files a manual lead for a store already in the directory.
    if (state.total > matches.length) {
      html += '<p class="req-more">Showing ' + matches.length + ' of ' + state.total +
        ' \u2014 keep typing to narrow it down.</p>';
    }
    list.innerHTML = html;
    var opts = list.querySelectorAll(".req-opt");
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener("click", function (e) { pick(e.currentTarget.getAttribute("data-key")); });
    }
  }

  function findByKey(key) {
    for (var i = 0; i < index.length; i++) { if (index[i].key === key) return index[i]; }
    return null;
  }

  function pick(key) {
    if (!index) return;
    picked = findByKey(key);
    if (!picked) return;
    $("#reqSearchWrap").style.display = "none";
    $("#reqResults").style.display = "none";
    if ($("#reqManualOpen")) $("#reqManualOpen").hidden = true;
    $("#reqPickedName").textContent = picked.name;
    $("#reqPickedMeta").textContent = storeMetaLine(picked);
    $("#reqPicked").classList.add("is-shown");

    var pin = $("#reqPickedPin"), badge = $("#reqPickedBadge"), affirm = $("#reqAffirm"), btn = $("#reqSubmit"), micro = $("#reqMicro");
    if (picked.stocked) {
      pin.classList.add("is-stocked");
      badge.hidden = false;
      affirm.hidden = false;
      affirm.innerHTML = "Good news — <b>" + escapeHTML(picked.name) + "</b> already stocks MWAH. She's on the shelf there now.";
      btn.textContent = "Find it on the map →";
      btn.onclick = findOnMap;
      if (micro) micro.hidden = true;
      trackEvent("store_request_already_stocked", { zip: String(picked.zip || "").slice(0, 5) });
    } else {
      pin.classList.remove("is-stocked");
      badge.hidden = true;
      affirm.hidden = true;
      btn.textContent = "Request it";
      btn.onclick = submitRequest;
      if (micro) micro.hidden = false;
    }
    btn.disabled = false;
  }

  function findOnMap() {
    closeModal();
    if (picked && window.MW && typeof window.MW.locatorSetState === "function") {
      window.MW.locatorSetState(picked.market);
    }
    if (picked && window.MW && typeof window.MW.locatorSearch === "function") {
      window.MW.locatorSearch(String(picked.zip || ""));
    }
  }

  function manualFieldValues() {
    return {
      name: valueOf("#reqManualName"),
      address: valueOf("#reqManualAddress"),
      city: valueOf("#reqManualCity"),
      market: valueOf("#reqManualMarket"),
      zip: valueOf("#reqManualZip"),
    };
  }

  function valueOf(selector) {
    var el = $(selector);
    return el ? el.value : "";
  }

  function resetModalScroll() {
    var modal = $(".req-modal");
    if (modal) modal.scrollTop = 0;
  }

  function syncManualStore() {
    picked = manualStoreFromFields(manualFieldValues());
    var btn = $("#reqSubmit");
    if (btn) {
      btn.disabled = !picked;
      btn.textContent = "Request it";
      btn.onclick = submitRequest;
    }
    setManualMicro(picked);
  }

  // The pre-submit promise has to be as honest as the confirmation: outside
  // enabled website markets, record demand without promising availability.
  function setManualMicro(store) {
    var micro = $("#reqMicro");
    if (!micro) return;
    micro.textContent = store && store.homeMarket === false
      ? "We'll record your interest and pass it to our team."
      : MICRO_DEFAULT;
  }

  function openManualForm() {
    var search = $("#reqSearch"), manual = $("#reqManualFields");
    var name = $("#reqManualName");
    if ($("#reqSearchWrap")) $("#reqSearchWrap").style.display = "none";
    if ($("#reqResults")) $("#reqResults").style.display = "none";
    if ($("#reqManualOpen")) $("#reqManualOpen").hidden = true;
    if (manual) manual.hidden = false;
    if (name && !name.value) name.value = search ? search.value.trim() : "";
    picked = null;
    syncManualStore();
    resetModalScroll();
    setStatus(feedFailures ? "Some known stores couldn't load. You can still add your shop." : "", false);
    if (name) setTimeout(function () { name.focus(); }, 0);
  }

  function closeManualForm() {
    var manual = $("#reqManualFields"), search = $("#reqSearch");
    if (manual) manual.hidden = true;
    if ($("#reqSearchWrap")) $("#reqSearchWrap").style.display = "";
    if ($("#reqResults")) $("#reqResults").style.display = "";
    if ($("#reqManualOpen")) $("#reqManualOpen").hidden = false;
    picked = null;
    resetModalScroll();
    var btn = $("#reqSubmit"); if (btn) btn.disabled = true;
    setStatus(feedFailures ? "Some known stores couldn't load. You can still add your shop." : "", false);
    if (search) search.focus();
  }

  function clearPick() {
    picked = null;
    resetModalScroll();
    var sw = $("#reqSearchWrap"); if (sw) sw.style.display = "";
    var rs = $("#reqResults"); if (rs) rs.style.display = "";
    var pk = $("#reqPicked"); if (pk) pk.classList.remove("is-shown");
    var pin = $("#reqPickedPin"); if (pin) pin.classList.remove("is-stocked");
    var badge = $("#reqPickedBadge"); if (badge) badge.hidden = true;
    var affirm = $("#reqAffirm"); if (affirm) affirm.hidden = true;
    var manual = $("#reqManualFields"); if (manual) manual.hidden = true;
    var manualOpen = $("#reqManualOpen"); if (manualOpen) manualOpen.hidden = false;
    ["#reqManualName", "#reqManualAddress", "#reqManualCity", "#reqManualMarket", "#reqManualZip"].forEach(function (selector) {
      var field = $(selector); if (field) field.value = "";
    });
    var btn = $("#reqSubmit"); if (btn) { btn.disabled = true; btn.textContent = "Request it"; btn.onclick = submitRequest; }
    var micro = $("#reqMicro"); if (micro) { micro.hidden = false; micro.textContent = MICRO_DEFAULT; }
    var input = $("#reqSearch"); if (input) input.value = "";
    setStatus(feedFailures ? "Some known stores couldn't load. You can still add your shop." : "", false);
  }

  function setStatus(msg, isErr) {
    var el = $("#reqStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--ink)" : "var(--text-mid)";
  }

  async function submitRequest() {
    if (!picked || picked.stocked) return;
    var btn = $("#reqSubmit"), hpEl = $("#reqHp");
    if (btn) btn.disabled = true;
    setStatus("Sending…", false);

    var appCheckToken = null;
    if (window.MW && typeof window.MW.getAppCheckToken === "function") {
      try { appCheckToken = await window.MW.getAppCheckToken(); } catch (e) { /* soft, see app-check.js */ }
    }
    var headers = { "Content-Type": "application/json" };
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

    try {
      var resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          store_license: picked.license,
          store_name: picked.name,
          store_address: picked.address,
          store_city: picked.city,
          store_market: picked.market,
          store_zip: picked.zip,
          hp: hpEl ? hpEl.value : ""
        })
      });
      if (resp.status === 429) {
        trackEvent("flow_error", { flow: "store_request", reason: "rate_limited" });
        setStatus("Too many requests — try again in a minute.", true);
        if (btn) btn.disabled = false;
        return;
      }
      if (resp.status === 401) {
        trackEvent("flow_error", { flow: "store_request", reason: "security_check" });
        setStatus("Security check failed. Refresh and try again.", true);
        if (btn) btn.disabled = false;
        return;
      }
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      trackEvent("store_request_submit", { zip: String(picked.zip || "").slice(0, 5) });
      showSuccess();
    } catch (err) {
      console.error("store request submit failed", err);
      trackEvent("flow_error", { flow: "store_request", reason: "network" });
      setStatus("Something went wrong. Try again?", true);
      if (btn) btn.disabled = false;
    }
  }

  function showSuccess() {
    setStatus("", false);
    var f = $("#reqForm"); if (f) f.style.display = "none";
    var s = $("#reqSuccess"); if (s) s.classList.add("is-shown");
    var sub = $("#reqSuccessSub");
    if (sub && picked) {
      // Keep disabled-market requests neutral about current or future availability.
      sub.innerHTML = picked.homeMarket === false
        ? "We've recorded your interest in MWAH at <b>" + escapeHTML(picked.name) + "</b>."
        : "We'll let our team know shoppers want MWAH at <b>" + escapeHTML(picked.name) + "</b>.";
    }
  }

  // ---- Focus trap + keys -------------------------------------------------
  function onKeydown(e) {
    var scrim = $("#reqScrim");
    if (!scrim || !scrim.classList.contains("is-open")) return;
    if (e.key === "Escape") { closeModal(); return; }
    if (e.key !== "Tab") return;
    var nodes = scrim.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].offsetParent !== null && !nodes[i].disabled) list.push(nodes[i]);
    }
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---- Init (null-safe) --------------------------------------------------
  function init() {
    var cta = $("#reqCtaBtn"); if (cta) cta.addEventListener("click", openModal);
    var closeBtn = $("#reqClose"); if (closeBtn) closeBtn.addEventListener("click", closeModal);
    var scrim = $("#reqScrim"); if (scrim) scrim.addEventListener("click", function (e) { if (e.target === scrim) closeModal(); });
    var change = $("#reqChange"); if (change) change.addEventListener("click", clearPick);
    var manualOpen = $("#reqManualOpen"); if (manualOpen) manualOpen.addEventListener("click", openManualForm);
    var manualBack = $("#reqManualBack"); if (manualBack) manualBack.addEventListener("click", closeManualForm);
    ["#reqManualName", "#reqManualAddress", "#reqManualCity", "#reqManualZip"].forEach(function (selector) {
      var field = $(selector); if (field) field.addEventListener("input", syncManualStore);
    });
    var manualMarket = $("#reqManualMarket");
    if (manualMarket) {
      manualMarket.addEventListener("input", syncManualStore);
      manualMarket.addEventListener("change", syncManualStore);
    }
    var stateList = $("#reqStateList");
    if (stateList && !stateList.children.length) stateList.innerHTML = stateOptionsHTML();
    var done = $("#reqDone"); if (done) done.addEventListener("click", closeModal);
    var search = $("#reqSearch"); if (search) search.addEventListener("input", function () { renderResults(search.value); });
    var submit = $("#reqSubmit"); if (submit) submit.onclick = submitRequest;
    document.addEventListener("keydown", onKeydown);
  }

  // Public hooks for tests (pure functions only).
  window.MW = window.MW || {};
  window.MW.requestPickerBuild = buildPickerIndex;
  window.MW.requestPickerFilter = filterPickerIndex;
  window.MW.requestManualStore = manualStoreFromFields;
  window.MW.requestNormalizeState = normalizeState;
  window.MW.requestStoreMeta = storeMetaLine;
  window.MW.requestPickerView = pickerView;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
