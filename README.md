# 中 GymMandarin

Aplikasi pribadi untuk **belajar Mandarin (HSK 1–4)** dan **tracking proses nge-gym + lari**.
Berupa PWA (Progressive Web App) — bisa di-*install* di **laptop dan HP**, jalan **offline**, data tersimpan **lokal** di perangkat.

---

## ▶️ Cara Menjalankan di Laptop

1. **Double-click `start-app.bat`** → browser otomatis terbuka di `http://localhost:8765`.
   (Biarkan jendela hitam tetap terbuka selama dipakai; tutup untuk mematikan.)
2. **Install jadi aplikasi:** di Chrome/Edge klik ikon *install* (⊕) di address bar, atau menu ⋮ → **Install GymMandarin**. Setelah itu bisa dibuka seperti aplikasi biasa tanpa membuka browser.

> `start-app.bat` memakai Python (sudah terpasang di laptopmu). Server lokal diperlukan agar fitur *install* & *offline* aktif.

---

## 📱 Cara Memakai di HP

Karena data tersimpan lokal per-perangkat, ada 2 pilihan:

**A. Install langsung (paling praktis untuk install di HP):**
- Upload folder ini ke hosting statis gratis (mis. **Netlify Drop** — tarik folder ke app.netlify.com/drop, atau **GitHub Pages**). Buka link HTTPS-nya di HP.
- **Android (Chrome):** menu ⋮ → *Tambahkan ke layar utama*.
- **iPhone (Safari):** tombol Share → *Add to Home Screen*.

**B. Lewat jaringan WiFi yang sama** (tanpa hosting):
- Jalankan `start-app.bat` di laptop, cari IP laptop (`ipconfig`), buka `http://IP-LAPTOP:8765/index.html` di HP. *(Catatan: install PWA penuh di Android butuh HTTPS, jadi cara A lebih disarankan untuk install.)*

**Pindah data antar perangkat:** menu **⚙️ Atur → Backup Data → Export**, lalu **Import** file `.json` itu di perangkat lain.

---

## ✨ Fitur

### 中 Mandarin
- **Flashcard acak** HSK 1–4 (filter per level), ketuk untuk lihat pinyin + arti + contoh.
- **Target harian:** belajar 10 kosakata baru + tulis 1 kalimat untuk tiap kata. Ada **streak 🔥**.
- **Materi:** simpan catatan/grammar.
- **Daftar kata:** cari, tandai favorit ⭐, tambah kosakata sendiri.

### 🏋️ Gym & Lari
- **Program mingguan** sesuai jadwalmu (Senin upper body → Minggu lari+kardio), fokus mengecilkan perut (banyak core + kardio).
- **Checklist latihan harian**, durasi (target min. **30 menit/hari**), estimasi kalori terbakar.
- **Riwayat** & rekap menit per minggu.

### 🍱 Nutrisi & Berat
- **Catat kalori** makanan harian (input manual + daftar makanan cepat).
- **Timbangan**: berat aktual + lingkar pinggang (pantau perut).
- **Perbandingan mingguan**: berat awal → **estimasi** (otomatis dihitung dari defisit kalori, finalisasi tiap Minggu) vs **aktual**.
- BMR/TDEE & rasio pinggang-tinggi.

---

## ⚠️ Catatan
- Estimasi berat/kalori bersifat **perkiraan** (rumus Mifflin-St Jeor, ~7700 kkal ≈ 1 kg). Anggap sebagai panduan tren, bukan angka pasti.
- Isi dulu **⚙️ Atur → Profil & Target** (tinggi, umur, berat, dll) agar perhitungan akurat.
- Backup berkala via Export agar data aman.

加油! 💪
