# Gudang — Inventory Control QR

Sistem inventory control berbasis web dengan QR code. Frontend berjalan di **GitHub Pages** (statis), database di **Google Sheets**, dan log pengeditan tersimpan otomatis di **Google Docs**.

## Fitur

- **Tambah item** — nama, lokasi, department, jumlah, kategori. QR code dibuat otomatis, bisa diunduh/dicetak sebagai label.
- **Department (free-text + dropdown)** — ketik nama department apa saja; nilai itu otomatis diingat dan muncul sebagai pilihan dropdown saat mengisi item berikutnya. Setiap pilihan di dropdown punya ikon tong sampah untuk dihapus dari daftar saran (item yang sudah memakai department itu tidak berubah, hanya sarannya yang hilang untuk input berikutnya).
- **Cek item** — scan QR lewat kamera HP/laptop, atau input manual ID, langsung menampilkan lokasi & detail item.
- **Daftar item** — tabel semua item dengan pencarian, klik baris untuk edit.
- **Edit item** — perubahan otomatis tercatat sebagai log.
- **Log aktivitas** — tanggal, jam, dan apa yang diubah, tersimpan permanen di Google Docs.

Struktur file:

```
inventory-qr/
├── index.html      → halaman utama
├── style.css        → tampilan
├── app.js           → logic aplikasi (fetch ke Apps Script)
├── config.js        → ISI URL Web App Apps Script Anda di sini
├── Code.gs           → backend, di-deploy lewat Google Apps Script
└── README.md
```

---

## Setup — 4 langkah

### 1. Buat Google Sheet (database)

1. Buka [sheets.google.com](https://sheets.google.com) → buat spreadsheet baru, beri nama misalnya `Database Inventory`.
2. Ambil **ID spreadsheet** dari URL-nya:
   ```
   https://docs.google.com/spreadsheets/d/►ID_SPREADSHEET_ADA_DI_SINI◄/edit
   ```
3. Sheet ("Items") dan header kolom akan dibuat **otomatis** oleh script saat pertama kali dijalankan — tidak perlu diisi manual.

### 2. Buat Google Docs (log)

1. Buka [docs.google.com](https://docs.google.com) → buat dokumen baru, beri nama misalnya `Log Aktivitas Inventory`.
2. Ambil **ID dokumen** dari URL-nya:
   ```
   https://docs.google.com/document/d/►ID_DOCUMENT_ADA_DI_SINI◄/edit
   ```

### 3. Deploy backend (Google Apps Script)

1. Buka [script.google.com](https://script.google.com) → **New project**.
2. Hapus kode default, lalu tempel seluruh isi file **`Code.gs`** dari folder ini.
3. Di bagian atas file, isi konfigurasi:
   ```javascript
   var SPREADSHEET_ID = 'ID_SPREADSHEET_DARI_LANGKAH_1';
   var DOC_ID          = 'ID_DOCUMENT_DARI_LANGKAH_2';
   ```
4. Jalankan fungsi `setupPertamaKali` sekali (pilih dari dropdown fungsi di toolbar, lalu klik **Run**). Saat diminta, berikan izin akses ke Sheets & Docs Anda.
5. Klik **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Klik **Deploy**, salin **Web app URL** yang muncul (formatnya `https://script.google.com/macros/s/XXXXX/exec`).

> Setiap kali Anda mengubah isi `Code.gs`, gunakan **Deploy → Manage deployments → Edit (ikon pensil) → New version** agar perubahan diterapkan ke URL yang sama.

### 4. Sambungkan frontend & publish ke GitHub Pages

1. Buka file **`config.js`**, ganti isinya dengan URL Web App dari langkah 3:
   ```javascript
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXXXX/exec';
   ```
2. Push seluruh folder ini ke repository GitHub Anda.
3. Di repo GitHub: **Settings → Pages → Source**, pilih branch (misalnya `main`) dan folder `/ (root)`.
4. Tunggu beberapa saat, situs akan aktif di `https://username.github.io/nama-repo/`.

Selesai — buka URL tersebut, status koneksi di sidebar kiri bawah akan menunjukkan **"Terhubung ke backend"** jika semua langkah benar.

---

## Cara pakai

- **Tambah Item** → isi nama & lokasi → *Simpan item* → QR code muncul, bisa diunduh (PNG) atau langsung dicetak sebagai label untuk ditempel di rak/lokasi barang.
- **Cek Item** → tab *Pindai kamera* untuk scan langsung, atau *Input manual* untuk mengetik ID item.
- **Daftar Item** → cari & klik salah satu baris untuk membuka form edit.
- **Log Aktivitas** → riwayat lengkap tiap penambahan/perubahan (tanggal, jam, field yang diubah, nilai lama → baru), diambil langsung dari Google Docs Anda.

## Catatan teknis

- Scan kamera memerlukan **HTTPS** (GitHub Pages sudah HTTPS secara default) dan izin akses kamera dari browser.
- Pemanggilan API ke Apps Script menggunakan `Content-Type: text/plain` pada POST agar terhindar dari *CORS preflight*, karena Apps Script Web App tidak mendukung custom preflight response.
- ID item dibuat otomatis dengan format `INV-yyMMddHHmmss + 3 digit acak`, dipakai sebagai isi QR code.
- Semua log ditulis sebagai paragraf baru di Google Docs dengan format:
  ```
  [dd MMMM yyyy | HH:mm:ss] AKSI — ID: ... — Item: ... — detail perubahan
  ```
- Daftar department tersimpan di sheet terpisah bernama **Departments** (dibuat otomatis). Kalau Anda sudah punya sheet `Items` dari versi sebelumnya (tanpa kolom Department), kolom itu akan **disisipkan otomatis** saat pertama kali dipanggil setelah Anda men-deploy ulang `Code.gs` — data lama tidak berubah.

## Kustomisasi lanjutan

- Tambah kolom baru (misal: kondisi barang, foto, supplier) → tambahkan header di Sheet, field di `fieldMap` pada `Code.gs`, dan input di `index.html` + `app.js`.
- Ingin membatasi siapa saja yang boleh mengakses situs → tambahkan autentikasi sederhana di frontend, atau ubah "Who has access" pada deployment Apps Script menjadi organisasi tertentu (memerlukan Google Workspace).
