-- Trello alternative on Supabase: schema, row-level security, RPCs,
-- notification triggers, realtime broadcast and attachment storage.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index on public.boards (workspace_id);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  position double precision not null
);
create index on public.lists (board_id);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  position double precision not null,
  due_date timestamptz,
  created_at timestamptz not null default now()
);
create index on public.cards (list_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index on public.comments (card_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards on delete cascade,
  path text not null,
  name text not null,
  created_at timestamptz not null default now()
);
create index on public.attachments (card_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  type text not null,
  data jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- --------------------------------------------------------------- profiles

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------- access helpers
-- security definer so policies can consult membership without recursing
-- into workspace_members' own policy.

create function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  )
$$;

create function public.is_workspace_owner(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid() and role = 'owner'
  )
$$;

create function public.is_board_member(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards
    join public.workspace_members m on m.workspace_id = boards.workspace_id
    where boards.id = b and m.user_id = auth.uid()
  )
$$;

create function public.board_of_list(l uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select board_id from public.lists where id = l
$$;

create function public.board_of_card(c uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select lists.board_id from public.cards join public.lists on lists.id = cards.list_id where cards.id = c
$$;

create function public.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ------------------------------------------------------------------- RLS
-- Every table is reachable only by members of the owning workspace.

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.lists enable row level security;
alter table public.cards enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;

create policy "see self and teammates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace(id));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- Workspaces and memberships are created through RPCs below.
create policy "members read" on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy "owner renames" on public.workspaces for update to authenticated
  using (public.is_workspace_owner(id));
create policy "owner deletes" on public.workspaces for delete to authenticated
  using (public.is_workspace_owner(id));

create policy "members read" on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "members read" on public.boards for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "members create" on public.boards for insert to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy "members edit" on public.boards for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "owner deletes" on public.boards for delete to authenticated
  using (public.is_workspace_owner(workspace_id));

create policy "board members" on public.lists for all to authenticated
  using (public.is_board_member(board_id)) with check (public.is_board_member(board_id));

create policy "board members" on public.cards for all to authenticated
  using (public.is_board_member(public.board_of_list(list_id)))
  with check (public.is_board_member(public.board_of_list(list_id)));

create policy "board members read" on public.comments for select to authenticated
  using (public.is_board_member(public.board_of_card(card_id)));
create policy "board members write as self" on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_board_member(public.board_of_card(card_id)));
create policy "author deletes" on public.comments for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "board members read" on public.attachments for select to authenticated
  using (public.is_board_member(public.board_of_card(card_id)));
create policy "board members add" on public.attachments for insert to authenticated
  with check (public.is_board_member(public.board_of_card(card_id)));
create policy "board members remove" on public.attachments for delete to authenticated
  using (public.is_board_member(public.board_of_card(card_id)));

create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mark own read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------------------ RPCs

create function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  insert into public.workspaces (name) values (trim(p_name)) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end $$;

create function public.add_workspace_member(p_workspace uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare invitee uuid; inserted int;
begin
  if not public.is_workspace_owner(p_workspace) then
    raise exception 'Only the owner can add members' using errcode = '42501';
  end if;
  select id into invitee from public.profiles where email = lower(trim(p_email));
  if invitee is null then raise exception 'No user with that email' using errcode = 'P0002'; end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace, invitee, 'member') on conflict do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    insert into public.notifications (user_id, type, data)
    select invitee, 'workspace:added', jsonb_build_object(
      'workspaceId', w.id, 'workspaceName', w.name,
      'by', (select name from public.profiles where id = auth.uid()))
    from public.workspaces w where w.id = p_workspace;
  end if;
end $$;

revoke execute on function public.create_workspace, public.add_workspace_member from public, anon;
grant execute on function public.create_workspace, public.add_workspace_member to authenticated;

-- ---------------------------------------------------------- notifications

-- ponytail: notifies every workspace member; switch to card watchers when those exist.
create function public.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, data)
  select m.user_id, 'comment', jsonb_build_object(
    'boardId', b.id, 'cardId', c.id, 'boardTitle', b.title, 'cardTitle', c.title,
    'by', (select name from public.profiles where id = new.user_id),
    'excerpt', left(new.body, 120))
  from public.cards c
  join public.lists l on l.id = c.list_id
  join public.boards b on b.id = l.board_id
  join public.workspace_members m on m.workspace_id = b.workspace_id
  where c.id = new.card_id and m.user_id <> new.user_id;
  return null;
end $$;

create trigger on_comment_created after insert on public.comments
for each row execute function public.notify_comment();

-- --------------------------------------------------------------- realtime
-- Private broadcast topics: board:<id> tells open boards to refetch,
-- user:<id> delivers notifications. Authorised by realtime.messages RLS.

create function public.broadcast_board_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  board uuid;
begin
  board := case tg_table_name
    when 'boards' then (rec ->> 'id')::uuid
    when 'lists' then (rec ->> 'board_id')::uuid
    when 'cards' then public.board_of_list((rec ->> 'list_id')::uuid)
    else public.board_of_card((rec ->> 'card_id')::uuid)
  end;
  -- Rows removed by a cascade can no longer resolve their board; the parent's own event covers them.
  if board is not null then
    perform realtime.send(jsonb_build_object('boardId', board), 'changed', 'board:' || board, true);
  end if;
  return null;
end $$;

-- ponytail: one broadcast per row; a mass delete sends many, switch to statement-level triggers if that shows up.
create trigger broadcast_change after insert or update or delete on public.boards
for each row execute function public.broadcast_board_change();
create trigger broadcast_change after insert or update or delete on public.lists
for each row execute function public.broadcast_board_change();
create trigger broadcast_change after insert or update or delete on public.cards
for each row execute function public.broadcast_board_change();
create trigger broadcast_change after insert or update or delete on public.comments
for each row execute function public.broadcast_board_change();
create trigger broadcast_change after insert or update or delete on public.attachments
for each row execute function public.broadcast_board_change();

create function public.broadcast_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(to_jsonb(new), 'notification', 'user:' || new.user_id, true);
  return null;
end $$;

create trigger broadcast_notification after insert on public.notifications
for each row execute function public.broadcast_notification();

create function public.can_listen(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if topic = 'user:' || auth.uid() then return true; end if;
  if topic like 'board:%' then return public.is_board_member(substr(topic, 7)::uuid); end if;
  return false;
exception when invalid_text_representation then
  return false;
end $$;

create policy "listen to own topics" on realtime.messages for select to authenticated
  using (extension = 'broadcast' and public.can_listen((select realtime.topic())));

-- ---------------------------------------------------------------- storage
-- Object path is <card_id>/<uuid>-<filename>; access follows the card's board.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10 * 1024 * 1024);

create function public.can_access_card_path(path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return public.is_board_member(public.board_of_card(split_part(path, '/', 1)::uuid));
exception when invalid_text_representation then
  return false;
end $$;

create policy "board members read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_access_card_path(name));
create policy "board members upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_access_card_path(name));
create policy "board members delete attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_access_card_path(name));
