/**
 * INVENTORY CONTROL QR — BACKEND (Google Apps Script)
 * ----------------------------------------------------
 * File ini di-deploy sebagai "Web App" di Google Apps Script.
 * Bertindak sebagai API perantara antara frontend (GitHub Pages)
 * dengan Google Sheets (database item) dan Google Docs (log aktivitas).
 *
 * CARA SETUP: lihat README.md.
 */

// =====================================================
// 1. KONFIGURASI — ISI DENGAN ID SPREADSHEET & DOCS ANDA
// =====================================================
var SPREADSHEET_ID = 'ISI_DENGAN_ID_SPREADSHEET_ANDA';
var DOC_ID          = 'ISI_DENGAN_ID_GOOGLE_DOCS_ANDA';
var SHEET_NAME       = 'Items';
var TIMEZONE         = 'GMT+7'; // Sesuaikan zona waktu Anda

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
      case 'logs':
        result = getLogs();
        break;
      case 'ping':
        result = { success: true, message: 'Backend aktif' };
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
// 3. HELPER — SHEET
// =====================================================
function getSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', 'Nama Item', 'Lokasi', 'Jumlah', 'Kategori', 'Dibuat', 'Terakhir Diedit']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToItem(row) {
  return {
    id: row[0],
    nama: row[1],
    lokasi: row[2],
    jumlah: row[3],
    kategori: row[4],
    dibuat: formatDateSafe(row[5]),
    terakhirDiedit: formatDateSafe(row[6])
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
    if (!data[i][0]) continue;
    items.push(rowToItem(data[i]));
  }
  return { success: true, items: items };
}

function findRowByCode(code) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === String(code).trim().toLowerCase()) {
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
  if (!nama || !lokasi) {
    return { success: false, message: 'Nama item dan lokasi wajib diisi.' };
  }
  var jumlah = payload.jumlah !== undefined && payload.jumlah !== '' ? payload.jumlah : 1;
  var kategori = (payload.kategori || '').toString().trim() || '-';

  var sheet = getSheet();
  var id = generateId();
  var now = new Date();
  sheet.appendRow([id, nama, lokasi, jumlah, kategori, now, now]);

  writeLog({
    id: id,
    nama: nama,
    aksi: 'TAMBAH ITEM',
    detail: 'Item baru dibuat di lokasi "' + lokasi + '" (jumlah: ' + jumlah + ', kategori: ' + kategori + ')'
  });

  return {
    success: true,
    item: { id: id, nama: nama, lokasi: lokasi, jumlah: jumlah, kategori: kategori,
             dibuat: formatDateSafe(now), terakhirDiedit: formatDateSafe(now) }
  };
}

function updateItem(payload) {
  var code = payload.id;
  if (!code) return { success: false, message: 'ID item tidak diberikan.' };

  var found = findRowByCode(code);
  if (!found) return { success: false, message: 'Item dengan ID "' + code + '" tidak ditemukan.' };

  var old = rowToItem(found.row);
  var fieldMap = [
    { key: 'nama', col: 2, label: 'Nama Item' },
    { key: 'lokasi', col: 3, label: 'Lokasi' },
    { key: 'jumlah', col: 4, label: 'Jumlah' },
    { key: 'kategori', col: 5, label: 'Kategori' }
  ];

  var changes = [];
  fieldMap.forEach(function (f) {
    var newVal = payload[f.key];
    if (newVal !== undefined && newVal !== null && String(newVal).trim() !== '' && String(newVal) !== String(old[f.key])) {
      changes.push(f.label + ': "' + old[f.key] + '" -> "' + newVal + '"');
      found.sheet.getRange(found.rowIndex, f.col).setValue(newVal);
    }
  });

  if (changes.length === 0) {
    return { success: true, message: 'Tidak ada perubahan yang disimpan.', item: old };
  }

  var now = new Date();
  found.sheet.getRange(found.rowIndex, 7).setValue(now);

  writeLog({
    id: old.id,
    nama: payload.nama || old.nama,
    aksi: 'EDIT ITEM',
    detail: changes.join(' | ')
  });

  var updatedRow = found.sheet.getRange(found.rowIndex, 1, 1, 7).getValues()[0];
  return { success: true, item: rowToItem(updatedRow) };
}

function generateId() {
  var now = new Date();
  var stamp = Utilities.formatDate(now, TIMEZONE, 'yyMMddHHmmss');
  var rand = Math.floor(100 + Math.random() * 900);
  return 'INV-' + stamp + rand;
}

// =====================================================
// 5. LOG — DISIMPAN DI GOOGLE DOCS
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
// 6. FUNGSI SETUP AWAL (jalankan manual sekali dari editor Apps Script)
// =====================================================
function setupPertamaKali() {
  var sheet = getSheet();
  Logger.log('Sheet "Items" siap dengan header di: ' + sheet.getParent().getUrl());

  var doc = DocumentApp.openById(DOC_ID);
  var body = doc.getBody();
  if (body.getText().trim() === '') {
    body.appendParagraph('LOG AKTIVITAS — INVENTORY CONTROL QR').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Setiap perubahan item (tambah/edit) akan dicatat otomatis di bawah ini.');
    body.appendParagraph('----------------------------------------------------');
  }
  Logger.log('Google Docs log siap di: ' + doc.getUrl());
}
