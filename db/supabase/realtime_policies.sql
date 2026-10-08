-- Supabase-only: authorisation for private Realtime channels used by live
-- matches (topic `match:<match_id>`). Apply in the Supabase SQL editor after
-- the main migrations. Messages on these channels are payload-free "changed"
-- pings; clients always refetch authoritative state from the server.
-- See https://supabase.com/docs/guides/realtime/authorization

create policy "match participants can receive match pings"
on realtime.messages for select to authenticated
using (
  realtime.topic() like 'match:%'
  and exists (
    select 1
      from public.match_participants mp
      join public.players p on p.id = mp.player_id
     where mp.match_id::text = split_part(realtime.topic(), ':', 2)
       and p.auth_user_id = auth.uid()
  )
);

-- Clients never send on these channels; only the server broadcasts.
