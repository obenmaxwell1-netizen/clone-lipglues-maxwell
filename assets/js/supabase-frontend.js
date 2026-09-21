/**
 * MWAH Frontend — Supabase Integration
 * v3 — Full Checkout System (min $120, customer info, payment, orders DB)
 */

(function () {
  'use strict';

  const SUPABASE_URL  = 'https://rrpxvsmggmgeilbynuij.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycHh2c21nZ21nZWlsYnludWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MzE0NDAsImV4cCI6MjEwNTUwNzQ0MH0.NLv7ylLgLN5xvW5FBiG66ChHCpdYGCpATTy5_Mqtfhw';
  const MIN_ORDER     = 120;

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

  const PAYMENT_METHODS = [
    { id: 'chime',         name: 'Chime',        icon: '💚', hint: 'Send via Chime app' },
    { id: 'bank_transfer', name: 'Bank Transfer', icon: '🏦', hint: 'Direct bank wire' },
    { id: 'wise',          name: 'Wise',          icon: '🌍', hint: 'Send via Wise' },
    { id: 'crypto',        name: 'Crypto',        icon: '₿',  hint: 'BTC / ETH / USDT' },
    { id: 'zelle',         name: 'Zelle',         icon: '⚡', hint: 'Send via Zelle' },
    { id: 'google_pay',    name: 'Google Pay',    icon: '🇬',  hint: 'Google Pay' },
    { id: 'apple_pay',     name: 'Apple Pay',     icon: '🍎', hint: 'Apple Pay' },
  ];

  // ── Fetch wrapper ─────────────────────────────────────────
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
      headers: Object.assign({ 'Prefer': 'return=representation' }, opts.headers || {}),
      body: JSON.stringify(body),
    }));
  }

  function trackEvent(eventType, productSlug, page) {
    sbFetch('/rest/v1/analytics_events', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ event_type: eventType, product_slug: productSlug || null, page: page || window.location.pathname }),
    }).catch(() => {});
  }

  // ════════════════════════════════════════════════════════
  // CART SYSTEM
  // ════════════════════════════════════════════════════════
  const CART_KEY = 'mwah_cart_v1';

  function getCart()       { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch(e) { return []; } }
  function saveCart(items) { localStorage.setItem(CART_KEY, JSON.stringify(items)); renderCart(); updateCartBadge(); }
  function clearCart()     { localStorage.removeItem(CART_KEY); renderCart(); updateCartBadge(); }

  function addToCart(product) {
    const cart = getCart();
    const idx = cart.findIndex(i => i.slug === product.slug);
    if (idx >= 0) { cart[idx].qty = (cart[idx].qty || 1) + 1; }
    else { cart.push({ ...product, qty: 1 }); }
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

  function removeFromCart(slug) { saveCart(getCart().filter(i => i.slug !== slug)); }

  function getCartTotal() { return getCart().reduce((s,i) => s + (parseFloat(i.price)||0) * (i.qty||1), 0); }
  function getCartCount() { return getCart().reduce((s,i) => s + (i.qty||1), 0); }

  function updateCartBadge() {
    const badge = document.getElementById('mwahCartBadge');
    if (!badge) return;
    const count = getCartCount();
    badge.textContent = count;
    badge.classList.toggle('has-items', count > 0);
  }

  function openCart()  {
    document.getElementById('mwahCartDrawer')?.classList.add('open');
    document.getElementById('mwahCartOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    document.getElementById('mwahCartDrawer')?.classList.remove('open');
    document.getElementById('mwahCartOverlay')?.classList.remove('open');
    if (!document.getElementById('mwahCheckoutOverlay')?.classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  function renderCart() {
    const itemsEl = document.getElementById('mwahCartItems');
    const totalEl = document.getElementById('mwahCartTotal');
    const countEl = document.getElementById('mwahCartCount');
    if (!itemsEl) return;
    const cart  = getCart();
    const count = getCartCount();
    const total = getCartTotal();
    if (countEl) countEl.textContent = count > 0 ? '(' + count + ')' : '';
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
    if (cart.length === 0) {
      itemsEl.innerHTML = `<div class="mwah-cart-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>Your bag is empty.<br>Explore our collection below.</p>
      </div>`;
      return;
    }
    itemsEl.innerHTML = cart.map(item => {
      const imgTag = item.image ? `<img class="mwah-cart-item__img" src="${item.image}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
      const placeholder = `<div class="mwah-cart-item__img-placeholder" ${item.image?'style="display:none"':''}>💋</div>`;
      const itemTotal = ((parseFloat(item.price)||0)*(item.qty||1)).toFixed(2);
      return `<div class="mwah-cart-item" data-cart-slug="${item.slug}">
        <div style="position:relative">${imgTag}${placeholder}</div>
        <div class="mwah-cart-item__info">
          <p class="mwah-cart-item__name">${item.name}</p>
          <p class="mwah-cart-item__type">${item.type||''}</p>
          <p class="mwah-cart-item__price-line">${parseFloat(item.price)>0?'$'+itemTotal:'Price TBD'}</p>
        </div>
        <div class="mwah-cart-item__actions">
          <div class="mwah-cart-item__qty">
            <button onclick="window.mwahCart.updateQty('${item.slug}',-1)" aria-label="Decrease">−</button>
            <span>${item.qty||1}</span>
            <button onclick="window.mwahCart.updateQty('${item.slug}',1)" aria-label="Increase">+</button>
          </div>
          <button class="mwah-cart-item__remove" onclick="window.mwahCart.remove('${item.slug}')">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  function injectCartHTML() {
    const overlay = document.createElement('div');
    overlay.id = 'mwahCartOverlay';
    overlay.className = 'mwah-cart-overlay';
    overlay.onclick = closeCart;
    document.body.appendChild(overlay);

    const drawer = document.createElement('div');
    drawer.id = 'mwahCartDrawer';
    drawer.className = 'mwah-cart-drawer';
    drawer.setAttribute('role','dialog');
    drawer.setAttribute('aria-label','Shopping cart');
    drawer.innerHTML = `
      <div class="mwah-cart-drawer__head">
        <div>
          <span class="mwah-cart-drawer__title">Your Bag</span>
          <span class="mwah-cart-drawer__count" id="mwahCartCount"></span>
        </div>
        <button class="mwah-cart-drawer__close" onclick="window.mwahCart.close()" aria-label="Close cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
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
    const navSocial = document.querySelector('.op-nav__social');
    if (navSocial && !document.getElementById('mwahCartTrigger')) {
      const btn = document.createElement('button');
      btn.id = 'mwahCartTrigger';
      btn.className = 'mwah-cart-trigger';
      btn.setAttribute('aria-label','Open shopping cart');
      btn.onclick = openCart;
      btn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="mwah-cart-badge" id="mwahCartBadge">0</span>`;
      navSocial.prepend(btn);
    }
  }

  // ════════════════════════════════════════════════════════
  // CHECKOUT SYSTEM
  // ════════════════════════════════════════════════════════
  let checkoutStep = 1;
  let checkoutData = { info: {}, payment: '' };

  function escHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function injectCheckoutHTML() {
    const el = document.createElement('div');
    el.id = 'mwahCheckoutOverlay';
    el.className = 'mwah-checkout-overlay';
    el.innerHTML = `
      <div class="mwah-checkout-modal" role="dialog" aria-modal="true" aria-label="Checkout">
        <div class="mwah-checkout-modal__head">
          <span class="mwah-checkout-modal__title">Secure Checkout</span>
          <button class="mwah-checkout-modal__close" id="checkoutCloseBtn" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
          </button>
        </div>
        <div class="mwah-checkout-steps" id="checkoutSteps"></div>
        <div id="checkoutContent"></div>
        <div class="mwah-checkout-footer" id="checkoutFooter"></div>
      </div>`;
    document.body.appendChild(el);
    document.getElementById('checkoutCloseBtn').onclick = closeCheckout;
  }

  function openCheckout() {
    const total = getCartTotal();
    checkoutStep = 1;
    checkoutData = { info: {}, payment: '' };
    const el = document.getElementById('mwahCheckoutOverlay');
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeCart();
    renderCheckoutStep();
  }

  function closeCheckout() {
    document.getElementById('mwahCheckoutOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderStepIndicator() {
    const steps = [
      { num: 1, label: 'Your Info' },
      { num: 2, label: 'Payment' },
      { num: 3, label: 'Confirm' },
    ];
    return steps.map((s, i) => {
      let cls = checkoutStep === s.num ? 'active' : checkoutStep > s.num ? 'done' : '';
      const numHtml = checkoutStep > s.num
        ? `<span class="mwah-checkout-step__num">✓</span>`
        : `<span class="mwah-checkout-step__num">${s.num}</span>`;
      const divider = i < steps.length - 1 ? '<div class="mwah-checkout-step-divider"></div>' : '';
      return `<div class="mwah-checkout-step ${cls}">${numHtml}<span class="mwah-checkout-step__label">${s.label}</span></div>${divider}`;
    }).join('');
  }

  function renderCheckoutStep() {
    const total = getCartTotal();
    document.getElementById('checkoutSteps').innerHTML = renderStepIndicator();

    if (checkoutStep === 1) renderStep1(total);
    else if (checkoutStep === 2) renderStep2();
    else if (checkoutStep === 3) renderStep3(total);
  }

  // ── STEP 1: Customer Info ─────────────────────────────────
  function renderStep1(total) {
    const f = checkoutData.info;
    const belowMin = total < MIN_ORDER;

    const warn = belowMin ? `
      <div class="mwah-checkout-min-warn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Minimum order is <strong>$${MIN_ORDER}.00</strong>. Your current total is <strong>$${total.toFixed(2)}</strong>. Please add more items to continue.</p>
      </div>` : '';

    document.getElementById('checkoutContent').innerHTML = `
      ${warn}
      <div class="mwah-checkout-body">
        <div class="mwah-form-section-label">Personal Information</div>
        <div class="mwah-form-row">
          <div class="mwah-form-group">
            <label>First & Last Name *</label>
            <input type="text" id="ch_name" placeholder="Jane Doe" value="${escHtml(f.full_name||'')}">
          </div>
          <div class="mwah-form-group">
            <label>Gender *</label>
            <select id="ch_gender">
              <option value="">Select…</option>
              <option value="female" ${f.gender==='female'?'selected':''}>Female</option>
              <option value="male" ${f.gender==='male'?'selected':''}>Male</option>
              <option value="non-binary" ${f.gender==='non-binary'?'selected':''}>Non-binary</option>
              <option value="prefer_not" ${f.gender==='prefer_not'?'selected':''}>Prefer not to say</option>
            </select>
          </div>
        </div>
        <div class="mwah-form-row">
          <div class="mwah-form-group">
            <label>Email Address *</label>
            <input type="email" id="ch_email" placeholder="jane@example.com" value="${escHtml(f.email||'')}">
          </div>
          <div class="mwah-form-group">
            <label>Phone Number *</label>
            <input type="tel" id="ch_phone" placeholder="+1 555 000 0000" value="${escHtml(f.phone||'')}">
          </div>
        </div>

        <div class="mwah-form-section-label" style="margin-top:4px">Shipping Address</div>
        <div class="mwah-form-row">
          <div class="mwah-form-group">
            <label>Country *</label>
            <input type="text" id="ch_country" placeholder="United States" value="${escHtml(f.country||'')}">
          </div>
          <div class="mwah-form-group">
            <label>State / Province *</label>
            <input type="text" id="ch_state" placeholder="California" value="${escHtml(f.state||'')}">
          </div>
        </div>
        <div class="mwah-form-row">
          <div class="mwah-form-group">
            <label>City / Town *</label>
            <input type="text" id="ch_city" placeholder="Los Angeles" value="${escHtml(f.city||'')}">
          </div>
          <div class="mwah-form-group">
            <label>ZIP / Postal Code</label>
            <input type="text" id="ch_zip" placeholder="90001" value="${escHtml(f.zip||'')}">
          </div>
        </div>
        <div class="mwah-form-group">
          <label>Street Address *</label>
          <input type="text" id="ch_address" placeholder="123 Main Street, Apt 4B" value="${escHtml(f.address||'')}">
        </div>
        <div class="mwah-form-group">
          <label>Order Notes (optional)</label>
          <input type="text" id="ch_notes" placeholder="Any special instructions…" value="${escHtml(f.notes||'')}">
        </div>
      </div>`;

    document.getElementById('checkoutFooter').innerHTML = `
      <button class="mwah-checkout-btn-back" onclick="window.mwahCheckout.openCart()">← Back to Cart</button>
      <button class="mwah-checkout-btn-next" onclick="window.mwahCheckout.nextStep()" ${belowMin ? 'disabled' : ''}>
        ${belowMin ? 'Add More Items' : 'Next: Payment →'}
      </button>`;
  }

  function validateStep1() {
    const fields = ['ch_name','ch_email','ch_phone','ch_country','ch_city','ch_address','ch_gender'];
    let valid = true;
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('error');
      if (!el.value.trim()) { el.classList.add('error'); valid = false; }
    });
    const emailEl = document.getElementById('ch_email');
    if (emailEl && emailEl.value && !emailEl.value.includes('@')) { emailEl.classList.add('error'); valid = false; }
    return valid;
  }

  function collectStep1() {
    checkoutData.info = {
      full_name: document.getElementById('ch_name')?.value.trim(),
      gender:    document.getElementById('ch_gender')?.value,
      email:     document.getElementById('ch_email')?.value.trim(),
      phone:     document.getElementById('ch_phone')?.value.trim(),
      country:   document.getElementById('ch_country')?.value.trim(),
      state:     document.getElementById('ch_state')?.value.trim(),
      city:      document.getElementById('ch_city')?.value.trim(),
      zip:       document.getElementById('ch_zip')?.value.trim(),
      address:   document.getElementById('ch_address')?.value.trim(),
      notes:     document.getElementById('ch_notes')?.value.trim(),
    };
  }

  // ── STEP 2: Payment Method ────────────────────────────────
  function renderStep2() {
    const cards = PAYMENT_METHODS.map(pm => `
      <div class="mwah-payment-card ${checkoutData.payment===pm.id?'selected':''}" onclick="window.mwahCheckout.selectPayment('${pm.id}')" data-pm="${pm.id}">
        <div class="mwah-payment-card__icon">${pm.icon}</div>
        <div class="mwah-payment-card__name">${pm.name}</div>
      </div>`).join('');

    document.getElementById('checkoutContent').innerHTML = `
      <div class="mwah-checkout-body">
        <div class="mwah-form-section-label">Choose Payment Method</div>
        <p style="font-size:.82rem;color:#888;line-height:1.5;">After placing your order, we will send you payment instructions via email. Your order is confirmed once payment is received.</p>
        <div class="mwah-payment-grid" id="paymentGrid">${cards}</div>
        <div id="pmError" style="color:#ff6b6b;font-size:.8rem;display:none">Please select a payment method.</div>
      </div>`;

    document.getElementById('checkoutFooter').innerHTML = `
      <button class="mwah-checkout-btn-back" onclick="window.mwahCheckout.prevStep()">← Back</button>
      <button class="mwah-checkout-btn-next" onclick="window.mwahCheckout.nextStep()">Review Order →</button>`;
  }

  // ── STEP 3: Confirm ───────────────────────────────────────
  function renderStep3(total) {
    const cart = getCart();
    const info = checkoutData.info;
    const pm   = PAYMENT_METHODS.find(p => p.id === checkoutData.payment) || {};

    const itemRows = cart.map(item => `
      <div class="mwah-order-summary-row">
        <span class="mwah-order-summary-row__label">${item.name} × ${item.qty||1}</span>
        <span class="mwah-order-summary-row__val">$${((parseFloat(item.price)||0)*(item.qty||1)).toFixed(2)}</span>
      </div>`).join('');

    document.getElementById('checkoutContent').innerHTML = `
      <div class="mwah-checkout-body">
        <div class="mwah-form-section-label">Order Summary</div>
        <div class="mwah-order-summary">
          ${itemRows}
          <div class="mwah-order-summary-row total">
            <span class="mwah-order-summary-row__label">Total</span>
            <span class="mwah-order-summary-row__val">$${total.toFixed(2)}</span>
          </div>
        </div>

        <div class="mwah-form-section-label" style="margin-top:4px">Shipping To</div>
        <div class="mwah-confirm-info">
          <div class="mwah-confirm-item"><div class="mwah-confirm-item__label">Name</div><div class="mwah-confirm-item__val">${escHtml(info.full_name)}</div></div>
          <div class="mwah-confirm-item"><div class="mwah-confirm-item__label">Email</div><div class="mwah-confirm-item__val">${escHtml(info.email)}</div></div>
          <div class="mwah-confirm-item"><div class="mwah-confirm-item__label">Phone</div><div class="mwah-confirm-item__val">${escHtml(info.phone)}</div></div>
          <div class="mwah-confirm-item"><div class="mwah-confirm-item__label">Gender</div><div class="mwah-confirm-item__val">${escHtml(info.gender)}</div></div>
          <div class="mwah-confirm-item"><div class="mwah-confirm-item__label">Country</div><div class="mwah-confirm-item__val">${escHtml(info.country)}</div></div>
          <div class="mwah-confirm-item"><div class="mwah-confirm-item__label">City</div><div class="mwah-confirm-item__val">${escHtml(info.city)}</div></div>
          <div class="mwah-confirm-item" style="grid-column:1/-1"><div class="mwah-confirm-item__label">Address</div><div class="mwah-confirm-item__val">${escHtml(info.address)}${info.zip ? ', '+escHtml(info.zip) : ''}</div></div>
          ${info.notes ? `<div class="mwah-confirm-item" style="grid-column:1/-1"><div class="mwah-confirm-item__label">Notes</div><div class="mwah-confirm-item__val">${escHtml(info.notes)}</div></div>` : ''}
        </div>

        <div class="mwah-form-section-label" style="margin-top:4px">Payment Method</div>
        <div class="mwah-payment-chosen">
          <div class="mwah-payment-chosen__icon">${pm.icon||''}</div>
          <div>
            <div class="mwah-payment-chosen__label">${pm.name||''}</div>
            <div class="mwah-payment-chosen__sub">${pm.hint||''} — Instructions sent to your email after order</div>
          </div>
        </div>
      </div>`;

    document.getElementById('checkoutFooter').innerHTML = `
      <button class="mwah-checkout-btn-back" onclick="window.mwahCheckout.prevStep()">← Back</button>
      <button class="mwah-checkout-btn-next" id="placeOrderBtn" onclick="window.mwahCheckout.placeOrder()">🔒 Place Order</button>`;
  }

  // ── Place Order ───────────────────────────────────────────
  async function placeOrder() {
    const btn = document.getElementById('placeOrderBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing order…'; }
    try {
      const cart = getCart();
      const info = checkoutData.info;
      const payload = {
        full_name:      info.full_name,
        email:          info.email,
        phone:          info.phone,
        gender:         info.gender || null,
        country:        info.country,
        city:           info.city,
        address:        [info.address, info.state, info.zip].filter(Boolean).join(', '),
        items:          cart,
        subtotal:       getCartTotal(),
        payment_method: checkoutData.payment,
        status:         'pending',
        notes:          info.notes || null,
      };

      const [result] = await sbPost('/rest/v1/orders', payload);
      const orderNum = result?.order_number || 'ORD-' + Date.now();

      // Show success screen
      document.getElementById('checkoutContent').innerHTML = `
        <div class="mwah-checkout-success">
          <div class="mwah-checkout-success__icon">✓</div>
          <h2 class="mwah-checkout-success__title">Order Placed! 💋</h2>
          <p class="mwah-checkout-success__order">${orderNum}</p>
          <p class="mwah-checkout-success__sub">
            Thank you, <strong>${escHtml(info.full_name)}</strong>!<br>
            Your order has been received. We'll email payment instructions to <strong>${escHtml(info.email)}</strong> within a few minutes.
          </p>
        </div>`;
      document.getElementById('checkoutFooter').innerHTML = `
        <button class="mwah-checkout-btn-next" onclick="window.mwahCheckout.closeAfterOrder()" style="width:100%">Continue Shopping</button>`;
      document.getElementById('checkoutSteps').innerHTML = '';

      clearCart();
      trackEvent('order_placed', null, info.email);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = '🔒 Place Order'; }
      alert('Something went wrong: ' + err.message + '. Please try again.');
    }
  }

  // ── Checkout global API ───────────────────────────────────
  function initCheckoutAPI() {
    window.mwahCheckout = {
      nextStep() {
        if (checkoutStep === 1) {
          if (!validateStep1()) {
            document.querySelector('.mwah-form-group input.error')?.scrollIntoView({ behavior:'smooth', block:'center' });
            return;
          }
          collectStep1();
          checkoutStep = 2;
        } else if (checkoutStep === 2) {
          if (!checkoutData.payment) {
            document.getElementById('pmError').style.display = 'block';
            return;
          }
          checkoutStep = 3;
        }
        renderCheckoutStep();
      },
      prevStep() {
        if (checkoutStep > 1) { checkoutStep--; renderCheckoutStep(); }
        else { closeCheckout(); openCart(); }
      },
      openCart() { closeCheckout(); openCart(); },
      selectPayment(id) {
        checkoutData.payment = id;
        document.getElementById('pmError').style.display = 'none';
        document.querySelectorAll('.mwah-payment-card').forEach(c => {
          c.classList.toggle('selected', c.dataset.pm === id);
        });
      },
      placeOrder,
      closeAfterOrder() { closeCheckout(); },
    };
  }

  // ════════════════════════════════════════════════════════
  // PRICING
  // ════════════════════════════════════════════════════════
  async function initPricing() {
    let priceMap = {};
    try {
      const products = await sbFetch('/rest/v1/products?select=slug,name,price,type&status=eq.active');
      if (products && products.length) {
        products.forEach(p => { priceMap[p.slug] = p; });
      }
    } catch (err) {
      console.warn('[MWAH] Pricing fetch failed, using fallbacks:', err.message);
    }

    document.querySelectorAll('.op-card[data-product]').forEach(card => {
        const rawSlug = card.dataset.product;
        const dbSlug = SLUG_MAP[rawSlug] || rawSlug;
        const product = priceMap[dbSlug] || {
          slug: dbSlug,
          name: card.querySelector('.op-card__title')?.textContent || 'MWAH Vape',
          type: card.querySelector('.op-card__eyebrow')?.textContent || 'HYBRID',
          price: 35.00
        };

        // Target the shell (the card image box) — inject overlay inside it
        const shellEl = card.querySelector('.op-card__shell');
        if (!shellEl) return;

        // Also remove old VIEW DETAILS link from info section
        const infoEl = card.querySelector('.op-card__info');
        if (infoEl) {
          const detailLink = infoEl.querySelector('.op-card__detail');
          if (detailLink) detailLink.remove();
        }

        // Don't double-inject
        if (shellEl.querySelector('.op-card__buy-overlay')) return;

        // Make the card title + image area clickable → product detail page
        const detailUrl = `/product/?slug=${encodeURIComponent(dbSlug)}`;

        // Make the card title and info section navigate to detail page
        if (infoEl) {
          infoEl.style.cursor = 'pointer';
          infoEl.addEventListener('click', (e) => {
            if (!e.target.closest('.op-card__buy-overlay') && !e.target.closest('.op-card__add-to-cart')) {
              window.location.href = detailUrl;
            }
          });
        }

        // Make clicking the shell image area navigate to detail page too
        shellEl.style.cursor = 'pointer';
        shellEl.addEventListener('click', (e) => {
          if (!e.target.closest('.op-card__buy-overlay') && !e.target.closest('.op-card__add-to-cart')) {
            window.location.href = detailUrl;
          }
        });

        // Build overlay bar at bottom of the card image box
        const overlay = document.createElement('div');
        overlay.className = 'op-card__buy-overlay';

        const priceEl = document.createElement('span');
        priceEl.className = 'op-card__buy-price';
        if (product.price && parseFloat(product.price) > 0) {
          priceEl.textContent = '$' + parseFloat(product.price).toFixed(2);
        } else {
          priceEl.textContent = 'Price TBD';
        }
        overlay.appendChild(priceEl);

        // View detail link inside overlay
        const viewLink = document.createElement('a');
        viewLink.href = detailUrl;
        viewLink.className = 'op-card__view-link';
        viewLink.textContent = 'VIEW';
        viewLink.setAttribute('aria-label', 'View ' + product.name);
        overlay.appendChild(viewLink);

        const btn = document.createElement('button');
        btn.className = 'op-card__add-to-cart';
        btn.setAttribute('data-cart-product', dbSlug);
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> ADD TO BAG`;

        btn.onclick = function(e) {
          e.stopPropagation();
          const videoEl = card.querySelector('.op-card__video');
          const imgSrc  = videoEl ? (videoEl.getAttribute('poster') || videoEl.getAttribute('data-poster') || '') : '';
          addToCart({ slug: dbSlug, name: product.name, type: product.type||'', price: parseFloat(product.price)||0, image: imgSrc });

          btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ADDED!`;
          btn.classList.add('added');
          setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> ADD TO BAG`;
          }, 1500);
          const trigger = document.getElementById('mwahCartTrigger');
          if (trigger) { trigger.classList.remove('pulse'); void trigger.offsetWidth; trigger.classList.add('pulse'); }
          setTimeout(openCart, 400);
          trackEvent('add_to_cart', dbSlug);
        };

        overlay.appendChild(btn);
        shellEl.appendChild(overlay);
    });
  }

  // ════════════════════════════════════════════════════════
  // EMAIL SIGNUP
  // ════════════════════════════════════════════════════════
  function initSignups() {
    document.querySelectorAll('[data-signup]').forEach(form => {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const hp = form.querySelector('[name="hp"]');
        if (hp && hp.value.trim()) return;
        const emailInput = form.querySelector('[type="email"]');
        const statusEl   = form.querySelector('[data-signup-status]');
        const btn        = form.querySelector('[type="submit"]');
        const email = emailInput ? emailInput.value.trim() : '';
        const source = form.dataset.source || 'homepage';
        if (!email || !email.includes('@')) {
          if (statusEl) { statusEl.textContent = 'Please enter a valid email.'; statusEl.classList.remove('visually-hidden'); }
          return;
        }
        if (btn) btn.disabled = true;
        try {
          await sbFetch('/rest/v1/subscribers', { method:'POST', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({email, source}) });
          if (statusEl) { statusEl.textContent = "You're in! Check your inbox for updates."; statusEl.classList.remove('visually-hidden'); }
          if (emailInput) emailInput.value = '';
          trackEvent('email_signup', null, source);
        } catch(err) {
          if (statusEl) { statusEl.textContent = 'Something went wrong. Please try again.'; statusEl.classList.remove('visually-hidden'); }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════
  // STORE LOCATOR
  // ════════════════════════════════════════════════════════
  async function initStoreLocator() {
    try {
      const stores = await sbFetch('/rest/v1/stores?select=*&status=neq.inactive&order=city');
      if (!stores || !stores.length) return;
      window.MWAH_STORES = stores.map(s => ({
        id: s.id, name: s.store_name,
        address: [s.address, s.city, s.state].filter(Boolean).join(', '),
        city: s.city||'', state: s.state||'',
        lat: parseFloat(s.lat)||0, lng: parseFloat(s.lng)||0,
        phone: s.phone||'', hours: s.hours||'', status: s.status||'stocked',
      }));
      const countEl = document.querySelector('.op-find-header__sub');
      if (countEl) countEl.textContent = stores.length + ' dispensaries. Search your city or explore the map.';
    } catch(err) {
      console.warn('[MWAH] Store locator fallback:', err.message);
    }
  }

  // ════════════════════════════════════════════════════════
  // STORE REQUEST MODAL
  // ════════════════════════════════════════════════════════
  function initRequestModal() {
    const reqSubmit = document.getElementById('reqSubmit');
    const reqStatus = document.getElementById('reqStatus');
    const reqSuccess = document.getElementById('reqSuccess');
    const reqForm   = document.getElementById('reqForm');
    const reqSuccessSub = document.getElementById('reqSuccessSub');
    if (!reqSubmit) return;
    reqSubmit.addEventListener('click', async function() {
      const storeName  = (document.getElementById('reqPickedName')||{}).textContent || '';
      const meta       = (document.getElementById('reqPickedMeta') ||{}).textContent || '';
      const manualName    = (document.getElementById('reqManualName')   ||{}).value||'';
      const manualAddress = (document.getElementById('reqManualAddress')||{}).value||'';
      const manualCity    = (document.getElementById('reqManualCity')   ||{}).value||'';
      const manualState   = (document.getElementById('reqManualMarket') ||{}).value||'';
      const manualZip     = (document.getElementById('reqManualZip')    ||{}).value||'';
      const finalName = storeName || manualName;
      const hp = document.getElementById('reqHp');
      if (hp && hp.value.trim()) return;
      if (!finalName) return;
      reqSubmit.disabled = true;
      if (reqStatus) reqStatus.textContent = 'Sending…';
      try {
        await sbFetch('/rest/v1/store_requests', { method:'POST', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({ store_name:finalName, store_address:manualAddress||meta, city:manualCity||(meta.match(/,\s*([^,]+),/)||[])[1]||'', state:manualState, zip:manualZip }) });
        if (reqForm) reqForm.hidden = true;
        if (reqSuccess) reqSuccess.hidden = false;
        if (reqSuccessSub) reqSuccessSub.textContent = "We let our team know there's demand for " + finalName + ' and will reach out to the store.';
        trackEvent('store_request', null, finalName);
      } catch(err) {
        if (reqStatus) reqStatus.textContent = 'Something went wrong. Please try again.';
        reqSubmit.disabled = false;
      }
    }, { once: false });
  }

  // ════════════════════════════════════════════════════════
  // ANALYTICS
  // ════════════════════════════════════════════════════════
  function initAnalytics() {
    trackEvent('page_view');
    document.querySelectorAll('[data-analytics-product]').forEach(el => {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { trackEvent('product_view', el.dataset.analyticsProduct); obs.unobserve(el); } });
      }, { threshold: 0.5 });
      obs.observe(el);
    });
    document.querySelectorAll('[data-analytics-action]').forEach(el => {
      el.addEventListener('click', () => trackEvent(el.dataset.analyticsAction, el.dataset.analyticsProduct||null));
    });
  }

  // ════════════════════════════════════════════════════════
  // BOOT
  // ════════════════════════════════════════════════════════
  function boot() {
    injectCartHTML();
    injectCartButton();
    injectCheckoutHTML();
    renderCart();
    updateCartBadge();
    initCheckoutAPI();

    window.mwahCart = {
      open:      openCart,
      close:     closeCart,
      updateQty: updateQty,
      remove:    removeFromCart,
      checkout:  openCheckout,
    };

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
