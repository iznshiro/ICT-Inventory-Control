/**
 * INVENTORY CONTROL QR — BACKEND (Google Apps Script)
 * ----------------------------------------------------
 * File ini di-deploy sebagai "Web App" di Google Apps Script.
 * Bertindak sebagai API perantara antara frontend (GitHub Pages)
 * dengan Google Sheets (database item + daftar department) dan
 * Google Docs (log aktivitas).
 *
 * CARA SETUP: lihat README.md.
 */

// =====================================================
// 1. KONFIGURASI — ISI DENGAN ID SPREADSHEET & DOCS ANDA
// =====================================================
var SPREADSHEET_ID = '1SgtHD_zeYfcBDM2nZRW1IoVxDc0nNxG8qVR-I0AJ5oE';
var DOC_ID          = '16t3BZdu833skv6fMqGQ1t0O2CYfPmgFHS2f1POYGb4E';
var SHEET_NAME       = 'Items';
var DEPT_SHEET_NAME  = 'Departments';
var HISTORY_SHEET_NAME = 'Histori Perbaikan';
var HISTORY_HEADERS = ['Tanggal', 'Jam', 'ID Item', 'Nama Item', 'Perlakuan'];
var TIMEZONE         = 'GMT+7'; // Sesuaikan zona waktu Anda
var BACKEND_VERSION  = '4.1.0-fix-format-histori'; // naik setiap kali fitur baru ditambahkan

// Urutan kolom tetap di sheet "Items". Jika sheet lama belum punya
// kolom "Department", migrateAddDepartmentColumn() akan menambahkannya
// otomatis di posisi yang benar tanpa perlu diedit manual.
var HEADERS = ['ID', 'Nama Item', 'Lokasi', 'Jumlah', 'Kategori', 'Department', 'Dibuat', 'Terakhir Diedit'];
var COL = { ID: 1, NAMA: 2, LOKASI: 3, JUMLAH: 4, KATEGORI: 5, DEPARTMENT: 6, DIBUAT: 7, DIEDIT: 8 };

// =====================================================
// 2. ROUTER
// =====================================================
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var result;
  try {
    var params = (e && e.parameter) || {};
    var payload = {};

    if (e && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = {}; }
    }

    var action = params.action || payload.action || '';

    switch (action) {
      case 'list':
        result = listItems();
        break;
      case 'get':
        result = getItemResult(params.code || payload.code);
        break;
      case 'add':
        result = addItem(payload);
        break;
      case 'update':
        result = updateItem(payload);
        break;
      case 'deleteItems':
        result = deleteItems(payload);
        break;
      case 'addPerlakuan':
        result = addPerlakuan(payload);
        break;
      case 'getPerlakuanHistory':
        result = getPerlakuanHistory(params.id || payload.id);
        break;
      case 'logs':
        result = getLogs();
        break;
      case 'listDepartments':
        result = listDepartments();
        break;
      case 'deleteDepartment':
        result = deleteDepartment(params.value !== undefined ? params : payload);
        break;
      case 'ping':
        result = { success: true, message: 'Backend aktif', version: BACKEND_VERSION };
        break;
      default:
        result = { success: false, message: 'Aksi "' + action + '" tidak dikenal.' };
    }
  } catch (err) {
    result = { success: false, message: 'Terjadi kesalahan server: ' + err.message };
  }
  return jsonOutput(result);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================
// 3. HELPER — SHEET ITEMS
// =====================================================
function getSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    migrateAddDepartmentColumn(sheet);
  }
  return sheet;
}

// Migrasi otomatis: kalau sheet lama belum punya kolom "Department",
// kolom baru disisipkan tepat setelah "Kategori" tanpa mengubah data lain.
function migrateAddDepartmentColumn(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headerRow.indexOf('Department') === -1) {
    var kategoriIdx = headerRow.indexOf('Kategori'); // 0-based
    var insertAfterCol = kategoriIdx !== -1 ? kategoriIdx + 1 : lastCol;
    sheet.insertColumnAfter(insertAfterCol);
    sheet.getRange(1, insertAfterCol + 1).setValue('Department');
  }
}

function rowToItem(row) {
  return {
    id: row[COL.ID - 1],
    nama: row[COL.NAMA - 1],
    lokasi: row[COL.LOKASI - 1],
    jumlah: row[COL.JUMLAH - 1],
    kategori: row[COL.KATEGORI - 1],
    department: row[COL.DEPARTMENT - 1],
    dibuat: formatDateSafe(row[COL.DIBUAT - 1]),
    terakhirDiedit: formatDateSafe(row[COL.DIEDIT - 1])
  };
}

function formatDateSafe(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, TIMEZONE, 'dd/MM/yyyy HH:mm');
  }
  return String(value);
}

// =====================================================
// 4. CRUD ITEM
// =====================================================
function listItems() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][COL.ID - 1]) continue;
    items.push(rowToItem(data[i]));
  }
  return { success: true, items: items };
}

function findRowByCode(code) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.ID - 1]).trim().toLowerCase() === String(code).trim().toLowerCase()) {
      return { sheet: sheet, rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

function getItemResult(code) {
  if (!code) return { success: false, message: 'Kode / ID item tidak diberikan.' };
  var found = findRowByCode(code);
  if (!found) return { success: false, message: 'Item dengan kode "' + code + '" tidak ditemukan.' };
  return { success: true, item: rowToItem(found.row), rowIndex: found.rowIndex };
}

function addItem(payload) {
  var nama = (payload.nama || '').toString().trim();
  var lokasi = (payload.lokasi || '').toString().trim();
  var department = (payload.department || '').toString().trim();
  if (!nama || !lokasi || !department) {
    return { success: false, message: 'Nama item, lokasi, dan department wajib diisi.' };
  }
  var jumlah = payload.jumlah !== undefined && payload.jumlah !== '' ? payload.jumlah : 1;
  var kategori = (payload.kategori || '').toString().trim() || '-';

  var sheet = getSheet();
  var id = generateId();
  var now = new Date();
  var row = [];
  row[COL.ID - 1] = id;
  row[COL.NAMA - 1] = nama;
  row[COL.LOKASI - 1] = lokasi;
  row[COL.JUMLAH - 1] = jumlah;
  row[COL.KATEGORI - 1] = kategori;
  row[COL.DEPARTMENT - 1] = department;
  row[COL.DIBUAT - 1] = now;
  row[COL.DIEDIT - 1] = now;
  sheet.appendRow(row);

  ensureDepartmentExists(department);

  writeLog({
    id: id,
    nama: nama,
    aksi: 'TAMBAH ITEM',
    detail: 'Item baru dibuat di lokasi "' + lokasi + '" (department: ' + department + ', jumlah: ' + jumlah + ', kategori: ' + kategori + ')'
  });

  return {
    success: true,
    item: {
      id: id, nama: nama, lokasi: lokasi, jumlah: jumlah, kategori: kategori, department: department,
      dibuat: formatDateSafe(now), terakhirDiedit: formatDateSafe(now)
    }
  };
}

function updateItem(payload) {
  var code = payload.id;
  if (!code) return { success: false, message: 'ID item tidak diberikan.' };

  var found = findRowByCode(code);
  if (!found) return { success: false, message: 'Item dengan ID "' + code + '" tidak ditemukan.' };

  var old = rowToItem(found.row);
  var fieldMap = [
    { key: 'nama', col: COL.NAMA, label: 'Nama Item' },
    { key: 'lokasi', col: COL.LOKASI, label: 'Lokasi' },
    { key: 'jumlah', col: COL.JUMLAH, label: 'Jumlah' },
    { key: 'kategori', col: COL.KATEGORI, label: 'Kategori' },
    { key: 'department', col: COL.DEPARTMENT, label: 'Department' }
  ];

  var changes = [];
  fieldMap.forEach(function (f) {
    var newVal = payload[f.key];
    if (newVal !== undefined && newVal !== null && String(newVal).trim() !== '' && String(newVal) !== String(old[f.key])) {
      changes.push(f.label + ': "' + old[f.key] + '" -> "' + newVal + '"');
      found.sheet.getRange(found.rowIndex, f.col).setValue(newVal);
    }
  });

  if (payload.department) ensureDepartmentExists(payload.department);

  if (changes.length === 0) {
    return { success: true, message: 'Tidak ada perubahan yang disimpan.', item: old };
  }

  var now = new Date();
  found.sheet.getRange(found.rowIndex, COL.DIEDIT).setValue(now);

  writeLog({
    id: old.id,
    nama: payload.nama || old.nama,
    aksi: 'EDIT ITEM',
    detail: changes.join(' | ')
  });

  var updatedRow = found.sheet.getRange(found.rowIndex, 1, 1, COL.DIEDIT).getValues()[0];
  return { success: true, item: rowToItem(updatedRow) };
}

function deleteItems(payload) {
  var ids = payload.ids;
  if (!ids || !ids.length) {
    return { success: false, message: 'Tidak ada item yang dipilih untuk dihapus.' };
  }

  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var idSet = {};
  ids.forEach(function (id) { idSet[String(id).trim().toLowerCase()] = true; });

  // Kumpulkan dulu info item yang akan dihapus (untuk log), lalu hapus barisnya
  // dari bawah ke atas supaya index baris tidak bergeser saat proses hapus.
  var rowsToDelete = [];
  var deletedInfo = [];
  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][COL.ID - 1]).trim().toLowerCase();
    if (idSet[rowId]) {
      rowsToDelete.push(i + 1);
      deletedInfo.push(rowToItem(data[i]));
    }
  }

  if (rowsToDelete.length === 0) {
    return { success: false, message: 'Item yang dipilih tidak ditemukan.' };
  }

  rowsToDelete.sort(function (a, b) { return b - a; }); // hapus dari baris terbawah dulu
  rowsToDelete.forEach(function (rowIndex) {
    sheet.deleteRow(rowIndex);
  });

  deletedInfo.forEach(function (item) {
    writeLog({
      id: item.id,
      nama: item.nama,
      aksi: 'HAPUS ITEM',
      detail: 'Item dihapus dari lokasi "' + item.lokasi + '" (department: ' + item.department + ')'
    });
  });

  return { success: true, deletedCount: rowsToDelete.length };
}

// =====================================================
// HISTORI PERBAIKAN — DISIMPAN DI SHEET TERSENDIRI
// Sheet "Histori Perbaikan" dengan kolom terpisah (Tanggal, Jam,
// ID Item, Nama Item, Perlakuan) supaya mudah dibaca/difilter/di-sort
// langsung dari Google Sheets, terlepas dari sheet "Items" utama.
// =====================================================
function getHistorySheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HISTORY_SHEET_NAME);
    sheet.appendRow(HISTORY_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HISTORY_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function addPerlakuan(payload) {
  var id = (payload.id || '').toString().trim();
  var perlakuan = (payload.perlakuan || '').toString().trim();
  if (!id || !perlakuan) {
    return { success: false, message: 'ID item dan isi perlakuan wajib diisi.' };
  }

  var found = findRowByCode(id);
  if (!found) return { success: false, message: 'Item dengan ID "' + id + '" tidak ditemukan.' };
  var itemNama = found.row[COL.NAMA - 1];

  var now = new Date();
  var historySheet = getHistorySheet();
  var newRow = historySheet.getLastRow() + 1;

  // Paksa kolom Tanggal & Jam sebagai teks biasa (format '@') supaya Google Sheets
  // tidak otomatis mengubahnya jadi tipe Date/Time — hasilnya tetap rapi & konsisten
  // baik dibuka langsung di Sheets maupun dibaca ulang lewat API.
  historySheet.getRange(newRow, 1, 1, 2).setNumberFormat('@');
  historySheet.getRange(newRow, 1, 1, 5).setValues([[
    Utilities.formatDate(now, TIMEZONE, 'dd/MM/yyyy'),
    Utilities.formatDate(now, TIMEZONE, 'HH:mm:ss'),
    id,
    itemNama,
    perlakuan
  ]]);
  try { historySheet.autoResizeColumns(1, HISTORY_HEADERS.length); } catch (e) { /* abaikan jika gagal */ }

  // Ikut perbarui "Terakhir Diedit" pada item & catat juga di log umum (Google Docs)
  found.sheet.getRange(found.rowIndex, COL.DIEDIT).setValue(now);
  writeLog({
    id: id,
    nama: itemNama,
    aksi: 'PERLAKUAN / PERBAIKAN',
    detail: perlakuan
  });

  return { success: true };
}

function formatDateOnly(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, TIMEZONE, 'dd/MM/yyyy');
  }
  return String(value);
}

function formatTimeOnly(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, TIMEZONE, 'HH:mm:ss');
  }
  return String(value);
}

function getPerlakuanHistory(id) {
  if (!id) return { success: false, message: 'ID item tidak diberikan.' };
  var sheet = getHistorySheet();
  var data = sheet.getDataRange().getValues();
  var history = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim().toLowerCase() === String(id).trim().toLowerCase()) {
      history.push({
        tanggal: formatDateOnly(data[i][0]),
        jam: formatTimeOnly(data[i][1]),
        perlakuan: data[i][4]
      });
    }
  }
  history.reverse(); // tampilkan yang terbaru lebih dulu
  return { success: true, history: history };
}

function generateId() {
  var now = new Date();
  var stamp = Utilities.formatDate(now, TIMEZONE, 'yyMMddHHmmss');
  var rand = Math.floor(100 + Math.random() * 900);
  return 'INV-' + stamp + rand;
}

// =====================================================
// 5. DEPARTMENT — DISIMPAN DI SHEET "Departments"
//    Combo box di frontend: bebas ketik teks baru (free text),
//    tapi juga tampil sebagai pilihan dropdown untuk dipakai lagi
//    nanti. Tiap opsi bisa dihapus dari daftar lewat ikon tong sampah.
// =====================================================
function getDepartmentSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(DEPT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DEPT_SHEET_NAME);
    sheet.appendRow(['Department']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function listDepartments() {
  var sheet = getDepartmentSheet();
  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) list.push(String(data[i][0]).trim());
  }
  return { success: true, departments: list };
}

function ensureDepartmentExists(name) {
  name = (name || '').toString().trim();
  if (!name) return;
  var sheet = getDepartmentSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === name.toLowerCase()) return;
  }
  sheet.appendRow([name]);
}

function deleteDepartment(payload) {
  var name = (payload.value || '').toString().trim();
  if (!name) return { success: false, message: 'Nama department tidak diberikan.' };
  var sheet = getDepartmentSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === name.toLowerCase()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: 'Department tidak ditemukan di daftar.' };
}

// =====================================================
// 6. LOG — DISIMPAN DI GOOGLE DOCS
// =====================================================
function writeLog(entry) {
  var doc = DocumentApp.openById(DOC_ID);
  var body = doc.getBody();
  var now = new Date();
  var tanggal = Utilities.formatDate(now, TIMEZONE, 'dd MMMM yyyy');
  var jam = Utilities.formatDate(now, TIMEZONE, 'HH:mm:ss');

  var line = '[' + tanggal + ' | ' + jam + '] ' + entry.aksi +
             ' — ID: ' + entry.id +
             ' — Item: ' + entry.nama +
             ' — ' + entry.detail;

  body.appendParagraph(line);
}

function getLogs() {
  var doc = DocumentApp.openById(DOC_ID);
  var body = doc.getBody();
  var paragraphs = body.getParagraphs();
  var logs = [];
  for (var i = paragraphs.length - 1; i >= 0 && logs.length < 300; i--) {
    var text = paragraphs[i].getText();
    if (text && text.trim().indexOf('[') === 0) {
      logs.push(text.trim());
    }
  }
  return { success: true, logs: logs };
}

// =====================================================
// 7. FUNGSI SETUP AWAL (jalankan manual sekali dari editor Apps Script)
// =====================================================
function setupPertamaKali() {
  var sheet = getSheet();
  Logger.log('Sheet "Items" siap dengan header di: ' + sheet.getParent().getUrl());

  getDepartmentSheet();
  Logger.log('Sheet "Departments" siap.');

  getHistorySheet();
  Logger.log('Sheet "Histori Perbaikan" siap.');

  var doc = DocumentApp.openById(DOC_ID);
  var body = doc.getBody();
  if (body.getText().trim() === '') {
    body.appendParagraph('LOG AKTIVITAS — INVENTORY CONTROL QR').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Setiap perubahan item (tambah/edit) akan dicatat otomatis di bawah ini.');
    body.appendParagraph('----------------------------------------------------');
  }
  Logger.log('Google Docs log siap di: ' + doc.getUrl());
}
