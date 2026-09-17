/* =========================================================
   GUDANG — Inventory Control QR — Frontend logic
   ========================================================= */

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------
const state = {
  items: [],
  logs: [],
  departments: [],
  selectedIds: new Set(),
  lastCheckedItem: null,
  html5Qr: null,
  camRunning: false
};

const departmentCombos = [];

// ------------------------------------------------------------
// API HELPERS
// ------------------------------------------------------------
async function apiGet(action, params = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiPost(action, payload = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// ------------------------------------------------------------
// TOAST
// ------------------------------------------------------------
let toastTimer = null;
function showToast(message, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ------------------------------------------------------------
// DEPARTMENT — combo box: bebas ketik teks baru (free text), tapi
// juga tersimpan sebagai pilihan dropdown untuk dipakai lagi nanti.
// Tiap pilihan di dropdown bisa dihapus lewat ikon tong sampah.
// ------------------------------------------------------------
async function loadDepartments() {
  try {
    const res = await apiGet('listDepartments');
    if (res.success) state.departments = res.departments;
  } catch (err) {
    // Diamkan — kolom tetap bisa dipakai untuk isi teks bebas walau daftar gagal dimuat.
  }
  departmentCombos.forEach(c => c.render(c.getInput().value));
}

function addLocalDepartmentIfNew(dept) {
  if (!dept) return;
  if (!state.departments.some(d => d.toLowerCase() === dept.toLowerCase())) {
    state.departments.push(dept);
    departmentCombos.forEach(c => c.render(c.getInput().value));
  }
}

async function removeDepartmentOption(value) {
  try {
    const res = await apiPost('deleteDepartment', { value });
    if (res.success) {
      state.departments = state.departments.filter(d => d.toLowerCase() !== value.toLowerCase());
      showToast('Department "' + value + '" dihapus dari daftar', 'ok');
    } else {
      showToast(res.message || 'Gagal menghapus department', 'err');
    }
  } catch (err) {
    showToast('Tidak dapat terhubung ke backend', 'err');
  }
  departmentCombos.forEach(c => c.render(c.getInput().value));
}

function initDepartmentCombo(inputId, dropdownId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  function render(filterText) {
    const filter = (filterText || '').toLowerCase();
    const filtered = state.departments.filter(d => d.toLowerCase().includes(filter));
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="combo-empty">Belum ada department tersimpan — ketik lalu simpan untuk menambahkan baru.</div>';
      return;
    }
    dropdown.innerHTML = filtered.map(d => `
      <div class="combo-option" data-value="${escapeHtml(d)}">
        <span class="combo-option-text">${escapeHtml(d)}</span>
        <button type="button" class="combo-delete" data-value="${escapeHtml(d)}" title="Hapus dari daftar" aria-label="Hapus ${escapeHtml(d)} dari daftar">🗑</button>
      </div>
    `).join('');
  }

  input.addEventListener('focus', () => { render(input.value); dropdown.hidden = false; });
  input.addEventListener('input', () => { render(input.value); dropdown.hidden = false; });

  // Cegah input kehilangan fokus sesaat sebelum klik di dropdown terdaftar.
  dropdown.addEventListener('mousedown', (e) => e.preventDefault());

  dropdown.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.combo-delete');
    if (delBtn) {
      await removeDepartmentOption(delBtn.dataset.value);
      return;
    }
    const opt = e.target.closest('.combo-option');
    if (opt) {
      input.value = opt.dataset.value;
      dropdown.hidden = true;
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  return { render, getInput: () => input };
}

// ------------------------------------------------------------
// NAVIGATION
// ------------------------------------------------------------
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('is-active'));
  const view = document.getElementById('view-' + viewName);
  const nav = document.querySelector('.nav-item[data-view="' + viewName + '"]');
  if (view) view.classList.add('is-active');
  if (nav) nav.classList.add('is-active');
  document.getElementById('sidebar').classList.remove('is-open');

  if (viewName === 'dashboard') refreshDashboard();
  if (viewName === 'daftar') refreshItemList();
  if (viewName === 'log') refreshLogs();
}

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  switchView(btn.dataset.view);
});

document.querySelectorAll('[data-view-link]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.viewLink));
});

document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('is-open');
});

// ------------------------------------------------------------
// CONNECTION CHECK
// ------------------------------------------------------------
async function checkConnection() {
  const statusEl = document.getElementById('connStatus');
  const textEl = document.getElementById('connStatusText');
  if (APPS_SCRIPT_URL.indexOf('ISI_DENGAN') === 0) {
    statusEl.className = 'conn-status err';
    textEl.textContent = 'Backend belum dikonfigurasi (lihat config.js)';
    return;
  }
  try {
    const res = await apiGet('ping');
    if (res.success) {
      statusEl.className = 'conn-status ok';
      textEl.textContent = 'Terhubung' + (res.version ? ' · v' + res.version.split('-')[0] : '');
    } else {
      throw new Error(res.message || 'Gagal');
    }
  } catch (err) {
    statusEl.className = 'conn-status err';
    textEl.textContent = 'Tidak dapat terhubung ke backend';
  }
}

// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------
async function refreshDashboard() {
  const activityEl = document.getElementById('dashboardActivity');
  try {
    const [itemsRes, logsRes] = await Promise.all([apiGet('list'), apiGet('logs')]);

    if (itemsRes.success) {
      state.items = itemsRes.items;
      const lokasiSet = new Set(state.items.map(i => i.lokasi));
      const totalStok = state.items.reduce((sum, i) => sum + (Number(i.jumlah) || 0), 0);

      document.getElementById('statTotalItem').textContent = state.items.length;
      document.getElementById('statTotalLokasi').textContent = lokasiSet.size;
      document.getElementById('statTotalStok').textContent = totalStok;
    }

    if (logsRes.success) {
      state.logs = logsRes.logs;
      const todayStr = formatTanggalIndonesia(new Date());
      const editHariIni = state.logs.filter(l => l.indexOf('[' + todayStr) === 0).length;
      document.getElementById('statEditHariIni').textContent = editHariIni;

      if (state.logs.length === 0) {
        activityEl.innerHTML = '<li class="empty-row">Belum ada aktivitas tercatat.</li>';
      } else {
        activityEl.innerHTML = state.logs.slice(0, 6).map(l => `<li>${escapeHtml(l)}</li>`).join('');
      }
    }
  } catch (err) {
    activityEl.innerHTML = '<li class="empty-row">Gagal memuat aktivitas. Periksa koneksi backend.</li>';
  }
}

function formatTanggalIndonesia(date) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return String(date.getDate()).padStart(2, '0') + ' ' + bulan[date.getMonth()] + ' ' + date.getFullYear();
}

// ------------------------------------------------------------
// TAMBAH ITEM
// ------------------------------------------------------------
document.getElementById('formTambah').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('tambahMsg');
  const btn = document.getElementById('btnSubmitTambah');
  const payload = {
    nama: document.getElementById('inputNama').value.trim(),
    lokasi: document.getElementById('inputLokasi').value.trim(),
    department: document.getElementById('inputDepartment').value.trim(),
    jumlah: document.getElementById('inputJumlah').value || 1,
    kategori: document.getElementById('inputKategori').value.trim()
  };
  if (!payload.nama || !payload.lokasi || !payload.department) {
    msg.textContent = 'Nama item, lokasi, dan department wajib diisi.';
    msg.className = 'form-msg err';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'Menyimpan…';
  msg.className = 'form-msg';

  try {
    const res = await apiPost('add', payload);
    if (res.success) {
      msg.textContent = 'Item berhasil disimpan.';
      msg.className = 'form-msg ok';
      renderQrResult(res.item);
      addLocalDepartmentIfNew(res.item.department);
      document.getElementById('formTambah').reset();
      document.getElementById('inputJumlah').value = 1;
      showToast('Item "' + res.item.nama + '" ditambahkan', 'ok');
    } else {
      msg.textContent = res.message || 'Gagal menyimpan item.';
      msg.className = 'form-msg err';
    }
  } catch (err) {
    msg.textContent = 'Tidak dapat terhubung ke backend.';
    msg.className = 'form-msg err';
  } finally {
    btn.disabled = false;
  }
});

function generateQrInto(hostId, item, size) {
  const host = document.getElementById(hostId);
  host.innerHTML = '';
  new QRCode(host, { text: item.id, width: size || 176, height: size || 176, colorDark: '#10161d', colorLight: '#ffffff' });
  host.dataset.itemJson = JSON.stringify(item);
}

function getQrDataUrl(hostId) {
  const host = document.getElementById(hostId);
  const img = host.querySelector('img');
  const canvas = host.querySelector('canvas');
  return img && img.src ? img.src : (canvas ? canvas.toDataURL('image/png') : null);
}

function downloadQrFromHost(hostId) {
  const dataUrl = getQrDataUrl(hostId);
  if (!dataUrl) return;
  const item = JSON.parse(document.getElementById(hostId).dataset.itemJson || '{}');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = (item.id || 'qr-item') + '.png';
  a.click();
}

function printQrFromHost(hostId) {
  const dataUrl = getQrDataUrl(hostId);
  const item = JSON.parse(document.getElementById(hostId).dataset.itemJson || '{}');
  if (!dataUrl) return;

  const win = window.open('', '_blank', 'width=420,height=560');
  win.document.write(`
    <html><head><title>Label ${escapeHtml(item.nama || '')}</title>
    <style>
      body{ font-family: sans-serif; text-align:center; padding:24px; }
      img{ width:220px; height:220px; }
      h2{ margin:14px 0 2px; font-size:18px; }
      p{ margin:2px 0; color:#444; }
      code{ font-size:12px; color:#666; }
    </style></head><body>
      <img src="${dataUrl}" />
      <h2>${escapeHtml(item.nama || '')}</h2>
      <p>${escapeHtml(item.lokasi || '')}</p>
      <p>${escapeHtml(item.department || '')}</p>
      <code>${escapeHtml(item.id || '')}</code>
      <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  win.document.close();
}

function renderQrResult(item) {
  document.getElementById('qrPlaceholder').hidden = true;
  document.getElementById('qrGenerated').hidden = false;

  generateQrInto('qrCanvas', item, 176);

  document.getElementById('qrItemNama').textContent = item.nama;
  document.getElementById('qrItemLokasi').textContent = item.lokasi;
  document.getElementById('qrItemDepartment').textContent = item.department;
  document.getElementById('qrItemId').textContent = item.id;
}

document.getElementById('btnDownloadQr').addEventListener('click', () => downloadQrFromHost('qrCanvas'));
document.getElementById('btnPrintQr').addEventListener('click', () => printQrFromHost('qrCanvas'));

document.getElementById('btnDownloadEditQr').addEventListener('click', () => downloadQrFromHost('editQrCanvas'));
document.getElementById('btnPrintEditQr').addEventListener('click', () => printQrFromHost('editQrCanvas'));

// ------------------------------------------------------------
// CEK ITEM — TABS
// ------------------------------------------------------------
document.querySelectorAll('.scan-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.scan-tab').forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    const mode = tab.dataset.mode;
    document.getElementById('mode-camera').hidden = mode !== 'camera';
    document.getElementById('mode-manual').hidden = mode !== 'manual';
    if (mode !== 'camera') stopCamera();
  });
});

document.getElementById('btnCekManual').addEventListener('click', () => {
  const code = document.getElementById('inputManualCode').value.trim();
  if (code) checkItemByCode(code);
});
document.getElementById('inputManualCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnCekManual').click();
});

async function checkItemByCode(code) {
  const msg = document.getElementById('cekMsg');
  msg.textContent = 'Mencari item…';
  msg.className = 'form-msg';
  try {
    const res = await apiGet('get', { code });
    if (res.success) {
      msg.textContent = '';
      state.lastCheckedItem = res.item;
      renderItemResult(res.item);
    } else {
      msg.textContent = res.message || 'Item tidak ditemukan.';
      msg.className = 'form-msg err';
      document.getElementById('itemResultData').hidden = true;
      document.getElementById('itemResultEmpty').hidden = false;
    }
  } catch (err) {
    msg.textContent = 'Tidak dapat terhubung ke backend.';
    msg.className = 'form-msg err';
  }
}

function renderItemResult(item) {
  document.getElementById('itemResultEmpty').hidden = true;
  document.getElementById('itemResultData').hidden = false;
  document.getElementById('resNama').textContent = item.nama;
  document.getElementById('resId').textContent = item.id;
  document.getElementById('resLokasi').textContent = item.lokasi;
  document.getElementById('resDepartment').textContent = item.department;
  document.getElementById('resJumlah').textContent = item.jumlah;
  document.getElementById('resKategori').textContent = item.kategori;
  document.getElementById('resDibuat').textContent = item.dibuat;
  document.getElementById('resDiedit').textContent = item.terakhirDiedit;
}

document.getElementById('btnEditFromCek').addEventListener('click', () => {
  if (state.lastCheckedItem) openEditModal(state.lastCheckedItem);
});

// ------------------------------------------------------------
// CEK ITEM — CAMERA SCAN
// ------------------------------------------------------------
document.getElementById('btnToggleCam').addEventListener('click', () => {
  if (state.camRunning) stopCamera(); else startCamera();
});

function startCamera() {
  const btn = document.getElementById('btnToggleCam');
  state.html5Qr = new Html5Qrcode('qrReader');
  state.html5Qr.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    (decodedText) => {
      checkItemByCode(decodedText.trim());
      stopCamera();
    },
    () => { /* frame tanpa hasil, abaikan */ }
  ).then(() => {
    state.camRunning = true;
    btn.textContent = 'Matikan kamera';
  }).catch(() => {
    document.getElementById('cekMsg').textContent = 'Tidak dapat mengakses kamera. Izinkan akses kamera pada browser.';
    document.getElementById('cekMsg').className = 'form-msg err';
  });
}

function stopCamera() {
  const btn = document.getElementById('btnToggleCam');
  if (state.html5Qr && state.camRunning) {
    state.html5Qr.stop().then(() => state.html5Qr.clear()).catch(() => {});
  }
  state.camRunning = false;
  btn.textContent = 'Aktifkan kamera';
}

// ------------------------------------------------------------
// DAFTAR ITEM
// ------------------------------------------------------------
async function refreshItemList() {
  const tbody = document.getElementById('itemTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Memuat data…</td></tr>';
  state.selectedIds.clear();
  updateDeleteButton();
  try {
    const res = await apiGet('list');
    if (res.success) {
      state.items = res.items;
      renderItemTable(state.items);
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">' + escapeHtml(res.message || 'Gagal memuat data.') + '</td></tr>';
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Tidak dapat terhubung ke backend.</td></tr>';
  }
}

function renderItemTable(items) {
  const tbody = document.getElementById('itemTableBody');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Belum ada item. Tambahkan item pertama Anda.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr data-id="${escapeHtml(item.id)}" class="${state.selectedIds.has(item.id) ? 'is-selected' : ''}">
      <td class="col-check"><input type="checkbox" class="row-check" data-id="${escapeHtml(item.id)}" ${state.selectedIds.has(item.id) ? 'checked' : ''}></td>
      <td>${escapeHtml(item.nama)}</td>
      <td>${escapeHtml(item.lokasi)}</td>
      <td>${escapeHtml(item.department)}</td>
      <td>${escapeHtml(String(item.jumlah))}</td>
      <td>${escapeHtml(item.kategori)}</td>
      <td>${escapeHtml(item.terakhirDiedit)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.row-check')) return;
      const item = state.items.find(i => i.id === row.dataset.id);
      if (item) openEditModal(item);
    });
  });

  tbody.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
      cb.closest('tr').classList.toggle('is-selected', cb.checked);
      updateDeleteButton();
      syncSelectAllCheckbox();
    });
  });

  syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
  const selectAll = document.getElementById('selectAllItems');
  const checks = document.querySelectorAll('#itemTableBody .row-check');
  if (checks.length === 0) { selectAll.checked = false; selectAll.indeterminate = false; return; }
  const checkedCount = document.querySelectorAll('#itemTableBody .row-check:checked').length;
  selectAll.checked = checkedCount === checks.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
}

function updateDeleteButton() {
  const btn = document.getElementById('btnDeleteSelected');
  btn.textContent = 'Hapus item terpilih (' + state.selectedIds.size + ')';
  btn.disabled = state.selectedIds.size === 0;
}

document.getElementById('selectAllItems').addEventListener('change', (e) => {
  const checked = e.target.checked;
  document.querySelectorAll('#itemTableBody .row-check').forEach(cb => {
    cb.checked = checked;
    const id = cb.dataset.id;
    if (checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
    cb.closest('tr').classList.toggle('is-selected', checked);
  });
  updateDeleteButton();
});

document.getElementById('btnDeleteSelected').addEventListener('click', async () => {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;
  const confirmed = window.confirm('Hapus ' + ids.length + ' item terpilih? Tindakan ini tidak bisa dibatalkan.');
  if (!confirmed) return;

  const btn = document.getElementById('btnDeleteSelected');
  btn.disabled = true;
  try {
    const res = await apiPost('deleteItems', { ids });
    if (res.success) {
      showToast(res.deletedCount + ' item berhasil dihapus', 'ok');
      state.selectedIds.clear();
      refreshItemList();
    } else {
      showToast(res.message || 'Gagal menghapus item', 'err');
      updateDeleteButton();
    }
  } catch (err) {
    showToast('Tidak dapat terhubung ke backend', 'err');
    updateDeleteButton();
  }
});

document.getElementById('searchItem').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = state.items.filter(i =>
    i.nama.toLowerCase().includes(q) ||
    i.lokasi.toLowerCase().includes(q) ||
    i.id.toLowerCase().includes(q) ||
    (i.department || '').toLowerCase().includes(q)
  );
  renderItemTable(filtered);
});

// ------------------------------------------------------------
// EDIT MODAL
// ------------------------------------------------------------
function openEditModal(item) {
  document.getElementById('editId').value = item.id;
  document.getElementById('editNama').value = item.nama;
  document.getElementById('editLokasi').value = item.lokasi;
  document.getElementById('editDepartment').value = item.department || '';
  document.getElementById('editJumlah').value = item.jumlah;
  document.getElementById('editKategori').value = item.kategori;
  document.getElementById('editMsg').textContent = '';
  document.getElementById('editQrItemId').textContent = item.id;
  generateQrInto('editQrCanvas', item, 130);
  document.getElementById('editModalOverlay').hidden = false;
}

function closeEditModal() {
  document.getElementById('editModalOverlay').hidden = true;
}

document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
document.getElementById('editModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'editModalOverlay') closeEditModal();
});

document.getElementById('formEdit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('editMsg');
  const btn = document.getElementById('btnSaveEdit');
  const payload = {
    id: document.getElementById('editId').value,
    nama: document.getElementById('editNama').value.trim(),
    lokasi: document.getElementById('editLokasi').value.trim(),
    department: document.getElementById('editDepartment').value.trim(),
    jumlah: document.getElementById('editJumlah').value,
    kategori: document.getElementById('editKategori').value.trim()
  };

  btn.disabled = true;
  msg.textContent = 'Menyimpan perubahan…';
  msg.className = 'form-msg';

  try {
    const res = await apiPost('update', payload);
    if (res.success) {
      showToast('Perubahan disimpan & dicatat di log', 'ok');
      addLocalDepartmentIfNew(payload.department);
      closeEditModal();
      refreshItemList();
      if (document.getElementById('view-cek').classList.contains('is-active') && state.lastCheckedItem && state.lastCheckedItem.id === payload.id) {
        checkItemByCode(payload.id);
      }
    } else {
      msg.textContent = res.message || 'Gagal menyimpan perubahan.';
      msg.className = 'form-msg err';
    }
  } catch (err) {
    msg.textContent = 'Tidak dapat terhubung ke backend.';
    msg.className = 'form-msg err';
  } finally {
    btn.disabled = false;
  }
});

// ------------------------------------------------------------
// LOG AKTIVITAS
// ------------------------------------------------------------
async function refreshLogs() {
  const list = document.getElementById('logList');
  list.innerHTML = '<li class="empty-row">Memuat log…</li>';
  try {
    const res = await apiGet('logs');
    if (res.success) {
      state.logs = res.logs;
      list.innerHTML = res.logs.length
        ? res.logs.map(l => `<li>${escapeHtml(l)}</li>`).join('')
        : '<li class="empty-row">Belum ada log aktivitas.</li>';
    } else {
      list.innerHTML = '<li class="empty-row">' + escapeHtml(res.message || 'Gagal memuat log.') + '</li>';
    }
  } catch (err) {
    list.innerHTML = '<li class="empty-row">Tidak dapat terhubung ke backend.</li>';
  }
}

document.getElementById('btnRefreshLog').addEventListener('click', refreshLogs);

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
departmentCombos.push(initDepartmentCombo('inputDepartment', 'dropdownTambahDept'));
departmentCombos.push(initDepartmentCombo('editDepartment', 'dropdownEditDept'));

checkConnection();
refreshDashboard();
loadDepartments();
