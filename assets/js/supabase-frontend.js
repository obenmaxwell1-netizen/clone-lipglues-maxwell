/**
 * MWAH Frontend — Supabase Integration
 * Replaces all Firebase/MWAH Cloud Function calls
 * Project: cloned gluesweb (rrpxvsmggmgeilbynuij)
 * v2 — adds Pricing + Cart system
 */

(function () {
  'use strict';

  const SUPABASE_URL  = 'https://rrpxvsmggmgeilbynuij.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycHh2c21nZ21nZWlsYnludWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MzE0NDAsImV4cCI6MjEwNTUwNzQ0MH0.NLv7ylLgLN5xvW5FBiG66ChHCpdYGCpATTy5_Mqtfhw';

  // HTML-data-product slug → Supabase DB slug mapping
  const SLUG_MAP = {
    'strawberry-matcha': 'strawberry-matcha',
    'watermelon-wifey':  'watermelon-wifey',
    'guava':             'its-giving-guava',
    'berry':             'berry-baddie',
    'mango':             'mango-mamacita',
    'peach':             'peach-perfection',
    'strawberry':        'she-ate-strawberry',
    'grape':             'glow-up-grape',
  };

  // ── Lightweight fetch wrapper ────────────────────────────
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

  // ── Analytics ─────────────────────────────────────────────
  function trackEvent(eventType, productSlug, page) {
    sbPost('/rest/v1/analytics_events', {
      event_type:   eventType,
      product_slug: productSlug || null,
      page:         page || window.location.pathname,
    }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // CART SYSTEM
  // ═══════════════════════════════════════════════════════════
  const CART_KEY = 'mwah_cart_v1';

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    renderCart();
    updateCartBadge();
  }

  function addToCart(product) {
    // product = { slug, name, type, price, image }
    const cart = getCart();
    const idx = cart.findIndex(i => i.slug === product.slug);
    if (idx >= 0) {
      cart[idx].qty = (cart[idx].qty || 1) + 1;
    } else {
      cart.push({ ...product, qty: 1 });
    }
    saveCart(cart);
  }

  function updateQty(slug, delta) {
    const cart = getCart();
    const idx = cart.findIndex(i => i.slug === slug);
    if (idx < 0) return;
    cart[idx].qty = (cart[idx].qty || 1) + delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart(cart);
  }

  function removeFromCart(slug) {
    saveCart(getCart().filter(i => i.slug !== slug));
  }

  function getCartTotal() {
    return getCart().reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (i.qty || 1), 0);
  }

  function getCartCount() {
    return getCart().reduce((sum, i) => sum + (i.qty || 1), 0);
  }

  function updateCartBadge() {
    const badge = document.getElementById('mwahCartBadge');
    if (!badge) return;
    const count = getCartCount();
    badge.textContent = count;
    badge.classList.toggle('has-items', count > 0);
  }

  function openCart() {
    const drawer  = document.getElementById('mwahCartDrawer');
    const overlay = document.getElementById('mwahCartOverlay');
    if (drawer)  drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    const drawer  = document.getElementById('mwahCartDrawer');
    const overlay = document.getElementById('mwahCartOverlay');
    if (drawer)  drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderCart() {
    const itemsEl = document.getElementById('mwahCartItems');
    const totalEl = document.getElementById('mwahCartTotal');
    const countEl = document.getElementById('mwahCartCount');
    if (!itemsEl) return;

    const cart = getCart();
    const count = getCartCount();
    const total = getCartTotal();

    if (countEl) countEl.textContent = count > 0 ? '(' + count + ')' : '';
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);

    if (cart.length === 0) {
      itemsEl.innerHTML = `
        <div class="mwah-cart-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <p>Your bag is empty.<br>Explore our collection below.</p>
        </div>`;
      return;
    }

    itemsEl.innerHTML = cart.map(item => {
      const imgUrl = item.image
        ? `<img class="mwah-cart-item__img" src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const placeholder = `<div class="mwah-cart-item__img-placeholder" ${item.image ? 'style="display:none"' : ''}>💋</div>`;
      const itemTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);
      const unitPrice = parseFloat(item.price) > 0 ? ' · $' + parseFloat(item.price).toFixed(2) + ' ea.' : '';

      return `
        <div class="mwah-cart-item" data-cart-slug="${item.slug}">
          <div style="position:relative">
            ${imgUrl}
            ${placeholder}
          </div>
          <div class="mwah-cart-item__info">
            <p class="mwah-cart-item__name">${item.name}</p>
            <p class="mwah-cart-item__type">${item.type || ''}</p>
            <p class="mwah-cart-item__price-line">${parseFloat(item.price) > 0 ? '$' + itemTotal + unitPrice : 'Price TBD'}</p>
          </div>
          <div class="mwah-cart-item__actions">
            <div class="mwah-cart-item__qty">
              <button onclick="window.mwahCart.updateQty('${item.slug}',-1)" aria-label="Decrease quantity">−</button>
              <span>${item.qty || 1}</span>
              <button onclick="window.mwahCart.updateQty('${item.slug}',1)" aria-label="Increase quantity">+</button>
            </div>
            <button class="mwah-cart-item__remove" onclick="window.mwahCart.remove('${item.slug}')">Remove</button>
          </div>
        </div>`;
    }).join('');
  }

  function injectCartHTML() {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'mwahCartOverlay';
    overlay.className = 'mwah-cart-overlay';
    overlay.onclick = closeCart;
    document.body.appendChild(overlay);

    // Drawer
    const drawer = document.createElement('div');
    drawer.id = 'mwahCartDrawer';
    drawer.className = 'mwah-cart-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Shopping cart');
    drawer.innerHTML = `
      <div class="mwah-cart-drawer__head">
        <div>
          <span class="mwah-cart-drawer__title">Your Bag</span>
          <span class="mwah-cart-drawer__count" id="mwahCartCount"></span>
        </div>
        <button class="mwah-cart-drawer__close" onclick="window.mwahCart.close()" aria-label="Close cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>
          </svg>
        </button>
      </div>
      <div class="mwah-cart-drawer__items" id="mwahCartItems"></div>
      <div class="mwah-cart-drawer__footer">
        <div class="mwah-cart-drawer__subtotal">
          <span class="mwah-cart-drawer__subtotal-label">Subtotal</span>
          <span class="mwah-cart-drawer__subtotal-val" id="mwahCartTotal">$0.00</span>
        </div>
        <button class="mwah-cart-checkout" onclick="window.mwahCart.checkout()">Checkout →</button>
        <button class="mwah-cart-continue" onclick="window.mwahCart.close()">Continue Shopping</button>
      </div>`;
    document.body.appendChild(drawer);
  }

  function injectCartButton() {
    // Inject cart icon into desktop nav social area
    const navSocial = document.querySelector('.op-nav__social');
    if (navSocial && !document.getElementById('mwahCartTrigger')) {
      const btn = document.createElement('button');
      btn.id = 'mwahCartTrigger';
      btn.className = 'mwah-cart-trigger';
      btn.setAttribute('aria-label', 'Open shopping cart');
      btn.onclick = openCart;
      btn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <span class="mwah-cart-badge" id="mwahCartBadge">0</span>`;
      navSocial.prepend(btn);
    }
  }

  // ── 5. PRICING — fetch from Supabase & inject into cards ──
  async function initPricing() {
    try {
      const products = await sbFetch('/rest/v1/products?select=slug,name,price,type&status=eq.active');
      if (!products || !products.length) return;

      // Build a lookup by DB slug
      const priceMap = {};
      products.forEach(p => { priceMap[p.slug] = p; });

      // For each card, find its matching product price
      document.querySelectorAll('.op-card[data-product]').forEach(card => {
        const htmlSlug = card.dataset.product;
        const dbSlug   = SLUG_MAP[htmlSlug];
        const product  = priceMap[dbSlug];
        if (!product) return;

        const infoEl = card.querySelector('.op-card__info');
        if (!infoEl) return;

        // Inject price element if not already there
        if (!card.querySelector('.op-card__price')) {
          const priceEl = document.createElement('p');
          priceEl.className = 'op-card__price';
          if (product.price && parseFloat(product.price) > 0) {
            priceEl.textContent = '$' + parseFloat(product.price).toFixed(2);
          } else {
            priceEl.textContent = 'Coming Soon';
            priceEl.style.color = '#888';
          }
          infoEl.insertBefore(priceEl, infoEl.querySelector('.op-card__detail'));
        }

        // Inject Add to Cart button
        if (!card.querySelector('.op-card__add-to-cart')) {
          const btn = document.createElement('button');
          btn.className = 'op-card__add-to-cart';
          btn.setAttribute('data-cart-product', dbSlug);
          btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            ADD TO BAG`;
          btn.onclick = function (e) {
            e.stopPropagation();
            // Get product image from the video poster
            const videoEl = card.querySelector('.op-card__video');
            const imgSrc  = videoEl ? (videoEl.getAttribute('poster') || videoEl.getAttribute('data-poster') || '') : '';

            addToCart({
              slug:  dbSlug,
              name:  product.name,
              type:  product.type || '',
              price: parseFloat(product.price) || 0,
              image: imgSrc,
            });

            // Button feedback
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ADDED!`;
            btn.classList.add('added');
            setTimeout(() => {
              btn.classList.remove('added');
              btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> ADD TO BAG`;
            }, 1800);

            // Pulse the nav cart icon
            const trigger = document.getElementById('mwahCartTrigger');
            if (trigger) {
              trigger.classList.remove('pulse');
              void trigger.offsetWidth;
              trigger.classList.add('pulse');
            }

            // Auto-open cart after short delay
            setTimeout(openCart, 400);
            trackEvent('add_to_cart', dbSlug);
          };
          infoEl.appendChild(btn);
        }
      });
    } catch (err) {
      console.warn('[MWAH] Pricing fetch failed:', err.message);
    }
  }

  // ── 1. EMAIL SIGNUP ──────────────────────────────────────
  function initSignups() {
    document.querySelectorAll('[data-signup]').forEach(form => {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
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
          if (statusEl) { statusEl.textContent = 'You\'re in! Check your inbox for updates.'; statusEl.classList.remove('visually-hidden'); }
          if (emailInput) emailInput.value = '';
          trackEvent('email_signup', null, source);
        } catch (err) {
          if (statusEl) { statusEl.textContent = 'Something went wrong. Please try again.'; statusEl.classList.remove('visually-hidden'); }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  // ── 2. STORE LOCATOR ─────────────────────────────────────
  async function initStoreLocator() {
    try {
      const stores = await sbFetch('/rest/v1/stores?select=*&status=neq.inactive&order=city');
      if (!stores || !stores.length) return;

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

      const countEl = document.querySelector('.op-find-header__sub');
      if (countEl) {
        countEl.textContent = stores.length + ' dispensaries. Search your city or explore the map.';
      }
      trackEvent('page_view_locator');
    } catch (err) {
      console.warn('[MWAH] Store locator using fallback data:', err.message);
    }
  }

  // ── 3. STORE REQUEST MODAL ───────────────────────────────
  function initRequestModal() {
    const reqSubmit    = document.getElementById('reqSubmit');
    const reqStatus    = document.getElementById('reqStatus');
    const reqSuccess   = document.getElementById('reqSuccess');
    const reqForm      = document.getElementById('reqForm');
    const reqSuccessSub = document.getElementById('reqSuccessSub');
    if (!reqSubmit) return;

    reqSubmit.addEventListener('click', async function () {
      const storeName     = (document.getElementById('reqPickedName')    || {}).textContent || '';
      const meta          = (document.getElementById('reqPickedMeta')    || {}).textContent || '';
      const manualName    = (document.getElementById('reqManualName')    || {}).value || '';
      const manualAddress = (document.getElementById('reqManualAddress') || {}).value || '';
      const manualCity    = (document.getElementById('reqManualCity')    || {}).value || '';
      const manualState   = (document.getElementById('reqManualMarket')  || {}).value || '';
      const manualZip     = (document.getElementById('reqManualZip')     || {}).value || '';

      const finalName    = storeName || manualName;
      const finalCity    = manualCity || (meta.match(/,\s*([^,]+),/) || [])[1] || '';
      const finalAddress = manualAddress || meta;

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
          state:         manualState,
          zip:           manualZip,
        });
        if (reqForm)      reqForm.hidden    = true;
        if (reqSuccess)   reqSuccess.hidden = false;
        if (reqSuccessSub) reqSuccessSub.textContent = 'We let our team know there\'s demand for ' + finalName + ' and will reach out to the store.';
        trackEvent('store_request', null, finalName);
      } catch (err) {
        if (reqStatus) reqStatus.textContent = 'Something went wrong. Please try again.';
        reqSubmit.disabled = false;
      }
    }, { once: false });
  }

  // ── 4. ANALYTICS ─────────────────────────────────────────
  function initAnalytics() {
    trackEvent('page_view');
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
    document.querySelectorAll('[data-analytics-action]').forEach(el => {
      el.addEventListener('click', () => {
        trackEvent(el.dataset.analyticsAction, el.dataset.analyticsProduct || null);
      });
    });
  }

  // ── BOOT ─────────────────────────────────────────────────
  function boot() {
    // Cart infrastructure
    injectCartHTML();
    injectCartButton();
    renderCart();
    updateCartBadge();

    // Expose cart API globally for inline onclick handlers
    window.mwahCart = {
      open:      openCart,
      close:     closeCart,
      updateQty: updateQty,
      remove:    removeFromCart,
      checkout:  function () {
        const cart  = getCart();
        const total = getCartTotal();
        if (!cart.length) return;
        const lines = cart.map(i => `${i.name} x${i.qty || 1} – $${((parseFloat(i.price)||0)*(i.qty||1)).toFixed(2)}`).join('%0A');
        const msg = encodeURIComponent(`Hi! I'd like to order:%0A${lines}%0A%0ATotal: $${total.toFixed(2)}`);
        window.open(`https://t.me/gimmemwhah?text=${msg}`, '_blank');
      },
    };

    // Data features
    initSignups();
    initStoreLocator();
    initRequestModal();
    initAnalytics();
    initPricing();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
