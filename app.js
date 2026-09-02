// ==========================================================================
// MED SWU Inventory & Requisition System - Application Logic
// ==========================================================================

const SYNC_SERVER_URL = 'http://127.0.0.1:8765';

// Global Application State
const AppState = {
  currentUser: {
    role: 'department', // 'department' | 'admin'
    name: 'ผู้ใช้งาน: ภาควิชา/หน่วยงาน'
  },
  inventory: [],
  departments: [],
  cart: [],
  requisitions: [],
  currentFilter: {
    search: '',
    stockStatus: 'all',
    imageStatus: 'all',
    viewMode: 'grid'
  },
  activeSlipData: null
};

// Storage Keys
const STORAGE_KEYS = {
  STOCK_OVERRIDES: 'medswu_stock_overrides',
  REQUISITIONS: 'medswu_requisitions_history',
  SAVED_USER: 'medswu_saved_role'
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initData();
  setupEventListeners();
  renderAllViews();
});

// 1. Data Initialization
function initData() {
  if (typeof INVENTORY_DATA === 'undefined') {
    console.error('INVENTORY_DATA not loaded');
    return;
  }

  // Load items and departments (filter out empty rows)
  AppState.inventory = JSON.parse(JSON.stringify(INVENTORY_DATA.items)).filter(i => i.material && i.name);
  AppState.departments = INVENTORY_DATA.departments || [];

  // Load stock overrides from LocalStorage
  const savedStockOverrides = localStorage.getItem(STORAGE_KEYS.STOCK_OVERRIDES);
  if (savedStockOverrides) {
    try {
      const overrides = JSON.parse(savedStockOverrides);
      AppState.inventory.forEach(item => {
        if (overrides[item.id] !== undefined) {
          item.stock = overrides[item.id];
        }
      });
    } catch (e) {
      console.warn('Error loading stock overrides:', e);
    }
  }

  // Load requisitions from LocalStorage
  const savedReqs = localStorage.getItem(STORAGE_KEYS.REQUISITIONS);
  if (savedReqs) {
    try {
      AppState.requisitions = JSON.parse(savedReqs);
    } catch (e) {
      console.warn('Error loading requisitions:', e);
    }
  }

  // Load user role
  const savedRole = localStorage.getItem(STORAGE_KEYS.SAVED_USER);
  if (savedRole === 'admin') {
    AppState.currentUser.role = 'admin';
    AppState.currentUser.name = 'ผู้ดูแลระบบ (Admin)';
  } else {
    AppState.currentUser.role = 'department';
    AppState.currentUser.name = 'ผู้ใช้งาน: ภาควิชา/หน่วยงาน';
  }

  updateAuthUI();
}

// 2. State Persistence
function saveStockState() {
  const overrides = {};
  AppState.inventory.forEach(item => {
    overrides[item.id] = item.stock;
  });
  localStorage.setItem(STORAGE_KEYS.STOCK_OVERRIDES, JSON.stringify(overrides));
}

function saveRequisitionsState() {
  localStorage.setItem(STORAGE_KEYS.REQUISITIONS, JSON.stringify(AppState.requisitions));
  updateBadges();
  // Auto-sync into Excel Sheet "การเบิก"
  syncRequisitionsToExcelFile(false);
}

// 3. Event Listeners Setup
function setupEventListeners() {
  // Navigation Sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.getAttribute('data-view');
      if (viewId) switchView(viewId);
    });
  });

  // Quick Cart Button in Header
  const quickCartBtn = document.getElementById('btnQuickCart');
  if (quickCartBtn) {
    quickCartBtn.addEventListener('click', () => switchView('view-requisition'));
  }

  // Auth Button (Switch User / Login)
  const switchUserBtn = document.getElementById('btnSwitchUser');
  if (switchUserBtn) {
    switchUserBtn.addEventListener('click', () => {
      if (AppState.currentUser.role === 'admin') {
        // If already admin, quick switch back to department
        setRole('department');
        showToast('สลับเข้าสู่โหมด ภาควิชา/หน่วยงาน เรียบร้อยแล้ว', 'info');
      } else {
        // If department, open login modal
        openAuthModal();
      }
    });
  }

  // Guest Access Button in Modal
  const guestBtn = document.getElementById('btnGuestAccess');
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      setRole('department');
      closeAuthModal();
      showToast('เข้าใช้งานในโหมดภาควิชา/หน่วยงาน', 'success');
    });
  }

  // Admin Login Form
  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUsername').value.trim();
      const p = document.getElementById('loginPassword').value.trim();
      if (u === 'admin' && p === 'admin') {
        setRole('admin');
        document.getElementById('loginErrorMsg').style.display = 'none';
        closeAuthModal();
        showToast('เข้าสู่ระบบสำหรับ Admin สำเร็จ', 'success');
      } else {
        document.getElementById('loginErrorMsg').style.display = 'block';
      }
    });
  }

  // Inventory Search & Filters
  const invSearch = document.getElementById('inventorySearchInput');
  if (invSearch) {
    invSearch.addEventListener('input', (e) => {
      AppState.currentFilter.search = e.target.value.trim().toLowerCase();
      renderInventoryView();
    });
  }

  const stockFilter = document.getElementById('stockFilterSelect');
  if (stockFilter) {
    stockFilter.addEventListener('change', (e) => {
      AppState.currentFilter.stockStatus = e.target.value;
      renderInventoryView();
    });
  }

  const imgFilter = document.getElementById('imageFilterSelect');
  if (imgFilter) {
    imgFilter.addEventListener('change', (e) => {
      AppState.currentFilter.imageStatus = e.target.value;
      renderInventoryView();
    });
  }

  // Grid/Table Toggles
  const btnGrid = document.getElementById('btnToggleGridView');
  const btnTable = document.getElementById('btnToggleTableView');
  if (btnGrid && btnTable) {
    btnGrid.addEventListener('click', () => {
      AppState.currentFilter.viewMode = 'grid';
      btnGrid.classList.add('active');
      btnTable.classList.remove('active');
      document.getElementById('materialsGridContainer').style.display = 'grid';
      document.getElementById('materialsTableContainer').style.display = 'none';
    });

    btnTable.addEventListener('click', () => {
      AppState.currentFilter.viewMode = 'table';
      btnTable.classList.add('active');
      btnGrid.classList.remove('active');
      document.getElementById('materialsGridContainer').style.display = 'none';
      document.getElementById('materialsTableContainer').style.display = 'block';
    });
  }

  // Requisition Form
  const reqSearch = document.getElementById('reqSearchInput');
  if (reqSearch) reqSearch.addEventListener('input', renderRequisitionCatalog);

  const reqDept = document.getElementById('reqDepartmentSelect');
  if (reqDept) reqDept.addEventListener('change', updateCartSubmitState);

  const reqRequester = document.getElementById('reqRequesterName');
  if (reqRequester) reqRequester.addEventListener('input', updateCartSubmitState);

  const btnClear = document.getElementById('btnClearCart');
  if (btnClear) btnClear.addEventListener('click', clearCart);

  const btnSubmit = document.getElementById('btnSubmitRequisition');
  if (btnSubmit) btnSubmit.addEventListener('click', submitRequisition);

  // History Filters
  const histSearch = document.getElementById('historySearchInput');
  if (histSearch) histSearch.addEventListener('input', renderHistoryView);

  const histDept = document.getElementById('historyDeptFilter');
  if (histDept) histDept.addEventListener('change', renderHistoryView);

  const histStatus = document.getElementById('historyStatusFilter');
  if (histStatus) histStatus.addEventListener('change', renderHistoryView);

  // Reports Filters & Export
  const repYear = document.getElementById('reportYearFilter');
  if (repYear) repYear.addEventListener('change', renderReportsView);

  const repMonth = document.getElementById('reportMonthFilter');
  if (repMonth) repMonth.addEventListener('change', renderReportsView);

  const repDept = document.getElementById('reportDeptFilter');
  if (repDept) repDept.addEventListener('change', renderReportsView);

  const btnExport = document.getElementById('btnExportCSV');
  if (btnExport) {
    btnExport.addEventListener('click', () => syncRequisitionsToExcelFile(true));
  }

  // Print Slip
  const btnPrint = document.getElementById('btnPrintSlip');
  if (btnPrint) {
    btnPrint.addEventListener('click', printOfficialSlip);
  }

  // Live Sync & File Picker (Admin)
  const btnLiveSync = document.getElementById('btnLiveSyncExcel');
  const fileInput = document.getElementById('excelFileInput');
  if (btnLiveSync && fileInput) {
    btnLiveSync.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importExcelDirectly(file);
    });
  }
}

// 4. Role Management & Authentication
function setRole(role) {
  AppState.currentUser.role = role;
  if (role === 'admin') {
    AppState.currentUser.name = 'ผู้ดูแลระบบ (Admin)';
  } else {
    AppState.currentUser.name = 'ผู้ใช้งาน: ภาควิชา/หน่วยงาน';
  }
  localStorage.setItem(STORAGE_KEYS.SAVED_USER, role);
  updateAuthUI();
  renderAllViews();
}

function updateAuthUI() {
  const isAdm = AppState.currentUser.role === 'admin';
  const badge = document.getElementById('currentUserBadge');
  const roleText = document.getElementById('currentRoleText');
  const btnText = document.getElementById('btnSwitchUserText');
  const navApprovals = document.getElementById('navItemApprovals');
  const btnLiveSync = document.getElementById('btnLiveSyncExcel');
  const btnExport = document.getElementById('btnExportCSV');

  if (isAdm) {
    if (badge) {
      badge.className = 'user-badge admin';
      badge.querySelector('span:first-child').textContent = '👨‍💼';
    }
    if (roleText) roleText.textContent = 'ผู้ดูแลระบบ (Admin)';
    if (btnText) btnText.textContent = 'สลับเป็น ภาควิชา';
    if (navApprovals) navApprovals.style.display = 'flex';
    if (btnLiveSync) btnLiveSync.style.display = 'inline-flex';
    if (btnExport) btnExport.style.display = 'inline-flex';
  } else {
    if (badge) {
      badge.className = 'user-badge';
      badge.querySelector('span:first-child').textContent = '🏢';
    }
    if (roleText) roleText.textContent = 'ผู้ใช้งาน: ภาควิชา/หน่วยงาน';
    if (btnText) btnText.textContent = 'เข้าสู่ระบบ Admin';
    if (navApprovals) navApprovals.style.display = 'none';
    if (btnLiveSync) btnLiveSync.style.display = 'none';
    if (btnExport) btnExport.style.display = 'none';

    // If on approvals view, switch to inventory
    const activeView = document.querySelector('.view-section.active');
    if (activeView && activeView.id === 'view-approvals') {
      switchView('view-inventory');
    }
  }

  updateBadges();
}

function updateBadges() {
  const pendingCount = AppState.requisitions.filter(r => r.status === 'pending').length;
  const pendingBadge = document.getElementById('sidebarPendingBadge');
  if (pendingBadge) {
    if (pendingCount > 0 && AppState.currentUser.role === 'admin') {
      pendingBadge.textContent = pendingCount;
      pendingBadge.style.display = 'inline-block';
    } else {
      pendingBadge.style.display = 'none';
    }
  }

  const cartCount = AppState.cart.reduce((sum, item) => sum + item.qty, 0);
  const headBadge = document.getElementById('headerCartBadge');
  const sideBadge = document.getElementById('sidebarCartBadge');
  if (headBadge) {
    headBadge.textContent = cartCount;
    headBadge.style.display = cartCount > 0 ? 'flex' : 'none';
  }
  if (sideBadge) {
    sideBadge.textContent = cartCount;
    sideBadge.style.display = cartCount > 0 ? 'inline-block' : 'none';
  }
}

// 5. Navigation Router
function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => {
    if (nav.getAttribute('data-view') === viewId) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewId === 'view-inventory') renderInventoryView();
    if (viewId === 'view-requisition') renderRequisitionCatalog();
    if (viewId === 'view-approvals') renderApprovalsView();
    if (viewId === 'view-history') renderHistoryView();
    if (viewId === 'view-reports') renderReportsView();
  }
}

// 6. View Renderers
function renderAllViews() {
  populateDepartmentDropdowns();
  renderInventoryView();
  renderRequisitionCatalog();
  renderCart();
  renderApprovalsView();
  renderHistoryView();
  renderReportsView();
  updateAuthUI();
}

function populateDepartmentDropdowns() {
  const depts = AppState.departments;

  const reqSelect = document.getElementById('reqDepartmentSelect');
  if (reqSelect) {
    const curr = reqSelect.value;
    reqSelect.innerHTML = '<option value="">-- กรุณาเลือกภาควิชา/หน่วยงาน --</option>' +
      depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    if (curr) reqSelect.value = curr;
  }

  const histSelect = document.getElementById('historyDeptFilter');
  if (histSelect) {
    histSelect.innerHTML = '<option value="all">ทุกภาควิชา/หน่วยงาน</option>' +
      depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  }

  const repSelect = document.getElementById('reportDeptFilter');
  if (repSelect) {
    repSelect.innerHTML = '<option value="all">ทุกภาควิชา/หน่วยงาน</option>' +
      depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  }
}

// ==========================================================================
// INVENTORY VIEW
// ==========================================================================
function renderInventoryView() {
  const items = AppState.inventory;
  const filter = AppState.currentFilter;

  // Stats
  const totalItems = items.length;
  const inStock = items.filter(i => i.stock > 5).length;
  const lowStock = items.filter(i => i.stock > 0 && i.stock <= 5).length;
  const outStock = items.filter(i => i.stock === 0).length;

  const statTotal = document.getElementById('statTotalItems');
  const statIn = document.getElementById('statInStock');
  const statLow = document.getElementById('statLowStock');
  const statOut = document.getElementById('statOutStock');

  if (statTotal) statTotal.textContent = totalItems.toLocaleString('th-TH');
  if (statIn) statIn.textContent = inStock.toLocaleString('th-TH');
  if (statLow) statLow.textContent = lowStock.toLocaleString('th-TH');
  if (statOut) statOut.textContent = outStock.toLocaleString('th-TH');

  // Filter Items
  const filtered = items.filter(item => {
    if (filter.search) {
      const matchName = item.name.toLowerCase().includes(filter.search);
      const matchCode = item.material.toLowerCase().includes(filter.search);
      if (!matchName && !matchCode) return false;
    }
    if (filter.stockStatus === 'in_stock' && item.stock <= 0) return false;
    if (filter.stockStatus === 'low_stock' && (item.stock <= 0 || item.stock > 5)) return false;
    if (filter.stockStatus === 'out_stock' && item.stock !== 0) return false;

    if (filter.imageStatus === 'has_img' && !item.has_image) return false;
    if (filter.imageStatus === 'no_img' && item.has_image) return false;

    return true;
  });

  // Render Grid
  const gridContainer = document.getElementById('materialsGridContainer');
  if (gridContainer) {
    if (filtered.length === 0) {
      gridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; background: #fff; border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">ไม่พบรายการวัสดุที่ค้นหา</div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">ลองปรับเปลี่ยนคำค้นหา หรือ ตัวกรองสถานะใหม่อีกครั้ง</p>
        </div>`;
    } else {
      gridContainer.innerHTML = filtered.map(item => createMaterialCardHtml(item)).join('');
    }
  }

  // Render Table
  const tableBody = document.getElementById('materialsTableBody');
  if (tableBody) {
    tableBody.innerHTML = filtered.map(item => {
      let badgeClass = 'in-stock';
      let badgeText = 'มีของพร้อมเบิก';
      if (item.stock === 0) {
        badgeClass = 'out-stock';
        badgeText = 'สินค้าหมด';
      } else if (item.stock <= 5) {
        badgeClass = 'low-stock';
        badgeText = 'ใกล้หมด';
      }

      const imgHtml = item.has_image
        ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" class="table-thumb" onclick="openImageZoom('${item.image}', '${escapeHtml(item.name)}', '${item.material}')">`
        : `<div class="table-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:#94a3b8;">📦</div>`;

      return `
        <tr>
          <td style="text-align: center;">${imgHtml}</td>
          <td><span class="material-code">${item.material}</span></td>
          <td><strong style="color: var(--text-primary);">${escapeHtml(item.name)}</strong></td>
          <td style="text-align: center;"><span style="color: var(--text-secondary);">${escapeHtml(item.unit)}</span></td>
          <td style="text-align: right;"><strong style="font-size: 1.1rem; color: var(--text-primary);">${item.stock}</strong></td>
          <td style="text-align: center;"><span class="stock-badge-floating ${badgeClass}" style="position:static;display:inline-block;">${badgeText}</span></td>
          <td style="text-align: center;">
            <button class="btn-add-cart-mini" ${item.stock <= 0 ? 'disabled' : ''} onclick="addToCart('${item.id}')">
              <span>➕</span> เบิก
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function createMaterialCardHtml(item) {
  let badgeClass = 'in-stock';
  let badgeText = `คงเหลือ ${item.stock}`;
  if (item.stock === 0) {
    badgeClass = 'out-stock';
    badgeText = 'สินค้าหมด (0)';
  } else if (item.stock <= 5) {
    badgeClass = 'low-stock';
    badgeText = `ใกล้หมด (${item.stock})`;
  }

  const imgHtml = item.has_image
    ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" class="material-img" loading="lazy">`
    : `<div class="no-img-placeholder"><span>📦</span><span>ไม่มีรูปภาพ</span></div>`;

  return `
    <div class="material-card">
      <div class="material-img-wrap" onclick="openImageZoom('${item.image || ''}', '${escapeHtml(item.name)}', '${item.material}')">
        ${imgHtml}
        <span class="stock-badge-floating ${badgeClass}">${badgeText}</span>
      </div>
      <div class="material-body">
        <span class="material-code">รหัส: ${item.material}</span>
        <h4 class="material-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
        <div class="material-meta">
          <div class="stock-info">
            <span class="label">คงเหลือ (Unrestricted)</span>
            <span class="amount">${item.stock} <span class="unit">${escapeHtml(item.unit)}</span></span>
          </div>
          <button class="btn-add-cart-mini" ${item.stock <= 0 ? 'disabled' : ''} onclick="addToCart('${item.id}')">
            <span>➕</span> เพิ่มเข้าตะกร้า
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// REQUISITION CATALOG & CART
// ==========================================================================
function renderRequisitionCatalog() {
  const query = document.getElementById('reqSearchInput') ? document.getElementById('reqSearchInput').value.trim().toLowerCase() : '';
  const items = AppState.inventory;

  const filtered = items.filter(item => {
    if (!query) return true;
    return item.name.toLowerCase().includes(query) || item.material.toLowerCase().includes(query);
  });

  const container = document.getElementById('reqMaterialsGrid');
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 2.5rem; text-align: center; background: #fff; border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <p style="font-weight: 600; color: var(--text-primary);">ไม่พบรายการวัสดุ</p>
        </div>`;
    } else {
      container.innerHTML = filtered.map(item => createMaterialCardHtml(item)).join('');
    }
  }
}

function addToCart(itemId) {
  const item = AppState.inventory.find(i => i.id === itemId);
  if (!item) return;

  if (item.stock <= 0) {
    showToast(`วัสดุ ${item.name} หมดสต๊อก ไม่สามารถเบิกได้`, 'warning');
    return;
  }

  const existing = AppState.cart.find(c => c.id === itemId);
  if (existing) {
    if (existing.qty + 1 > item.stock) {
      showToast(`จำนวนเบิกรวมเกินจำนวนคงเหลือในสต๊อก (${item.stock} ${item.unit})`, 'warning');
      return;
    }
    existing.qty += 1;
  } else {
    AppState.cart.push({
      id: item.id,
      material: item.material,
      name: item.name,
      unit: item.unit,
      stock: item.stock,
      qty: 1
    });
  }

  renderCart();
  updateBadges();
  showToast(`เพิ่ม "${item.name}" เข้าตะกร้าแล้ว`, 'success');
}

function changeCartQty(itemId, delta) {
  const cartItem = AppState.cart.find(c => c.id === itemId);
  if (!cartItem) return;

  const invItem = AppState.inventory.find(i => i.id === itemId);
  const maxStock = invItem ? invItem.stock : cartItem.stock;

  const newQty = cartItem.qty + delta;
  if (newQty <= 0) {
    removeFromCart(itemId);
    return;
  }
  if (newQty > maxStock) {
    showToast(`จำนวนขอเบิกเกินยอดคงเหลือ (${maxStock} ${cartItem.unit})`, 'warning');
    return;
  }

  cartItem.qty = newQty;
  renderCart();
  updateBadges();
}

function setCartQtyDirect(itemId, rawVal) {
  const cartItem = AppState.cart.find(c => c.id === itemId);
  if (!cartItem) return;

  const invItem = AppState.inventory.find(i => i.id === itemId);
  const maxStock = invItem ? invItem.stock : cartItem.stock;

  let val = parseInt(rawVal);
  if (isNaN(val) || val <= 0) val = 1;
  if (val > maxStock) {
    val = maxStock;
    showToast(`ปรับจำนวนเป็นสูงสุดตามยอดคงเหลือ (${maxStock} ${cartItem.unit})`, 'warning');
  }

  cartItem.qty = val;
  renderCart();
  updateBadges();
}

function removeFromCart(itemId) {
  AppState.cart = AppState.cart.filter(c => c.id !== itemId);
  renderCart();
  updateBadges();
}

function clearCart() {
  if (AppState.cart.length === 0) return;
  AppState.cart = [];
  renderCart();
  updateBadges();
  showToast('ล้างตะกร้าเรียบร้อยแล้ว', 'info');
}

function renderCart() {
  const container = document.getElementById('cartItemsList');
  const countLabel = document.getElementById('cartCountLabel');
  const totalQtyLabel = document.getElementById('cartTotalQty');

  if (countLabel) countLabel.textContent = AppState.cart.length;
  const totalUnits = AppState.cart.reduce((sum, item) => sum + item.qty, 0);
  if (totalQtyLabel) totalQtyLabel.textContent = `${totalUnits.toLocaleString('th-TH')} ชิ้น`;

  if (container) {
    if (AppState.cart.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.5rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          <span>🛒</span> ยังไม่มีรายการในตะกร้า<br>กด "เพิ่มเข้าตะกร้า" จากรายการด้านซ้าย
        </div>`;
    } else {
      container.innerHTML = AppState.cart.map(item => `
        <div class="cart-item-card">
          <div class="cart-item-header">
            <span class="cart-item-name">${escapeHtml(item.name)}</span>
            <button class="btn-del-item" onclick="removeFromCart('${item.id}')" title="ลบรายการ">✕</button>
          </div>
          <div class="cart-item-controls">
            <span style="font-size: 0.75rem; color: var(--text-muted);">คงเหลือ: ${item.stock} ${escapeHtml(item.unit)}</span>
            <div class="qty-stepper">
              <button class="qty-btn" onclick="changeCartQty('${item.id}', -1)">-</button>
              <input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.stock}" onchange="setCartQtyDirect('${item.id}', this.value)">
              <button class="qty-btn" onclick="changeCartQty('${item.id}', 1)">+</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  updateCartSubmitState();
}

function updateCartSubmitState() {
  const deptElem = document.getElementById('reqDepartmentSelect');
  const reqElem = document.getElementById('reqRequesterName');
  const btnSubmit = document.getElementById('btnSubmitRequisition');

  const dept = deptElem ? deptElem.value : '';
  const requester = reqElem ? reqElem.value.trim() : '';
  const hasItems = AppState.cart.length > 0;

  if (btnSubmit) {
    btnSubmit.disabled = !(dept && requester && hasItems);
  }
}

// 7. Submit Requisition (Creates Pending Request)
function submitRequisition() {
  const dept = document.getElementById('reqDepartmentSelect').value;
  const requester = document.getElementById('reqRequesterName').value.trim();
  const remark = document.getElementById('reqRemark').value.trim();

  if (!dept || !requester || AppState.cart.length === 0) {
    showToast('กรุณากรอกข้อมูลภาควิชา ชื่อผู้ขอเบิก และเลือกรายการวัสดุให้ครบถ้วน', 'warning');
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(AppState.requisitions.length + 1).padStart(4, '0');
  const reqId = `REQ-${dateStr}-${seq}`;

  const newRequisition = {
    id: reqId,
    createdAt: now.toISOString(),
    formattedDate: formatThaiDateTime(now),
    yearMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    department: dept,
    requesterName: requester,
    remark: remark || 'เบิกใช้งานตามปกติ',
    items: JSON.parse(JSON.stringify(AppState.cart)),
    totalUnits: AppState.cart.reduce((sum, item) => sum + item.qty, 0),
    status: 'pending',
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null
  };

  AppState.requisitions.unshift(newRequisition);
  saveRequisitionsState();

  AppState.cart = [];
  renderCart();
  document.getElementById('reqRequesterName').value = '';
  document.getElementById('reqRemark').value = '';

  showToast(`สร้างใบเบิก ${reqId} สำเร็จ (สถานะ: รอการอนุมัติ)`, 'success');
  openSlipModal(newRequisition);
  updateBadges();
}

// ==========================================================================
// APPROVALS MANAGEMENT (ADMIN ONLY)
// ==========================================================================
function renderApprovalsView() {
  const container = document.getElementById('pendingApprovalsContainer');
  if (!container) return;

  const pendingReqs = AppState.requisitions.filter(r => r.status === 'pending');

  if (pendingReqs.length === 0) {
    container.innerHTML = `
      <div style="padding: 3rem; text-align: center; background: #fff; border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--primary);">ไม่มีใบเบิกที่รอการอนุมัติในขณะนี้</div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">ใบเบิกใหม่ที่ภาควิชาส่งเข้ามาจะปรากฏที่หน้านี้เพื่อรอการอนุมัติและตัดสต๊อกจริง</p>
      </div>`;
    return;
  }

  container.innerHTML = pendingReqs.map(req => `
    <div class="cart-panel" style="margin-bottom: 1.25rem; position: static;">
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
        <div>
          <span style="font-weight: 700; font-size: 1.1rem; color: var(--primary);">${req.id}</span>
          <span class="badge badge-pending" style="margin-left: 0.5rem;">🟡 รอการอนุมัติ</span>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">📅 วันที่ยื่นคำขอ: ${req.formattedDate}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 600; color: var(--text-primary);">🏢 ${escapeHtml(req.department)}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">ผู้ขอเบิก: ${escapeHtml(req.requesterName)}</div>
        </div>
      </div>

      <table class="custom-table" style="margin-bottom: 1rem;">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">ลำดับ</th>
            <th style="width: 120px;">รหัส Material</th>
            <th>รายการวัสดุ</th>
            <th style="width: 90px; text-align: center;">หน่วยนับ</th>
            <th style="width: 110px; text-align: right;">จำนวนที่ขอเบิก</th>
            <th style="width: 120px; text-align: right;">สต๊อกคงเหลือปัจจุบัน</th>
          </tr>
        </thead>
        <tbody>
          ${req.items.map((it, idx) => {
            const currentStockItem = AppState.inventory.find(x => x.id === it.id);
            const currStock = currentStockItem ? currentStockItem.stock : it.stock;
            const isExceeded = it.qty > currStock;
            return `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td><span class="material-code">${it.material}</span></td>
                <td><strong>${escapeHtml(it.name)}</strong></td>
                <td style="text-align: center;">${escapeHtml(it.unit)}</td>
                <td style="text-align: right;"><strong style="font-size: 1rem; color: var(--primary);">${it.qty}</strong></td>
                <td style="text-align: right;">
                  <span style="font-weight: 600; color: ${isExceeded ? 'var(--accent-red)' : 'var(--text-primary)'};">
                    ${currStock} ${isExceeded ? '⚠️ (ไม่พอตัด)' : ''}
                  </span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; background: #f8fafc; padding: 0.75rem 1rem; border-radius: var(--radius-md);">
        <button class="btn-secondary" onclick="previewSlipById('${req.id}')">
          <span>📄</span> ดูตัวอย่างใบเบิก
        </button>

        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-danger" onclick="rejectRequisition('${req.id}')">
            <span>✕</span> ไม่อนุมัติ
          </button>
          <button class="btn-primary" style="width: auto; padding: 0.6rem 1.5rem;" onclick="approveRequisition('${req.id}')">
            <span>✓</span> อนุมัติและตัดสต๊อกทันที
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// 8. Execute Approval & Real-Time Stock Deduction
function approveRequisition(reqId) {
  const req = AppState.requisitions.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  for (const it of req.items) {
    const invItem = AppState.inventory.find(x => x.id === it.id);
    if (!invItem || invItem.stock < it.qty) {
      const avail = invItem ? invItem.stock : 0;
      showToast(`ไม่สามารถอนุมัติได้: วัสดุ "${it.name}" มีคงเหลือ ${avail} ${it.unit} (ขอเบิก ${it.qty})`, 'error');
      return;
    }
  }

  // Real-time Stock Deduction
  req.items.forEach(it => {
    const invItem = AppState.inventory.find(x => x.id === it.id);
    if (invItem) {
      invItem.stock -= it.qty;
      if (invItem.stock < 0) invItem.stock = 0;
    }
  });

  const now = new Date();
  req.status = 'approved';
  req.approvedAt = now.toISOString();
  req.approvedFormattedDate = formatThaiDateTime(now);
  req.approvedBy = 'หัวหน้างานพัสดุ (Admin)';

  saveStockState();
  saveRequisitionsState();

  showToast(`อนุมัติใบเบิก ${reqId} และตัดสต๊อกคงเหลือแบบ Real-time เรียบร้อยแล้ว`, 'success');

  renderApprovalsView();
  renderInventoryView();
  renderHistoryView();
  renderReportsView();
  updateBadges();

  openSlipModal(req);
}

function rejectRequisition(reqId) {
  const req = AppState.requisitions.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  const reason = prompt('กรุณาระบุเหตุผลการไม่อนุมัติ (ถ้ามี):', 'สต๊อกคงเหลือไม่เพียงพอ / เอกสารไม่ครบถ้วน');
  if (reason === null) return;

  req.status = 'rejected';
  req.rejectionReason = reason;
  req.approvedAt = new Date().toISOString();
  req.approvedBy = 'หัวหน้างานพัสดุ (Admin)';

  saveRequisitionsState();
  showToast(`ปฏิเสธใบเบิก ${reqId} เรียบร้อยแล้ว`, 'info');

  renderApprovalsView();
  renderHistoryView();
  updateBadges();
}

// Delete Pending Requisition
function deletePendingRequisition(reqId) {
  const req = AppState.requisitions.find(r => r.id === reqId);
  if (!req) return;

  if (req.status !== 'pending') {
    showToast('ไม่สามารถลบใบเบิกนี้ได้ เนื่องจากได้รับการอนุมัติหรือดำเนินการไปแล้ว', 'warning');
    return;
  }

  const confirmMsg = `ยืนยันการลบใบเบิก ${reqId} หรือไม่?\n- ภาควิชา: ${req.department}\n- ผู้ขอเบิก: ${req.requesterName}\n\n(การดำเนินการนี้ไม่สามารถเรียกคืนได้)`;
  if (!confirm(confirmMsg)) return;

  AppState.requisitions = AppState.requisitions.filter(r => r.id !== reqId);
  saveRequisitionsState();

  showToast(`ลบใบเบิก ${reqId} เรียบร้อยแล้ว`, 'success');

  renderHistoryView();
  renderApprovalsView();
  renderReportsView();
  updateBadges();
}

// ==========================================================================
// REQUISITION HISTORY VIEW
// ==========================================================================
function renderHistoryView() {
  const queryElem = document.getElementById('historySearchInput');
  const deptElem = document.getElementById('historyDeptFilter');
  const statusElem = document.getElementById('historyStatusFilter');

  const query = queryElem ? queryElem.value.trim().toLowerCase() : '';
  const deptFilter = deptElem ? deptElem.value : 'all';
  const statusFilter = statusElem ? statusElem.value : 'all';

  const filtered = AppState.requisitions.filter(req => {
    if (query) {
      const matchId = req.id.toLowerCase().includes(query);
      const matchDept = req.department.toLowerCase().includes(query);
      const matchName = req.requesterName.toLowerCase().includes(query);
      if (!matchId && !matchDept && !matchName) return false;
    }
    if (deptFilter !== 'all' && req.department !== deptFilter) return false;
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    return true;
  });

  const tableBody = document.getElementById('historyTableBody');
  if (!tableBody) return;

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          ไม่พบประวัติใบเบิกที่ตรงกับเงื่อนไข
        </td>
      </tr>`;
    return;
  }

  tableBody.innerHTML = filtered.map(req => {
    let badgeHtml = '<span class="badge badge-pending">🟡 รอการอนุมัติ</span>';
    if (req.status === 'approved') {
      badgeHtml = '<span class="badge badge-approved">🟢 อนุมัติแล้ว</span>';
    } else if (req.status === 'rejected') {
      badgeHtml = '<span class="badge badge-rejected">🔴 ไม่อนุมัติ</span>';
    }

    return `
      <tr>
        <td><strong style="color: var(--primary); font-family: monospace; font-size: 0.95rem;">${req.id}</strong></td>
        <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${req.formattedDate}</span></td>
        <td><strong>${escapeHtml(req.department)}</strong></td>
        <td>${escapeHtml(req.requesterName)}</td>
        <td style="text-align: center;">${req.items.length} รายการ</td>
        <td style="text-align: right;"><strong>${req.totalUnits.toLocaleString('th-TH')}</strong></td>
        <td style="text-align: center;">${badgeHtml}</td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.4rem; justify-content: center; align-items: center;">
            <button class="btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.82rem;" onclick="previewSlipById('${req.id}')" title="ดูรายละเอียดใบเบิกและพิมพ์">
              <span>📄</span> ดูใบเบิก
            </button>
            ${req.status === 'pending' ? `
              <button class="btn-danger-outline" onclick="deletePendingRequisition('${req.id}')" title="ลบใบเบิก (เฉพาะที่ยังรออนุมัติ)">
                <span>🗑️</span> ลบ
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// REPORTS & ANALYTICS VIEW
// ==========================================================================
function renderReportsView() {
  const approvedReqs = AppState.requisitions.filter(r => r.status === 'approved');

  const yearElem = document.getElementById('reportYearFilter');
  const monthElem = document.getElementById('reportMonthFilter');
  const deptElem = document.getElementById('reportDeptFilter');

  const selectedYear = yearElem ? yearElem.value : 'all';
  const selectedMonth = monthElem ? monthElem.value : 'all';
  const selectedDept = deptElem ? deptElem.value : 'all';

  const filtered = approvedReqs.filter(r => {
    const d = new Date(r.createdAt);
    const thaiYear = String(d.getFullYear() + 543);
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');

    if (selectedYear !== 'all' && thaiYear !== selectedYear) return false;
    if (selectedMonth !== 'all' && monthStr !== selectedMonth) return false;
    if (selectedDept !== 'all' && r.department !== selectedDept) return false;

    return true;
  });

  const totalApproved = filtered.length;
  const totalUnits = filtered.reduce((sum, r) => sum + r.totalUnits, 0);
  const activeDepts = new Set(filtered.map(r => r.department)).size;

  const countElem = document.getElementById('reportApprovedCount');
  const unitsElem = document.getElementById('reportTotalUnits');
  const deptsElem = document.getElementById('reportActiveDepts');

  if (countElem) countElem.textContent = totalApproved.toLocaleString('th-TH');
  if (unitsElem) unitsElem.textContent = totalUnits.toLocaleString('th-TH');
  if (deptsElem) deptsElem.textContent = activeDepts.toLocaleString('th-TH');

  // Top Materials
  const materialUsage = {};
  filtered.forEach(r => {
    r.items.forEach(it => {
      if (!materialUsage[it.id]) {
        materialUsage[it.id] = { material: it.material, name: it.name, unit: it.unit, qty: 0, times: 0 };
      }
      materialUsage[it.id].qty += it.qty;
      materialUsage[it.id].times += 1;
    });
  });

  const topMaterials = Object.values(materialUsage).sort((a, b) => b.qty - a.qty);
  const topBody = document.getElementById('reportTopMaterialsBody');
  if (topBody) {
    if (topMaterials.length === 0) {
      topBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่มีข้อมูลการเบิกที่อนุมัติในช่วงเวลานี้</td></tr>`;
    } else {
      topBody.innerHTML = topMaterials.slice(0, 15).map((m, idx) => `
        <tr>
          <td style="text-align: center;"><span style="font-weight:700; color: ${idx < 3 ? 'var(--primary)' : 'var(--text-secondary)'};">#${idx + 1}</span></td>
          <td><span class="material-code">${m.material}</span></td>
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td style="text-align: right;"><strong style="font-size: 1rem; color: var(--primary);">${m.qty.toLocaleString('th-TH')}</strong></td>
          <td style="text-align: center;"><span style="color: var(--text-secondary);">${escapeHtml(m.unit)}</span></td>
        </tr>
      `).join('');
    }
  }

  // Department Breakdown (Clickable rows)
  const deptUsage = {};
  filtered.forEach(r => {
    if (!deptUsage[r.department]) {
      deptUsage[r.department] = { reqCount: 0, reqs: [] };
    }
    deptUsage[r.department].reqCount += 1;
    deptUsage[r.department].reqs.push(r);
  });

  const sortedDepts = Object.entries(deptUsage).sort((a, b) => b[1].reqCount - a[1].reqCount);
  const deptBody = document.getElementById('reportDeptBreakdownBody');
  if (deptBody) {
    if (sortedDepts.length === 0) {
      deptBody.innerHTML = `<tr><td colspan="2" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่มีข้อมูลการเบิกที่อนุมัติในช่วงเวลานี้</td></tr>`;
    } else {
      deptBody.innerHTML = sortedDepts.map(([deptName, stats]) => `
        <tr>
          <td>
            <span class="dept-clickable-row" onclick="openDeptRequisitionsModal('${escapeHtml(deptName)}')" title="คลิกเพื่อดูรายการใบเบิกทั้งหมดของ ${escapeHtml(deptName)}">
              <span>🏢</span>
              <strong>${escapeHtml(deptName)}</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 4px;">🔍</span>
            </span>
          </td>
          <td style="text-align: center;">
            <button class="btn-secondary" style="padding: 0.25rem 0.65rem; font-size: 0.82rem;" onclick="openDeptRequisitionsModal('${escapeHtml(deptName)}')">
              <strong>${stats.reqCount}</strong> ใบ
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  // Ensure export button visibility
  const btnExport = document.getElementById('btnExportCSV');
  if (btnExport) {
    btnExport.style.display = (AppState.currentUser.role === 'admin') ? 'inline-flex' : 'none';
  }
}

// Direct Excel Sync Handler (Writes directly into Sheet "การเบิก" of วัสดุคงคลัง 1กย69.xlsx)
async function syncRequisitionsToExcelFile(showNotification = false) {
  if (AppState.requisitions.length === 0 && showNotification) {
    showToast('ยังไม่มีข้อมูลประวัติการเบิก', 'info');
    return;
  }

  const payload = JSON.stringify({ requisitions: AppState.requisitions });

  // Try relative endpoint first (when opened via http://localhost:8765), then fallback to absolute URL
  const endpoints = ['/api/save_requisitions', 'http://127.0.0.1:8765/api/save_requisitions', 'http://localhost:8765/api/save_requisitions'];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (response.ok) {
        const data = await response.json();
        if (showNotification) {
          showToast(`💾 บันทึก ${data.rowsCount || 0} รายการลงในไฟล์ Excel (Sheet การเบิก) สำเร็จแล้ว!`, 'success');
        }
        return true;
      }
    } catch (err) {
      // Continue to next endpoint
    }
  }

  // If none succeeded
  if (showNotification) {
    showToast('⚠️ ระบบกำลังดาวน์โหลดไฟล์ Excel ให้แทน (หรือเปิด run_system.bat เพื่อบันทึกไฟล์ต้นฉบับอัตโนมัติ)', 'warning');
    exportRequisitionsFallback();
  }
  return false;
}

function exportRequisitionsFallback() {
  const allReqs = AppState.requisitions;
  if (allReqs.length === 0) return;

  const exportRows = [];
  allReqs.forEach(r => {
    let statusText = 'รอการอนุมัติ';
    if (r.status === 'approved') statusText = 'อนุมัติแล้ว';
    else if (r.status === 'rejected') statusText = `ไม่อนุมัติ (${r.rejectionReason || 'ไม่อนุมัติ'})`;

    r.items.forEach(it => {
      exportRows.push({
        'วันเวลา': r.formattedDate,
        'ชื่อภาควิชา/หน่วยงาน': r.department,
        'รายการที่เบิก': it.name,
        'จำนวน': it.qty,
        'หน่วยนับ': it.unit,
        'ชื่อผู้เบิก': r.requesterName,
        'สถานะ': statusText,
        'รหัสวัสดุ': it.material,
        'เลขที่ใบเบิก': r.id,
        'ผู้อนุญาต': r.approvedBy || (r.status === 'approved' ? 'หัวหน้างานพัสดุ' : '-'),
        'วัตถุประสงค์': r.remark || '-'
      });
    });
  });

  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
      { wch: 22 }, { wch: 30 }, { wch: 35 }, { wch: 10 }, { wch: 10 },
      { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 22 }, { wch: 25 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "การเบิก");
    const nowStr = new Date().toISOString().slice(0, 10);
    try {
      XLSX.writeFile(wb, `ข้อมูลการเบิกวัสดุ_MEDSWU_${nowStr}.xlsx`);
    } catch (e) {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ข้อมูลการเบิกวัสดุ_MEDSWU_${nowStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}

// In-Browser Direct Excel Parser (SheetJS Live Reader)
function importExcelDirectly(file) {
  if (typeof XLSX === 'undefined') {
    showToast('กรุณารอระบบโหลดสักครู่', 'warning');
    return;
  }

  showToast(`กำลังอ่านข้อมูลจาก ${file.name}...`, 'info');
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames.includes('Data') ? 'Data' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonRows.length < 2) {
        showToast('ไฟล์ Excel ไม่มีข้อมูลรายการวัสดุ', 'error');
        return;
      }

      let updatedCount = 0;
      for (let r = 1; r < jsonRows.length; r++) {
        const row = jsonRows[r];
        if (!row || !row[0] || !row[1]) continue;
        const matCode = String(row[0]).trim();
        const desc = String(row[1]).trim();
        const bun = row[2] ? String(row[2]).trim() : '';
        const unrestricted = parseFloat(row[3]) || 0;

        if (!matCode || !desc) continue;

        const invItem = AppState.inventory.find(x => x.id === matCode);
        if (invItem) {
          invItem.stock = unrestricted;
          invItem.name = desc;
          invItem.unit = bun;
          updatedCount++;
        }
      }

      saveStockState();
      renderInventoryView();
      renderRequisitionCatalog();
      renderReportsView();

      showToast(`⚡ อัปเดตสต๊อกสด ${updatedCount} รายการจาก Excel สำเร็จแล้ว!`, 'success');
    } catch (err) {
      console.error('Error importing Excel:', err);
      showToast('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// Department Requisitions Modal Functions
function openDeptRequisitionsModal(deptName) {
  const modal = document.getElementById('deptReqsModal');
  const title = document.getElementById('deptReqsModalTitle');
  const tbody = document.getElementById('deptReqsTableBody');

  if (!modal || !title || !tbody) return;

  title.innerHTML = `🏢 รายการใบเบิกของ: <span style="color: var(--primary);">${escapeHtml(deptName)}</span>`;
  const deptReqs = AppState.requisitions.filter(r => r.department === deptName);

  if (deptReqs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          ไม่พบประวัติใบเบิกของภาควิชา/หน่วยงานนี้
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = deptReqs.map(req => {
      let badgeHtml = '<span class="badge badge-pending">🟡 รอการอนุมัติ</span>';
      if (req.status === 'approved') {
        badgeHtml = '<span class="badge badge-approved">🟢 อนุมัติแล้ว</span>';
      } else if (req.status === 'rejected') {
        badgeHtml = '<span class="badge badge-rejected">🔴 ไม่อนุมัติ</span>';
      }

      return `
        <tr>
          <td><strong style="color: var(--primary); font-family: monospace; font-size: 0.95rem;">${req.id}</strong></td>
          <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${req.formattedDate}</span></td>
          <td>${escapeHtml(req.requesterName)}</td>
          <td style="text-align: center;">${req.items.length} รายการ (${req.totalUnits} ชิ้น)</td>
          <td style="text-align: center;">${badgeHtml}</td>
          <td style="text-align: center;">
            <button class="btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.82rem;" onclick="previewSlipById('${req.id}')">
              <span>📄</span> ดูใบเบิก
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  modal.classList.add('active');
}

function closeDeptReqsModal() {
  const modal = document.getElementById('deptReqsModal');
  if (modal) modal.classList.remove('active');
}

// ==========================================================================
// OFFICIAL REQUISITION SLIP MODAL
// ==========================================================================
function previewSlipById(reqId) {
  const req = AppState.requisitions.find(r => r.id === reqId);
  if (req) openSlipModal(req);
}

function openSlipModal(req) {
  AppState.activeSlipData = req;

  const reqNo = document.getElementById('slipReqNo');
  const dateElem = document.getElementById('slipDate');
  const deptElem = document.getElementById('slipDept');
  const formalDept = document.getElementById('slipFormalDeptName');
  const remarkElem = document.getElementById('slipRemark');
  const statusBadge = document.getElementById('slipStatusBadge');
  const itemsBody = document.getElementById('slipItemsBody');

  if (reqNo) reqNo.textContent = req.id;
  if (dateElem) dateElem.textContent = req.formattedDate;
  if (deptElem) deptElem.textContent = req.department;
  if (formalDept) formalDept.textContent = req.department || '....................';
  if (remarkElem) remarkElem.textContent = req.remark || '-';

  if (statusBadge) {
    if (req.status === 'approved') {
      statusBadge.innerHTML = '<span class="badge badge-approved" style="font-size:0.9rem;">🟢 อนุมัติแล้ว (Approved)</span>';
    } else if (req.status === 'rejected') {
      statusBadge.innerHTML = `<span class="badge badge-rejected" style="font-size:0.9rem;">🔴 ไม่อนุมัติ (${escapeHtml(req.rejectionReason || 'ไม่อนุมัติ')})</span>`;
    } else {
      statusBadge.innerHTML = '<span class="badge badge-pending" style="font-size:0.9rem;">🟡 รอการอนุมัติ (Pending)</span>';
    }
  }

  if (itemsBody) {
    itemsBody.innerHTML = req.items.map((it, idx) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="text-center"><span class="material-code" style="font-size:0.85rem;">${it.material}</span></td>
        <td><strong>${escapeHtml(it.name)}</strong></td>
        <td class="text-center">${escapeHtml(it.unit)}</td>
        <td class="text-right"><strong style="font-size: 1.05rem;">${it.qty}</strong></td>
        <td class="text-center" style="color: #64748b; font-size: 0.85rem;">-</td>
      </tr>
    `).join('');

    itemsBody.innerHTML += `
      <tr style="background: #f8fafc; font-weight: 700;">
        <td colspan="4" class="text-right">รวมจำนวนรายการที่เบิกทั้งสิ้น:</td>
        <td class="text-right" style="color: var(--primary); font-size: 1.15rem;">${req.totalUnits.toLocaleString('th-TH')}</td>
        <td class="text-center">ชิ้น</td>
      </tr>
    `;
  }

  const requesterSig = document.getElementById('slipSigRequesterName');
  if (requesterSig) requesterSig.textContent = req.requesterName || '........................................';

  const approvalBox = document.getElementById('slipApprovalSigContent');
  if (approvalBox) {
    if (req.status === 'approved') {
      approvalBox.innerHTML = `
        <div class="approved-stamp">✓ อนุญาตแล้ว (APPROVED)</div>
        <div class="sig-name" style="margin-top:0.4rem; font-weight:600;">( ${escapeHtml(req.approvedBy || 'หัวหน้างานพัสดุ')} )</div>
        <div class="sig-date">${req.approvedFormattedDate || ''}</div>
      `;
    } else {
      approvalBox.innerHTML = `
        <div class="sig-line"></div>
        <div class="sig-name">( ........................................ )</div>
        <div class="sig-date">ตำแหน่ง: หัวหน้างานพัสดุ</div>
      `;
    }
  }

  const footerReqNo = document.getElementById('slipFooterReqNo');
  if (footerReqNo) footerReqNo.textContent = req.id || '...........';
  
  const footerDate = document.getElementById('slipFooterDate');
  if (footerDate) {
    const rawDatePart = req.formattedDate ? req.formattedDate.split(' ') : [];
    if (rawDatePart.length >= 4) {
      footerDate.textContent = `${rawDatePart[0]} ${rawDatePart[1]} ${rawDatePart[2]}`;
    } else {
      footerDate.textContent = req.formattedDate || '-';
    }
  }

  const modal = document.getElementById('slipModal');
  if (modal) modal.classList.add('active');
}

function closeSlipModal() {
  const modal = document.getElementById('slipModal');
  if (modal) modal.classList.remove('active');
}

function printOfficialSlip() {
  document.body.classList.add('printing-slip');
  const slipModal = document.getElementById('slipModal');
  if (slipModal) slipModal.classList.add('active');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-slip');
    }, 500);
  }, 100);
}

// Modals
function openImageZoom(imgSrc, title, code) {
  if (!imgSrc) {
    showToast('รายการนี้ไม่มีไฟล์รูปภาพ', 'info');
    return;
  }
  document.getElementById('imageZoomSrc').src = imgSrc;
  document.getElementById('imageZoomTitle').textContent = `รหัสวัสดุ: ${code}`;
  document.getElementById('imageZoomCaption').textContent = title;
  document.getElementById('imageZoomModal').classList.add('active');
}

function closeImageZoomModal() {
  document.getElementById('imageZoomModal').classList.remove('active');
}

function openAuthModal() {
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginErrorMsg').style.display = 'none';
  document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

// Helpers
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatThaiDateTime(dateObj) {
  const d = new Date(dateObj);
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const day = d.getDate();
  const month = thaiMonths[d.getMonth()];
  const year = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes} น.`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
