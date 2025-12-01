/* CONFIG */
// Configuração do servidor com detecção automática de ambiente
const DEFAULT_SERVER_URL = "http://192.168.6.5:5000";

// Função para obter o SERVER_URL de diferentes fontes (localStorage, window.serverConfig, ou padrão)
function getServerUrl() {
    // 1. Verificar se há configuração no localStorage (permite que o usuário configure)
    const savedUrl = localStorage.getItem('cardapio_server_url');
    if (savedUrl) return savedUrl;
    
    // 2. Verificar se há configuração global definida na página
    if (window.serverConfig && window.serverConfig.apiUrl) {
        return window.serverConfig.apiUrl;
    }
    
    // 3. Usar URL padrão
    return DEFAULT_SERVER_URL;
}

// Inicializar SERVER_URL
const SERVER_URL = getServerUrl();
const PRODUCTS_JSON = SERVER_URL + '/api/products'; // (mantido apenas como referência)

/* --- helper: resolve sempre para SERVER_URL se definido --- */
function api(path) {
    // path deve começar com '/api/...'
    if (typeof SERVER_URL === 'string' && SERVER_URL) {
        return SERVER_URL.replace(/\/+$/, '') + path;
    }
    return path;
}

/* --- SOCKET.IO (conexão igual ao painel) --- */
let socket = null;
try {
    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 9999,
        timeout: 20000
    });
    socket.on('connect', () => console.log('Socket conectado (index)'));
    socket.on('connect_error', (err) => console.error('Socket connect_error (index):', err));
    socket.on('disconnect', (reason) => console.warn('Socket desconectado (index):', reason));
} catch (e) {
    console.warn('Socket.IO client não inicializado:', e);
}
if (socket) {
    socket.on('connect', () => {
        console.log('Socket conectado (cliente) id:', socket.id);
        try { showNotification('Conectado ao servidor', 'success'); } catch (e) { }
    });
    socket.on('server_message', msg => console.log('server_message:', msg));
    socket.on('pedido_confirmado', data => {
        console.log('pedido_confirmado recebido do servidor:', data);
    });
}

/* Estado */
let PRODUCTS = [];
const PREFERRED_CATEGORY_ORDER = ['Doces', 'Salgados', 'Bebidas'];
let CATEGORIES = {};
let cart = {}; // {productId: qty}
let searchTerm = ''; // Para armazenar o termo de busca atual

// Chave para armazenar o carrinho no localStorage
const CART_STORAGE_KEY = 'cardapio_cart_v1';
// Função para salvar o carrinho no localStorage
function saveCartToLocalStorage() {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
        console.warn('Não foi possível salvar o carrinho no localStorage:', e);
    }
}

// Função para obter o tema atual
function getCurrentTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === THEME_DARK || savedTheme === THEME_LIGHT) {
        return savedTheme;
    }
    
    // Verificar preferência do sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return THEME_DARK;
    }
    
    return THEME_LIGHT;
}

// Função para aplicar o tema
function applyTheme(theme) {
    if (theme === THEME_DARK) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    
    localStorage.setItem(THEME_KEY, theme);
}

// Função para alternar o tema
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    applyTheme(newTheme);
    return newTheme;
}

/* util */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function money(v) { return Number(v).toFixed(2).replace('.', ','); }
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    const el = document.createElement('div');
    el.textContent = str;
    return el.innerHTML;
}
function randomColorFromString(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i); const hue = Math.abs(h) % 360; return `hsl(${hue}deg 90% 65%)`; }

/* Notificação (toast simple) */
function showNotification(message, type = 'info', duration = 3000) {
    try {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.position = 'fixed';
            container.style.right = '16px';
            container.style.top = '16px';
            container.style.zIndex = 99999;
            document.body.appendChild(container);
        }
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<div class="toast-msg">${escapeHtml(message)}</div>`;
        t.style.marginBottom = '8px';
        t.style.padding = '10px 14px';
        t.style.borderRadius = '10px';
        t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
        t.style.fontWeight = '600';
        t.style.background = type === 'success' ? 'linear-gradient(90deg,#43a047,#2e7d32)' :
            type === 'error' ? 'linear-gradient(90deg,#e53935,#b71c1c)' :
                type === 'warning' ? 'linear-gradient(90deg,#f57c00,#ef6c00)' :
                    'linear-gradient(90deg,#455a64,#37474f)';
        t.style.color = '#fff';
        container.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(12px)';
            setTimeout(() => t.remove(), 350);
        }, duration);
    } catch (e) {
        try { alert(message); } catch (_) { console.log(message); }
    }
}

/* ------------------ Carregamento / render ------------------ */

async function loadProducts() {
    let data = null;
    // tenta a API no SERVER_URL (via helper api)
    try {
        const res = await fetch(api('/api/products'), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();
    } catch (err) {
        console.warn('Falha ao carregar produtos pela API:', err);
    }

    // fallback para arquivos locais se não conseguiu
    if (!Array.isArray(data)) {
        const fallbackPaths = [
            './Data/products.json',
            '../Data/products.json',
            './products.json'
        ];
        for (const p of fallbackPaths) {
            try {
                const r = await fetch(p, { cache: 'no-store' });
                if (!r.ok) continue;
                const d = await r.json();
                if (Array.isArray(d)) { data = d; console.log('Produtos carregados do fallback:', p); break; }
            } catch (e) { /* ignora */ }
        }
    }

    if (!Array.isArray(data)) {
        console.error('Não foi possível carregar products.json pela API nem por fallback.');
        const catEl = document.getElementById('categories');
        if (catEl) catEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Erro ao carregar <code>products.json</code>. Verifique o servidor/API e abra via servidor local.</div>';
        return;
    }

    PRODUCTS = data.map(p => ({
        id: p.id !== undefined ? p.id : (p.name && p.name.toLowerCase().split(' ').join('_')),
        name: p.name,
        price: Number(p.price) || 0,
        quantity: (p.quantity !== undefined ? Number(p.quantity) : 0),
        category: (p.category || 'Outros').toString(),
        desc: p.desc || p.description || ''
    }));

    buildCategoriesAndRender();
}

function buildCategoriesAndRender() {
    CATEGORIES = {};
    for (const p of PRODUCTS) {
        const cat = p.category || 'Outros';
        if (!CATEGORIES[cat]) CATEGORIES[cat] = [];
        CATEGORIES[cat].push({ id: p.id, name: p.name, price: Number(p.price) || 0, quantity: p.quantity || 0, desc: p.desc || '' });
    }
    const ordered = {};
    for (const pref of PREFERRED_CATEGORY_ORDER) if (CATEGORIES[pref]) ordered[pref] = CATEGORIES[pref];
    for (const k of Object.keys(CATEGORIES)) if (!ordered[k]) ordered[k] = CATEGORIES[k];
    CATEGORIES = ordered;
    renderCategoryNav();
    renderCategories();
    
    // Inicializar a busca se houver um termo de busca
    if (searchTerm) {
        filterProductsBySearch(searchTerm);
    }
}

function renderCategoryNav() {
    const nav = document.getElementById('catsNav'); if (!nav) return;
    nav.innerHTML = '';
    const keys = Object.keys(CATEGORIES);
    if (keys.length === 0) return;
    keys.forEach((k, i) => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn' + (i === 0 ? ' active' : '');
        btn.textContent = `${k} (${CATEGORIES[k].length})`;
        btn.dataset.cat = k;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.category').forEach(el => el.style.display = el.dataset.cat === k ? 'block' : 'none');
        });
        nav.appendChild(btn);
    });
}

function renderCategories() {
    const container = document.getElementById('categories');
    if (!container) return;
    container.innerHTML = '';
    const keys = Object.keys(CATEGORIES);
    if (keys.length === 0) {
        container.innerHTML = '<div style="color:var(--muted)">Nenhuma categoria encontrada.</div>';
        return;
    }

    // Se estiver em modo de busca, mostrar resultados em uma única seção
    if (searchTerm) {
        const searchResults = [];
        // Coletar todos os produtos que correspondem à busca
        for (const k of keys) {
            for (const p of CATEGORIES[k]) {
                if (productMatchesSearch(p, searchTerm)) {
                    searchResults.push({...p, category: k});
                }
            }
        }

        if (searchResults.length === 0) {
            container.innerHTML = `<div class="search-results-info">Nenhum produto encontrado para "${escapeHtml(searchTerm)}"</div>`;
            return;
        }

        const section = document.createElement('div');
        section.className = 'category search-results';
        section.innerHTML = `<h2>Resultados da busca (${searchResults.length})</h2><div class="items" id="search-results"></div>`;
        container.appendChild(section);

        const itemsEl = section.querySelector('#search-results');
        for (const p of searchResults) {
            renderProductItem(p, itemsEl, p.category);
        }
        return;
    }

    // Renderização normal por categorias
    keys.forEach((k, i) => {
        const section = document.createElement('div');
        section.className = 'category';
        section.dataset.cat = k;
        section.style.display = i === 0 ? 'block' : 'none';
        section.innerHTML = `<h2>${k}</h2><div class="items" id="items-${i}"></div>`;
        container.appendChild(section);

        const itemsEl = section.querySelector(`#items-${i}`);
        for (const p of CATEGORIES[k]) {
            renderProductItem(p, itemsEl, k);
        }
    });
}

// Função auxiliar para renderizar um item de produto
function renderProductItem(p, container, categoryName) {
    const id = (p.id !== undefined && p.id !== null) ? p.id : ((p.name && p.name.toLowerCase().split(' ').join('_')) || Math.random().toString(36).slice(2, 8));
    const price = Number(p.price || 0);
    const desc = p.desc || '';
    const color = p.color || randomColorFromString(categoryName);

    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
        <div class="thumb" style="background:linear-gradient(135deg, ${color}, #ff7043);">${(p.name || '').split(' ')[0]}</div>
        <div class="meta"><b>${p.name}</b><small>${desc} · R$ ${money(price)} · Estoque: ${p.quantity ?? 0}</small></div>
        <div class="controls">
          <button class="btn-circle" data-id="${id}" data-action="dec">−</button>
          <div class="qty" id="qty-${id}">0</div>
          <button class="btn-circle btn-add" data-id="${id}" data-action="inc">+</button>
          <button class="btn-circle" title="Gerenciar estoque" data-manage-id="${id}" data-manage-name="${escapeHtml(p.name)}" style="margin-left:8px">⚙</button>
          <button class="btn-circle btn-delete" title="Remover produto" data-delete-id="${id}" data-delete-name="${escapeHtml(p.name)}" style="margin-left:6px;background:transparent;border:1px solid rgba(0,0,0,0.06)">🗑️</button>
        </div>
    `;
    const incBtn = item.querySelector('[data-action="inc"]');
    if (incBtn) {
        incBtn.dataset.price = price;
        incBtn.dataset.name = p.name;
        incBtn.dataset.id = id;
        incBtn.dataset.stock = p.quantity ?? 0;
    }
    container.appendChild(item);
    
    // Atualizar a quantidade no carrinho, se houver
    if (cart[id]) {
        const qtyEl = item.querySelector(`#qty-${id}`);
        if (qtyEl) qtyEl.textContent = cart[id];
    }
}

// Função para verificar se um produto corresponde ao termo de busca
function productMatchesSearch(product, term) {
    if (!term) return true;
    
    const searchLower = term.toLowerCase();
    const nameLower = (product.name || '').toLowerCase();
    const descLower = (product.desc || '').toLowerCase();
    const price = product.price?.toString() || '';
    
    return nameLower.includes(searchLower) || 
           descLower.includes(searchLower) || 
           price.includes(searchLower);
}

// Função para filtrar produtos com base no termo de busca
function filterProductsBySearch(term) {
    searchTerm = term.trim();
    
    // Se a busca estiver vazia, voltar à visualização normal
    if (!searchTerm) {
        // Mostrar a primeira categoria ativa novamente
        const activeBtn = document.querySelector('.cat-btn.active');
        if (activeBtn) {
            const cat = activeBtn.dataset.cat;
            document.querySelectorAll('.category').forEach(el => {
                el.style.display = el.dataset.cat === cat ? 'block' : 'none';
            });
        }
    }
    
    // Renderizar os resultados filtrados
    renderCategories();
}

/* ------------------ Cart handlers (delegation) ------------------ */

document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest && e.target.closest('[data-action]');
    if (actionBtn) {
        const id = actionBtn.dataset.id;
        const action = actionBtn.dataset.action;
        if (!id) return;
        if (action === 'inc') {
            const prod = PRODUCTS.find(p => (p.id !== undefined && p.id !== null && p.id.toString() === id.toString()) || (p.name && p.name.toLowerCase().split(' ').join('_') === id.toString()));
            const stock = prod ? Number(prod.quantity || 0) : Infinity;
            const current = cart[id] || 0;
            if (current + 1 > stock) {
                try { showNotification('Quantidade insuficiente em estoque', 'warning'); } catch (e) { alert('Quantidade insuficiente em estoque'); }
                return;
            }
            cart[id] = (cart[id] || 0) + 1;
        } else {
            cart[id] = Math.max(0, (cart[id] || 0) - 1);
        }
        const el = document.getElementById(`qty-${id}`);
        if (el) { el.textContent = cart[id]; el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 280); }
        renderCart();
        return;
    }

    // delete product (delegation)
    const deleteEl = e.target.closest && e.target.closest('[data-delete-id]');
    if (deleteEl) {
        const pid = deleteEl.getAttribute('data-delete-id') ?? deleteEl.dataset.deleteId;
        const pname = deleteEl.getAttribute('data-delete-name') ?? deleteEl.dataset.deleteName ?? pid;
        if (!pid) return;
        // impedir remover se estiver no carrinho
        if (cart[pid] && cart[pid] > 0) {
            alert('Remova o produto do carrinho antes de excluir.');
            return;
        }
        if (!confirm(`Remover o produto "${pname}"?`)) return;
        deleteEl.disabled = true;
        deleteProduct(pid).finally(() => deleteEl.disabled = false);
        e.preventDefault();
        return;
    }

    const manageEl = e.target.closest && e.target.closest('[data-manage-id]');
    if (manageEl) {
        const pid = manageEl.getAttribute('data-manage-id') ?? manageEl.dataset.manageId;
        const pname = manageEl.getAttribute('data-manage-name') ?? manageEl.dataset.manageName ?? '';
        openAdjustStockModalFor(pid, pname || manageEl.title || '');
        e.preventDefault();
        return;
    }
});

/* render cart */
function renderCart() {
    const list = document.getElementById('cart-list'); if (!list) return;
    list.innerHTML = '';
    let total = 0;
    const allProducts = PRODUCTS.slice();
    for (const id of Object.keys(cart)) {
        const qty = cart[id]; if (qty <= 0) continue;
        let prod = allProducts.find(p => (p.id !== undefined && p.id !== null && p.id.toString() === id.toString()));
        if (!prod) { prod = allProducts.find(p => (p.name && p.name.toLowerCase().split(' ').join('_')) === id.toString()); }
        if (!prod) { prod = { name: id, price: 0 }; }
        const row = document.createElement('div'); row.className = 'cart-row';
        row.innerHTML = `<div class="name">${prod.name} <small style="color:var(--muted)">× ${qty}</small></div><div>R$ ${money((Number(prod.price) || 0) * qty)}</div>`;
        list.appendChild(row);
        total += (Number(prod.price) || 0) * qty;
    }
    document.getElementById('total').textContent = `Total: R$ ${money(total)}`;
    
    // Salvar o carrinho no localStorage após cada atualização
    saveCartToLocalStorage();
}

/* ------------------ Modals & forms ------------------ */

function openAddProductModal() {
    const modal = document.getElementById('addProductModal');
    if (!modal) return console.warn('addProductModal não encontrado');
    modal.style.zIndex = 999999;
    modal.style.pointerEvents = 'auto';
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
        const input = document.getElementById('newProductName');
        if (input) { input.focus(); input.select && input.select(); }
    }, 50);
}

function openAdjustStockModalFor(productId, productName) {
    const modal = document.getElementById('adjustStockModal');
    if (!modal) { console.warn('adjustStockModal não encontrado.'); return; }
    const pidInput = document.getElementById('adjustProductId');
    const nameLabel = document.getElementById('adjustProductNameLabel');
    if (pidInput) pidInput.value = productId ?? '';
    if (nameLabel) nameLabel.textContent = productName ?? '';
    const qty = document.getElementById('adjustQty'); if (qty) qty.value = 1;
    const price = document.getElementById('adjustUnitPrice'); if (price) price.value = '';
    const who = document.getElementById('adjustWho'); if (who) who.value = '';
    const supplier = document.getElementById('adjustSupplier'); if (supplier) supplier.value = '';
    // garantir z-index e pointer events
    modal.style.zIndex = 999999;
    modal.style.pointerEvents = 'auto';
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    // controlar visibilidade do campo fornecedor (se type=entrada)
    const typeSel = document.getElementById('adjustType');
    if (typeSel && typeSel.value === 'entrada') {
        document.getElementById('adjustSupplierField').style.display = 'block';
    } else {
        document.getElementById('adjustSupplierField').style.display = 'none';
    }
    setTimeout(() => {
        const input = document.getElementById('adjustQty');
        if (input) { input.focus(); input.select && input.select(); }
    }, 50);
}

function closeAddProductModalFunc() {
    const modal = document.getElementById('addProductModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

function closeAdjustStockModalFunc() {
    const modal = document.getElementById('adjustStockModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

/* Ensures fallback add button exists and wires it */
function ensureAddProductBtn() {
    if (!document.getElementById('openAddProductBtn')) {
        const btn = document.createElement('button');
        btn.id = 'openAddProductBtn';
        btn.className = 'btn-cardapio';
        btn.title = 'Adicionar produto';
        btn.innerHTML = '<span style="font-weight:700;margin-right:6px">+</span> Adicionar Produto';
        btn.style.position = 'fixed';
        btn.style.right = '18px';
        btn.style.bottom = '18px';
        btn.style.zIndex = 99999;
        btn.style.padding = '10px 14px';
        btn.style.borderRadius = '12px';
        btn.style.boxShadow = '0 10px 30px rgba(0,0,0,0.08)';
        document.body.appendChild(btn);
    }
    const openBtn = document.getElementById('openAddProductBtn');
    openBtn && openBtn.addEventListener('click', () => openAddProductModal());
}

/* Wire modal close buttons (single source of truth) */
function wireModalCloseButtons() {
    const closeAdd = document.getElementById('closeAddProductModal');
    closeAdd && closeAdd.addEventListener('click', closeAddProductModalFunc);
    const addModal = document.getElementById('addProductModal');
    addModal && addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAddProductModalFunc(); });

    const closeAdjust = document.getElementById('closeAdjustStockModal');
    closeAdjust && closeAdjust.addEventListener('click', closeAdjustStockModalFunc);
    const adModal = document.getElementById('adjustStockModal');
    adModal && adModal.addEventListener('click', (e) => { if (e.target === adModal) closeAdjustStockModalFunc(); });

    const adjustCancelBtn = document.getElementById('adjustCancelBtn');
    adjustCancelBtn && adjustCancelBtn.addEventListener('click', closeAdjustStockModalFunc);

    // quando trocar tipo, mostrar/ocultar fornecedor
    const typeSel = document.getElementById('adjustType');
    if (typeSel) {
        typeSel.addEventListener('change', (ev) => {
            const val = ev.target.value;
            const f = document.getElementById('adjustSupplierField');
            if (f) f.style.display = (val === 'entrada') ? 'block' : 'none';
        });
    }

    // categoria: quando escolher 'Outra...' mostrar input custom
    const catSel = document.getElementById('newProductCategory');
    if (catSel) {
        const custom = document.getElementById('newProductCategoryCustom');
        catSel.addEventListener('change', (ev) => {
            if (custom) custom.style.display = (ev.target.value === '__outra__') ? 'block' : 'none';
        });
    }
}

/* Submits: criar produto com fallback de métodos */
async function submitAddProductForm(ev) {
    ev.preventDefault();
    const name = document.getElementById('newProductName')?.value.trim() || '';
    const price = Number(document.getElementById('newProductPrice')?.value || 0);
    // Categoria: se select = '__outra__' pegar valor do input custom
    let category = (document.getElementById('newProductCategory')?.value || '').trim() || 'Outros';
    if (category === '__outra__') {
        const custom = (document.getElementById('newProductCategoryCustom')?.value || '').trim();
        if (custom) category = custom;
        else category = 'Outros';
    }
    const quantity = parseInt(document.getElementById('newProductQty')?.value || 0) || 0;

    if (!name) { alert('Nome obrigatório'); return; }

    const url = api('/api/products');
    const payload = { name, price, category, quantity };
    const methodsToTry = ['POST', 'PUT', 'PATCH']; // fallback se 405

    let lastError = null;
    for (const method of methodsToTry) {
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let body = null;
            try { body = await res.json(); } catch (_) { body = null; }
            if (res.ok) {
                await refreshProductsFromServer();
                closeAddProductModalFunc();
                ev.target.reset && ev.target.reset();
                // reset custom category input visibility
                const custom = document.getElementById('newProductCategoryCustom');
                if (custom) custom.style.display = 'none';
                try { showNotification && showNotification('Produto criado', 'success'); } catch (_) { }
                return;
            } else {
                if (res.status === 405) {
                    lastError = new Error(`HTTP 405 com método ${method}`);
                    continue;
                } else {
                    throw new Error((body && body.error) ? body.error : `HTTP ${res.status}`);
                }
            }
        } catch (e) {
            lastError = e;
        }
    }
    console.error('Não foi possível criar produto (todos métodos tentados):', lastError);
    alert('Não foi possível criar produto: ' + (lastError && lastError.message ? lastError.message : 'Erro desconhecido'));
}

/* Submits: ajustar estoque */
async function submitAdjustStockForm(ev) {
    ev.preventDefault();
    let pid = document.getElementById('adjustProductId')?.value ?? '';
    const productNameLabel = document.getElementById('adjustProductNameLabel')?.textContent ?? '';
    if (!pid || isNaN(Number(pid))) {
        const found = (PRODUCTS || []).find(p => {
            if (!p) return false;
            if ((p.name || '').toLowerCase() === (productNameLabel || '').toLowerCase()) return true;
            const slug = (p.name || '').toLowerCase().split(' ').join('_');
            if (slug === (pid || '').toString()) return true;
            return false;
        });
        if (found) pid = found.id;
    }
    if (!pid) { alert('ID do produto inválido. Não foi possível identificar o produto para ajuste.'); return; }

    const type = document.getElementById('adjustType')?.value || 'entrada';
    const qty = parseInt(document.getElementById('adjustQty')?.value || 0);
    const unit_price = Number(document.getElementById('adjustUnitPrice')?.value || 0);
    const who = (document.getElementById('adjustWho')?.value || '').trim();
    const supplier = (document.getElementById('adjustSupplier')?.value || '').trim();

    if (!qty || qty <= 0) { alert('Quantidade inválida'); return; }

    const delta = (type === 'entrada') ? Math.abs(qty) : -Math.abs(qty);
    // incluir campos opcionais (who, supplier) - servidor pode ignorar se não esperar
    const payload = { delta, type, unit_price };
    if (who) payload.who = who;
    if (supplier && type === 'entrada') payload.supplier = supplier;

    // tentar POST → se 405, tentar PUT/PATCH
    const methodsToTry = ['POST', 'PUT', 'PATCH'];
    let lastError = null;
    for (const method of methodsToTry) {
        try {
            const res = await fetch(api(`/api/products/${encodeURIComponent(pid)}/stock`), {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let body = null;
            try { body = await res.json(); } catch (_) { body = null; }
            if (res.ok) {
                await refreshProductsFromServer();
                closeAdjustStockModalFunc();
                try { showNotification && showNotification('Estoque ajustado', 'success'); } catch (_) { }
                return;
            } else {
                if (res.status === 405) {
                    lastError = new Error(`HTTP 405 com método ${method}`);
                    continue;
                } else {
                    throw new Error((body && body.error) ? body.error : `HTTP ${res.status}`);
                }
            }
        } catch (e) {
            lastError = e;
        }
    }
    console.error('Erro ajustar estoque (todos métodos tentados):', lastError);
    alert('Erro ajustar estoque: ' + (lastError && lastError.message ? lastError.message : 'Erro desconhecido'));
}

/* Função para deletar produto (DELETE + fallback POST /delete) */
async function deleteProduct(pid) {
    try {
        const res = await fetch(api(`/api/products/${encodeURIComponent(pid)}`), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        let body = null;
        try { body = await res.json(); } catch (_) { body = null; }
        if (res.ok) {
            await refreshProductsFromServer();
            try { showNotification && showNotification('Produto removido', 'success'); } catch (_) { }
            return;
        }
        if (res.status === 405) {
            // fallback comum: POST /api/products/{id}/delete
            const r2 = await fetch(api(`/api/products/${encodeURIComponent(pid)}/delete`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            let b2 = null;
            try { b2 = await r2.json(); } catch (_) { b2 = null; }
            if (r2.ok) {
                await refreshProductsFromServer();
                try { showNotification && showNotification('Produto removido (fallback)', 'success'); } catch (_) { }
                return;
            } else {
                throw new Error((b2 && b2.error) ? b2.error : `HTTP ${r2.status} (fallback)`);
            }
        } else {
            throw new Error((body && body.error) ? body.error : `HTTP ${res.status}`);
        }
    } catch (err) {
        console.error('Erro ao remover produto:', err);
        alert('Erro ao remover produto: ' + (err.message || err));
    }
}

/* Refresh produtos do servidor */
async function refreshProductsFromServer() {
    try {
        const res = await fetch(api('/api/products'), { cache: 'no-store' });
        if (!res.ok) {
            let errBody = null;
            try { errBody = await res.json(); } catch (_) { /* nada */ }
            throw new Error(errBody && errBody.error ? errBody.error : `HTTP ${res.status}`);
        }
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!Array.isArray(data)) {
            console.warn('refreshProductsFromServer: resposta não é array. Mantendo lista atual.');
            return;
        }
        PRODUCTS.length = 0;
        data.forEach(p => PRODUCTS.push(p));
        buildCategoriesAndRender();
    } catch (err) {
        console.warn('refreshProductsFromServer erro:', err);
        try { showNotification && showNotification('Não foi possível atualizar produtos', 'warning'); } catch (_) { }
    }
}

/* Finalizar pedido */
function wireFinalizeOrder() {
    const modal = document.getElementById('modal');
    const finalizeBtn = document.getElementById('finalizeBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const submitBtn = document.getElementById('submitBtn');
    if (finalizeBtn) {
        finalizeBtn.addEventListener('click', () => {
            const any = Object.values(cart).some(q => q > 0);
            if (!any) {
                try { showNotification('Carrinho vazio. Adicione pelo menos um item.', 'warning'); } catch (e) { alert('Carrinho vazio. Adicione pelo menos um item.'); }
                return;
            }
            if (modal) modal.classList.add('show');
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.classList.remove('show'); });
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const name = document.getElementById('buyerName').value.trim();
            const payment = document.getElementById('paymentMethod').value;
            const note = document.getElementById('note').value.trim();
            if (!name) { try { showNotification('Informe o nome do comprador.', 'warning'); } catch (e) { alert('Informe o nome do comprador.'); } return; }
            const items = [];
            const allProducts = PRODUCTS.slice();
            let total = 0;
            for (const id of Object.keys(cart)) {
                const qty = cart[id]; if (qty <= 0) continue;
                let prod = allProducts.find(p => (p.id !== undefined && p.id !== null && p.id.toString() === id.toString()));
                if (!prod) { prod = allProducts.find(p => (p.name && p.name.toLowerCase().split(' ').join('_') === id.toString())); }
                if (!prod) prod = { name: id, price: 0, id };
                items.push({ id: prod.id || id, name: prod.name, qtd: qty, price: Number(prod.price) || 0 });
                total += (Number(prod.price) || 0) * qty;
            }
            const payload = { buyerInfo: { name }, itens: items, total, pagamento: payment, note };

            try {
                if (typeof socket !== 'undefined' && socket && socket.connected) {
                    socket.emit('novo_pedido', payload);
                } else {
                    const res = await fetch(api('/api/orders'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('Erro no envio HTTP');
                    await res.json();
                }

                for (const it of items) {
                    const p = PRODUCTS.find(x => x.id === it.id || x.name === it.name);
                    if (p) p.quantity = Math.max(0, (Number(p.quantity || 0) - Number(it.qtd)));
                }

                cart = {}; renderCart(); // Isso também salvará o carrinho vazio no localStorage
                if (modal) modal.classList.remove('show');
                document.getElementById('buyerName').value = ''; document.getElementById('note').value = '';
                document.querySelectorAll('[id^="qty-"]')?.forEach(e => e.textContent = '0');
                renderCategories();
                showNotification('Pedido enviado com sucesso!', 'success');
            } catch (err) {
                console.error(err);
                try { showNotification('Não foi possível enviar o pedido. Verifique a conexão.', 'error'); } catch (e) { alert('Não foi possível enviar o pedido. Verifique a conexão.'); }
            }
        });
    }
}

// Configurar a funcionalidade de busca
function setupProductSearch() {
    const searchInput = document.getElementById('searchProducts');
    const clearBtn = document.getElementById('clearSearch');
    
    if (searchInput) {
        // Ouvir mudanças no campo de busca (com debounce)
        let debounceTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const term = e.target.value.trim();
                filterProductsBySearch(term);
            }, 300); // 300ms de debounce para evitar muitas atualizações
        });
        
        // Ouvir tecla Enter para busca imediata
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(debounceTimeout);
                filterProductsBySearch(e.target.value.trim());
            }
        });
    }
    
    if (clearBtn) {
        // Limpar a busca ao clicar no botão X
        clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            filterProductsBySearch('');
            searchInput.focus();
        });
    }
}

/* Socket updates */
if (socket) {
    socket.on('product_updated', (payload) => {
        try {
            refreshProductsFromServer();
            console.log('product_updated', payload);
        } catch (e) { console.warn(e); }
    });
    socket.on('pedido_confirmado', (data) => {
        console.log('pedido_confirmado (index):', data);
    });
}
/* ------------------ Init ------------------ */

function init() {
    ensureAddProductBtn();
    wireModalCloseButtons();

    const addForm = document.getElementById('addProductForm');
    if (addForm) addForm.addEventListener('submit', submitAddProductForm);

    const adjustForm = document.getElementById('adjustStockForm');
    if (adjustForm) adjustForm.addEventListener('submit', submitAdjustStockForm);

    // Configurar a busca de produtos
    setupProductSearch();
    
    // Configurar o alternador de tema
    wireFinalizeOrder();
    loadProducts();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
