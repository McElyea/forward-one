create extension if not exists pgcrypto with schema extensions;

create table public.race_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  level_id text not null check (level_id in ('class-ii', 'class-iii', 'class-iv', 'class-v')),
  max_players smallint not null default 8 check (max_players between 2 and 64),
  host_player_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'lobby' check (state in ('lobby', 'countdown', 'racing', 'finished')),
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);

create table public.race_room_members (
  room_id uuid not null references public.race_rooms (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 18),
  color_index smallint not null check (color_index between 0 and 15),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create index race_room_members_player_id_idx
  on public.race_room_members (player_id);

alter table public.race_rooms enable row level security;
alter table public.race_room_members enable row level security;

create function public.is_race_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.race_room_members member
    where member.room_id = p_room_id
      and member.player_id = (select auth.uid())
  )
$$;

revoke all on function public.is_race_room_member(uuid) from public;
grant execute on function public.is_race_room_member(uuid) to authenticated;

create policy "room members can read their room"
on public.race_rooms
for select
to authenticated
using (public.is_race_room_member(id));

create policy "room members can read fellow members"
on public.race_room_members
for select
to authenticated
using (public.is_race_room_member(room_id));

grant select on public.race_rooms to authenticated;
grant select on public.race_room_members to authenticated;

create function public.race_room_payload(p_room_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', room.id,
    'code', room.code,
    'levelId', room.level_id,
    'maxPlayers', room.max_players,
    'hostPlayerId', room.host_player_id,
    'state', room.state,
    'serverNow', clock_timestamp(),
    'startsAt', room.starts_at,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'playerId', member.player_id,
          'name', member.player_name,
          'colorIndex', member.color_index
        )
        order by member.joined_at
      )
      from public.race_room_members member
      where member.room_id = room.id
    ), '[]'::jsonb)
  )
  from public.race_rooms room
  where room.id = p_room_id
$$;

revoke all on function public.race_room_payload(uuid) from public;

create function public.new_race_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated text := '';
begin
  for position in 1..6 loop
    generated := generated || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
  end loop;
  return generated;
end
$$;

revoke all on function public.new_race_room_code() from public;

create function public.create_race_room(
  p_level_id text,
  p_player_name text,
  p_max_players smallint default 8
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_id uuid := (select auth.uid());
  room_id uuid;
  room_code text;
begin
  if player_id is null then raise exception 'Sign in before creating a room'; end if;
  if p_level_id not in ('class-ii', 'class-iii', 'class-iv', 'class-v') then
    raise exception 'Unknown river level';
  end if;
  if char_length(trim(p_player_name)) not between 1 and 18 then
    raise exception 'Paddler name must contain 1 to 18 characters';
  end if;
  if p_max_players not between 2 and 64 then
    raise exception 'Room capacity must be between 2 and 64';
  end if;

  delete from public.race_rooms where expires_at <= now();

  for attempt in 1..8 loop
    room_code := public.new_race_room_code();
    begin
      insert into public.race_rooms (code, level_id, max_players, host_player_id)
      values (room_code, p_level_id, p_max_players, player_id)
      returning id into room_id;
      exit;
    exception when unique_violation then
      room_id := null;
    end;
  end loop;

  if room_id is null then raise exception 'Could not allocate a unique room code'; end if;

  insert into public.race_room_members (room_id, player_id, player_name, color_index)
  values (room_id, player_id, trim(p_player_name), 0);

  return public.race_room_payload(room_id);
end
$$;

create function public.join_race_room(p_code text, p_player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := (select auth.uid());
  room public.race_rooms%rowtype;
  member_count integer;
begin
  if current_player_id is null then raise exception 'Sign in before joining a room'; end if;
  if char_length(trim(p_player_name)) not between 1 and 18 then
    raise exception 'Paddler name must contain 1 to 18 characters';
  end if;

  select * into room
  from public.race_rooms
  where code = upper(trim(p_code))
  for update;

  if room.id is null or room.expires_at <= now() then raise exception 'Room not found'; end if;
  if room.state <> 'lobby' then raise exception 'That race has already started'; end if;

  delete from public.race_room_members
  where room_id = room.id and last_seen_at < now() - interval '90 seconds';

  if exists (
    select 1 from public.race_room_members
    where room_id = room.id and player_id = current_player_id
  ) then
    update public.race_room_members
    set player_name = trim(p_player_name), last_seen_at = now()
    where room_id = room.id and player_id = current_player_id;
  else
    select count(*) into member_count
    from public.race_room_members
    where room_id = room.id;

    if member_count >= room.max_players then raise exception 'That room is full'; end if;

    insert into public.race_room_members (room_id, player_id, player_name, color_index)
    values (room.id, current_player_id, trim(p_player_name), member_count % 16);
  end if;

  if not exists (
    select 1 from public.race_room_members where room_id = room.id and player_id = room.host_player_id
  ) then
    update public.race_rooms
    set host_player_id = (
      select player_id from public.race_room_members
      where room_id = room.id order by joined_at limit 1
    )
    where id = room.id;
  end if;

  return public.race_room_payload(room.id);
end
$$;

create function public.get_race_room(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_race_room_member(p_room_id) then raise exception 'Room not found'; end if;
  return public.race_room_payload(p_room_id);
end
$$;

create function public.start_race_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.race_rooms%rowtype;
  member_count integer;
begin
  select * into room from public.race_rooms where id = p_room_id for update;
  if room.id is null then raise exception 'Room not found'; end if;
  if room.host_player_id <> (select auth.uid()) then raise exception 'Only the host can start'; end if;
  if room.state <> 'lobby' then raise exception 'That race has already started'; end if;

  select count(*) into member_count
  from public.race_room_members
  where room_id = p_room_id;
  if member_count < 2 then raise exception 'At least two paddlers are required'; end if;

  update public.race_rooms
  set state = 'countdown', starts_at = clock_timestamp() + interval '4 seconds'
  where id = p_room_id;

  return public.race_room_payload(p_room_id);
end
$$;

create function public.touch_race_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_id uuid := (select auth.uid());
  room_state text;
  host_seen_at timestamptz;
  next_host uuid;
begin
  update public.race_room_members
  set last_seen_at = now()
  where room_id = p_room_id and player_id = current_player_id;

  if not found then raise exception 'Room not found'; end if;

  select room.state, host.last_seen_at into room_state, host_seen_at
  from public.race_rooms room
  left join public.race_room_members host
    on host.room_id = room.id and host.player_id = room.host_player_id
  where room.id = p_room_id
  for update of room;

  if room_state = 'lobby' then
    delete from public.race_room_members
    where room_id = p_room_id and last_seen_at < now() - interval '90 seconds';

    if host_seen_at is null or host_seen_at < now() - interval '45 seconds' then
      select player_id into next_host
      from public.race_room_members
      where room_id = p_room_id
      order by joined_at
      limit 1;

      update public.race_rooms set host_player_id = next_host where id = p_room_id;
    end if;
  end if;

  return public.race_room_payload(p_room_id);
end
$$;

create function public.leave_race_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_id uuid := (select auth.uid());
  was_host boolean;
  next_host uuid;
begin
  select host_player_id = current_player_id into was_host
  from public.race_rooms
  where id = p_room_id;

  delete from public.race_room_members
  where room_id = p_room_id and player_id = current_player_id;

  select member.player_id into next_host
  from public.race_room_members member
  where member.room_id = p_room_id
  order by member.joined_at
  limit 1;

  if next_host is null then
    delete from public.race_rooms where id = p_room_id;
  elsif was_host then
    update public.race_rooms set host_player_id = next_host where id = p_room_id;
  end if;
end
$$;

revoke all on function public.create_race_room(text, text, smallint) from public;
revoke all on function public.join_race_room(text, text) from public;
revoke all on function public.get_race_room(uuid) from public;
revoke all on function public.start_race_room(uuid) from public;
revoke all on function public.touch_race_room(uuid) from public;
revoke all on function public.leave_race_room(uuid) from public;

grant execute on function public.create_race_room(text, text, smallint) to authenticated;
grant execute on function public.join_race_room(text, text) to authenticated;
grant execute on function public.get_race_room(uuid) to authenticated;
grant execute on function public.start_race_room(uuid) to authenticated;
grant execute on function public.touch_race_room(uuid) to authenticated;
grant execute on function public.leave_race_room(uuid) to authenticated;

create function public.can_access_race_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic ~ '^race:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_race_room_member(substring(p_topic from 6)::uuid)
    else false
  end
$$;

revoke all on function public.can_access_race_topic(text) from public;
grant execute on function public.can_access_race_topic(text) to authenticated;

create policy "room members can receive race broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and public.can_access_race_topic((select realtime.topic()))
);

create policy "room members can send race broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and public.can_access_race_topic((select realtime.topic()))
);
