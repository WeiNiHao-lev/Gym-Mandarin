/* ============================================================
   GYMMANDARIN — Logika Aplikasi
   Semua data disimpan lokal di localStorage (key: "gm_data").
   ============================================================ */

const KCAL_PER_KG = 7700; // ~7700 kkal defisit = 1 kg lemak

/* Pilihan fokus/tujuan — menyetir kartu "Fokus" di Beranda (personal per akun) */
const FOKUS_LIST = {
  kecilkan_perut: {
    label: "Kecilkan Perut", emoji: "🎯",
    tip: (p, tgt) => `Tetap defisit kalori (target ${tgt} kkal/hari), perbanyak kardio (lari) & latihan <b>core</b> tiap hari. Pantau lingkar pinggang (target ${p.targetPinggang} cm) di Nutrisi → Berat Badan. Konsistensi > intensitas.`,
  },
  turun_bb: {
    label: "Turunkan Berat Badan", emoji: "📉",
    tip: (p, tgt) => `Jaga defisit kalori (target ${tgt} kkal/hari) menuju <b>${p.targetBerat} kg</b>. Gabung kardio + angkat beban biar otot tetap terjaga saat berat turun.`,
  },
  naik_otot: {
    label: "Tambah Massa Otot", emoji: "💪",
    tip: (p, tgt) => `Surplus kalori ringan + protein cukup (~${Math.round(beratSekarang() * 1.8)} g/hari). Fokus <b>progressive overload</b> — naikkan beban/rep bertahap tiap minggu.`,
  },
  bugar: {
    label: "Jaga Kebugaran & Sehat", emoji: "🌿",
    tip: (p, tgt) => `Konsisten olahraga ≥30 menit/hari & pola makan seimbang (~${tgt} kkal). Variasikan latihan (gym, lari, badminton) biar nggak bosan.`,
  },
};

/* ---------------- STORAGE ---------------- */
const DEFAULT_DB = () => ({
  profile: {
    nama: "", gender: "pria", umur: 25, tinggi: 170,
    beratAwal: 76, aktivitas: 1.375, targetKalori: 0,
    targetBerat: 68, targetPinggang: 85, fokus: "kecilkan_perut",
  },
  onboarded: false,    // sudah isi profil awal?
  vocabProgress: {},   // id -> {status:'baru'|'belajar'|'hafal', star, lastSeen}
  customVocab: [],     // {id,h,p,a,l,c}
  daily: {},           // dateKey -> {vocabIds:[], kalimat:{id:str}, done}
  materi: [],          // {id,judul,isi,tgl}
  workouts: {},        // dateKey -> {done:[names], durasi, kaloriTerbakar, catatan}
  meals: {},           // dateKey -> [{id,nama,kalori}]
  weightLog: [],       // {tgl, berat, pinggang}
  flashLevels: [1, 2, 3, 4],
  streak: { mandarin: 0, lastMandarin: "" },
  notif: false,
});

let DB = load();

function load() {
  try {
    const raw = localStorage.getItem("gm_data");
    if (!raw) return DEFAULT_DB();
    return Object.assign(DEFAULT_DB(), JSON.parse(raw));
  } catch (e) { return DEFAULT_DB(); }
}
function save() {
  localStorage.setItem("gm_data", JSON.stringify(DB));
  localStorage.setItem("gm_ts", String(Date.now()));
  if (window.syncPush) window.syncPush(DB);
}

// Dipakai oleh modul sync (js/sync.js)
let currentView = "home";
window.getLocalData = () => DB;
window.applySyncedData = (data) => {
  DB = Object.assign(DEFAULT_DB(), data);
  localStorage.setItem("gm_data", JSON.stringify(DB));
  renderView(currentView);
  if (typeof toast === "function") toast("☁️ Data tersinkron dari cloud");
};

/* ---------------- TANGGAL ---------------- */
function dateKey(d) {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}
function todayKey() { return dateKey(new Date()); }
function parseKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function mondayOf(d) {
  const x = new Date(d); const day = x.getDay();
  return addDays(x, day === 0 ? -6 : 1 - day);
}
function weekDates(monday) { return Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i))); }
function fmtTgl(k) {
  const d = parseKey(k);
  return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getMonth()];
}

/* ---------------- VOCAB HELPERS ---------------- */
function allVocab() { return VOCAB.concat(DB.customVocab); }
function vp(id) {
  if (!DB.vocabProgress[id]) DB.vocabProgress[id] = { status: "baru", star: false, lastSeen: "" };
  return DB.vocabProgress[id];
}

/* ---------------- TDEE / KALORI ---------------- */
function beratSekarang() {
  if (DB.weightLog.length) return DB.weightLog[DB.weightLog.length - 1].berat;
  return DB.profile.beratAwal;
}
function bmr(berat) {
  const p = DB.profile;
  const base = 10 * berat + 6.25 * p.tinggi - 5 * p.umur;
  return p.gender === "pria" ? base + 5 : base - 161;
}
function tdee(berat) { return Math.round(bmr(berat) * DB.profile.aktivitas); }
function targetKalori() {
  if (DB.profile.targetKalori > 0) return DB.profile.targetKalori;
  return Math.max(1400, tdee(beratSekarang()) - 500); // defisit ~500 utk turun BB
}
function kaloriMakan(dk) { return (DB.meals[dk] || []).reduce((s, m) => s + (+m.kalori || 0), 0); }
function kaloriOlahraga(dk) { return (DB.workouts[dk] && DB.workouts[dk].kaloriTerbakar) || 0; }
function pengeluaranHari(dk) {
  // maintenance harian + kalori olahraga tercatat
  return tdee(beratSekarang()) + kaloriOlahraga(dk);
}

/* ---------------- ESTIMASI BERAT MINGGUAN ---------------- */
function ringkasanMinggu(monday) {
  const dates = weekDates(monday);
  const today = todayKey();
  let intake = 0, expend = 0, hariBerdata = 0, totalDurasi = 0;
  dates.forEach(dk => {
    if (dk > today) return;
    const km = kaloriMakan(dk);
    if (km > 0) { intake += km; expend += pengeluaranHari(dk); hariBerdata++; }
    totalDurasi += (DB.workouts[dk] && DB.workouts[dk].durasi) || 0;
  });
  const defisit = expend - intake;                 // + berarti defisit (turun)
  const deltaBerat = -defisit / KCAL_PER_KG;        // kg perubahan (negatif = turun)
  // berat awal minggu = timbangan aktual terakhir sebelum minggu ini, kalau tidak ada pakai beratAwal
  const startKey = dateKey(monday);
  let beratAwal = DB.profile.beratAwal;
  const sebelum = DB.weightLog.filter(w => w.tgl < startKey);
  if (sebelum.length) beratAwal = sebelum[sebelum.length - 1].berat;
  // aktual = timbangan dalam minggu ini (ambil terakhir)
  const dlmMinggu = DB.weightLog.filter(w => dates.includes(w.tgl));
  const aktual = dlmMinggu.length ? dlmMinggu[dlmMinggu.length - 1].berat : null;
  const estimasi = +(beratAwal + deltaBerat).toFixed(2);
  return { dates, intake, expend, defisit, deltaBerat, beratAwal, estimasi, aktual, hariBerdata, totalDurasi };
}

/* ---------------- NAVIGASI ---------------- */
function go(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  window.scrollTo(0, 0);
  renderView(view);
}
function renderView(view) {
  ({ home: renderHome, mandarin: renderMandarin, gym: renderGym, nutrisi: renderNutrisi, setting: renderSetting }[view] || (() => {}))();
}
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => go(b.dataset.view));

// subtabs
document.querySelectorAll(".subtabs").forEach(group => {
  group.querySelectorAll(".subtab").forEach(tab => {
    tab.onclick = () => {
      const parent = group.parentElement;
      group.querySelectorAll(".subtab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      parent.querySelectorAll(".subview").forEach(s => s.classList.remove("active"));
      parent.querySelector("#sub-" + tab.dataset.sub).classList.add("active");
      renderView(parent.id.replace("view-", ""));
    };
  });
});

/* ---------------- UI HELPERS ---------------- */
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.remove("hidden"); t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 1800);
}
function esc(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---------------- PELAFALAN (TTS) ---------------- */
let zhVoice = null;
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /^zh/i.test(v.lang)) || vs.find(v => /chinese|中文|普通话|mandarin/i.test(v.name)) || null;
}
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text) {
  if (!("speechSynthesis" in window)) { toast("Browser tidak mendukung suara"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN"; u.rate = 0.85;
  if (zhVoice) u.voice = zhVoice;
  speechSynthesis.speak(u);
}

/* ============================================================
   BERANDA
   ============================================================ */
function renderHome() {
  const tk = todayKey(), hari = new Date().getDay();
  const prog = PROGRAM_LIB[progKeyFor(tk, hari)] || PROGRAM[hari];
  const w = DB.workouts[tk] || {};
  const durasi = w.durasi || 0;
  const d = DB.daily[tk] || {};
  const mandarinDone = !!d.done;
  const km = kaloriMakan(tk), tgt = targetKalori();
  const minggu = ringkasanMinggu(mondayOf(new Date()));
  const fokus = FOKUS_LIST[DB.profile.fokus] || FOKUS_LIST.kecilkan_perut;

  const c = document.getElementById("homeContent");
  c.innerHTML = `
    ${DB.profile.nama ? `<div class="small muted" style="margin:-2px 0 10px">Halo, <b style="color:var(--text)">${esc(DB.profile.nama)}</b> 👋 — ayo capai targetmu!</div>` : ""}
    <div class="card" style="background:linear-gradient(160deg,#cfe4fb,#e6f4f1)">
      <div class="row spread">
        <div>
          <div class="muted small">Latihan hari ini</div>
          <h3 style="font-size:20px;margin:2px 0">${prog.emoji} ${prog.nama}</h3>
          <div class="small">${prog.fokus}</div>
        </div>
        <div class="center">
          <div class="stat-big">${durasi}<span style="font-size:16px"> mnt</span></div>
          <div class="${durasi >= 30 ? "down" : "muted"} small">${durasi >= 30 ? "✓ Target 30 mnt" : "min. 30 mnt"}</div>
        </div>
      </div>
      <div class="pbar mt"><div style="width:${Math.min(100, durasi / 30 * 100)}%"></div></div>
      <button class="btn full mt" onclick="go('gym')">Buka latihan ${durasi ? "(lanjut)" : ""} →</button>
    </div>

    <div class="grid2">
      <div class="card tight center">
        <div class="muted small">Mandarin hari ini</div>
        <div style="font-size:30px;margin:6px 0">${mandarinDone ? "✅" : "📚"}</div>
        <div class="small">${mandarinDone ? "Target selesai!" : "10 kosakata + kalimat"}</div>
        <div class="small muted mt">🔥 Streak ${DB.streak.mandarin} hari</div>
        <button class="btn sm sec full mt" onclick="go('mandarin')">${mandarinDone ? "Latihan lagi" : "Mulai"}</button>
      </div>
      <div class="card tight center">
        <div class="muted small">Kalori hari ini</div>
        <div class="stat-big" style="margin:6px 0">${km}</div>
        <div class="small ${km > tgt ? "up" : "down"}">target ${tgt} kkal</div>
        <button class="btn sm sec full mt" onclick="go('nutrisi')">Catat makan</button>
      </div>
    </div>

    <div class="card">
      <h3>📉 Progres Minggu Ini</h3>
      <div class="stat-grid">
        <div><div class="muted small">Berat awal</div><div class="stat-big" style="font-size:22px">${minggu.beratAwal}<span class="stat-unit">kg</span></div></div>
        <div><div class="muted small">Estimasi</div><div class="stat-big" style="font-size:22px;color:var(--accent)">${minggu.estimasi}<span class="stat-unit">kg</span></div></div>
        <div><div class="muted small">Aktual</div><div class="stat-big" style="font-size:22px">${minggu.aktual ?? "–"}<span class="stat-unit">${minggu.aktual ? "kg" : ""}</span></div></div>
      </div>
      <div class="small muted mt">Olahraga minggu ini: <b style="color:var(--text)">${minggu.totalDurasi} menit</b> · Hari kerja ke-${weekDates(mondayOf(new Date())).filter(x => x <= todayKey()).length} · ${hari === 0 ? "Hari ini timbang berat badan! ⚖️" : "Timbang BB tiap Minggu"}</div>
    </div>

    <div class="card">
      <h3>${fokus.emoji} Fokus: ${fokus.label}</h3>
      <div class="small">${fokus.tip(DB.profile, tgt)}</div>
    </div>
  `;
  updateReminder();
}

/* ============================================================
   MANDARIN
   ============================================================ */
let flashCurrent = null;

function renderMandarin() {
  renderLevelFilter();
  if (document.querySelector("#sub-flashcard").classList.contains("active")) renderFlashcard();
  if (document.querySelector("#sub-harian").classList.contains("active")) renderDailyVocab();
  if (document.querySelector("#sub-materi").classList.contains("active")) renderMateri();
  if (document.querySelector("#sub-daftar").classList.contains("active")) renderDaftar();
}

function renderLevelFilter() {
  const f = document.getElementById("levelFilter");
  const count = allVocab().filter(v => DB.flashLevels.includes(v.l)).length;
  f.innerHTML = [1, 2, 3, 4].map(l =>
    `<button class="lvl-chip ${DB.flashLevels.includes(l) ? "on" : ""}" onclick="toggleLevel(${l})">HSK ${l}</button>`
  ).join("") + `<span class="small muted" style="margin-left:auto;font-weight:700">${count} kata aktif</span>`;
}
function toggleLevel(l) {
  const i = DB.flashLevels.indexOf(l);
  if (i >= 0) {
    if (DB.flashLevels.length > 1) DB.flashLevels.splice(i, 1);
    else { toast("Minimal 1 level harus aktif"); return; }
  } else DB.flashLevels.push(l);
  save(); renderLevelFilter(); renderFlashcard();
}

function pickFlash() {
  const pool = allVocab().filter(v => DB.flashLevels.includes(v.l));
  if (!pool.length) return null;
  // bobot: kata belum hafal lebih sering muncul
  const weighted = [];
  pool.forEach(v => {
    const s = vp(v.id).status;
    const w = s === "hafal" ? 1 : s === "belajar" ? 3 : 4;
    for (let i = 0; i < w; i++) weighted.push(v);
  });
  let pick;
  do { pick = weighted[Math.floor(Math.random() * weighted.length)]; }
  while (pool.length > 1 && flashCurrent && pick.id === flashCurrent.id);
  return pick;
}

function renderFlashcard() {
  const area = document.getElementById("flashcardArea");
  flashCurrent = pickFlash();
  if (!flashCurrent) { area.innerHTML = `<div class="empty">Pilih minimal 1 level HSK.</div>`; return; }
  const v = flashCurrent, st = vp(v.id);
  const total = allVocab().filter(x => DB.flashLevels.includes(x.l));
  const hafal = total.filter(x => vp(x.id).status === "hafal").length;
  area.innerHTML = `
    <div class="flashcard" id="fcard" onclick="document.getElementById('fcard').classList.toggle('flipped')">
      <div class="flash-inner">
        <div class="flash-face flash-front">
          <span class="flash-badge">HSK ${v.l}</span>
          <div style="position:absolute;top:11px;right:12px;display:flex;gap:6px">
            <button class="flash-star" style="position:static" onclick="event.stopPropagation();speak('${v.h}')">🔊</button>
            <button class="flash-star" style="position:static" onclick="event.stopPropagation();toggleStar('${v.id}')">${st.star ? "⭐" : "☆"}</button>
          </div>
          <div class="flash-hanzi">${v.h}</div>
          <div class="flash-hint">ketuk untuk lihat arti</div>
        </div>
        <div class="flash-face flash-back">
          <span class="flash-badge">HSK ${v.l}</span>
          <button class="flash-star" style="position:absolute;top:11px;right:12px" onclick="event.stopPropagation();speak('${v.h}')">🔊</button>
          <div class="flash-pinyin">${v.p}</div>
          <div class="flash-arti">${esc(v.a)}</div>
          ${v.c ? `<div class="flash-contoh">${esc(v.c)}</div>` : ""}
          <div class="flash-hint">ketuk untuk balik</div>
        </div>
      </div>
    </div>
    <div class="flash-actions">
      <button class="btn sec" onclick="markFlash('belajar')">🔁 Belum hafal</button>
      <button class="btn green" onclick="markFlash('hafal')">✓ Sudah hafal</button>
    </div>
    <div class="row spread mt small muted">
      <span>Progres HSK ${DB.flashLevels.join("·")}: ${hafal}/${total.length} hafal</span>
      <button class="btn xs ghost" onclick="renderFlashcard()">Lewati →</button>
    </div>
    <div class="pbar mt"><div style="width:${total.length ? hafal / total.length * 100 : 0}%"></div></div>
  `;
}
function toggleStar(id) { const s = vp(id); s.star = !s.star; save(); renderFlashcard(); }
function markFlash(status) {
  const s = vp(flashCurrent.id); s.status = status; s.lastSeen = todayKey(); save();
  if (status === "hafal") toast("Mantap! 加油 💪");
  renderFlashcard();
}

/* ---------- TARGET HARIAN ---------- */
function renderDailyVocab() {
  const tk = todayKey();
  const area = document.getElementById("dailyVocabArea");
  let d = DB.daily[tk];

  if (!d || !d.vocabIds || !d.vocabIds.length) {
    area.innerHTML = `
      <div class="card center">
        <h3 style="justify-content:center">📚 Target Harian</h3>
        <p class="small muted">Belajar <b style="color:var(--text)">10 kosakata baru</b> lalu buat <b style="color:var(--text)">1 kalimat</b> untuk tiap kata. Selesaikan tiap hari untuk jaga streak 🔥</p>
        <div class="small muted mt mb">🔥 Streak saat ini: <b style="color:var(--accent)">${DB.streak.mandarin} hari</b></div>
        <button class="btn full" onclick="mulaiHarian()">Mulai 10 Kosakata Baru</button>
      </div>`;
    return;
  }

  const kata = d.vocabIds.map(id => allVocab().find(v => v.id === id)).filter(Boolean);
  const terisi = kata.filter(v => (d.kalimat[v.id] || "").trim().length > 2).length;
  area.innerHTML = `
    <div class="card">
      <div class="row spread">
        <h3 style="margin:0">📝 Kosakata Hari Ini</h3>
        <span class="${d.done ? "pill-done" : "pill-wait"}">${terisi}/${kata.length} kalimat</span>
      </div>
      <div class="pbar mt"><div style="width:${terisi / kata.length * 100}%"></div></div>
    </div>
    ${kata.map((v, i) => `
      <div class="card tight">
        <div class="row spread">
          <div><b style="font-size:22px">${v.h}</b> <span style="color:var(--accent)">${v.p}</span>
            <button class="btn xs ghost" onclick="speak('${v.h}')">🔊</button>
            <span class="tag hsk${v.l}">HSK${v.l}</span></div>
          <span class="muted small">#${i + 1}</span>
        </div>
        <div class="small muted mb">${esc(v.a)}${v.c ? " · " + esc(v.c) : ""}</div>
        <textarea id="kal_${v.id}" placeholder="Tulis kalimatmu dengan ${v.h}..." style="min-height:46px"
          oninput="simpanKalimat('${v.id}', this.value)">${esc(d.kalimat[v.id] || "")}</textarea>
        <div class="row mt"><button class="btn sm sec" onclick="periksaKalimat('${v.id}','${v.h}')">🔍 Periksa grammar</button></div>
        <div id="rev_${v.id}"></div>
      </div>`).join("")}
    <button class="btn full green mt" onclick="selesaikanHarian()">${d.done ? "✓ Sudah selesai — Perbarui" : "Selesaikan Target Hari Ini"}</button>
    <button class="btn full ghost mt" onclick="if(confirm('Ganti dengan 10 kata baru lain?')){mulaiHarian(true)}">Ganti kata</button>
  `;
}
function mulaiHarian(force) {
  const tk = todayKey();
  let pool = allVocab().filter(v => DB.flashLevels.includes(v.l) && vp(v.id).status === "baru");
  if (pool.length < 10) pool = allVocab().filter(v => DB.flashLevels.includes(v.l)); // cadangan
  if (pool.length < 10) pool = allVocab();
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 10);
  DB.daily[tk] = { vocabIds: shuffled.map(v => v.id), kalimat: {}, done: false };
  shuffled.forEach(v => { vp(v.id).status = vp(v.id).status === "baru" ? "belajar" : vp(v.id).status; });
  save(); renderDailyVocab();
}
/* ---------- REVIEW KALIMAT (pemeriksa grammar heuristik) ---------- */
const ADJ_COMMON = ["高","大","小","好","忙","累","贵","便宜","漂亮","快","慢","新","旧","热","冷","胖","瘦","难","重要","聪明","年轻","干净","安静","近","远","长","甜","饿","渴","饱","开心","高兴"];
function reviewSentence(text, target) {
  text = (text || "").trim();
  const r = { ok: [], warn: [], err: [] };
  if (!text) { r.err.push("Kalimat masih kosong."); return r; }
  const hanziCount = (text.match(/[一-鿿]/g) || []).length;
  // 1. memakai kata target
  if (target && !text.includes(target)) r.err.push(`Belum memakai kata「${target}」di kalimat.`);
  else if (target) r.ok.push(`Kata「${target}」sudah dipakai.`);
  // 2. panjang
  if (hanziCount < 4) r.warn.push("Kalimat agak pendek — coba lengkapi (subjek + predikat/objek).");
  else r.ok.push(`Panjang cukup (${hanziCount} karakter).`);
  // 3. tanda baca akhir
  if (!/[。！？!?]$/.test(text)) r.warn.push("Tambahkan tanda baca penutup: 。 ？ atau ！");
  else r.ok.push("Ada tanda baca penutup.");
  // 4. campur huruf latin (abaikan isi dalam kurung)
  if (/[a-zA-Z]/.test(text.replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, ""))) r.warn.push("Ada huruf Latin — usahakan tulis penuh dengan hanzi.");
  // 5. pola yang sering keliru
  if (/很是|是很/.test(text)) r.err.push("「很」+「是」biasanya tak digabung.「很」untuk sifat (我很忙),「是」untuk identitas (我是学生).");
  if (/了了|的的|很很|不不/.test(text)) r.err.push("Ada karakter dobel yang janggal (mis. 了了 / 的的).");
  for (const a of ADJ_COMMON) { if (text.includes("是" + a)) { r.err.push(`Untuk sifat pakai「很」bukan「是」: mis. 我很${a}（bukan 我是${a}）.`); break; } }
  if (/没\S*了/.test(text)) r.warn.push("Cek lagi:「没」+「了」jarang dipakai bersama (没去了 ❌ → 没去 / 不去了).");
  if (/[一二三四五六七八九两](人|书|猫|狗|车|苹果)/.test(text)) r.warn.push("Setelah angka biasanya ada kata bantu bilangan (量词): mis. 三个人, 一本书, 两只猫.");
  if (/^[一-鿿]*吗[。.]?$/.test(text) && !/[？?]$/.test(text)) r.warn.push("Kalimat dengan「吗」sebaiknya diakhiri tanda tanya ？");
  return r;
}
function periksaKalimat(id, hanzi) {
  const live = document.getElementById("kal_" + id);
  const d = DB.daily[todayKey()];
  const text = (live ? live.value : "") || (d && d.kalimat[id]) || "";
  const r = reviewSentence(text, hanzi);
  const box = document.getElementById("rev_" + id);
  if (!box) return;
  const lines = []
    .concat(r.err.map(m => `<div class="r-line r-err">✕ ${esc(m)}</div>`))
    .concat(r.warn.map(m => `<div class="r-line r-warn">▲ ${esc(m)}</div>`))
    .concat(r.ok.map(m => `<div class="r-line r-ok">✓ ${esc(m)}</div>`));
  const verdict = r.err.length ? "Perlu perbaikan ✍️" : (r.warn.length ? "Hampir oke 👍" : "Bagus sekali! 🎉");
  box.innerHTML = `<div class="review-box"><b>${verdict}</b>${lines.join("")}<div class="small muted mt">Catatan: pemeriksa dasar (struktur & pola umum). Untuk koreksi grammar mendalam, fitur AI bisa ditambah.</div></div>`;
}
function simpanKalimat(id, val) {
  const d = DB.daily[todayKey()]; if (!d) return;
  d.kalimat[id] = val; save();
  // update progress bar tanpa re-render penuh
  const kata = d.vocabIds.length;
  const terisi = d.vocabIds.filter(i => (d.kalimat[i] || "").trim().length > 2).length;
  const bar = document.querySelector("#dailyVocabArea .pbar > div");
  if (bar) bar.style.width = (terisi / kata * 100) + "%";
}
function selesaikanHarian() {
  const tk = todayKey(), d = DB.daily[tk];
  const kata = d.vocabIds, terisi = kata.filter(i => (d.kalimat[i] || "").trim().length > 2).length;
  if (terisi < kata.length) { toast(`Masih ${kata.length - terisi} kalimat lagi!`); return; }
  if (!d.done) {
    d.done = true;
    // update streak
    const kemarin = dateKey(addDays(new Date(), -1));
    DB.streak.mandarin = (DB.streak.lastMandarin === kemarin || DB.streak.lastMandarin === tk) ? DB.streak.mandarin + (DB.streak.lastMandarin === tk ? 0 : 1) : 1;
    DB.streak.lastMandarin = tk;
    d.vocabIds.forEach(i => { vp(i).status = "hafal"; });
  }
  save(); toast("🎉 Target selesai! 太棒了!"); renderDailyVocab(); updateReminder();
}

/* ---------- MATERI ---------- */
function renderMateri() {
  const area = document.getElementById("materiArea");
  area.innerHTML = `
    <div class="card">
      <h3>➕ Simpan Materi</h3>
      <label class="field"><span>Judul</span><input id="mJudul" placeholder="Misal: Tata bahasa 把字句"></label>
      <label class="field"><span>Isi catatan</span><textarea id="mIsi" placeholder="Tulis materi / grammar / catatan di sini..."></textarea></label>
      <button class="btn full" onclick="tambahMateri()">Simpan</button>
    </div>
    ${DB.materi.length ? DB.materi.slice().reverse().map(m => `
      <div class="card tight">
        <div class="row spread">
          <b>${esc(m.judul)}</b>
          <button class="btn xs ghost" onclick="hapusMateri('${m.id}')">🗑</button>
        </div>
        <div class="small muted">${fmtTgl(m.tgl)}</div>
        <div class="small mt" style="white-space:pre-wrap">${esc(m.isi)}</div>
      </div>`).join("") : `<div class="empty">Belum ada materi tersimpan.</div>`}
  `;
}
function tambahMateri() {
  const j = document.getElementById("mJudul").value.trim();
  const i = document.getElementById("mIsi").value.trim();
  if (!j && !i) { toast("Isi dulu materinya"); return; }
  DB.materi.push({ id: "m" + Date.now(), judul: j || "(tanpa judul)", isi: i, tgl: todayKey() });
  save(); renderMateri(); toast("Materi tersimpan");
}
function hapusMateri(id) { DB.materi = DB.materi.filter(m => m.id !== id); save(); renderMateri(); }

/* ---------- DAFTAR KATA ---------- */
let daftarFilter = { q: "", lvl: 0, fav: false };
function renderDaftar() {
  const area = document.getElementById("daftarArea");
  let list = allVocab();
  if (daftarFilter.lvl) list = list.filter(v => v.l === daftarFilter.lvl);
  if (daftarFilter.fav) list = list.filter(v => vp(v.id).star);
  if (daftarFilter.q) {
    const q = daftarFilter.q.toLowerCase();
    list = list.filter(v => v.h.includes(q) || v.p.toLowerCase().includes(q) || v.a.toLowerCase().includes(q));
  }
  area.innerHTML = `
    <div class="card tight">
      <input placeholder="🔍 Cari hanzi / pinyin / arti..." value="${esc(daftarFilter.q)}" oninput="daftarFilter.q=this.value;renderDaftar()">
      <div class="row wrap mt">
        ${[0, 1, 2, 3, 4].map(l => `<button class="lvl-chip ${daftarFilter.lvl === l ? "on" : ""}" onclick="daftarFilter.lvl=${l};renderDaftar()">${l ? "HSK " + l : "Semua"}</button>`).join("")}
        <button class="lvl-chip ${daftarFilter.fav ? "on" : ""}" onclick="daftarFilter.fav=!daftarFilter.fav;renderDaftar()">⭐ Favorit</button>
      </div>
    </div>
    <details class="card tight">
      <summary style="cursor:pointer;font-weight:700">➕ Tambah kosakata sendiri</summary>
      <div class="grid2 mt">
        <input id="cvH" placeholder="汉字">
        <input id="cvP" placeholder="pinyin">
      </div>
      <input id="cvA" class="mt" placeholder="arti (Indonesia)">
      <div class="row mt">
        <select id="cvL"><option value="1">HSK 1</option><option value="2">HSK 2</option><option value="3">HSK 3</option><option value="4" selected>HSK 4</option></select>
        <button class="btn" onclick="tambahVocab()">Simpan</button>
      </div>
    </details>
    <div class="small muted mb">${list.length} kata</div>
    ${list.map(v => {
      const s = vp(v.id);
      return `<div class="litem">
        <div class="grow">
          <b style="font-size:18px">${v.h}</b> <span style="color:var(--accent)">${v.p}</span>
          <span class="tag hsk${v.l}">HSK${v.l}</span>
          <div><small>${esc(v.a)}</small></div>
        </div>
        <div class="row">
          <button class="btn xs ghost" onclick="speak('${v.h}')">🔊</button>
          <button class="btn xs ghost" onclick="toggleStar2('${v.id}')">${s.star ? "⭐" : "☆"}</button>
          <span class="tag" style="color:${s.status === "hafal" ? "var(--green)" : s.status === "belajar" ? "var(--accent)" : "var(--muted)"}">${s.status}</span>
        </div>
      </div>`;
    }).join("") || `<div class="empty">Tidak ada kata.</div>`}
  `;
}
function toggleStar2(id) { const s = vp(id); s.star = !s.star; save(); renderDaftar(); }
function tambahVocab() {
  const h = document.getElementById("cvH").value.trim();
  const p = document.getElementById("cvP").value.trim();
  const a = document.getElementById("cvA").value.trim();
  const l = +document.getElementById("cvL").value;
  if (!h || !a) { toast("Hanzi & arti wajib diisi"); return; }
  DB.customVocab.push({ id: "c" + Date.now(), h, p, a, l });
  save(); renderDaftar(); toast("Kosakata ditambahkan");
}

/* ============================================================
   GYM
   ============================================================ */
function renderGym() {
  if (document.querySelector("#sub-hariini").classList.contains("active")) renderGymToday();
  if (document.querySelector("#sub-program").classList.contains("active")) renderProgram();
  if (document.querySelector("#sub-riwayat").classList.contains("active")) renderGymRiwayat();
}

function progKeyFor(dk, day) { return (DB.workouts[dk] && DB.workouts[dk].programKey) || SCHEDULE[day]; }
function estimasiBurn(key, durasi) {
  const prog = PROGRAM_LIB[key] || {};
  const rate = prog.cardio ? (KALORI_PER_MENIT[prog.cardio.jenis] || 8) : KALORI_PER_MENIT["Angkat beban / Gym"];
  return Math.round((durasi || 0) * rate);
}
let gymPicker = { open: false, grup: "", q: "" };
function ensureWorkout(dk, hari) {
  if (!DB.workouts[dk]) DB.workouts[dk] = { done: [], durasi: 0, catatan: "", programKey: SCHEDULE[hari] };
  return DB.workouts[dk];
}
function dayList(w, key) {
  if (w.list) return w.list;
  return ((PROGRAM_LIB[key] && PROGRAM_LIB[key].exercises) || []).map(e => ({ n: e.n, d: e.d }));
}
function renderGymToday() {
  const tk = todayKey(), hari = new Date().getDay();
  const defKey = SCHEDULE[hari];
  const w = DB.workouts[tk] || { done: [], durasi: 0, catatan: "" };
  const key = w.programKey || defKey;
  const prog = PROGRAM_LIB[key] || PROGRAM_LIB[defKey];
  const list = dayList(w, key);
  const area = document.getElementById("gymTodayArea");
  area.innerHTML = `
    <div class="card" style="background:linear-gradient(160deg,#e3f6f3,#e6f0fc)">
      <div class="muted small">${NAMA_HARI[hari]}</div>
      <h3 style="margin:2px 0;font-size:20px">${prog.emoji} ${prog.nama}</h3>
      <div class="small muted">${prog.fokus} · ${list.length} gerakan</div>
    </div>

    <details class="card tight">
      <summary style="cursor:pointer;font-weight:700;color:var(--primary-d)">📋 Mulai dari template (opsional)</summary>
      <select id="gProg" class="mt" onchange="muatProgram(this.value)">
        <option value="">— pilih template untuk memuat gerakannya —</option>
        ${Object.keys(PROGRAM_LIB).map(k => `<option value="${k}">${PROGRAM_LIB[k].emoji} ${PROGRAM_LIB[k].nama}${k === defKey ? " — disarankan" : ""}</option>`).join("")}
      </select>
      <div class="small muted mt">Saran hari ini: <b>${PROGRAM_LIB[defKey].emoji} ${PROGRAM_LIB[defKey].nama}</b>. Memilih template akan mengisi daftar gerakan di bawah (bisa kamu ubah).</div>
    </details>

    <div class="card">
      <div class="row spread"><h3 style="margin:0">🏋️ Gerakan Hari Ini</h3>
        <button class="btn sm" onclick="togglePicker()">${gymPicker.open ? "Tutup ✕" : "➕ Tambah gerakan"}</button></div>
      ${gymPicker.open ? renderExercisePicker() : ""}
      <div class="mt">
      ${list.length ? list.map((ex, idx) => {
        const done = w.done.includes(ex.n);
        return `<div class="checkrow ${done ? "done" : ""}">
          <input type="checkbox" ${done ? "checked" : ""} onchange="toggleEx('${esc(ex.n)}')">
          <span class="grow"><span class="ex-name">${esc(ex.n)}</span><div class="ex-d">${esc(ex.d || "")}</div></span>
          <button class="btn xs ghost" title="Video tutorial" onclick="bukaVideo('${esc(ex.n)}')">▶️</button>
          <button class="btn xs ghost" title="Hapus" onclick="hapusGerakan(${idx})">🗑</button>
        </div>`;
      }).join("") : `<div class="empty">Belum ada gerakan. Pilih template di atas, atau tap "➕ Tambah gerakan".</div>`}
      </div>
    </div>

    <div class="card">
      <h3>⏱️ Durasi, Kalori & Catatan</h3>
      <div class="grid2">
        <label class="field"><span>Durasi (menit) — target ≥30</span>
          <input type="number" id="gDurasi" value="${w.durasi || ""}" placeholder="0" oninput="hitungBurn()"></label>
        <label class="field"><span>Kalori terbakar (kkal)</span>
          <input type="number" id="gKalori" value="${w.kaloriTerbakar || ""}" placeholder="otomatis" oninput="hitungBurn()"></label>
      </div>
      <button class="btn xs sec" onclick="isiBurnOtomatis()">↺ Hitung kalori otomatis dari durasi</button>
      <div id="burnInfo" class="small muted mt mb"></div>
      <label class="field"><span>Catatan (opsional)</span>
        <textarea id="gCatatan" placeholder="Beban, set, perasaan, dll">${esc(w.catatan || "")}</textarea></label>
      <button class="btn full green" onclick="simpanWorkout()">Simpan Latihan</button>
      <div class="small muted center mt">💡 Kalori terbakar otomatis masuk ke perhitungan berat badan mingguan.</div>
    </div>
  `;
  hitungBurn();
}
function renderExercisePicker() {
  return `<div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:8px">
    <input id="pickQ" placeholder="🔍 Cari gerakan (mis. squat, dada...)" value="${esc(gymPicker.q)}" oninput="gymPicker.q=this.value;refreshPicker()">
    <div id="pickBody" class="mt">${pickerBodyHTML()}</div>
  </div>`;
}
function pickerBodyHTML() {
  let list = EXERCISES.slice();
  if (gymPicker.grup) list = list.filter(e => e.grup === gymPicker.grup);
  if (gymPicker.q) { const q = gymPicker.q.toLowerCase(); list = list.filter(e => e.n.toLowerCase().includes(q) || e.grup.toLowerCase().includes(q)); }
  return `<div class="row wrap mb">
      <button class="lvl-chip ${gymPicker.grup === "" ? "on" : ""}" onclick="gymPicker.grup='';refreshPicker()">Semua</button>
      ${EX_GRUP.map(g => `<button class="lvl-chip ${gymPicker.grup === g ? "on" : ""}" onclick="gymPicker.grup='${g}';refreshPicker()">${g}</button>`).join("")}
    </div>
    <div style="max-height:300px;overflow-y:auto">
    ${list.map(e => `<div class="litem">
      <div class="grow"><b>${esc(e.n)}</b> <span class="tag">${e.grup}</span>
        <div><small>${esc(e.alat)} · ${esc(e.set)}</small></div>
        <div><small class="muted">💡 ${esc(e.tip)}</small></div></div>
      <div class="row">
        <button class="btn xs ghost" title="Video tutorial" onclick="bukaVideo('${esc(e.n)}')">▶️</button>
        <button class="btn xs" onclick="tambahGerakan('${e.id}')">➕</button>
      </div>
    </div>`).join("") || `<div class="empty">Tidak ada gerakan cocok.</div>`}
    </div>`;
}
function refreshPicker() { const b = document.getElementById("pickBody"); if (b) b.innerHTML = pickerBodyHTML(); }
function togglePicker() { gymPicker.open = !gymPicker.open; renderGymToday(); }
function muatProgram(key) {
  if (!key) return;
  const tk = todayKey(), hari = new Date().getDay();
  const w = ensureWorkout(tk, hari);
  w.programKey = key;
  w.list = ((PROGRAM_LIB[key] && PROGRAM_LIB[key].exercises) || []).map(e => ({ n: e.n, d: e.d }));
  w.done = w.done.filter(n => w.list.some(x => x.n === n));
  save(); renderGymToday();
  if (currentView === "home") renderHome();
  toast("Gerakan dimuat dari " + PROGRAM_LIB[key].nama);
}
function tambahGerakan(id) {
  const e = EXERCISES.find(x => x.id === id); if (!e) return;
  const tk = todayKey(), hari = new Date().getDay();
  const w = ensureWorkout(tk, hari);
  if (!w.list) w.list = dayList(w, w.programKey || SCHEDULE[hari]).slice();
  if (w.list.some(x => x.n === e.n)) { toast(e.n + " sudah ada"); return; }
  w.list.push({ n: e.n, d: e.set, id: e.id });
  save(); renderGymToday(); toast("➕ " + e.n);
}
function hapusGerakan(idx) {
  const tk = todayKey(), hari = new Date().getDay();
  const w = ensureWorkout(tk, hari);
  if (!w.list) w.list = dayList(w, w.programKey || SCHEDULE[hari]).slice();
  const removed = w.list.splice(idx, 1)[0];
  if (removed) w.done = w.done.filter(n => n !== removed.n);
  save(); renderGymToday();
}
function bukaVideo(name) {
  const q = encodeURIComponent(name + " tutorial cara yang benar");
  window.open("https://www.youtube.com/results?search_query=" + q, "_blank");
}
function toggleEx(name) {
  const tk = todayKey(), hari = new Date().getDay();
  const w = DB.workouts[tk] || { done: [], durasi: 0, catatan: "", programKey: SCHEDULE[hari] };
  const i = w.done.indexOf(name);
  if (i >= 0) w.done.splice(i, 1); else w.done.push(name);
  DB.workouts[tk] = w; save();
}
function hitungBurn() {
  const tk = todayKey(), hari = new Date().getDay(), key = progKeyFor(tk, hari);
  const durasi = +(document.getElementById("gDurasi")?.value || 0);
  const est = estimasiBurn(key, durasi);
  const kalField = document.getElementById("gKalori");
  const manual = kalField ? +(kalField.value || 0) : 0;
  if (kalField && !kalField.value) kalField.placeholder = est ? est + " (otomatis)" : "otomatis";
  const shown = manual || est;
  const info = document.getElementById("burnInfo");
  if (info) info.innerHTML = (durasi || manual)
    ? `🔥 <b style="color:var(--accent)">${shown} kkal</b> ${manual ? "(manual)" : "(estimasi)"}${durasi ? " · " + (durasi >= 30 ? "✓ target 30 mnt tercapai" : "kurang " + (30 - durasi) + " mnt lagi") : ""}`
    : "";
  return shown;
}
function isiBurnOtomatis() {
  const tk = todayKey(), hari = new Date().getDay(), key = progKeyFor(tk, hari);
  const durasi = +(document.getElementById("gDurasi")?.value || 0);
  if (!durasi) { toast("Isi durasi dulu"); return; }
  document.getElementById("gKalori").value = estimasiBurn(key, durasi);
  hitungBurn();
}
function simpanWorkout() {
  const tk = todayKey(), hari = new Date().getDay();
  const w = DB.workouts[tk] || { done: [] };
  if (!w.programKey) w.programKey = SCHEDULE[hari];
  w.durasi = +(document.getElementById("gDurasi").value || 0);
  const manual = +(document.getElementById("gKalori").value || 0);
  w.kaloriTerbakar = manual || estimasiBurn(w.programKey, w.durasi);
  w.catatan = document.getElementById("gCatatan").value;
  DB.workouts[tk] = w; save();
  toast(w.durasi >= 30 ? "💪 Mantap, target tercapai!" : "Tersimpan ✓");
  renderGymToday();
  updateReminder();
}

function renderProgram() {
  const area = document.getElementById("programArea");
  const order = [1, 2, 3, 4, 5, 6, 0];
  const today = new Date().getDay();
  area.innerHTML = `<div class="card tight"><div class="small muted">📅 Ini jadwal <b>saran</b> mingguan. Mau variasi? Ganti program harian kapan saja di tab <b>Hari Ini</b> → "Pilih Program".</div></div>` + order.map(d => {
    const p = PROGRAM[d];
    return `<div class="card ${d === today ? "" : ""}" ${d === today ? 'style="border-color:var(--accent)"' : ""}>
      <div class="row spread">
        <h3 style="margin:0">${p.emoji} ${NAMA_HARI[d]} — ${p.nama}</h3>
        ${d === today ? '<span class="pill-done">Hari ini</span>' : ""}
      </div>
      <div class="small muted mb">${p.fokus}${p.cardio ? " · 🏃 " + p.cardio.jenis + " " + p.cardio.durasi + "mnt" : ""}</div>
      ${p.exercises.map(ex => `<div class="row spread small" style="padding:3px 0"><span>• ${ex.n}</span><span class="muted">${ex.d}</span></div>`).join("")}
    </div>`;
  }).join("");
}

function renderGymRiwayat() {
  const area = document.getElementById("gymRiwayatArea");
  const keys = Object.keys(DB.workouts).filter(k => (DB.workouts[k].durasi || DB.workouts[k].done.length)).sort().reverse();
  const minggu = ringkasanMinggu(mondayOf(new Date()));
  // hitung berapa hari minggu ini latihan >=30 mnt
  const hari30 = weekDates(mondayOf(new Date())).filter(dk => (DB.workouts[dk]?.durasi || 0) >= 30).length;
  area.innerHTML = `
    <div class="stat-grid mb">
      <div class="card"><div class="muted small">Menit minggu ini</div><div class="stat-big" style="font-size:24px">${minggu.totalDurasi}</div></div>
      <div class="card"><div class="muted small">Hari ≥30 mnt</div><div class="stat-big" style="font-size:24px">${hari30}<span class="stat-unit">/7</span></div></div>
      <div class="card"><div class="muted small">Total sesi</div><div class="stat-big" style="font-size:24px">${keys.length}</div></div>
    </div>
    ${keys.length ? keys.map(k => {
      const w = DB.workouts[k], d = parseKey(k);
      const pnama = (PROGRAM_LIB[w.programKey || SCHEDULE[d.getDay()]] || {}).nama || "Latihan";
      return `<div class="litem">
        <div class="grow"><b>${NAMA_HARI[d.getDay()]}, ${fmtTgl(k)}</b><div><small>${pnama} · ${w.done.length} gerakan${w.catatan ? " · " + esc(w.catatan) : ""}</small></div></div>
        <div class="center"><b style="color:${w.durasi >= 30 ? "var(--green)" : "var(--accent)"}">${w.durasi || 0}'</b><div><small>${w.kaloriTerbakar || 0} kkal</small></div></div>
      </div>`;
    }).join("") : `<div class="empty">Belum ada riwayat latihan.</div>`}
  `;
}

/* ============================================================
   NUTRISI & BERAT
   ============================================================ */
let kaloriTgl = todayKey();
function renderNutrisi() {
  if (document.querySelector("#sub-kalori").classList.contains("active")) renderKalori();
  if (document.querySelector("#sub-berat").classList.contains("active")) renderBerat();
}

function renderKalori() {
  const area = document.getElementById("kaloriArea");
  const meals = DB.meals[kaloriTgl] || [];
  const total = kaloriMakan(kaloriTgl);
  const tgt = targetKalori();
  const burn = kaloriOlahraga(kaloriTgl);
  const net = total - burn;
  const sisa = tgt - total;
  area.innerHTML = `
    <div class="card">
      <label class="field"><span>Tanggal</span>
        <input type="date" value="${kaloriTgl}" max="${todayKey()}" onchange="kaloriTgl=this.value;renderKalori()"></label>
      <div class="stat-grid">
        <div><div class="muted small">Masuk</div><div class="stat-big" style="font-size:22px">${total}</div></div>
        <div><div class="muted small">Olahraga</div><div class="stat-big" style="font-size:22px;color:var(--accent)">-${burn}</div></div>
        <div><div class="muted small">Target</div><div class="stat-big" style="font-size:22px">${tgt}</div></div>
      </div>
      <div class="pbar mt"><div style="width:${Math.min(100, total / tgt * 100)}%;background:${total > tgt ? "var(--rose)" : "linear-gradient(90deg,var(--green),var(--accent))"}"></div></div>
      <div class="small ${sisa < 0 ? "up" : "down"} mt center">${sisa >= 0 ? "Sisa " + sisa + " kkal — bagus, tetap defisit 👍" : "Lebih " + (-sisa) + " kkal dari target ⚠️"}</div>
    </div>

    <div class="card">
      <h3>🍽️ Tambah Makanan</h3>
      <input id="fNama" list="foodlist" placeholder="Nama makanan (ketik / pilih)">
      <datalist id="foodlist">${FOOD_REF.map(f => `<option value="${esc(f.n)}" data-k="${f.k}">`).join("")}</datalist>
      <div class="row mt">
        <input type="number" id="fKal" placeholder="kalori" style="flex:1">
        <button class="btn" onclick="tambahMakan()">Tambah</button>
      </div>
      <div class="small muted mt">💡 Pilih dari daftar untuk auto-isi kalori, atau isi manual.</div>
    </div>

    ${meals.length ? `<div class="card"><h3>Daftar (${fmtTgl(kaloriTgl)})</h3>${meals.map(m => `
      <div class="litem"><div class="grow"><b>${esc(m.nama)}</b></div><div class="row"><b>${m.kalori} kkal</b><button class="btn xs ghost" onclick="hapusMakan('${m.id}')">🗑</button></div></div>
    `).join("")}<div class="row spread mt"><b>Total</b><b style="color:var(--accent)">${total} kkal</b></div></div>` : `<div class="empty">Belum ada makanan dicatat untuk tanggal ini.</div>`}
  `;
  // auto isi kalori dari datalist
  const nama = document.getElementById("fNama");
  nama.addEventListener("change", () => {
    const f = FOOD_REF.find(x => x.n === nama.value);
    if (f) document.getElementById("fKal").value = f.k;
  });
}
function tambahMakan() {
  const nama = document.getElementById("fNama").value.trim();
  const kal = +document.getElementById("fKal").value;
  if (!nama || !kal) { toast("Isi nama & kalori"); return; }
  if (!DB.meals[kaloriTgl]) DB.meals[kaloriTgl] = [];
  DB.meals[kaloriTgl].push({ id: "f" + Date.now(), nama, kalori: kal });
  save(); renderKalori();
}
function hapusMakan(id) {
  DB.meals[kaloriTgl] = (DB.meals[kaloriTgl] || []).filter(m => m.id !== id);
  save(); renderKalori();
}

/* ---------- BERAT BADAN ---------- */
function renderBerat() {
  const area = document.getElementById("beratArea");
  const berat = beratSekarang();
  const t = tdee(berat);
  const p = DB.profile;
  const pinggangTerakhir = [...DB.weightLog].reverse().find(w => w.pinggang)?.pinggang;
  const whtr = pinggangTerakhir ? (pinggangTerakhir / p.tinggi) : null;

  // tabel mingguan: kumpulkan minggu yang ada data
  const mingguKeys = new Set();
  Object.keys(DB.meals).forEach(k => mingguKeys.add(dateKey(mondayOf(parseKey(k)))));
  Object.keys(DB.workouts).forEach(k => mingguKeys.add(dateKey(mondayOf(parseKey(k)))));
  DB.weightLog.forEach(w => mingguKeys.add(dateKey(mondayOf(parseKey(w.tgl)))));
  mingguKeys.add(dateKey(mondayOf(new Date())));
  const minggus = [...mingguKeys].sort().reverse().map(mk => ringkasanMinggu(parseKey(mk)));

  area.innerHTML = `
    <div class="card">
      <h3>⚖️ Catat Timbangan</h3>
      <div class="grid2">
        <label class="field"><span>Berat aktual (kg)</span><input type="number" step="0.1" id="bBerat" placeholder="${berat}"></label>
        <label class="field"><span>Lingkar pinggang (cm)</span><input type="number" step="0.1" id="bPinggang" placeholder="${pinggangTerakhir || ""}"></label>
      </div>
      <label class="field"><span>Tanggal</span><input type="date" id="bTgl" value="${todayKey()}" max="${todayKey()}"></label>
      <button class="btn full green" onclick="catatBerat()">Simpan Timbangan</button>
      <div class="small muted mt center">📅 Idealnya timbang tiap hari Minggu setelah olahraga seminggu.</div>
    </div>

    <div class="card">
      <h3>📊 Metabolisme Kamu</h3>
      <div class="stat-grid">
        <div><div class="muted small">BMR</div><div class="stat-big" style="font-size:20px">${Math.round(bmr(berat))}</div></div>
        <div><div class="muted small">TDEE</div><div class="stat-big" style="font-size:20px">${t}</div></div>
        <div><div class="muted small">Target makan</div><div class="stat-big" style="font-size:20px">${targetKalori()}</div></div>
      </div>
      <div class="small muted mt">TDEE = kalori harian untuk berat stabil. Makan di bawahnya → berat turun.</div>
    </div>

    <div class="card">
      <h3>🎯 Kecilkan Perut (Lingkar Pinggang)</h3>
      ${pinggangTerakhir ? `
        <div class="row spread"><span>Pinggang terakhir</span><b>${pinggangTerakhir} cm</b></div>
        <div class="row spread"><span>Target</span><b>${p.targetPinggang} cm</b></div>
        <div class="row spread"><span>Rasio pinggang/tinggi</span><b class="${whtr > 0.5 ? "up" : "down"}">${whtr.toFixed(2)} ${whtr > 0.5 ? "(perlu turun)" : "(sehat)"}</b></div>
        <div class="small muted mt">Rasio sehat &lt; 0.5. Lemak perut turun paling efektif dgn defisit kalori + kardio rutin (lari) — pertahankan!</div>
      ` : `<div class="small muted">Catat lingkar pinggang di atas untuk memantau pengecilan perut. Target kamu: ${p.targetPinggang} cm.</div>`}
    </div>

    ${sparkline()}

    <div class="card">
      <h3>📈 Perbandingan Mingguan</h3>
      <div class="small muted mb">Estimasi dihitung dari defisit kalori (otomatis update tiap Minggu). Bandingkan dengan timbangan aktual.</div>
      <table>
        <tr><th>Minggu</th><th class="num">Awal</th><th class="num">Estimasi</th><th class="num">Aktual</th><th class="num">Selisih</th></tr>
        ${minggus.map(m => {
          const selisih = (m.aktual != null) ? +(m.aktual - m.estimasi).toFixed(1) : null;
          return `<tr>
            <td>${fmtTgl(dateKey(m.dates[0] ? parseKey(m.dates[0]) : new Date()))}</td>
            <td class="num">${m.beratAwal}</td>
            <td class="num" style="color:var(--accent)">${m.estimasi}</td>
            <td class="num">${m.aktual ?? "–"}</td>
            <td class="num ${selisih == null ? "" : selisih > 0 ? "up" : "down"}">${selisih == null ? "–" : (selisih > 0 ? "+" : "") + selisih}</td>
          </tr>`;
        }).join("")}
      </table>
      <div class="small muted mt">Selisih + = aktual lebih berat dari estimasi (mungkin kurang defisit / retensi air). − = lebih ringan dari perkiraan 🎉</div>
    </div>
  `;
}
function catatBerat() {
  const berat = +document.getElementById("bBerat").value;
  const pinggang = +document.getElementById("bPinggang").value || null;
  const tgl = document.getElementById("bTgl").value;
  if (!berat) { toast("Isi berat badan"); return; }
  DB.weightLog = DB.weightLog.filter(w => w.tgl !== tgl); // 1 entri per tanggal
  DB.weightLog.push({ tgl, berat, pinggang });
  DB.weightLog.sort((a, b) => a.tgl.localeCompare(b.tgl));
  save(); toast("Timbangan tersimpan ⚖️"); renderBerat();
}
function sparkline() {
  const log = DB.weightLog.filter(w => w.berat);
  if (log.length < 2) return "";
  const vals = log.map(w => w.berat);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const W = 300, H = 70, pad = 6;
  const pts = vals.map((v, i) => {
    const x = pad + i / (vals.length - 1) * (W - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (H - 2 * pad);
    return [x, y];
  });
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return `<div class="card"><h3>📉 Tren Berat (${vals.length} data)</h3>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:80px">
      <path d="${path}" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#f59e0b"/>`).join("")}
    </svg>
    <div class="row spread small muted"><span>${min} kg</span><span>${vals[0]} → ${vals[vals.length - 1]} kg</span><span>${max} kg</span></div>
  </div>`;
}

/* ============================================================
   GERBANG LOGIN (AUTH GATE) — login dulu sebelum pakai
   ============================================================ */
function hasSession() {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /sb-.*-auth-token/.test(k)) {
      const v = localStorage.getItem(k);
      if (v && v !== "null" && v !== "[]") return true;
    }
  }
  return false;
}
let gateMode = "login";      // login | register
let inOnboarding = false;    // sedang isi profil setelah daftar
let lastRegEmail = "";
function updateGate() {
  const g = document.getElementById("authGate");
  if (inOnboarding) {        // tahan di onboarding walau sudah signed-in
    document.body.classList.add("locked");
    if (g) { g.style.display = "flex"; renderAuthGate(); }
    return;
  }
  const signedIn = (typeof SYNC !== "undefined" && SYNC.status === "signedin");
  if (signedIn || hasSession() || localStorage.getItem("gm_skipAuth") === "1") {
    document.body.classList.remove("locked");
    if (g) g.style.display = "none";
  } else {
    document.body.classList.add("locked");
    if (g) { g.style.display = "flex"; renderAuthGate(); }
  }
}
function renderAuthGate() {
  const g = document.getElementById("authGate"); if (!g) return;
  if (inOnboarding) { renderOnboarding(g); return; }
  const isReg = gateMode === "register";
  g.innerHTML = `<div class="auth-card">
    <div class="auth-logo">中</div>
    <h1>GymMandarin</h1>
    <div class="sub">${isReg ? "Buat akun — lalu isi profil singkat" : "Masuk untuk lanjut belajar & tracking"}</div>
    <div class="auth-box">
      <label>Email</label>
      <input id="gateEmail" type="email" placeholder="kamu@email.com" autocomplete="email">
      <label>Password</label>
      <input id="gatePass" type="password" placeholder="minimal 6 karakter" autocomplete="${isReg ? "new-password" : "current-password"}"
        onkeydown="if(event.key==='Enter'){${isReg ? "gateRegister()" : "gateLogin()"}}">
      <div id="gateMsg" class="auth-msg"></div>
      <button class="btn full" onclick="${isReg ? "gateRegister()" : "gateLogin()"}">${isReg ? "Lanjut — isi profil" : "Masuk"}</button>
      <div class="auth-toggle">${isReg
        ? `Sudah punya akun? <a onclick="gateSwitch('login')">Masuk</a>`
        : `Belum punya akun? <a onclick="gateSwitch('register')">Daftar</a>`}</div>
    </div>
    <span class="auth-skip" onclick="gateSkip()">Lewati dulu — pakai tanpa akun (data lokal saja)</span>
    <div class="auth-foot">🔒 Datamu tersimpan aman & hanya bisa diakses olehmu.</div>
  </div>`;
}
function renderOnboarding(g) {
  const p = DB.profile;
  g.innerHTML = `<div class="auth-card">
    <div class="auth-logo">中</div>
    <h1>Lengkapi Profilmu</h1>
    <div class="sub">Biar target kalori & fokusmu pas. Diisi dulu sebelum mulai 🙌</div>
    <div class="auth-box" style="text-align:left">
      <label>Nama panggilan</label>
      <input id="obNama" placeholder="Nama kamu" value="${esc(p.nama || "")}">
      <div class="grid2">
        <div><label>Jenis kelamin</label>
          <select id="obGender"><option value="pria" ${p.gender === "pria" ? "selected" : ""}>Pria</option><option value="wanita" ${p.gender === "wanita" ? "selected" : ""}>Wanita</option></select></div>
        <div><label>Umur</label><input id="obUmur" type="number" value="${p.umur || ""}" placeholder="25"></div>
      </div>
      <div class="grid2">
        <div><label>Tinggi (cm) *</label><input id="obTinggi" type="number" value="${p.tinggi || ""}" placeholder="170"></div>
        <div><label>Berat sekarang (kg) *</label><input id="obBerat" type="number" step="0.1" value="${p.beratAwal || ""}" placeholder="76"></div>
      </div>
      <div class="grid2">
        <div><label>Target berat (kg)</label><input id="obTBerat" type="number" step="0.1" value="${p.targetBerat || ""}" placeholder="68"></div>
        <div><label>Target pinggang (cm)</label><input id="obTPinggang" type="number" value="${p.targetPinggang || ""}" placeholder="85"></div>
      </div>
      <label>Tingkat aktivitas harian</label>
      <select id="obAkt">
        <option value="1.2" ${p.aktivitas == 1.2 ? "selected" : ""}>Jarang gerak (kerja duduk)</option>
        <option value="1.375" ${p.aktivitas == 1.375 ? "selected" : ""}>Ringan (sedikit aktif)</option>
        <option value="1.55" ${p.aktivitas == 1.55 ? "selected" : ""}>Sedang (aktif)</option>
        <option value="1.725" ${p.aktivitas == 1.725 ? "selected" : ""}>Berat (sangat aktif)</option>
      </select>
      <label>Fokus utama 🎯</label>
      <select id="obFokus">${Object.keys(FOKUS_LIST).map(k => `<option value="${k}" ${p.fokus === k ? "selected" : ""}>${FOKUS_LIST[k].emoji} ${FOKUS_LIST[k].label}</option>`).join("")}</select>
      <div id="gateMsg" class="auth-msg mt"></div>
      <button class="btn full green" onclick="gateFinishOnboarding()">Simpan & Lanjut ke Login →</button>
    </div>
    <div class="auth-foot">Semua bisa diubah lagi nanti di ⚙️ Atur.</div>
  </div>`;
}
function gateSwitch(m) { gateMode = m; renderAuthGate(); }
function gateMsg(t, ok) { const m = document.getElementById("gateMsg"); if (m) { m.textContent = t; m.className = "auth-msg " + (ok ? "ok" : "err"); } }
async function gateLogin() {
  const e = (document.getElementById("gateEmail").value || "").trim(), p = document.getElementById("gatePass").value || "";
  if (!e || !p) { gateMsg("Isi email & password."); return; }
  gateMsg("Masuk…", true);
  if (window.syncSignIn) await window.syncSignIn(e, p);
  if (typeof SYNC !== "undefined" && SYNC.status === "signedin") { localStorage.removeItem("gm_skipAuth"); updateGate(); }
  else gateMsg((typeof SYNC !== "undefined" && SYNC.msg) || "Email atau password salah.");
}
async function gateRegister() {
  const e = (document.getElementById("gateEmail").value || "").trim(), p = document.getElementById("gatePass").value || "";
  if (!e || !p) { gateMsg("Isi email & password."); return; }
  if (p.length < 6) { gateMsg("Password minimal 6 karakter."); return; }
  gateMsg("Membuat akun…", true);
  inOnboarding = true; lastRegEmail = e;            // ke onboarding, jangan masuk app dulu
  if (window.syncSignUp) await window.syncSignUp(e, p);
  if (typeof SYNC !== "undefined" && SYNC.status === "signedin") {
    renderAuthGate();                                // tampilkan form profil
  } else {
    inOnboarding = false; renderAuthGate();
    gateMsg((typeof SYNC !== "undefined" && SYNC.msg) || "Gagal daftar. Coba email lain.");
  }
}
async function gateFinishOnboarding() {
  const v = (id) => document.getElementById(id);
  const tinggi = +v("obTinggi").value, berat = +v("obBerat").value;
  if (!tinggi || !berat) { gateMsg("Isi tinggi & berat badan dulu."); return; }
  DB.profile = Object.assign({}, DB.profile, {
    nama: (v("obNama").value || "").trim(),
    gender: v("obGender").value,
    umur: +v("obUmur").value || 25,
    tinggi, beratAwal: berat,
    targetBerat: +v("obTBerat").value || Math.max(40, Math.round(berat - 6)),
    targetPinggang: +v("obTPinggang").value || 85,
    aktivitas: +v("obAkt").value || 1.375,
    fokus: v("obFokus").value,
  });
  DB.onboarded = true;
  save();
  gateMsg("Menyimpan & menyinkronkan…", true);
  if (window.syncPushNow) await window.syncPushNow(DB);   // data langsung ke cloud
  inOnboarding = false;
  gateMode = "login";
  if (window.syncSignOut) await window.syncSignOut();      // arahkan ke halaman login
  renderAuthGate();
  const em = document.getElementById("gateEmail"); if (em && lastRegEmail) em.value = lastRegEmail;
  gateMsg("Profil tersimpan & tersinkron! Silakan masuk ✅", true);
}
function gateSkip() { localStorage.setItem("gm_skipAuth", "1"); inOnboarding = false; updateGate(); toast("Mode lokal — data hanya di perangkat ini"); }
function showGate() { localStorage.removeItem("gm_skipAuth"); gateMode = "login"; inOnboarding = false; updateGate(); }
function gateLogout() {
  localStorage.removeItem("gm_skipAuth");
  if (window.syncSignOut) window.syncSignOut();
  gateMode = "login"; inOnboarding = false; updateGate();
}

/* ============================================================
   PENGATURAN
   ============================================================ */
function renderSyncCard() {
  if (typeof SYNC === "undefined") return "";
  let inner;
  if (SYNC.status === "signedin") {
    inner = `<div class="small down mb">✅ Login sebagai <b>${esc((SYNC.user && SYNC.user.email) || "")}</b> — data tersinkron lintas perangkat.</div>
      <div class="grid2">
        <button class="btn green" onclick="doSyncManual()">☁️ Sinkron sekarang</button>
        <button class="btn sec" onclick="gateLogout()">Logout</button>
      </div>`;
  } else {
    inner = `<div class="small muted mb">Kamu pakai <b>mode lokal</b> — data hanya di perangkat ini. Login untuk simpan & sinkron ke HP/laptop lain.</div>
      <button class="btn full" onclick="showGate()">Login / Daftar</button>`;
  }
  return `<div class="card"><h3>☁️ Cloud Sync</h3>${inner}</div>`;
}
function doSyncManual() { if (typeof syncPushNow === "function") { syncPushNow(DB); toast("Menyinkronkan..."); } }

function renderSetting() {
  const p = DB.profile;
  const area = document.getElementById("settingArea");
  area.innerHTML = `
    <div class="card">
      <h3>👤 Profil & Target</h3>
      <label class="field"><span>Nama panggilan</span><input id="pNama" value="${esc(p.nama)}" placeholder="Nama kamu"></label>
      <div class="grid2">
        <label class="field"><span>Jenis kelamin</span>
          <select id="pGender"><option value="pria" ${p.gender === "pria" ? "selected" : ""}>Pria</option><option value="wanita" ${p.gender === "wanita" ? "selected" : ""}>Wanita</option></select></label>
        <label class="field"><span>Umur</span><input type="number" id="pUmur" value="${p.umur}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Tinggi (cm)</span><input type="number" id="pTinggi" value="${p.tinggi}"></label>
        <label class="field"><span>Berat awal (kg)</span><input type="number" step="0.1" id="pBerat" value="${p.beratAwal}"></label>
      </div>
      <label class="field"><span>Tingkat aktivitas harian</span>
        <select id="pAkt">
          <option value="1.2" ${p.aktivitas == 1.2 ? "selected" : ""}>Jarang gerak (kerja duduk)</option>
          <option value="1.375" ${p.aktivitas == 1.375 ? "selected" : ""}>Ringan (sedikit aktif)</option>
          <option value="1.55" ${p.aktivitas == 1.55 ? "selected" : ""}>Sedang (aktif)</option>
          <option value="1.725" ${p.aktivitas == 1.725 ? "selected" : ""}>Berat (sangat aktif)</option>
        </select></label>
      <div class="grid2">
        <label class="field"><span>Target berat (kg)</span><input type="number" step="0.1" id="pTBerat" value="${p.targetBerat}"></label>
        <label class="field"><span>Target pinggang (cm)</span><input type="number" id="pTPinggang" value="${p.targetPinggang}"></label>
      </div>
      <label class="field"><span>Target kalori/hari (0 = otomatis defisit 500)</span><input type="number" id="pTKal" value="${p.targetKalori}"></label>
      <label class="field"><span>Fokus utama 🎯 (mengatur saran di Beranda)</span>
        <select id="pFokus">${Object.keys(FOKUS_LIST).map(k => `<option value="${k}" ${(p.fokus || "kecilkan_perut") === k ? "selected" : ""}>${FOKUS_LIST[k].emoji} ${FOKUS_LIST[k].label}</option>`).join("")}</select></label>
      <button class="btn full green" onclick="simpanProfil()">Simpan Profil</button>
    </div>

    ${typeof renderSyncCard === "function" ? renderSyncCard() : ""}

    <div class="card">
      <h3>🔔 Pengingat</h3>
      <div class="small muted mb">Aktifkan notifikasi pengingat belajar Mandarin & olahraga (saat aplikasi terbuka).</div>
      <button class="btn full ${DB.notif ? "sec" : ""}" onclick="aktifkanNotif()">${DB.notif ? "✓ Notifikasi aktif" : "Aktifkan Notifikasi"}</button>
    </div>

    <div class="card">
      <h3>💾 Backup Data</h3>
      <div class="small muted mb">Data tersimpan di perangkat ini saja. Export untuk pindah ke HP/laptop lain.</div>
      <div class="grid2">
        <button class="btn blue" onclick="exportData()">⬇️ Export</button>
        <button class="btn sec" onclick="document.getElementById('importFile').click()">⬆️ Import</button>
      </div>
      <input type="file" id="importFile" accept="application/json" class="hidden" onchange="importData(this)">
    </div>

    <div class="card">
      <h3>📲 Cara Install</h3>
      <div class="small muted">
        <b>Laptop (Chrome/Edge):</b> klik ikon install di address bar, atau menu ⋮ → "Install GymMandarin".<br><br>
        <b>HP Android:</b> buka di Chrome → menu ⋮ → "Tambahkan ke layar utama".<br><br>
        <b>iPhone:</b> buka di Safari → Share → "Add to Home Screen".
      </div>
    </div>

    <div class="card">
      <button class="btn full ghost" style="color:var(--rose)" onclick="if(confirm('Hapus SEMUA data? Tidak bisa dikembalikan.')){localStorage.removeItem('gm_data');location.reload()}">🗑 Reset Semua Data</button>
    </div>
    <div class="center small muted mb">GymMandarin · dibuat untuk dirimu sendiri 加油!</div>
  `;
}
function simpanProfil() {
  const g = id => document.getElementById(id).value;
  DB.profile = {
    nama: g("pNama"), gender: g("pGender"), umur: +g("pUmur"), tinggi: +g("pTinggi"),
    beratAwal: +g("pBerat"), aktivitas: +g("pAkt"), targetKalori: +g("pTKal"),
    targetBerat: +g("pTBerat"), targetPinggang: +g("pTPinggang"), fokus: g("pFokus"),
  };
  save(); toast("Profil tersimpan ✓"); if (currentView === "home") renderHome();
}
function aktifkanNotif() {
  if (!("Notification" in window)) { toast("Browser tidak mendukung notifikasi"); return; }
  Notification.requestPermission().then(perm => {
    if (perm === "granted") { DB.notif = true; save(); new Notification("GymMandarin", { body: "Pengingat aktif! 加油 💪", icon: "icons/icon-192.png" }); renderSetting(); }
    else toast("Izin notifikasi ditolak");
  });
}
function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gymmandarin-backup-" + todayKey() + ".json";
  a.click(); toast("Data di-export ⬇️");
}
function importData(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      DB = Object.assign(DEFAULT_DB(), JSON.parse(r.result)); save();
      toast("Data berhasil di-import ✓"); renderSetting(); updateReminder();
    } catch (e) { toast("File tidak valid"); }
  };
  r.readAsText(file);
}

/* ============================================================
   PENGINGAT / NOTIFIKASI
   ============================================================ */
function updateReminder() {
  const tk = todayKey();
  const mandarinDone = !!(DB.daily[tk] && DB.daily[tk].done);
  const durasi = (DB.workouts[tk] && DB.workouts[tk].durasi) || 0;
  const banner = document.getElementById("reminderBanner");
  const pesan = [];
  if (!mandarinDone) pesan.push("📚 Belum belajar 10 kosakata + kalimat hari ini");
  if (durasi < 30) pesan.push("🏋️ Olahraga belum 30 menit");
  if (pesan.length) { banner.className = "reminder-banner"; banner.textContent = pesan.join("  •  "); }
  else { banner.className = "reminder-banner green"; banner.textContent = "✅ Target hari ini selesai! Hebat, pertahankan 加油!"; }
  banner.classList.remove("hidden");
}
function cekNotif() {
  if (!DB.notif || !("Notification" in window) || Notification.permission !== "granted") return;
  const tk = todayKey();
  const mandarinDone = !!(DB.daily[tk] && DB.daily[tk].done);
  const durasi = (DB.workouts[tk] && DB.workouts[tk].durasi) || 0;
  const jam = new Date().getHours();
  const lastNotif = localStorage.getItem("gm_lastnotif");
  if (jam >= 18 && lastNotif !== tk && (!mandarinDone || durasi < 30)) {
    const t = [];
    if (!mandarinDone) t.push("belajar 10 kosakata");
    if (durasi < 30) t.push("olahraga 30 menit");
    new Notification("Pengingat GymMandarin 🔔", { body: "Hari ini belum: " + t.join(" & ") + ". Yuk selesaikan! 💪", icon: "icons/icon-192.png" });
    localStorage.setItem("gm_lastnotif", tk);
  }
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  updateGate(); // tentukan gerbang login (cek sesi tersimpan secara sinkron)
  const hari = new Date().getDay();
  document.getElementById("todayLabel").innerHTML = `${NAMA_HARI[hari]}<br>${PROGRAM[hari].emoji} ${PROGRAM[hari].nama}`;
  renderHome();
  cekNotif();
  setInterval(cekNotif, 60 * 60 * 1000); // cek tiap jam
  // service worker untuk offline
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
init();
