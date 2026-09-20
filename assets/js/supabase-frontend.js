/**
 * MWAH Frontend — Supabase Integration
 * Replaces all Firebase/MWAH Cloud Function calls
 * Project: cloned gluesweb (rrpxvsmggmgeilbynuij)
 */

(function () {
  'use strict';

  const SUPABASE_URL  = 'https://rrpxvsmggmgeilbynuij.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycHh2c21nZ21nZWlsYnludWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MzE0NDAsImV4cCI6MjEwNTUwNzQ0MH0.NLv7ylLgLN5xvW5FBiG66ChHCpdYGCpATTy5_Mqtfhw';

  // ── Lightweight fetch wrapper (no SDK needed for public reads) ────────
  async function sbFetch(path, opts = {}) {
    const url = SUPABASE_URL + path;
    const headers = Object.assign({
      'apikey':        SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type':  'application/json',
    }, opts.headers || {});
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || res.statusText);
    }
    return res.json();
  }

  async function sbPost(path, body, opts = {}) {
    return sbFetch(path, Object.assign({}, opts, {
      method: 'POST',
      headers: Object.assign({ 'Prefer': 'return=minimal' }, opts.headers || {}),
      body: JSON.stringify(body),
    }));
  }

  // ── Analytics tracker (replaces Firebase/Mixpanel) ────────────────
  function trackEvent(eventType, productSlug, page) {
    sbPost('/rest/v1/analytics_events', {
      event_type:   eventType,
      product_slug: productSlug || null,
      page:         page || window.location.pathname,
    }).catch(() => {}); // fire-and-forget, never block UI
  }

  // ── 1. EMAIL SIGNUP — replaces signupWrite Cloud Function ─────────
  function initSignups() {
    document.querySelectorAll('[data-signup]').forEach(form => {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        // Honeypot check
        const hp = form.querySelector('[name="hp"]');
        if (hp && hp.value.trim()) return;

        const emailInput = form.querySelector('[type="email"]');
        const statusEl   = form.querySelector('[data-signup-status]');
        const btn        = form.querySelector('[type="submit"]');
        const email      = emailInput ? emailInput.value.trim() : '';
        const source     = form.dataset.source || 'homepage';

        if (!email || !email.includes('@')) {
          if (statusEl) { statusEl.textContent = 'Please enter a valid email.'; statusEl.classList.remove('visually-hidden'); }
          return;
        }

        if (btn) btn.disabled = true;

        try {
          await sbPost('/rest/v1/subscribers', { email, source });
          if (statusEl) {
            statusEl.textContent = 'You\'re in! Check your inbox for updates.';
            statusEl.classList.remove('visually-hidden');
          }
          if (emailInput) emailInput.value = '';
          trackEvent('email_signup', null, source);
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = 'Something went wrong. Please try again.';
            statusEl.classList.remove('visually-hidden');
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  // ── 2. STORE LOCATOR — replaces Cloud Run feed ─────────────────────
  // The existing locator.js + locator-data.js remain for the map UI.
  // We override the store feed by injecting our Supabase data into
  // the same global that locator-data.js exports (window.MWAH_STORES).
  async function initStoreLocator() {
    try {
      const stores = await sbFetch('/rest/v1/stores?select=*&status=neq.inactive&order=city');
      if (!stores || !stores.length) return; // Keep existing hardcoded if empty

      // Map Supabase rows to the format locator.js expects
      window.MWAH_STORES = stores.map(s => ({
        id:      s.id,
        name:    s.store_name,
        address: [s.address, s.city, s.state].filter(Boolean).join(', '),
        city:    s.city || '',
        state:   s.state || '',
        lat:     parseFloat(s.lat) || 0,
        lng:     parseFloat(s.lng) || 0,
        phone:   s.phone || '',
        hours:   s.hours || '',
        status:  s.status || 'stocked',
      }));

      // Update the store count in the header copy
      const countEl = document.querySelector('.op-find-header__sub');
      if (countEl) {
        countEl.textContent = stores.length + ' dispensaries. Search your city or explore the map.';
      }

      trackEvent('page_view_locator');
    } catch (err) {
      // Silently fail — existing locator-data.js will still work
      console.warn('[MWAH] Store locator using fallback data:', err.message);
    }
  }

  // ── 3. STORE REQUEST MODAL — replaces requestWrite Cloud Function ──
  // The existing request-modal.js handles the UI.
  // We intercept the final submit and redirect to our Supabase table.
  function initRequestModal() {
    const reqSubmit = document.getElementById('reqSubmit');
    const reqStatus = document.getElementById('reqStatus');
    const reqSuccess = document.getElementById('reqSuccess');
    const reqForm   = document.getElementById('reqForm');
    const reqSuccessSub = document.getElementById('reqSuccessSub');

    if (!reqSubmit) return;

    reqSubmit.addEventListener('click', async function () {
      // Collect data from the request modal's state
      // (request-modal.js keeps selected store in reqPickedName)
      const storeName = (document.getElementById('reqPickedName') || {}).textContent || '';
      const meta      = (document.getElementById('reqPickedMeta')  || {}).textContent || '';

      // Manual entry fallback
      const manualName    = (document.getElementById('reqManualName')    || {}).value || '';
      const manualAddress = (document.getElementById('reqManualAddress') || {}).value || '';
      const manualCity    = (document.getElementById('reqManualCity')    || {}).value || '';
      const manualState   = (document.getElementById('reqManualMarket')  || {}).value || '';
      const manualZip     = (document.getElementById('reqManualZip')     || {}).value || '';

      const finalName    = storeName || manualName;
      const finalCity    = manualCity  || (meta.match(/,\s*([^,]+),/) || [])[1] || '';
      const finalState   = manualState || '';
      const finalAddress = manualAddress || meta;
      const finalZip     = manualZip || '';

      // Honeypot
      const hp = document.getElementById('reqHp');
      if (hp && hp.value.trim()) return;

      if (!finalName) return;

      reqSubmit.disabled = true;
      if (reqStatus) reqStatus.textContent = 'Sending…';

      try {
        await sbPost('/rest/v1/store_requests', {
          store_name:    finalName,
          store_address: finalAddress,
          city:          finalCity,
          state:         finalState,
          zip:           finalZip,
        });

        // Show success state (same as original)
        if (reqForm)    reqForm.hidden    = true;
        if (reqSuccess) reqSuccess.hidden = false;
        if (reqSuccessSub) reqSuccessSub.textContent = 'We let our team know there\'s demand for ' + finalName + ' and will reach out to the store.';

        trackEvent('store_request', null, finalName);
      } catch (err) {
        if (reqStatus) reqStatus.textContent = 'Something went wrong. Please try again.';
        reqSubmit.disabled = false;
      }
    }, { once: false });
  }

  // ── 4. ANALYTICS — replaces GA4 / Mixpanel ────────────────────────
  function initAnalytics() {
    // Page view
    trackEvent('page_view');

    // Product card views
    document.querySelectorAll('[data-analytics-product]').forEach(el => {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            trackEvent('product_view', el.dataset.analyticsProduct);
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      observer.observe(el);
    });

    // CTA clicks
    document.querySelectorAll('[data-analytics-action]').forEach(el => {
      el.addEventListener('click', () => {
        trackEvent(el.dataset.analyticsAction, el.dataset.analyticsProduct || null);
      });
    });
  }

  // ── BOOT ──────────────────────────────────────────────────────────
  function boot() {
    initSignups();
    initStoreLocator();
    initRequestModal();
    initAnalytics();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
