/* ============================================================
   CLOUD SYNC via Supabase (opsional)
   - Aplikasi tetap jalan penuh tanpa ini (offline / localStorage).
   - Saat aktif: data (gm_data) disinkron antar perangkat (HP & laptop).
   - Strategi: last-write-wins berdasarkan timestamp.
   ============================================================ */
const SYNC = {
  client: null, user: null, lib: null,
  url: "", key: "",
  status: "off", // off | signedout | signedin | error
  msg: "", _t: null,
};

async function syncLib() {
  if (SYNC.lib) return SYNC.lib;
  SYNC.lib = await import("https://esm.sh/@supabase/supabase-js@2");
  return SYNC.lib;
}

async function syncInit() {
  const cfg = (typeof window !== "undefined" && window.GM_SUPABASE) || {};
  SYNC.url = (cfg.url || "").trim() || localStorage.getItem("gm_sync_url") || "";
  SYNC.key = (cfg.key || "").trim() || localStorage.getItem("gm_sync_key") || "";
  if (!SYNC.url || !SYNC.key) { SYNC.status = "off"; syncRefreshUI(); return; }
  try {
    const { createClient } = await syncLib();
    SYNC.client = createClient(SYNC.url, SYNC.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await SYNC.client.auth.getSession();
    if (data && data.session) { SYNC.user = data.session.user; SYNC.status = "signedin"; await syncPull(); }
    else { SYNC.status = "signedout"; }
  } catch (e) { SYNC.status = "error"; SYNC.msg = (e && e.message) || String(e); }
  syncRefreshUI();
}

function syncConfigure(url, key) {
  SYNC.url = url.trim().replace(/\/+$/, "");
  SYNC.key = key.trim();
  localStorage.setItem("gm_sync_url", SYNC.url);
  localStorage.setItem("gm_sync_key", SYNC.key);
  SYNC.client = null; SYNC.user = null;
  syncInit();
}

function syncForget() {
  try { if (SYNC.client) SYNC.client.auth.signOut(); } catch (e) {}
  SYNC.url = ""; SYNC.key = ""; SYNC.client = null; SYNC.user = null; SYNC.status = "off"; SYNC.msg = "";
  localStorage.removeItem("gm_sync_url");
  localStorage.removeItem("gm_sync_key");
  syncRefreshUI();
}

async function syncSignUp(email, pw) {
  if (!SYNC.client) return;
  try {
    const { data, error } = await SYNC.client.auth.signUp({ email, password: pw });
    if (error) throw error;
    if (data.session) {
      SYNC.user = data.user; SYNC.status = "signedin"; await syncPull();
      _toast("Akun dibuat & tersinkron ☁️");
    } else {
      _toast('Akun dibuat. Matikan "Confirm email" di Supabase lalu Masuk.');
    }
    syncRefreshUI();
  } catch (e) { _toast("Daftar gagal: " + ((e && e.message) || e)); }
}

async function syncSignIn(email, pw) {
  if (!SYNC.client) return;
  try {
    const { data, error } = await SYNC.client.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
    SYNC.user = data.user; SYNC.status = "signedin";
    await syncPull();
    _toast("Login sukses, data tersinkron ☁️");
    syncRefreshUI();
  } catch (e) { _toast("Login gagal: " + ((e && e.message) || e)); }
}

async function syncSignOut() {
  try { if (SYNC.client) await SYNC.client.auth.signOut(); } catch (e) {}
  SYNC.user = null; SYNC.status = "signedout"; syncRefreshUI();
}

async function syncPull() {
  if (!SYNC.client || !SYNC.user) return;
  try {
    const { data, error } = await SYNC.client
      .from("app_data").select("data,updated_at").eq("user_id", SYNC.user.id).maybeSingle();
    if (error) { console.warn("pull:", error.message); return; }
    const localTs = +(localStorage.getItem("gm_ts") || 0);
    if (data && data.data) {
      const remoteTs = Date.parse(data.updated_at) || 0;
      if (remoteTs >= localTs && window.applySyncedData) {
        window.applySyncedData(data.data);
        localStorage.setItem("gm_ts", String(remoteTs));
      } else {
        await syncPushNow(window.getLocalData ? window.getLocalData() : null);
      }
    } else {
      // remote masih kosong -> unggah data lokal
      await syncPushNow(window.getLocalData ? window.getLocalData() : null);
    }
  } catch (e) { console.warn("pull err", e); }
}

function syncPush(localData) {
  if (SYNC.status !== "signedin") return;
  clearTimeout(SYNC._t);
  SYNC._t = setTimeout(() => syncPushNow(localData), 1500); // debounce
}

async function syncPushNow(localData) {
  if (!SYNC.client || !SYNC.user || !localData) return;
  try {
    const ts = new Date().toISOString();
    const { error } = await SYNC.client.from("app_data")
      .upsert({ user_id: SYNC.user.id, data: localData, updated_at: ts });
    if (error) { console.warn("push:", error.message); _toast("Gagal sinkron: " + error.message); return; }
    localStorage.setItem("gm_ts", String(Date.parse(ts)));
  } catch (e) { console.warn("push err", e); }
}

function syncRefreshUI() {
  if (typeof currentView !== "undefined" && currentView === "setting" && typeof renderSetting === "function") {
    try { renderSetting(); } catch (e) {}
  }
}

function _toast(m) { if (typeof toast === "function") toast(m); else console.log(m); }

// expose untuk app.js
window.syncPush = (d) => syncPush(d);

// inisialisasi setelah app.js siap
syncInit();
