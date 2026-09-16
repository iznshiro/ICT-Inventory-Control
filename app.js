/* =========================================================
   GUDANG — Inventory Control QR — Frontend logic
   ========================================================= */

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------
const state = {
  items: [],
  logs: [],
  lastCheckedItem: null,
  html5Qr: null,
  camRunning: false
};

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
      textEl.textContent = 'Terhubung ke backend';
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    jumlah: document.getElementById('inputJumlah').value || 1,
    kategori: document.getElementById('inputKategori').value.trim()
  };
  if (!payload.nama || !payload.lokasi) return;

  btn.disabled = true;
  msg.textContent = 'Menyimpan…';
  msg.className = 'form-msg';

  try {
    const res = await apiPost('add', payload);
    if (res.success) {
      msg.textContent = 'Item berhasil disimpan.';
      msg.className = 'form-msg ok';
      renderQrResult(res.item);
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

function renderQrResult(item) {
  document.getElementById('qrPlaceholder').hidden = true;
  const generated = document.getElementById('qrGenerated');
  generated.hidden = false;

  const canvasHost = document.getElementById('qrCanvas');
  canvasHost.innerHTML = '';
  new QRCode(canvasHost, { text: item.id, width: 176, height: 176, colorDark: '#10161d', colorLight: '#ffffff' });

  document.getElementById('qrItemNama').textContent = item.nama;
  document.getElementById('qrItemLokasi').textContent = item.lokasi;
  document.getElementById('qrItemId').textContent = item.id;

  generated.dataset.itemJson = JSON.stringify(item);
}

document.getElementById('btnDownloadQr').addEventListener('click', () => {
  const host = document.getElementById('qrCanvas');
  const img = host.querySelector('img');
  const canvas = host.querySelector('canvas');
  const dataUrl = img && img.src ? img.src : (canvas ? canvas.toDataURL('image/png') : null);
  if (!dataUrl) return;
  const item = JSON.parse(document.getElementById('qrGenerated').dataset.itemJson || '{}');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = (item.id || 'qr-item') + '.png';
  a.click();
});

document.getElementById('btnPrintQr').addEventListener('click', () => {
  const host = document.getElementById('qrCanvas');
  const img = host.querySelector('img');
  const canvas = host.querySelector('canvas');
  const dataUrl = img && img.src ? img.src : (canvas ? canvas.toDataURL('image/png') : null);
  const item = JSON.parse(document.getElementById('qrGenerated').dataset.itemJson || '{}');
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
      <code>${escapeHtml(item.id || '')}</code>
      <script>window.onload = () => window.print();</script>
    </body></html>
  `);
  win.document.close();
});

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
  tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Memuat data…</td></tr>';
  try {
    const res = await apiGet('list');
    if (res.success) {
      state.items = res.items;
      renderItemTable(state.items);
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">' + escapeHtml(res.message || 'Gagal memuat data.') + '</td></tr>';
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Tidak dapat terhubung ke backend.</td></tr>';
  }
}

function renderItemTable(items) {
  const tbody = document.getElementById('itemTableBody');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Belum ada item. Tambahkan item pertama Anda.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr data-id="${escapeHtml(item.id)}">
      <td>${escapeHtml(item.nama)}</td>
      <td>${escapeHtml(item.lokasi)}</td>
      <td>${escapeHtml(String(item.jumlah))}</td>
      <td>${escapeHtml(item.kategori)}</td>
      <td>${escapeHtml(item.terakhirDiedit)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const item = state.items.find(i => i.id === row.dataset.id);
      if (item) openEditModal(item);
    });
  });
}

document.getElementById('searchItem').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = state.items.filter(i =>
    i.nama.toLowerCase().includes(q) ||
    i.lokasi.toLowerCase().includes(q) ||
    i.id.toLowerCase().includes(q)
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
  document.getElementById('editJumlah').value = item.jumlah;
  document.getElementById('editKategori').value = item.kategori;
  document.getElementById('editMsg').textContent = '';
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
checkConnection();
refreshDashboard();
