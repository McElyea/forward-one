create or replace function public.create_race_room(
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
  if current_player_id is null then raise exception 'Sign in before creating a room'; end if;
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
      values (room_code, p_level_id, p_max_players, current_player_id)
      returning id into room_id;
      exit;
    exception when unique_violation then
      room_id := null;
    end;
  end loop;

  if room_id is null then raise exception 'Could not allocate a unique room code'; end if;

  insert into public.race_room_members (room_id, player_id, player_name, color_index)
  values (room_id, current_player_id, trim(p_player_name), 0);

  return public.race_room_payload(room_id);
end
$$;

create or replace function public.join_race_room(p_code text, p_player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player_id uuid := (select auth.uid());
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
