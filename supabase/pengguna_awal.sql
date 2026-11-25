-- ALR: akun masuk (login) untuk 12 pengguna, No. ID 01001 - 01012.
-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang: akun yang sudah ada tidak dibuat dua kali).
--
-- Cara masuk di aplikasi: No. ID (5 angka) + PIN (6 angka).
-- PIN awal dibuat ACAK di dalam database. PIN TIDAK ditulis di file ini dan tidak ada di GitHub.
-- Untuk melihat PIN awal: Supabase > Table Editor > tabel "pin_awal" (hanya bisa dibuka pemilik project Supabase).
-- Bagikan PIN ke masing-masing orang secara pribadi, minta mereka ganti PIN di Profil > Ganti PIN,
-- lalu kosongkan tabelnya:  delete from public.pin_awal;

-- ---------- divisi baru ----------
insert into public.divisi (kode, nama, urut) values
  ('pjo',       'PJO',                          2),
  ('ch',        'CH (Inspeksi jalan)',          3),
  ('security',  'Security',                     12),
  ('developer', 'Developer aplikasi',           13)
on conflict (kode) do update set nama = excluded.nama, urut = excluded.urut;
update public.divisi set nama = 'Safety / HSE' where kode = 'hse';
update public.divisi set nama = 'Engineering / Surveyor / QC' where kode = 'qc';

-- ---------- tabel PIN awal (tertutup: tidak bisa dibaca dari aplikasi) ----------
create table if not exists public.pin_awal (
  kode_alr text primary key,
  nama     text not null,
  pin      text not null,
  dibuat   timestamptz not null default now()
);
alter table public.pin_awal enable row level security;   -- tanpa policy = tertutup untuk aplikasi
revoke all on public.pin_awal from anon, authenticated;

-- ---------- buat akun ----------
do $$
declare
  r record;
  uid uuid;
  pin text;
  surel text;
begin
  for r in select * from (values
    ('01001', 'Sutrisno W', 'pimpinan',  'Owner / Pimpinan'),
    ('01002', 'Bambang S',  'pimpinan',  'Owner / Pimpinan'),
    ('01003', 'Zaki D',     'pjo',       'PJO'),
    ('01004', 'Sunggu',     'ch',        'CH'),
    ('01005', 'Wicak',      'ch',        'CH'),
    ('01006', 'Jufri',      'rm',        'Road Maintenance'),
    ('01007', 'Robby',      'logistik',  'Logistik'),
    ('01008', 'Julian',     'hse',       'Safety'),
    ('01009', 'Doni',       'qc',        'Engineering'),
    ('01010', 'Muskarel',   'security',  'Security'),
    ('01011', 'Fanza',      'developer', 'Developer aplikasi'),
    ('01012', 'Reza',       'developer', 'Developer aplikasi')
  ) as t(kode, nama, divisi, jabatan)
  loop
    surel := r.kode || '@alr.example';               -- alamat buatan untuk login, tidak dipakai kirim email
    select id into uid from auth.users where email = surel;
    if uid is null then
      uid := gen_random_uuid();
      pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', surel,
        extensions.crypt(pin, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('kode_alr', r.kode, 'nama', r.nama), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', surel, 'email_verified', true), 'email', now(), now(), now());
      insert into public.pin_awal (kode_alr, nama, pin) values (r.kode, r.nama, pin)
        on conflict (kode_alr) do update set pin = excluded.pin, nama = excluded.nama, dibuat = now();
    end if;
    insert into public.pengguna (kode_alr, nama, divisi, jabatan, akses, auth_id, aktif)
    values (r.kode, r.nama, r.divisi, r.jabatan, 'kelola', uid, true)
    on conflict (kode_alr) do update set nama = excluded.nama, divisi = excluded.divisi, jabatan = excluded.jabatan,
      akses = excluded.akses, auth_id = excluded.auth_id, aktif = true;
  end loop;
end $$;

-- cek hasil: 12 baris
select p.kode_alr, p.nama, p.divisi, p.jabatan, (p.auth_id is not null) as punya_login
from public.pengguna p order by p.kode_alr;
