-- Tambahan izin untuk project yang sudah menjalankan skema.sql versi awal. Jalankan sekali di SQL Editor.

-- ---------- izin dasar (project Supabase baru tidak memberi izin otomatis) ----------
grant usage on schema public to anon, authenticated;
grant select on public.divisi to anon, authenticated;
grant select, insert on public.laporan to anon, authenticated;
grant update on public.laporan to authenticated;
grant select, insert, update, delete on public.pengguna to authenticated;
grant select on public.rekap_harian to anon, authenticated;
grant execute on function public.boleh_kelola() to authenticated;
