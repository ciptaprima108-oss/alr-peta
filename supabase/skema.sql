-- Database ALR di Supabase.
-- Pasang: Supabase > SQL Editor > New query > tempel isi file ini > Run. Aman dijalankan ulang.
-- Tahap 1: aplikasi menyalin tiap laporan lapangan ke tabel "laporan" (cara lama lewat relay tetap jalan).

-- ---------- divisi ----------
create table if not exists public.divisi (
  kode  text primary key,
  nama  text not null,
  urut  int  not null default 99
);
insert into public.divisi (kode, nama, urut) values
  ('pimpinan',    'Pimpinan',                     1),
  ('rm',          'Road Maintenance',             2),
  ('logistik',    'Logistik & Gudang',            3),
  ('qc',          'Engineering / Surveyor / QC',  4),
  ('alat',        'Alat Berat & BBM',             5),
  ('hse',         'HSE / K3',                     6),
  ('traffic',     'Traffic, Patroli & Portal',    7),
  ('billing',     'Billing Hauler',               8),
  ('humas',       'Humas / Warga',                9),
  ('keuangan',    'Admin & Keuangan',            10),
  ('mitra',       'Mitra luar (CH GPE, WHL)',    11)
on conflict (kode) do update set nama = excluded.nama, urut = excluded.urut;

-- ---------- pengguna (ID card) ----------
create table if not exists public.pengguna (
  id         uuid primary key default gen_random_uuid(),
  kode_alr   text unique,                       -- contoh ALR-001
  nama       text not null,
  divisi     text references public.divisi(kode),
  jabatan    text,
  no_hp      text,
  akses      text not null default 'lihat' check (akses in ('lihat','lapor','kelola')),
  auth_id    uuid unique,                       -- diisi kalau orangnya sudah punya login Supabase
  aktif      boolean not null default true,
  dibuat     timestamptz not null default now()
);

-- ---------- laporan lapangan ----------
create table if not exists public.laporan (
  id          bigint generated always as identity primary key,
  rid         text unique,                      -- id unik dari HP, supaya tidak dobel saat kirim ulang
  jenis       text not null check (jenis in ('inspeksi','logistik','rm','hse','traffic','alat','humas','lainnya')),
  judul       text not null check (char_length(judul) <= 200),
  pelapor     text check (char_length(pelapor) <= 80),
  tim         text check (char_length(tim) <= 60),
  sta         numeric(6,2),
  lat         double precision,
  lon         double precision,
  status      text,
  trigger_no  int,                              -- nomor trigger jalan merah (tiket lama)
  tiket_no    int,                              -- nomor tiket di sistem lama, kalau ada
  sumber      text not null default 'aplikasi' check (sumber in ('aplikasi','qr','wa','admin')),
  waktu       timestamptz not null default now(),   -- waktu di lapangan
  data        jsonb not null default '{}'::jsonb,   -- isi form lengkap
  foto        jsonb not null default '[]'::jsonb,   -- daftar link foto
  dibuat      timestamptz not null default now(),
  constraint data_kecil check (pg_column_size(data) < 20000)
);
create index if not exists laporan_waktu_idx on public.laporan (waktu desc);
create index if not exists laporan_jenis_idx on public.laporan (jenis, waktu desc);

-- ---------- hak akses ----------
alter table public.divisi   enable row level security;
alter table public.pengguna enable row level security;
alter table public.laporan  enable row level security;

-- semua orang (termasuk tanpa login) boleh lihat daftar divisi dan laporan
drop policy if exists "divisi dibaca semua" on public.divisi;
create policy "divisi dibaca semua" on public.divisi for select using (true);
drop policy if exists "laporan dibaca semua" on public.laporan;
create policy "laporan dibaca semua" on public.laporan for select using (true);

-- siapa saja boleh MENAMBAH laporan (seperti sekarang, pelapor lapangan tidak perlu login),
-- tapi tidak bisa mengubah atau menghapus
drop policy if exists "laporan boleh ditambah" on public.laporan;
create policy "laporan boleh ditambah" on public.laporan for insert with check (
  waktu > now() - interval '7 days' and waktu < now() + interval '1 hour'
);

-- data pengguna (no HP dll) hanya untuk yang sudah login; ubah hanya oleh akses "kelola"
drop policy if exists "pengguna dibaca yang login" on public.pengguna;
create policy "pengguna dibaca yang login" on public.pengguna for select to authenticated using (true);
create or replace function public.boleh_kelola() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pengguna where auth_id = auth.uid() and akses = 'kelola' and aktif)
$$;
drop policy if exists "pengguna dikelola" on public.pengguna;
create policy "pengguna dikelola" on public.pengguna for all to authenticated using (public.boleh_kelola()) with check (public.boleh_kelola());
drop policy if exists "laporan diubah pengelola" on public.laporan;
create policy "laporan diubah pengelola" on public.laporan for update to authenticated using (public.boleh_kelola()) with check (public.boleh_kelola());

-- ---------- rekap harian (untuk laporan 06.00 / 18.00 dan bot grup nanti) ----------
create or replace view public.rekap_harian with (security_invoker = on) as
select (waktu at time zone 'Asia/Jakarta')::date as tanggal, jenis, count(*) as jumlah
from public.laporan group by 1, 2;

-- ---------- izin dasar (project Supabase baru tidak memberi izin otomatis) ----------
grant usage on schema public to anon, authenticated;
grant select on public.divisi to anon, authenticated;
grant select, insert on public.laporan to anon, authenticated;
grant update on public.laporan to authenticated;
grant select, insert, update, delete on public.pengguna to authenticated;
grant select on public.rekap_harian to anon, authenticated;
grant execute on function public.boleh_kelola() to authenticated;
