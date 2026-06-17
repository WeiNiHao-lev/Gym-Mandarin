# ☁️ Setup Cloud Sync (Supabase)

Ikuti ini sekali saja supaya data (latihan, berat, kalori, progres hafalan) **otomatis sinkron antara HP & laptop**.

## 1. Buat / buka project Supabase
1. Masuk ke https://supabase.com → **New project** (atau pakai yang sudah ada).
2. Beri nama (mis. `gymmandarin`), pilih region terdekat (Singapore), buat password DB (bebas), **Create**. Tunggu ~1 menit.

## 2. Buat tabel + keamanan (RLS)
1. Di sidebar kiri → **SQL Editor** → **New query**.
2. Tempel SQL di bawah → **Run**.

```sql
create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

create policy "own_select" on public.app_data
  for select using (auth.uid() = user_id);
create policy "own_insert" on public.app_data
  for insert with check (auth.uid() = user_id);
create policy "own_update" on public.app_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_delete" on public.app_data
  for delete using (auth.uid() = user_id);
```

## 3. Matikan konfirmasi email (biar daftar langsung jadi)
1. Sidebar → **Authentication** → **Sign In / Providers** (atau **Providers**) → **Email**.
2. **Matikan** opsi **"Confirm email"** → Save.
   *(Supaya daftar akun langsung aktif tanpa harus klik link di email.)*

## 4. Ambil kunci
1. Sidebar → **Project Settings** (ikon gear) → **API**.
2. Catat 2 hal:
   - **Project URL** → mis. `https://abcdxyz.supabase.co`
   - **anon public** key → string panjang diawali `eyJhbGci...`

> Kirim 2 nilai ini ke Claude untuk ditanam ke aplikasi, **atau** masukkan sendiri di aplikasi:
> **⚙️ Atur → Cloud Sync → tempel URL & anon key → Hubungkan**.

## 5. Login di aplikasi
- Di **⚙️ Atur → Cloud Sync**: isi email & password → **Daftar baru** (sekali) di satu perangkat.
- Di perangkat lain: isi email & password yang **sama** → **Masuk**.
- Selesai — data otomatis nyambung. Ada tombol **☁️ Sinkron sekarang** untuk paksa sinkron.

> Aman: `anon key` memang dirancang publik. Data kamu dilindungi **Row Level Security** — hanya bisa diakses akun kamu sendiri.
