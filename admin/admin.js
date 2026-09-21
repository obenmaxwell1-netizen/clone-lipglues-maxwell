/* ════════════════════════════════════════════════════════════════════
   MWAH Admin Dashboard — admin.js
   Supabase project: cloned gluesweb (rrpxvsmggmgeilbynuij)
   ════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://rrpxvsmggmgeilbynuij.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycHh2c21nZ21nZWlsYnludWlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MzE0NDAsImV4cCI6MjEwNTUwNzQ0MH0.NLv7ylLgLN5xvW5FBiG66ChHCpdYGCpATTy5_Mqtfhw';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── STATE ───────────────────────────────────────────────────────────
let currentSection = 'overview';
let modalSaveCallback = null;

// ── AUTH GUARD ──────────────────────────────────────────────────────
async function init() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  const email = session.user.email || session.user.id;
  document.getElementById('topbarUser').textContent = email;
  setupNav();
  setupSidebar();
  setupModal();
  setupLogout();
  loadSection('overview');
}

// ── NAVIGATION ──────────────────────────────────────────────────────
const sectionTitles = {
  overview:    'Overview',
  products:    'Products',
  categories:  'Categories',
  stores:      'Stores',
  cms:         'Homepage CMS',
  subscribers: 'Subscribers',
  requests:    'Store Requests',
  orders:      'Orders',
};

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      loadSection(section);
      // Close sidebar on mobile
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function loadSection(name) {
  currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  document.getElementById('topbarTitle').textContent = sectionTitles[name] || name;
  loaders[name]();
}

function setupSidebar() {
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar  = document.getElementById('sidebar');
  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
}

function setupLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await client.auth.signOut();
    window.location.href = 'login.html';
  });
}

// ── TOAST ───────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── MODAL ───────────────────────────────────────────────────────────
function setupModal() {
  const backdrop = document.getElementById('modalBackdrop');
  const closeBtn = document.getElementById('modalClose');
  const cancelBtn = document.getElementById('modalCancel');
  const saveBtn  = document.getElementById('modalSave');

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  saveBtn.addEventListener('click', () => { if (modalSaveCallback) modalSaveCallback(); });
}

function openModal(title, bodyHTML, saveCb, saveLabel = 'Save') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalSave').textContent = saveLabel;
  modalSaveCallback = saveCb;
  document.getElementById('modalBackdrop').classList.add('open');
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  modalSaveCallback = null;
}

// ── HELPER: format date ─────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function typeBadge(type) {
  if (!type) return '';
  const cls = { Hybrid: 'hybrid', Indica: 'indica', Sativa: 'sativa' }[type] || '';
  return `<span class="badge badge--${cls}">${type}</span>`;
}

function statusBadge(status) {
  return `<span class="badge badge--${(status||'active').toLowerCase()}">${status || 'active'}</span>`;
}

// ── LOADERS ─────────────────────────────────────────────────────────
const loaders = {
  overview:    loadOverview,
  products:    loadProducts,
  categories:  loadCategories,
  stores:      loadStores,
  cms:         loadCMS,
  subscribers: loadSubscribers,
  requests:    loadRequests,
  orders:      loadOrders,
};

// ── OVERVIEW ────────────────────────────────────────────────────────
async function loadOverview() {
  const [prod, subs, strs, reqs] = await Promise.all([
    client.from('products').select('id', { count: 'exact', head: true }),
    client.from('subscribers').select('id', { count: 'exact', head: true }),
    client.from('stores').select('id', { count: 'exact', head: true }),
    client.from('store_requests').select('id', { count: 'exact', head: true }),
  ]);
  document.getElementById('stat-products').textContent    = prod.count ?? 0;
  document.getElementById('stat-subscribers').textContent = subs.count ?? 0;
  document.getElementById('stat-stores').textContent      = strs.count ?? 0;
  document.getElementById('stat-requests').textContent    = reqs.count ?? 0;

  // Recent subscribers
  const { data: recentSubs } = await client.from('subscribers').select('email, created_at').order('created_at', { ascending: false }).limit(6);
  const subsList = document.getElementById('recent-subscribers-list');
  subsList.innerHTML = recentSubs && recentSubs.length ? recentSubs.map(s =>
    `<div class="recent-item">
      <span class="recent-item__email">${escHtml(s.email)}</span>
      <span class="recent-item__date">${fmtDate(s.created_at)}</span>
    </div>`).join('') : '<div class="empty">No subscribers yet.</div>';

  // Recent store requests
  const { data: recentReqs } = await client.from('store_requests').select('store_name, city, state, created_at').order('created_at', { ascending: false }).limit(6);
  const reqsList = document.getElementById('recent-requests-list');
  reqsList.innerHTML = recentReqs && recentReqs.length ? recentReqs.map(r =>
    `<div class="recent-item">
      <span class="recent-item__email">${escHtml(r.store_name)}, ${escHtml(r.city || '')} ${escHtml(r.state || '')}</span>
      <span class="recent-item__date">${fmtDate(r.created_at)}</span>
    </div>`).join('') : '<div class="empty">No requests yet.</div>';
}

// ── PRODUCTS ─────────────────────────────────────────────────────────
async function loadProducts() {
  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading…</td></tr>';

  const { data, error } = await client.from('products').select('*').order('sort_order');
  if (error) { tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error: ${error.message}</td></tr>`; return; }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td>
        <div class="product-cell">
          ${p.image_url ? `<img class="product-thumb" src="${escHtml(p.image_url)}" alt="${escHtml(p.name)}" onerror="this.style.display='none'">` : '<div class="product-thumb"></div>'}
          <div>
            <div class="product-name">${escHtml(p.name)}</div>
            <div class="product-slug">${escHtml(p.slug)}</div>
          </div>
        </div>
      </td>
      <td>${typeBadge(p.type)}</td>
      <td style="color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.vibe || '—')}</td>
      <td style="font-weight:700;color:#e75480">${p.price && parseFloat(p.price) > 0 ? '$' + parseFloat(p.price).toFixed(2) : '<span style="color:var(--muted);font-weight:400">—</span>'}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${p.sort_order}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-icon" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn btn-danger btn-icon" onclick="deleteProduct('${p.id}','${escHtml(p.name)}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');

  // Add Product button
  document.getElementById('addProductBtn').onclick = () => productModal(null);
}

function productModal(product) {
  const isEdit = !!product;
  const p = product || {};
  const html = `
    <div class="form-group">
      <label>Product Name</label>
      <input type="text" id="f_name" value="${escHtml(p.name||'')}" placeholder="e.g. Strawberry Matcha">
    </div>
    <div class="form-group">
      <label>URL Slug</label>
      <input type="text" id="f_slug" value="${escHtml(p.slug||'')}" placeholder="e.g. strawberry-matcha">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Type</label>
        <select id="f_type">
          <option value="Hybrid"  ${p.type==='Hybrid'  ?'selected':''}>Hybrid</option>
          <option value="Indica"  ${p.type==='Indica'  ?'selected':''}>Indica</option>
          <option value="Sativa"  ${p.type==='Sativa'  ?'selected':''}>Sativa</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f_status">
          <option value="active" ${p.status==='active'||!p.status?'selected':''}>Active</option>
          <option value="hidden" ${p.status==='hidden'?'selected':''}>Hidden</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Vibe (Short Description)</label>
      <input type="text" id="f_vibe" value="${escHtml(p.vibe||'')}" placeholder="e.g. Sweet strawberry. Creamy, earthy, smooth.">
    </div>
    <div class="form-group">
      <label>Moods</label>
      <input type="text" id="f_moods" value="${escHtml(p.moods||'')}" placeholder="e.g. Good vibes · Golden hour · Chill">
    </div>
    <div class="form-group">
      <label>Full Description</label>
      <textarea id="f_description">${escHtml(p.description||'')}</textarea>
    </div>
    <div class="form-group">
      <label>Product Image (Upload)</label>
      <input type="file" id="f_image_file" accept="image/*" style="background:var(--surface2);color:#fff;padding:8px">
      <input type="hidden" id="f_image" value="${escHtml(p.image_url||'')}">
      ${p.image_url ? `<div style="font-size:0.75rem;margin-top:4px;color:var(--muted)">Current: <a href="${escHtml(p.image_url)}" target="_blank" style="color:var(--pink)">View Image</a></div>` : ''}
    </div>
    <div class="form-group">
      <label>Product Video (Upload)</label>
      <input type="file" id="f_video_file" accept="video/*" style="background:var(--surface2);color:#fff;padding:8px">
      <input type="hidden" id="f_video" value="${escHtml(p.video_url||'')}">
      ${p.video_url ? `<div style="font-size:0.75rem;margin-top:4px;color:var(--muted)">Current: <a href="${escHtml(p.video_url)}" target="_blank" style="color:var(--pink)">View Video</a></div>` : ''}
    </div>
    <div class="form-group">
      <label>Sort Order</label>
      <input type="number" id="f_order" value="${p.sort_order||0}" min="0">
    </div>
    <div class="form-group">
      <label>Price (USD $) — displayed on product cards</label>
      <input type="number" id="f_price" value="${p.price||0}" min="0" step="0.01" placeholder="e.g. 29.99" style="font-size:1rem;font-weight:700;color:#e75480">
    </div>`;

  openModal(isEdit ? 'Edit Product' : 'Add Product', html, async () => {
    const saveBtn = document.getElementById('modalSave');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
      let imgUrl = document.getElementById('f_image').value.trim();
      let vidUrl = document.getElementById('f_video').value.trim();

      const imgFile = document.getElementById('f_image_file').files[0];
      const vidFile = document.getElementById('f_video_file').files[0];

      if (imgFile) {
        saveBtn.textContent = 'Uploading Image...';
        const fileExt = imgFile.name.split('.').pop();
        const fileName = `${Date.now()}-img.${fileExt}`;
        const { data, error } = await client.storage.from('media').upload(`products/${fileName}`, imgFile);
        if (error) throw new Error('Image upload failed: ' + error.message);
        const { data: pubData } = client.storage.from('media').getPublicUrl(`products/${fileName}`);
        imgUrl = pubData.publicUrl;
      }

      if (vidFile) {
        saveBtn.textContent = 'Uploading Video...';
        const fileExt = vidFile.name.split('.').pop();
        const fileName = `${Date.now()}-vid.${fileExt}`;
        const { data, error } = await client.storage.from('media').upload(`products/${fileName}`, vidFile);
        if (error) throw new Error('Video upload failed: ' + error.message);
        const { data: pubData } = client.storage.from('media').getPublicUrl(`products/${fileName}`);
        vidUrl = pubData.publicUrl;
      }

      saveBtn.textContent = 'Saving Product...';
      const payload = {
        name:        document.getElementById('f_name').value.trim(),
        slug:        document.getElementById('f_slug').value.trim().toLowerCase().replace(/\s+/g,'-'),
        type:        document.getElementById('f_type').value,
        status:      document.getElementById('f_status').value,
        vibe:        document.getElementById('f_vibe').value.trim(),
        moods:       document.getElementById('f_moods').value.trim(),
        description: document.getElementById('f_description').value.trim(),
        image_url:   imgUrl,
        video_url:   vidUrl,
        sort_order:  parseInt(document.getElementById('f_order').value) || 0,
        price:       parseFloat(document.getElementById('f_price').value) || 0,
        updated_at:  new Date().toISOString(),
      };
      if (!payload.name || !payload.slug) { toast('Name and slug are required.', 'error'); return; }
      
      const { error } = isEdit
        ? await client.from('products').update(payload).eq('id', p.id)
        : await client.from('products').insert(payload);
        
      if (error) throw error;
      
      toast(isEdit ? 'Product updated!' : 'Product added!');
      closeModal();
      loadProducts();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }
  });
}

window.editProduct = async (id) => {
  const { data } = await client.from('products').select('*').eq('id', id).single();
  productModal(data);
};

window.deleteProduct = async (id, name) => {
  if (!confirm(`Delete product "${name}"? This cannot be undone.`)) return;
  const { error } = await client.from('products').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(`"${name}" deleted.`);
  loadProducts();
};

// ── CATEGORIES ───────────────────────────────────────────────────────
async function loadCategories() {
  const tbody = document.getElementById('categoriesTableBody');
  tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">Loading…</td></tr>';
  const { data, error } = await client.from('categories').select('*').order('name');
  if (error) { tbody.innerHTML = `<tr><td colspan="3" class="loading-cell">${error.message}</td></tr>`; return; }

  tbody.innerHTML = data.map(c => `
    <tr>
      <td style="font-weight:600">${escHtml(c.name)}</td>
      <td style="color:var(--muted)">${escHtml(c.description||'—')}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-icon" onclick="editCategory('${c.id}')">Edit</button>
          <button class="btn btn-danger btn-icon" onclick="deleteCategory('${c.id}','${escHtml(c.name)}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');

  document.getElementById('addCategoryBtn').onclick = () => categoryModal(null);
}

function categoryModal(cat) {
  const isEdit = !!cat;
  const c = cat || {};
  const html = `
    <div class="form-group"><label>Category Name</label><input type="text" id="c_name" value="${escHtml(c.name||'')}" placeholder="e.g. Indica"></div>
    <div class="form-group"><label>Description</label><textarea id="c_desc">${escHtml(c.description||'')}</textarea></div>
    <div class="form-group"><label>Image URL (optional)</label><input type="text" id="c_img" value="${escHtml(c.image_url||'')}"></div>`;
  openModal(isEdit ? 'Edit Category' : 'Add Category', html, async () => {
    const payload = {
      name:        document.getElementById('c_name').value.trim(),
      description: document.getElementById('c_desc').value.trim(),
      image_url:   document.getElementById('c_img').value.trim() || null,
    };
    if (!payload.name) { toast('Name required.', 'error'); return; }
    const { error } = isEdit
      ? await client.from('categories').update(payload).eq('id', c.id)
      : await client.from('categories').insert(payload);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast(isEdit ? 'Category updated!' : 'Category added!');
    closeModal(); loadCategories();
  });
}

window.editCategory = async (id) => {
  const { data } = await client.from('categories').select('*').eq('id', id).single();
  categoryModal(data);
};
window.deleteCategory = async (id, name) => {
  if (!confirm(`Delete "${name}"?`)) return;
  const { error } = await client.from('categories').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(`"${name}" deleted.`); loadCategories();
};

// ── STORES ───────────────────────────────────────────────────────────
async function loadStores() {
  const tbody = document.getElementById('storesTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Loading stores…</td></tr>';
  const { data, error } = await client.from('stores').select('*').order('city');
  if (error) { tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">${error.message}</td></tr>`; return; }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No stores added yet. Add your first store to populate the locator.</td></tr>';
  } else {
    tbody.innerHTML = data.map(s => `
      <tr>
        <td style="font-weight:600">${escHtml(s.store_name)}</td>
        <td>${escHtml(s.city||'—')}</td>
        <td>${escHtml(s.state||'—')}</td>
        <td>${statusBadge(s.status)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-icon" onclick="editStore('${s.id}')">Edit</button>
            <button class="btn btn-danger btn-icon" onclick="deleteStore('${s.id}','${escHtml(s.store_name)}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  }

  document.getElementById('addStoreBtn').onclick = () => storeModal(null);
}

function storeModal(store) {
  const isEdit = !!store;
  const s = store || {};
  const html = `
    <div class="form-group"><label>Store Name</label><input type="text" id="s_name" value="${escHtml(s.store_name||'')}" placeholder="Green Leaf Dispensary"></div>
    <div class="form-group"><label>Address</label><input type="text" id="s_addr" value="${escHtml(s.address||'')}"></div>
    <div class="form-row">
      <div class="form-group"><label>City</label><input type="text" id="s_city" value="${escHtml(s.city||'')}"></div>
      <div class="form-group"><label>State</label><input type="text" id="s_state" value="${escHtml(s.state||'')}" placeholder="WA" maxlength="2"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Latitude</label><input type="number" step="any" id="s_lat" value="${s.lat||''}"></div>
      <div class="form-group"><label>Longitude</label><input type="number" step="any" id="s_lng" value="${s.lng||''}"></div>
    </div>
    <div class="form-group"><label>Phone</label><input type="text" id="s_phone" value="${escHtml(s.phone||'')}"></div>
    <div class="form-group"><label>Opening Hours</label><input type="text" id="s_hours" value="${escHtml(s.hours||'')}" placeholder="Mon-Sun 9am-10pm"></div>
    <div class="form-group">
      <label>Status</label>
      <select id="s_status">
        <option value="stocked"  ${s.status==='stocked' ||!s.status?'selected':''}>Stocked</option>
        <option value="soon"     ${s.status==='soon'    ?'selected':''}>Coming Soon</option>
        <option value="inactive" ${s.status==='inactive'?'selected':''}>Inactive</option>
      </select>
    </div>`;
  openModal(isEdit ? 'Edit Store' : 'Add Store', html, async () => {
    const payload = {
      store_name: document.getElementById('s_name').value.trim(),
      address:    document.getElementById('s_addr').value.trim() || null,
      city:       document.getElementById('s_city').value.trim() || null,
      state:      document.getElementById('s_state').value.trim().toUpperCase() || null,
      lat:        parseFloat(document.getElementById('s_lat').value) || null,
      lng:        parseFloat(document.getElementById('s_lng').value) || null,
      phone:      document.getElementById('s_phone').value.trim() || null,
      hours:      document.getElementById('s_hours').value.trim() || null,
      status:     document.getElementById('s_status').value,
    };
    if (!payload.store_name) { toast('Store name required.', 'error'); return; }
    const { error } = isEdit
      ? await client.from('stores').update(payload).eq('id', s.id)
      : await client.from('stores').insert(payload);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast(isEdit ? 'Store updated!' : 'Store added!');
    closeModal(); loadStores();
  });
}

window.editStore = async (id) => {
  const { data } = await client.from('stores').select('*').eq('id', id).single();
  storeModal(data);
};
window.deleteStore = async (id, name) => {
  if (!confirm(`Remove store "${name}"?`)) return;
  const { error } = await client.from('stores').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'error'); return; }
  toast(`Store removed.`); loadStores();
};

// ── CMS ──────────────────────────────────────────────────────────────
async function loadCMS() {
  const container = document.getElementById('cmsCards');
  container.innerHTML = '<div class="loading-cell">Loading CMS content…</div>';
  const { data, error } = await client.from('cms_content').select('*').order('section_name');
  if (error) { container.innerHTML = `<div>${error.message}</div>`; return; }

  container.innerHTML = data.map(item => `
    <div class="cms-card">
      <div class="cms-card__section">${escHtml(item.section_name.replace(/_/g,' ').toUpperCase())}</div>
      <div class="cms-card__title">${escHtml(item.title||'—')}</div>
      <div class="cms-card__sub">${escHtml(item.subtitle||'')}${item.body ? '<br>' + escHtml(item.body.substring(0,80)) + (item.body.length>80?'…':'') : ''}</div>
      <div class="cms-card__actions">
        <button class="btn btn-outline btn-icon" onclick="editCMS('${item.id}')">Edit Content</button>
      </div>
    </div>`).join('');
}

window.editCMS = async (id) => {
  const { data: item } = await client.from('cms_content').select('*').eq('id', id).single();
  const html = `
    <div class="form-group"><label>Section</label><input type="text" value="${escHtml(item.section_name)}" disabled style="opacity:.5"></div>
    <div class="form-group"><label>Title</label><input type="text" id="cms_title" value="${escHtml(item.title||'')}"></div>
    <div class="form-group"><label>Subtitle / Eyebrow</label><input type="text" id="cms_sub" value="${escHtml(item.subtitle||'')}"></div>
    <div class="form-group"><label>Body Text</label><textarea id="cms_body">${escHtml(item.body||'')}</textarea></div>
    <div class="form-group"><label>Image URL</label><input type="text" id="cms_img" value="${escHtml(item.image_url||'')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Button Text</label><input type="text" id="cms_btn" value="${escHtml(item.button_text||'')}"></div>
      <div class="form-group"><label>Button Link</label><input type="text" id="cms_link" value="${escHtml(item.button_link||'')}"></div>
    </div>`;
  openModal('Edit: ' + item.section_name, html, async () => {
    const payload = {
      title:       document.getElementById('cms_title').value.trim(),
      subtitle:    document.getElementById('cms_sub').value.trim(),
      body:        document.getElementById('cms_body').value.trim(),
      image_url:   document.getElementById('cms_img').value.trim() || null,
      button_text: document.getElementById('cms_btn').value.trim(),
      button_link: document.getElementById('cms_link').value.trim(),
      updated_at:  new Date().toISOString(),
    };
    const { error } = await client.from('cms_content').update(payload).eq('id', id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Content updated!');
    closeModal(); loadCMS();
  });
};

// ── SUBSCRIBERS ──────────────────────────────────────────────────────
async function loadSubscribers() {
  const tbody = document.getElementById('subscribersTableBody');
  tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">Loading…</td></tr>';
  const { data, error } = await client.from('subscribers').select('*').order('created_at', { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="3" class="loading-cell">${error.message}</td></tr>`; return; }

  tbody.innerHTML = data.length ? data.map(s =>
    `<tr>
      <td>${escHtml(s.email)}</td>
      <td><span class="badge badge--active">${escHtml(s.source||'homepage')}</span></td>
      <td style="color:var(--muted)">${fmtDate(s.created_at)}</td>
    </tr>`).join('') : '<tr><td colspan="3" class="loading-cell">No subscribers yet.</td></tr>';

  document.getElementById('exportSubsBtn').onclick = () => {
    const csv = 'Email,Source,Date\n' + data.map(s =>
      `"${s.email}","${s.source||'homepage'}","${fmtDate(s.created_at)}"`).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'mwah-subscribers.csv';
    a.click();
  };
}

// ── STORE REQUESTS ───────────────────────────────────────────────────
async function loadRequests() {
  const tbody = document.getElementById('requestsTableBody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">Loading…</td></tr>';
  const { data, error } = await client.from('store_requests').select('*').order('created_at', { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">${error.message}</td></tr>`; return; }

  tbody.innerHTML = data.length ? data.map(r =>
    `<tr>
      <td style="font-weight:600">${escHtml(r.store_name)}</td>
      <td>${escHtml(r.city||'—')}</td>
      <td>${escHtml(r.state||'—')}</td>
      <td style="color:var(--muted)">${fmtDate(r.created_at)}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="loading-cell">No requests yet.</td></tr>';
}

// ── ORDERS ─────────────────────────────────────────────
const PAYMENT_LABELS = {
  chime: 'Chime', bank_transfer: 'Bank Transfer', wise: 'Wise',
  crypto: 'Crypto', zelle: 'Zelle', google_pay: 'Google Pay', apple_pay: 'Apple Pay',
};
const STATUS_COLORS = {
  pending: 'orange', processing: 'hybrid', shipped: 'sativa', delivered: 'active', cancelled: 'inactive',
};

async function loadOrders() {
  const tbody = document.getElementById('ordersTableBody');
  tbody.innerHTML = '<tr><td colspan="10" class="loading-cell">Loading orders…</td></tr>';
  const { data, error } = await client.from('orders').select('*').order('created_at', { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="10" class="loading-cell">${error.message}</td></tr>`; return; }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="loading-cell">No orders yet. Orders from the website will appear here.</td></tr>';
  } else {
    tbody.innerHTML = data.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemSummary = items.map(i => `${i.name} ×${i.qty||1}`).join(', ');
      const statusCls = STATUS_COLORS[o.status] || 'active';
      const pmLabel = PAYMENT_LABELS[o.payment_method] || o.payment_method || '—';
      return `<tr>
        <td style="font-weight:800;color:var(--pink);font-size:.8rem">${escHtml(o.order_number||'—')}</td>
        <td>
          <div style="font-weight:600">${escHtml(o.full_name)}</div>
          <div style="font-size:.75rem;color:var(--muted)">${escHtml(o.phone||'')}</div>
        </td>
        <td style="font-size:.82rem">${escHtml(o.email)}</td>
        <td style="font-size:.8rem;color:var(--muted)">${escHtml([o.city,o.country].filter(Boolean).join(', '))}</td>
        <td style="font-size:.78rem;color:var(--muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(itemSummary)}">${escHtml(itemSummary||'—')}</td>
        <td style="font-weight:800;color:var(--pink)">$${parseFloat(o.subtotal||0).toFixed(2)}</td>
        <td><span class="badge badge--active" style="font-size:.7rem">${escHtml(pmLabel)}</span></td>
        <td>
          <select class="order-status-sel" onchange="updateOrderStatus('${o.id}', this.value)" style="background:var(--surface2);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;font-family:inherit;font-size:.75rem;padding:4px 8px;cursor:pointer">
            ${['pending','processing','shipped','delivered','cancelled'].map(s =>
              `<option value="${s}" ${o.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
            ).join('')}
          </select>
        </td>
        <td style="color:var(--muted);font-size:.8rem">${fmtDate(o.created_at)}</td>
        <td>
          <button class="btn btn-outline btn-icon" onclick="viewOrder('${o.id}')">View</button>
        </td>
      </tr>`;
    }).join('');
  }

  // Export CSV
  document.getElementById('exportOrdersBtn').onclick = () => {
    if (!data.length) return;
    const rows = data.map(o => [
      o.order_number, o.full_name, o.email, o.phone, o.gender,
      o.country, o.city, o.address, o.subtotal, o.payment_method, o.status, fmtDate(o.created_at),
      (Array.isArray(o.items) ? o.items.map(i => i.name+'x'+i.qty).join(' | ') : ''),
      o.notes || ''
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
    const csv = 'Order#,Name,Email,Phone,Gender,Country,City,Address,Total,Payment,Status,Date,Items,Notes\n' + rows.join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'mwah-orders.csv';
    a.click();
  };
}

window.updateOrderStatus = async (id, status) => {
  const { error } = await client.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Error updating status: ' + error.message, 'error'); return; }
  toast('Order status updated!');
};

window.viewOrder = async (id) => {
  const { data: o, error } = await client.from('orders').select('*').eq('id', id).single();
  if (error || !o) { toast('Could not load order.', 'error'); return; }
  const items = Array.isArray(o.items) ? o.items : [];
  const pmLabel = PAYMENT_LABELS[o.payment_method] || o.payment_method || '—';
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="form-group" style="gap:4px"><label>Order #</label><div style="font-weight:800;color:#e75480">${escHtml(o.order_number||'')}</div></div>
      <div class="form-group" style="gap:4px"><label>Status</label><div style="font-weight:700;text-transform:capitalize">${escHtml(o.status)}</div></div>
      <div class="form-group" style="gap:4px"><label>Full Name</label><div style="font-weight:600">${escHtml(o.full_name)}</div></div>
      <div class="form-group" style="gap:4px"><label>Gender</label><div>${escHtml(o.gender||'—')}</div></div>
      <div class="form-group" style="gap:4px"><label>Email</label><div>${escHtml(o.email)}</div></div>
      <div class="form-group" style="gap:4px"><label>Phone</label><div>${escHtml(o.phone)}</div></div>
      <div class="form-group" style="gap:4px"><label>Country</label><div>${escHtml(o.country)}</div></div>
      <div class="form-group" style="gap:4px"><label>City</label><div>${escHtml(o.city)}</div></div>
      <div class="form-group" style="gap:4px;grid-column:1/-1"><label>Full Address</label><div>${escHtml(o.address||'—')}</div></div>
      <div class="form-group" style="gap:4px"><label>Payment Method</label><div style="font-weight:700">${escHtml(pmLabel)}</div></div>
      <div class="form-group" style="gap:4px"><label>Order Total</label><div style="font-weight:800;color:#e75480;font-size:1.1rem">$${parseFloat(o.subtotal||0).toFixed(2)}</div></div>
    </div>
    <label style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#e75480">Items Ordered</label>
    <div style="margin-top:8px;border:1px solid rgba(255,255,255,.1);border-radius:10px;overflow:hidden">
      ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);font-size:.85rem"><span>${escHtml(i.name)} <span style="color:#888">×${i.qty||1}</span></span><span style="font-weight:700">$${((parseFloat(i.price)||0)*(i.qty||1)).toFixed(2)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 14px;font-weight:800;font-size:.9rem;color:#e75480"><span>Total</span><span>$${parseFloat(o.subtotal||0).toFixed(2)}</span></div>
    </div>
    ${o.notes ? `<div style="margin-top:12px"><label style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#888">Customer Notes</label><p style="margin-top:4px;font-size:.85rem;color:#ccc">${escHtml(o.notes)}</p></div>` : ''}
    <div style="margin-top:12px">
      <label style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#888">Update Status</label>
      <select id="modal_status" style="margin-top:6px;width:100%;background:var(--surface2);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-family:inherit;font-size:.9rem;padding:10px 14px">
        ${['pending','processing','shipped','delivered','cancelled'].map(s =>
          `<option value="${s}" ${o.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
        ).join('')}
      </select>
    </div>`;
  openModal(`Order: ${o.order_number||'Detail'}`, html, async () => {
    const newStatus = document.getElementById('modal_status').value;
    const { error } = await client.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', o.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Order status updated!');
    closeModal();
    loadOrders();
  }, 'Update Status');
};

// ── SECURITY: Escape HTML ─────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── BOOT ─────────────────────────────────────────────────────────────
init();
