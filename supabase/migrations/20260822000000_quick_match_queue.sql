alter table public.race_rooms
add column if not exists matchmaking boolean not null default false;

create index if not exists race_rooms_matchmaking_queue_idx
on public.race_rooms (level_id, created_at)
where matchmaking = true and state in ('lobby', 'countdown');

create or replace function public.race_room_payload(p_room_id uuid)
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
    'matchmaking', room.matchmaking,
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

create or replace function public.quick_match_race_room(
  p_level_id text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_id uuid := (select auth.uid());
  room public.race_rooms%rowtype;
  room_code text;
  member_count integer;
begin
  if current_player_id is null then raise exception 'Sign in before finding a match'; end if;
  if p_level_id not in ('class-ii', 'class-iii', 'class-iv', 'class-v') then
    raise exception 'Unknown river level';
  end if;
  if char_length(trim(p_player_name)) not between 1 and 18 then
    raise exception 'Paddler name must contain 1 to 18 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('forward-one:quick-match:' || p_level_id)
  );

  delete from public.race_rooms where expires_at <= now();

  delete from public.race_room_members member
  using public.race_rooms queued_room
  where member.room_id = queued_room.id
    and queued_room.matchmaking = true
    and queued_room.level_id = p_level_id
    and queued_room.state in ('lobby', 'countdown')
    and member.last_seen_at < now() - interval '90 seconds';

  delete from public.race_rooms queued_room
  where queued_room.matchmaking = true
    and queued_room.level_id = p_level_id
    and queued_room.state in ('lobby', 'countdown')
    and not exists (
      select 1
      from public.race_room_members member
      where member.room_id = queued_room.id
    );

  update public.race_rooms queued_room
  set host_player_id = (
    select member.player_id
    from public.race_room_members member
    where member.room_id = queued_room.id
    order by member.joined_at
    limit 1
  )
  where queued_room.matchmaking = true
    and queued_room.level_id = p_level_id
    and queued_room.state in ('lobby', 'countdown')
    and not exists (
      select 1
      from public.race_room_members member
      where member.room_id = queued_room.id
        and member.player_id = queued_room.host_player_id
    );

  select queued_room.* into room
  from public.race_rooms queued_room
  join public.race_room_members member on member.room_id = queued_room.id
  where member.player_id = current_player_id
    and queued_room.matchmaking = true
    and queued_room.level_id = p_level_id
    and queued_room.expires_at > now()
    and (
      queued_room.state = 'lobby'
      or (
        queued_room.state = 'countdown'
        and queued_room.starts_at > clock_timestamp() + interval '2 seconds'
      )
    )
  order by queued_room.created_at
  limit 1
  for update of queued_room;

  if room.id is not null then
    update public.race_room_members
    set player_name = trim(p_player_name), last_seen_at = now()
    where room_id = room.id and player_id = current_player_id;
    return public.race_room_payload(room.id);
  end if;

  select queued_room.* into room
  from public.race_rooms queued_room
  where queued_room.matchmaking = true
    and queued_room.level_id = p_level_id
    and queued_room.expires_at > now()
    and (
      queued_room.state = 'lobby'
      or (
        queued_room.state = 'countdown'
        and queued_room.starts_at > clock_timestamp() + interval '2 seconds'
      )
    )
    and (
      select count(*)
      from public.race_room_members member
      where member.room_id = queued_room.id
    ) < queued_room.max_players
  order by queued_room.created_at
  limit 1
  for update of queued_room;

  if room.id is null then
    for attempt in 1..8 loop
      room_code := public.new_race_room_code();
      begin
        insert into public.race_rooms (
          code,
          level_id,
          max_players,
          host_player_id,
          matchmaking
        )
        values (room_code, p_level_id, 8, current_player_id, true)
        returning * into room;
        exit;
      exception when unique_violation then
        room := null;
      end;
    end loop;
  end if;

  if room.id is null then raise exception 'Could not allocate a matchmaking room'; end if;

  select count(*) into member_count
  from public.race_room_members member
  where member.room_id = room.id;

  insert into public.race_room_members (room_id, player_id, player_name, color_index)
  values (room.id, current_player_id, trim(p_player_name), member_count % 16);

  member_count := member_count + 1;
  if room.state = 'lobby' and member_count >= 2 then
    update public.race_rooms
    set state = 'countdown', starts_at = clock_timestamp() + interval '8 seconds'
    where id = room.id;
  end if;

  return public.race_room_payload(room.id);
end
$$;

revoke all on function public.quick_match_race_room(text, text) from public;
grant execute on function public.quick_match_race_room(text, text) to authenticated;
