-- Access control.
-- The application server is the only writer and the only reader of game
-- state; it connects with a privileged role. Client roles (anon,
-- authenticated) get the bare minimum through the Data API, and nothing that
-- could reveal answers. RLS is enabled everywhere so a forgotten grant never
-- exposes rows by itself.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('revoke all on private.%I from public, anon, authenticated', t.tablename);
  end loop;
end $$;

revoke all on schema private from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

-- Categories are public reference data.
grant select on public.categories to anon, authenticated;
create policy categories_read on public.categories for select to anon, authenticated using (true);

-- Signed-in players may read their own profile row (Supabase Auth identity).
grant select (id, kind, display_name, avatar_key, country_code, settings, created_at)
  on public.players to authenticated;
create policy players_read_own on public.players for select to authenticated
  using (auth_user_id = auth.uid());

-- Signed-in players may read summaries of their own sessions. Per-question
-- rows (issued_questions), options, versions and answer keys are not granted.
grant select (id, player_id, mode, status, score, correct_count, answered_count,
              total_questions, started_at, completed_at)
  on public.game_sessions to authenticated;
create policy sessions_read_own on public.game_sessions for select to authenticated
  using (player_id in (select id from public.players where auth_user_id = auth.uid()));
