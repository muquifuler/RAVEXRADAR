-- 1. Tabla de Perfiles (vinculada a Supabase Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  favorite_subgenre text default 'Hard Techno',
  raves_attended int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Tabla de Eventos (con external_id único para no duplicar al scrapear)
create table public.events (
  id uuid default gen_random_uuid() primary key,
  external_id text unique not null, -- Ej: 'tm_1959413614' o 'ra_182931'
  name text not null,
  description text,
  promoter text,
  start_date date not null,
  start_time time,
  subgenre text default 'Techno', -- 'Hard Techno', 'Schranz', 'Industrial', 'Acid', 'Techno'
  image_url text,
  ticket_url text,
  venue_name text,
  city text,
  lat double precision not null,
  lng double precision not null,
  likes_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Tabla de Asistencia / Squad Finder ("¿Quién va?")
create table public.event_attendees (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text check (status in ('going', 'looking_for_squad')), -- Clave para conectar gente
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(event_id, user_id)
);

-- 4. Tabla de Comentarios en Tiempo Real
create table public.event_comments (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  username text not null, -- Desnormalizado para carga ultra rápida
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilitar Realtime para comentarios
alter publication supabase_realtime add table public.event_comments;

-- Crear perfil automáticamente cuando un usuario se registra en Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, favorite_subgenre, raves_attended)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'Raver_' || substr(new.id::text, 1, 5)),
    coalesce(new.raw_user_meta_data->>'favorite_subgenre', 'Hard Techno'),
    1
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

  -- Activar RLS en todas las tablas
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_comments enable row level security;

-- Políticas de lectura pública (cualquiera puede ver el mapa, perfiles y comentarios)
create policy "Lectura pública de eventos" on public.events for select using (true);
create policy "Lectura pública de perfiles" on public.profiles for select using (true);
create policy "Lectura pública de asistentes" on public.event_attendees for select using (true);
create policy "Lectura pública de comentarios" on public.event_comments for select using (true);

-- Políticas de escritura para usuarios logueados
create policy "Usuarios suben eventos" on public.events for insert with check (auth.role() = 'authenticated');
create policy "Usuarios comentan" on public.event_comments for insert with check (auth.uid() = user_id);
create policy "Usuarios marcan asistencia" on public.event_attendees for all using (auth.uid() = user_id);
create policy "Usuarios editan su perfil" on public.profiles for update using (auth.uid() = id);





-- 1. Añadir soporte para Secret Locations y Sets (SoundCloud/Spotify) en eventos
alter table public.events 
  add column if not exists is_secret_location boolean default false,
  add column if not exists media_embed_url text;

-- 2. Actualizar el trigger de registro para leer datos de Google, Apple y Spotify
create or replace function public.handle_new_user()
returns trigger as $$
declare
  clean_username text;
begin
  -- Extrae el nombre de Spotify/Google/Apple o usa el prefijo del email
  clean_username := coalesce(
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'Raver_' || substr(new.id::text, 1, 5)
  );
  -- Limpia espacios y añade sufijo único corto para evitar choques
  clean_username := replace(clean_username, ' ', '_') || '_' || substr(new.id::text, 1, 3);

  insert into public.profiles (id, username, avatar_url, favorite_subgenre, raves_attended)
  values (
    new.id,
    clean_username,
    new.raw_user_meta_data->>'avatar_url',
    'Hard Techno',
    1
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- 3. Crear Bucket en Supabase Storage para subir carteles desde el móvil
insert into storage.buckets (id, name, public)
values ('flyers', 'flyers', true)
on conflict (id) do nothing;

-- Políticas de Storage para que cualquiera vea flyers y usuarios logueados suban fotos
create policy "Flyers públicos" on storage.objects for select using (bucket_id = 'flyers');
create policy "Subida de flyers autenticada" on storage.objects for insert with check (
  bucket_id = 'flyers' and auth.role() = 'authenticated'
);

-- 4. Políticas RLS de las tablas principales
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_comments enable row level security;

create policy "Lectura pública eventos" on public.events for select using (true);
create policy "Lectura pública perfiles" on public.profiles for select using (true);
create policy "Lectura pública asistentes" on public.event_attendees for select using (true);
create policy "Lectura pública comentarios" on public.event_comments for select using (true);


-- =========================================================
-- 1. ACTUALIZACIÓN DE EVENTOS (VÍDEO, AUDIO Y ELECTRÓNICA)
-- =========================================================
alter table public.events
  add column if not exists is_secret_location boolean default false,
  add column if not exists audio_url text,
  add column if not exists video_url text,
  add column if not exists media_storage_paths text[] default '{}';

-- Bucket público para almacenar los MP3 y MP4 descargados por evento
insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

create policy "Lectura pública de event-media" on storage.objects
  for select using (bucket_id = 'event-media');

create policy "Subida y borrado de event-media" on storage.objects
  for all using (bucket_id = 'event-media');

-- =========================================================
-- 2. SISTEMA DE AMIGOS (FRIENDSHIPS)
-- =========================================================
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  addressee_id uuid references public.profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'blocked')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(requester_id, addressee_id)
);

-- =========================================================
-- 3. SALAS DE CHAT (EVENTO, AMIGOS DM Y GRUPOS PRIVADOS)
-- =========================================================
create table if not exists public.chat_rooms (
  id uuid default gen_random_uuid() primary key,
  type text check (type in ('event', 'direct', 'private_group')) not null,
  name text not null,
  event_id uuid references public.events(id) on delete cascade unique, -- Si el evento se borra, su chat se borra en cascada
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.chat_participants (
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text check (role in ('admin', 'member')) default 'member',
  joined_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (room_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  sender_username text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Crear automáticamente una sala de chat grupal por cada evento nuevo
create or replace function public.create_event_chat_room()
returns trigger as $$
begin
  insert into public.chat_rooms (type, name, event_id)
  values ('event', '🔊 ' || new.name, new.id)
  on conflict (event_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_event_created_chat on public.events;
create trigger on_event_created_chat
  after insert on public.events
  for each row execute procedure public.create_event_chat_room();

-- Generar salas para los eventos que ya tenías creados
insert into public.chat_rooms (type, name, event_id)
select 'event', '🔊 ' || name, id from public.events
on conflict (event_id) do nothing;

-- =========================================================
-- 4. POLÍTICAS RLS (ROW LEVEL SECURITY)
-- =========================================================
alter table public.friendships enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

-- Friendships: Ver y gestionar tus propias amistades
create policy "Ver mis amistades" on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Enviar solicitud amistad" on public.friendships for insert
  with check (auth.uid() = requester_id);
create policy "Actualizar amistad" on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Borrar amistad" on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Chat Rooms: Las salas de eventos son públicas; las privadas/DM solo para sus participantes
create policy "Ver salas de chat" on public.chat_rooms for select
  using (
    type = 'event'
    or created_by = auth.uid()
    or exists (select 1 from public.chat_participants cp where cp.room_id = id and cp.user_id = auth.uid())
  );
create policy "Crear salas privadas" on public.chat_rooms for insert
  with check (auth.role() = 'authenticated');

-- Participantes de Chat
create policy "Ver participantes" on public.chat_participants for select using (true);
create policy "Unirse o añadir a chat" on public.chat_participants for insert
  with check (auth.role() = 'authenticated');

-- Mensajes de Chat: Cualquiera lee/escribe en chats de eventos; en privados solo miembros
create policy "Leer mensajes" on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_rooms cr
      where cr.id = room_id and (
        cr.type = 'event'
        or exists (select 1 from public.chat_participants cp where cp.room_id = cr.id and cp.user_id = auth.uid())
      )
    )
  );
create policy "Enviar mensajes" on public.chat_messages for insert
  with check (auth.uid() = sender_id);

-- Activar Realtime para los mensajes de chat y amistades
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.friendships;

-- 1. Nuevos campos de Perfil (Rol: DJ/Promotor/Raver, Ciudad, Bio y BPM favorito)
alter table public.profiles
  add column if not exists bio text default 'Amante del sonido club y frecuencias industriales.',
  add column if not exists city text default 'Madrid',
  add column if not exists role text check (role in ('DJ', 'Promotor', 'Raver')) default 'Raver',
  add column if not exists favorite_bpm int default 155;

-- 2. Guardar quién creó cada evento para permitirle fijar mensajes (Pin)
alter table public.events
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- 3. Mejorar mensajes de chat (Avatar del emisor y soporte para fijar mensajes)
alter table public.chat_messages
  add column if not exists sender_avatar text,
  add column if not exists is_pinned boolean default false;

-- Permitir al creador del evento o participantes actualizar el estado is_pinned
create policy "Actualizar mensajes fijados" on public.chat_messages
  for update using (auth.role() = 'authenticated');

-- 4. Bucket para Avatares de usuario
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatares públicos" on storage.objects for select using (bucket_id = 'avatars');
create policy "Subir avatares" on storage.objects for all using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- 5. Habilitar Realtime completo en tablas de Chat y Asistentes
alter table public.chat_messages replica identity full;
alter table public.event_attendees replica identity full;
alter table public.friendships replica identity full;

-- Asegurar que están en la publicación realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'event_attendees'
  ) then
    alter publication supabase_realtime add table public.event_attendees;
  end if;
end $$;

-- 1. Añadir duración estimada en horas (12h por defecto para los eventos de internet)
alter table public.events
  add column if not exists duration_hours int default 12;

-- 2. Asegurar permisos RLS completos en profiles para que funcione el guardado (UPSERT)
drop policy if exists "Usuarios insertan su perfil" on public.profiles;
create policy "Usuarios insertan su perfil" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Usuarios editan su perfil" on public.profiles;
create policy "Usuarios editan su perfil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 3. Asegurar permisos de subida y actualización en el bucket 'avatars'
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatares públicos" on storage.objects;
create policy "Avatares públicos" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Subir y actualizar avatares" on storage.objects;
create policy "Subir y actualizar avatares" on storage.objects
  for all using (bucket_id = 'avatars' and auth.role() = 'authenticated')
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- 4. Función para borrar automáticamente eventos que pasaron hace más de 1 mes
create or replace function public.delete_events_older_than_one_month()
returns void as $$
begin
  delete from public.events
  where start_date < (current_date - interval '1 month');
end;
$$ language plpgsql security definer;

-- 1. Asegurar todas las columnas del perfil y de DJs
alter table public.profiles
  add column if not exists bio text default 'Amante del sonido club y frecuencias industriales.',
  add column if not exists city text default 'Madrid',
  add column if not exists role text check (role in ('DJ', 'Promotor', 'Raver')) default 'Raver',
  add column if not exists favorite_bpm int default 155,
  add column if not exists soundcloud_url text,
  add column if not exists hype_score int default 10,
  add column if not exists lat double precision default 40.4168,
  add column if not exists lng double precision default -3.7038;

-- 2. Forzar a Supabase a refrescar la caché del esquema inmediatamente
notify pgrst, 'reload schema';

-- 1. Tabla para limitar el Hype a 1 máximo por Usuario y DJ
create table if not exists public.dj_hypes (
  id uuid default gen_random_uuid() primary key,
  dj_id uuid references public.profiles(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(dj_id, user_id) -- Bloquea a nivel de base de datos más de 1 hype por DJ
);

alter table public.dj_hypes enable row level security;

drop policy if exists "Lectura pública de hypes" on public.dj_hypes;
create policy "Lectura pública de hypes" on public.dj_hypes
  for select using (true);

drop policy if exists "Usuarios dan 1 hype" on public.dj_hypes;
create policy "Usuarios dan 1 hype" on public.dj_hypes
  for insert with check (auth.uid() = user_id);

-- 2. Asegurar que cualquier usuario autenticado pueda actualizar el contador hype_score de un DJ
drop policy if exists "Actualizar perfil o hype" on public.profiles;
create policy "Actualizar perfil o hype" on public.profiles
  for update using (auth.role() = 'authenticated');

-- 3. Asegurar Realtime en friendships para que la campanita reciba solicitudes al instante
alter table public.friendships replica identity full;

-- 4. Recargar caché del esquema
notify pgrst, 'reload schema';

-- 1. Asegurar TODAS las columnas de events (Evita que desaparezcan al crear/editar)
alter table public.events
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists duration_hours int default 12,
  add column if not exists is_secret_location boolean default false,
  add column if not exists audio_url text,
  add column if not exists video_url text,
  add column if not exists media_storage_paths text[] default '{}';

-- Políticas RLS completas en events (Lectura, Creación, Edición y Borrado)
drop policy if exists "Usuarios suben eventos" on public.events;
create policy "Usuarios suben eventos" on public.events
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Creadores editan sus eventos" on public.events;
create policy "Creadores editan sus eventos" on public.events
  for update using (auth.uid() = created_by);

drop policy if exists "Creadores borran sus eventos" on public.events;
create policy "Creadores borran sus eventos" on public.events
  for delete using (auth.uid() = created_by);

-- 2. Columnas en profiles para que el DJ elija entre SoundCloud o Canción Subida (.mp3)
alter table public.profiles
  add column if not exists dj_audio_source text check (dj_audio_source in ('soundcloud', 'upload')) default 'soundcloud',
  add column if not exists dj_audio_url text;

-- 3. Desbloquear RLS en Chats Directos (DMs) y permitir borrar el chat al eliminar amigo
drop policy if exists "Ver salas de chat" on public.chat_rooms;
create policy "Ver salas de chat" on public.chat_rooms
  for select using (true);

drop policy if exists "Borrar salas de chat" on public.chat_rooms;
create policy "Borrar salas de chat" on public.chat_rooms
  for delete using (auth.role() = 'authenticated');

drop policy if exists "Leer mensajes" on public.chat_messages;
create policy "Leer mensajes" on public.chat_messages
  for select using (true);

drop policy if exists "Enviar mensajes" on public.chat_messages;
create policy "Enviar mensajes" on public.chat_messages
  for insert with check (auth.uid() = sender_id);

-- 4. Asegurar Realtime y recargar la caché de Supabase
alter table public.chat_messages replica identity full;
alter table public.friendships replica identity full;
notify pgrst, 'reload schema';

-- 1. Añadir coordenadas aproximadas para Secret Locations y columna Lineup en events
alter table public.events
  add column if not exists secret_lat double precision,
  add column if not exists secret_lng double precision,
  add column if not exists lineup jsonb default '[]'::jsonb;

-- 2. Asegurar que chat_messages tenga sender_avatar y rellenar los mensajes antiguos con el avatar actual de su autor
alter table public.chat_messages
  add column if not exists sender_avatar text,
  add column if not exists is_pinned boolean default false;

update public.chat_messages cm
set sender_avatar = p.avatar_url
from public.profiles p
where cm.sender_id = p.id and cm.sender_avatar is null;

-- 3. Refrescar inmediatamente la caché del esquema
notify pgrst, 'reload schema';

-- 1. Añadir galería multimedia del DJ (vídeos de sesiones y fotos) y control de primer login
alter table public.profiles
  add column if not exists dj_media jsonb default '[]'::jsonb,
  add column if not exists onboarding_completed boolean default false;

-- 2. Marcar a los usuarios que ya habían editado su perfil anteriormente como completados
update public.profiles
set onboarding_completed = true
where role in ('DJ', 'Promotor');

-- 3. Recargar inmediatamente la caché de Supabase
notify pgrst, 'reload schema';

-- 1. Permitir usuario Administrador únicamente desde Base de Datos
alter table public.profiles
  add column if not exists is_admin boolean default false;

-- Ampliar restricción de role por si prefieres ponerte 'Admin' en la columna role desde Supabase
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('DJ', 'Promotor', 'Raver', 'Admin'));

-- 2. Tabla de Soporte / Contacto y Respuestas del Admin
create table if not exists public.support_tickets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  user_email text not null,
  subject text not null,
  message text not null,
  admin_reply text,
  status text check (status in ('open', 'answered')) default 'open',
  user_read_reply boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  replied_at timestamp with time zone
);

alter table public.support_tickets enable row level security;

drop policy if exists "Usuarios ven sus tickets y Admin ve todos" on public.support_tickets;
create policy "Usuarios ven sus tickets y Admin ve todos" on public.support_tickets
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  );

drop policy if exists "Usuarios crean tickets de soporte" on public.support_tickets;
create policy "Usuarios crean tickets de soporte" on public.support_tickets
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admin responde y usuario marca leído" on public.support_tickets;
create policy "Admin responde y usuario marca leído" on public.support_tickets
  for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  );

-- 3. Activar Realtime en support_tickets para que la respuesta llegue al instante a la campanita
alter table public.support_tickets replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 1. Ampliar tabla profiles para DJs (Subgéneros extra, Redes Sociales y Datos de Promotores)
alter table public.profiles
  add column if not exists secondary_subgenres text[] default '{}',
  add column if not exists instagram_url text,
  add column if not exists spotify_url text,
  add column if not exists tiktok_url text,
  add column if not exists youtube_url text,
  add column if not exists booking_fee text default '',
  add column if not exists is_fee_negotiable boolean default true,
  add column if not exists willing_to_travel boolean default true,
  add column if not exists available_dates text[] default '{}';

-- 2. Refrescar inmediatamente la caché del esquema
notify pgrst, 'reload schema';

-- 1. Añadir 'Club' (Club / Sala) a los roles permitidos en profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('DJ', 'Promotor', 'Raver', 'Club', 'Admin'));

-- 2. Vincular eventos con un usuario tipo 'Club' si se selecciona una sala registrada
alter table public.events
  add column if not exists venue_id uuid references public.profiles(id) on delete set null;

-- 3. Guardar el tipo de usuario en los tickets de soporte para verlo en /admin
alter table public.support_tickets
  add column if not exists user_role text default 'Raver';

-- 4. Permitir borrar asistencia (Deshacer "Voy a ir") y expulsar miembros de grupos privados
drop policy if exists "Usuarios marcan asistencia" on public.event_attendees;
create policy "Usuarios marcan asistencia" on public.event_attendees
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Creador gestiona participantes de grupo" on public.chat_participants;
create policy "Creador gestiona participantes de grupo" on public.chat_participants
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.chat_rooms cr
      where cr.id = room_id and cr.created_by = auth.uid()
    )
  );

notify pgrst, 'reload schema';

-- ============================================================================
-- 1. FUNCIÓN AUTOMÁTICA DE LIMPIEZA DE ARCHIVOS HUÉRFANOS EN STORAGE
-- ============================================================================
create or replace function public.cleanup_orphaned_storage_objects()
returns void as $$
declare
  used_urls text[];
begin
  -- Permitir borrado directo sobre storage.objects desde funciones internas de Postgres
  perform set_config('storage.allow_delete_query', 'true', true);

  -- Recopilar todas las URLs y rutas actualmente en uso en todas las tablas
  select array_agg(distinct ref) into used_urls
  from (
    -- 1. Avatares y audios principales en profiles
    select avatar_url as ref from public.profiles where avatar_url is not null
    union
    select dj_audio_url as ref from public.profiles where dj_audio_url is not null
    union
    -- 2. Galería multimedia de DJs (vídeos, canciones y fotos en JSONB)
    select elem->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.dj_media, '[]'::jsonb)) as elem
    where elem->>'url' is not null
    union
    -- 3. Carteles, vídeos y audios en events
    select image_url as ref from public.events where image_url is not null
    union
    select video_url as ref from public.events where video_url is not null
    union
    select audio_url as ref from public.events where audio_url is not null
    union
    -- 4. Rutas directas almacenadas en media_storage_paths de events
    select unnest(media_storage_paths) as ref from public.events where media_storage_paths is not null
    union
    -- 5. Avatares de DJs personalizados dentro del JSONB lineup de events
    select slot->>'avatar_url' as ref
    from public.events e,
    lateral jsonb_array_elements(coalesce(e.lineup, '[]'::jsonb)) as slot
    where slot->>'avatar_url' is not null
    union
    -- 6. Avatares cacheados en mensajes de chat
    select sender_avatar as ref from public.chat_messages where sender_avatar is not null
  ) as all_refs
  where ref is not null and ref <> '';

  if used_urls is null then
    used_urls := array[]::text[];
  end if;

  -- Borrar de storage.objects cualquier archivo en nuestros buckets cuyo nombre/ruta no aparezca en ningún registro
  delete from storage.objects so
  where so.bucket_id in ('avatars', 'flyers', 'event-media')
    and not exists (
      select 1
      from unnest(used_urls) as u(ref_str)
      where u.ref_str = so.name
         or u.ref_str like '%' || so.bucket_id || '/' || so.name || '%'
         or u.ref_str like '%/' || so.name
    );

exception when others then
  -- Evita bloquear una transacción de usuario si algún permiso interno de storage difiere
  raise notice 'Aviso limpieza storage: %', sqlerrm;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 2. TRIGGERS AUTOMÁTICOS AL ACTUALIZAR O BORRAR PERFILES Y EVENTOS
-- ============================================================================
create or replace function public.trigger_cleanup_orphaned_storage()
returns trigger as $$
begin
  perform public.cleanup_orphaned_storage_objects();
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_cleanup_storage_on_profiles on public.profiles;
create trigger trg_cleanup_storage_on_profiles
  after update or delete on public.profiles
  for each statement
  execute procedure public.trigger_cleanup_orphaned_storage();

drop trigger if exists trg_cleanup_storage_on_events on public.events;
create trigger trg_cleanup_storage_on_events
  after update or delete on public.events
  for each statement
  execute procedure public.trigger_cleanup_orphaned_storage();

-- Ejecutar una primera limpieza inmediata ahora mismo
select public.cleanup_orphaned_storage_objects();

-- 1. Añadir soporte PRO común a todos los usuarios en profiles
alter table public.profiles
  add column if not exists is_pro boolean default false,
  add column if not exists pro_until timestamp with time zone,
  add column if not exists street_address text default '';

-- 2. Añadir columna street_address en events para separar el Club de la Calle y Número exacto
alter table public.events
  add column if not exists street_address text default '';

-- 3. Refrescar inmediatamente la caché del esquema
notify pgrst, 'reload schema';

-- 1. Añadir Web Oficial, Vídeo del Club y Galería de Fotos para perfiles tipo 'Club'
alter table public.profiles
  add column if not exists website_url text,
  add column if not exists club_video_url text,
  add column if not exists club_media jsonb default '[]'::jsonb;

-- 2. Actualizar la función de limpieza de Storage para proteger también los vídeos y fotos de los Clubs
create or replace function public.cleanup_orphaned_storage_objects()
returns void as $$
declare
  used_urls text[];
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  select array_agg(distinct ref) into used_urls
  from (
    select avatar_url as ref from public.profiles where avatar_url is not null
    union
    select dj_audio_url as ref from public.profiles where dj_audio_url is not null
    union
    select club_video_url as ref from public.profiles where club_video_url is not null
    union
    select elem->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.dj_media, '[]'::jsonb)) as elem
    where elem->>'url' is not null
    union
    select elem2->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.club_media, '[]'::jsonb)) as elem2
    where elem2->>'url' is not null
    union
    select image_url as ref from public.events where image_url is not null
    union
    select video_url as ref from public.events where video_url is not null
    union
    select audio_url as ref from public.events where audio_url is not null
    union
    select unnest(media_storage_paths) as ref from public.events where media_storage_paths is not null
    union
    select slot->>'avatar_url' as ref
    from public.events e,
    lateral jsonb_array_elements(coalesce(e.lineup, '[]'::jsonb)) as slot
    where slot->>'avatar_url' is not null
    union
    select sender_avatar as ref from public.chat_messages where sender_avatar is not null
  ) as all_refs
  where ref is not null and ref <> '';

  if used_urls is null then
    used_urls := array[]::text[];
  end if;

  delete from storage.objects so
  where so.bucket_id in ('avatars', 'flyers', 'event-media')
    and not exists (
      select 1
      from unnest(used_urls) as u(ref_str)
      where u.ref_str = so.name
         or u.ref_str like '%' || so.bucket_id || '/' || so.name || '%'
         or u.ref_str like '%/' || so.name
    );

exception when others then
  raise notice 'Aviso limpieza storage: %', sqlerrm;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';

-- 1. Añadir columna de canción oficial para los perfiles tipo 'Club'
alter table public.profiles
  add column if not exists club_audio_url text;

-- 2. Actualizar la función de limpieza automática de Storage para proteger también club_audio_url
create or replace function public.cleanup_orphaned_storage_objects()
returns void as $$
declare
  used_urls text[];
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  select array_agg(distinct ref) into used_urls
  from (
    select avatar_url as ref from public.profiles where avatar_url is not null
    union
    select dj_audio_url as ref from public.profiles where dj_audio_url is not null
    union
    select club_audio_url as ref from public.profiles where club_audio_url is not null
    union
    select club_video_url as ref from public.profiles where club_video_url is not null
    union
    select elem->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.dj_media, '[]'::jsonb)) as elem
    where elem->>'url' is not null
    union
    select elem2->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.club_media, '[]'::jsonb)) as elem2
    where elem2->>'url' is not null
    union
    select image_url as ref from public.events where image_url is not null
    union
    select video_url as ref from public.events where video_url is not null
    union
    select audio_url as ref from public.events where audio_url is not null
    union
    select unnest(media_storage_paths) as ref from public.events where media_storage_paths is not null
    union
    select slot->>'avatar_url' as ref
    from public.events e,
    lateral jsonb_array_elements(coalesce(e.lineup, '[]'::jsonb)) as slot
    where slot->>'avatar_url' is not null
    union
    select sender_avatar as ref from public.chat_messages where sender_avatar is not null
  ) as all_refs
  where ref is not null and ref <> '';

  if used_urls is null then
    used_urls := array[]::text[];
  end if;

  delete from storage.objects so
  where so.bucket_id in ('avatars', 'flyers', 'event-media')
    and not exists (
      select 1
      from unnest(used_urls) as u(ref_str)
      where u.ref_str = so.name
         or u.ref_str like '%' || so.bucket_id || '/' || so.name || '%'
         or u.ref_str like '%/' || so.name
    );

exception when others then
  raise notice 'Aviso limpieza storage: %', sqlerrm;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';

-- Añadir lista de promotores (registrados o externos) a la tabla events
alter table public.events
  add column if not exists promoters_list jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';

-- 1. Hacer independientes "Voy a ir" (is_going) y "Busco Rave Squad" (looking_for_squad)
alter table public.event_attendees
  add column if not exists is_going boolean default false,
  add column if not exists looking_for_squad boolean default false;

-- Migrar los datos existentes según el valor que tenían en status
update public.event_attendees
set is_going = true
where status = 'going' and is_going = false;

update public.event_attendees
set looking_for_squad = true
where status = 'looking_for_squad' and looking_for_squad = false;

notify pgrst, 'reload schema';

-- 1. Tabla de configuración global para el interruptor de auto-aprobar perfiles en /admin
create table if not exists public.app_settings (
  id text primary key default 'global',
  auto_approve_roles boolean default false,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

insert into public.app_settings (id, auto_approve_roles)
values ('global', false)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Lectura pública de configuración" on public.app_settings;
create policy "Lectura pública de configuración" on public.app_settings
  for select using (true);

drop policy if exists "Admin actualiza configuración" on public.app_settings;
create policy "Admin actualiza configuración" on public.app_settings
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  );

-- 2. Tabla de solicitudes de verificación de rol (DJ, Promotor, Club)
create table if not exists public.role_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  user_email text,
  requested_role text check (requested_role in ('DJ', 'Promotor', 'Club')) not null,
  message text not null,
  requested_lat double precision,
  requested_lng double precision,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  user_read_resolution boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  resolved_at timestamp with time zone
);

alter table public.role_requests enable row level security;

drop policy if exists "Usuarios ven sus peticiones y Admin ve todas" on public.role_requests;
create policy "Usuarios ven sus peticiones y Admin ve todas" on public.role_requests
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  );

drop policy if exists "Usuarios crean peticiones de rol" on public.role_requests;
create policy "Usuarios crean peticiones de rol" on public.role_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admin resuelve peticiones y usuario marca leído" on public.role_requests;
create policy "Admin resuelve peticiones y usuario marca leído" on public.role_requests
  for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  );

-- Permitir al Admin cambiar el rol del perfil cuando aprueba la solicitud
drop policy if exists "Actualizar perfil propio o por Admin" on public.profiles;
create policy "Actualizar perfil propio o por Admin" on public.profiles
  for update using (
    auth.role() = 'authenticated'
  );

-- 3. Activar Realtime en role_requests y app_settings
alter table public.role_requests replica identity full;
alter table public.app_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'role_requests'
  ) then
    alter publication supabase_realtime add table public.role_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 1. PUNTO 1: Corregir permisos RLS de app_settings (INSERT + UPDATE) para que la casilla de /admin no se desmarque al actualizar
alter table public.app_settings enable row level security;

drop policy if exists "Lectura pública de configuración" on public.app_settings;
create policy "Lectura pública de configuración" on public.app_settings
  for select using (true);

drop policy if exists "Admin actualiza configuración" on public.app_settings;
drop policy if exists "Admin gestiona configuración" on public.app_settings;
create policy "Admin gestiona configuración" on public.app_settings
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'Admin')
    )
  );

insert into public.app_settings (id, auto_approve_roles)
values ('global', false)
on conflict (id) do nothing;

-- 2. PUNTO 3: Columna para mostrar la notificación de bienvenida la primera vez que se registra un usuario
alter table public.profiles
  add column if not exists welcome_notif_read boolean default false;

-- 3. PUNTO 6: Tabla de Ofertas de Colaboración (creadas por Clubs y Promotores)
create table if not exists public.collab_offers (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  image_url text,
  target_roles text[] not null default '{DJ}',
  status text check (status in ('active', 'closed')) default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table public.collab_offers enable row level security;

drop policy if exists "Usuarios ven ofertas de colaboración" on public.collab_offers;
create policy "Usuarios ven ofertas de colaboración" on public.collab_offers
  for select using (auth.role() = 'authenticated');

drop policy if exists "Clubs y Promotores crean y editan sus ofertas" on public.collab_offers;
create policy "Clubs y Promotores crean y editan sus ofertas" on public.collab_offers
  for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

-- 4. PUNTO 6: Permitir salas de chat de tipo 'collab' independientes de los chats de amigos
alter table public.chat_rooms drop constraint if exists chat_rooms_type_check;
alter table public.chat_rooms
  add constraint chat_rooms_type_check check (type in ('event', 'direct', 'private_group', 'collab'));

alter table public.chat_rooms
  add column if not exists collab_offer_id uuid references public.collab_offers(id) on delete set null;

-- 5. PUNTO 6: Tabla de Vínculos de Colaboración (cuando alguien aplica a una oferta o cuando un Club/Promotor se la envía)
create table if not exists public.collab_links (
  id uuid default gen_random_uuid() primary key,
  offer_id uuid references public.collab_offers(id) on delete cascade not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  target_user_id uuid references public.profiles(id) on delete cascade not null,
  direction text check (direction in ('applied', 'invited')) not null,
  initial_message text not null,
  room_id uuid references public.chat_rooms(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(offer_id, target_user_id)
);

alter table public.collab_links enable row level security;

drop policy if exists "Lectura de vínculos de colaboración" on public.collab_links;
create policy "Lectura de vínculos de colaboración" on public.collab_links
  for select using (auth.uid() = creator_id or auth.uid() = target_user_id);

drop policy if exists "Crear vínculos de colaboración" on public.collab_links;
create policy "Crear vínculos de colaboración" on public.collab_links
  for insert with check (auth.uid() = creator_id or auth.uid() = target_user_id);

-- 6. Proteger también las imágenes de collab_offers en la limpieza automática de Storage
create or replace function public.cleanup_orphaned_storage_objects()
returns void as $$
declare
  used_urls text[];
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  select array_agg(distinct ref) into used_urls
  from (
    select avatar_url as ref from public.profiles where avatar_url is not null
    union
    select dj_audio_url as ref from public.profiles where dj_audio_url is not null
    union
    select club_audio_url as ref from public.profiles where club_audio_url is not null
    union
    select club_video_url as ref from public.profiles where club_video_url is not null
    union
    select elem->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.dj_media, '[]'::jsonb)) as elem
    where elem->>'url' is not null
    union
    select elem2->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.club_media, '[]'::jsonb)) as elem2
    where elem2->>'url' is not null
    union
    select image_url as ref from public.events where image_url is not null
    union
    select video_url as ref from public.events where video_url is not null
    union
    select audio_url as ref from public.events where audio_url is not null
    union
    select unnest(media_storage_paths) as ref from public.events where media_storage_paths is not null
    union
    select slot->>'avatar_url' as ref
    from public.events e,
    lateral jsonb_array_elements(coalesce(e.lineup, '[]'::jsonb)) as slot
    where slot->>'avatar_url' is not null
    union
    select sender_avatar as ref from public.chat_messages where sender_avatar is not null
    union
    select image_url as ref from public.collab_offers where image_url is not null
  ) as all_refs
  where ref is not null and ref <> '';

  if used_urls is null then
    used_urls := array[]::text[];
  end if;

  delete from storage.objects so
  where so.bucket_id in ('avatars', 'flyers', 'event-media')
    and not exists (
      select 1
      from unnest(used_urls) as u(ref_str)
      where u.ref_str = so.name
         or u.ref_str like '%' || so.bucket_id || '/' || so.name || '%'
         or u.ref_str like '%/' || so.name
    );

exception when others then
  raise notice 'Aviso limpieza storage: %', sqlerrm;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';

-- Añadir fecha de creación a profiles para la gráfica de evolución de usuarios en /admin
alter table public.profiles
  add column if not exists created_at timestamp with time zone default timezone('utc'::text, now());

notify pgrst, 'reload schema';

-- 1. Añadir soporte de "Solo por Invitación" a la tabla events
alter table public.events
  add column if not exists is_invite_only boolean default false;

-- 2. Tabla de Invitaciones y Solicitudes de Permiso para Eventos
create table if not exists public.event_invitations (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  invited_by uuid references public.profiles(id) on delete set null,
  direction text check (direction in ('invited', 'requested')) not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
  user_read_notification boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(event_id, user_id)
);

alter table public.event_invitations enable row level security;

drop policy if exists "Lectura de invitaciones de eventos" on public.event_invitations;
create policy "Lectura de invitaciones de eventos" on public.event_invitations
  for select using (auth.role() = 'authenticated');

drop policy if exists "Crear invitaciones o pedir permiso" on public.event_invitations;
create policy "Crear invitaciones o pedir permiso" on public.event_invitations
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Actualizar estado de invitaciones" on public.event_invitations;
create policy "Actualizar estado de invitaciones" on public.event_invitations
  for update using (auth.role() = 'authenticated');

drop policy if exists "Borrar invitaciones" on public.event_invitations;
create policy "Borrar invitaciones" on public.event_invitations
  for delete using (auth.role() = 'authenticated');

-- Permitir que el organizador pueda insertar automáticamente el "Voy a ir" del usuario al aceptar su solicitud
drop policy if exists "Insertar asistencia propia o por organizador" on public.event_attendees;
create policy "Insertar asistencia propia o por organizador" on public.event_attendees
  for insert with check (auth.role() = 'authenticated');

-- 3. Activar Realtime en event_invitations
alter table public.event_invitations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'event_invitations'
  ) then
    alter publication supabase_realtime add table public.event_invitations;
  end if;
end $$;

notify pgrst, 'reload schema';

create table if not exists public.billing (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text,                       -- active, trialing, past_due, canceled, unpaid...
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean default false,
  updated_at timestamp with time zone default now()
);

alter table public.billing enable row level security;

drop policy if exists "billing: cada uno ve lo suyo" on public.billing;
create policy "billing: cada uno ve lo suyo" on public.billing
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Sin políticas de insert/update/delete: desde la app no se puede escribir.


-- ---------------------------------------------------------------------------
-- 2. Protección de columnas sensibles de profiles
--    · Webhook de Stripe (service_role) y panel de Supabase: pueden todo.
--    · Admin de la app: puede cambiar is_pro y role de cualquiera (panel /admin),
--      pero no is_admin.
--    · Usuario normal en SU perfil: todo menos is_pro, pro_until, is_admin
--      y hacerse role = 'Admin'.
--    · Usuario normal en perfil AJENO: solo hype_score (botón de hype a un DJ).
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  requester uuid := auth.uid();
  requester_is_admin boolean := false;
  kept_hype int;
begin
  -- Solo se filtran las peticiones que vienen de la app con la anon key
  if jwt_role not in ('authenticated', 'anon') then
    return new;
  end if;

  select coalesce(p.is_admin, false) or p.role = 'Admin'
    into requester_is_admin
    from public.profiles p
   where p.id = requester;
  requester_is_admin := coalesce(requester_is_admin, false);

  if tg_op = 'INSERT' then
    new.is_admin := false;
    if not requester_is_admin then
      new.is_pro := false;
      new.pro_until := null;
      if new.role = 'Admin' then new.role := 'Raver'; end if;
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  -- Nadie desde la app toca is_admin (solo desde el panel de Supabase)
  new.is_admin := old.is_admin;

  if requester_is_admin then
    return new;
  end if;

  if requester is distinct from old.id then
    -- Perfil de otra persona: solo se acepta el cambio del contador de hype
    kept_hype := new.hype_score;
    new := old;
    new.hype_score := kept_hype;
    return new;
  end if;

  -- Su propio perfil
  new.is_pro := old.is_pro;
  new.pro_until := old.pro_until;
  if new.role = 'Admin' and old.role is distinct from 'Admin' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_is_pro on public.profiles;          -- versión anterior (no usar)
drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();


-- ---------------------------------------------------------------------------
-- 3. Storage: leer público, subir solo con sesión, editar/borrar solo lo tuyo
-- ---------------------------------------------------------------------------
drop policy if exists "Subida y borrado de event-media" on storage.objects;
drop policy if exists "event-media: subir con sesion" on storage.objects;
drop policy if exists "event-media: editar lo propio" on storage.objects;
drop policy if exists "event-media: borrar lo propio" on storage.objects;

create policy "event-media: subir con sesion" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-media');
create policy "event-media: editar lo propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-media' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'event-media' and owner_id = (select auth.uid()::text));
create policy "event-media: borrar lo propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-media' and owner_id = (select auth.uid()::text));

drop policy if exists "Subir avatares" on storage.objects;
drop policy if exists "Subir y actualizar avatares" on storage.objects;
drop policy if exists "avatars: subir con sesion" on storage.objects;
drop policy if exists "avatars: editar lo propio" on storage.objects;
drop policy if exists "avatars: borrar lo propio" on storage.objects;

create policy "avatars: subir con sesion" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');
create policy "avatars: editar lo propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));
create policy "avatars: borrar lo propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

-- Las políticas de lectura pública ("Lectura pública de event-media",
-- "Avatares públicos", "Flyers públicos") y "Subida de flyers autenticada" se mantienen.


-- ---------------------------------------------------------------------------
-- 4. Tamaño máximo por archivo en el servidor (= máximo del plan PRO)
--    La app ya lo comprueba por plan; esto evita que alguien se lo salte.
-- ---------------------------------------------------------------------------
update storage.buckets set file_size_limit = 100 * 1024 * 1024 where id = 'event-media';
update storage.buckets set file_size_limit = 10 * 1024 * 1024  where id = 'flyers';
update storage.buckets set file_size_limit = 10 * 1024 * 1024  where id = 'avatars';

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Comprobación rápida (opcional): debe devolver la fila del trigger
select tgname from pg_trigger where tgname = 'trg_protect_profile_fields';
-- ---------------------------------------------------------------------------
-- 1. Quitar los triggers que lanzaban la limpieza en cada update
drop trigger if exists trg_cleanup_storage_on_profiles on public.profiles;
drop trigger if exists trg_cleanup_storage_on_events on public.events;

-- 2. Misma función que tenías (versión con collab_offers) + filtro de 24 h
create or replace function public.cleanup_orphaned_storage_objects()
returns void as $$
declare
  used_urls text[];
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  select array_agg(distinct ref) into used_urls
  from (
    select avatar_url as ref from public.profiles where avatar_url is not null
    union
    select dj_audio_url as ref from public.profiles where dj_audio_url is not null
    union
    select club_audio_url as ref from public.profiles where club_audio_url is not null
    union
    select club_video_url as ref from public.profiles where club_video_url is not null
    union
    select elem->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.dj_media, '[]'::jsonb)) as elem
    where elem->>'url' is not null
    union
    select elem2->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.club_media, '[]'::jsonb)) as elem2
    where elem2->>'url' is not null
    union
    select image_url as ref from public.events where image_url is not null
    union
    select video_url as ref from public.events where video_url is not null
    union
    select audio_url as ref from public.events where audio_url is not null
    union
    select unnest(media_storage_paths) as ref from public.events where media_storage_paths is not null
    union
    select slot->>'avatar_url' as ref
    from public.events e,
    lateral jsonb_array_elements(coalesce(e.lineup, '[]'::jsonb)) as slot
    where slot->>'avatar_url' is not null
    union
    select sender_avatar as ref from public.chat_messages where sender_avatar is not null
    union
    select image_url as ref from public.collab_offers where image_url is not null
  ) as all_refs
  where ref is not null and ref <> '';

  if used_urls is null then
    used_urls := array[]::text[];
  end if;

  delete from storage.objects so
  where so.bucket_id in ('avatars', 'flyers', 'event-media')
    -- Solo archivos con más de 24 h: lo recién subido puede no estar guardado aún en su tabla
    and so.created_at < now() - interval '24 hours'
    and not exists (
      select 1
      from unnest(used_urls) as u(ref_str)
      where u.ref_str = so.name
         or u.ref_str like '%' || so.bucket_id || '/' || so.name || '%'
         or u.ref_str like '%/' || so.name
    );

exception when others then
  raise notice 'Aviso limpieza storage: %', sqlerrm;
end;
$$ language plpgsql security definer;

-- 3. Programarla a diario (04:30 UTC). pg_cron viene incluido en Supabase.
create extension if not exists pg_cron;
select cron.schedule(
  'ravexradar-limpieza-storage',
  '30 4 * * *',
  $cron$ select public.cleanup_orphaned_storage_objects(); $cron$
);

-- (Opcional) Borrar eventos de hace más de un mes, que ya tenías como función:
select cron.schedule('ravexradar-borrar-eventos-viejos', '0 5 * * *',
  $cron$ select public.delete_events_older_than_one_month(); $cron$);

create table if not exists public.billing (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  status text,                       -- active, trialing, past_due, canceled, unpaid...
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean default false,
  updated_at timestamp with time zone default now()
);

alter table public.billing enable row level security;

drop policy if exists "billing: cada uno ve lo suyo" on public.billing;
create policy "billing: cada uno ve lo suyo" on public.billing
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Sin políticas de insert/update/delete: desde la app no se puede escribir.


-- ---------------------------------------------------------------------------
-- 2. Protección de columnas sensibles de profiles
--    · Webhook de Stripe (service_role) y panel de Supabase: pueden todo.
--    · Admin de la app: puede cambiar is_pro y role de cualquiera (panel /admin),
--      pero no is_admin.
--    · Usuario normal en SU perfil: todo menos is_pro, pro_until, is_admin
--      y hacerse role = 'Admin'.
--    · Usuario normal en perfil AJENO: solo hype_score (botón de hype a un DJ).
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  requester uuid := auth.uid();
  requester_is_admin boolean := false;
  kept_hype int;
begin
  -- Solo se filtran las peticiones que vienen de la app con la anon key
  if jwt_role not in ('authenticated', 'anon') then
    return new;
  end if;

  select coalesce(p.is_admin, false) or p.role = 'Admin'
    into requester_is_admin
    from public.profiles p
   where p.id = requester;
  requester_is_admin := coalesce(requester_is_admin, false);

  if tg_op = 'INSERT' then
    new.is_admin := false;
    if not requester_is_admin then
      new.is_pro := false;
      new.pro_until := null;
      if new.role = 'Admin' then new.role := 'Raver'; end if;
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  -- Nadie desde la app toca is_admin (solo desde el panel de Supabase)
  new.is_admin := old.is_admin;

  if requester_is_admin then
    return new;
  end if;

  if requester is distinct from old.id then
    -- Perfil de otra persona: solo se acepta el cambio del contador de hype
    kept_hype := new.hype_score;
    new := old;
    new.hype_score := kept_hype;
    return new;
  end if;

  -- Su propio perfil
  new.is_pro := old.is_pro;
  new.pro_until := old.pro_until;
  if new.role = 'Admin' and old.role is distinct from 'Admin' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_is_pro on public.profiles;          -- versión anterior (no usar)
drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();


-- ---------------------------------------------------------------------------
-- 3. Storage: leer público, subir solo con sesión, editar/borrar solo lo tuyo
-- ---------------------------------------------------------------------------
drop policy if exists "Subida y borrado de event-media" on storage.objects;
drop policy if exists "event-media: subir con sesion" on storage.objects;
drop policy if exists "event-media: editar lo propio" on storage.objects;
drop policy if exists "event-media: borrar lo propio" on storage.objects;

create policy "event-media: subir con sesion" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-media');
create policy "event-media: editar lo propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-media' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'event-media' and owner_id = (select auth.uid()::text));
create policy "event-media: borrar lo propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-media' and owner_id = (select auth.uid()::text));

drop policy if exists "Subir avatares" on storage.objects;
drop policy if exists "Subir y actualizar avatares" on storage.objects;
drop policy if exists "avatars: subir con sesion" on storage.objects;
drop policy if exists "avatars: editar lo propio" on storage.objects;
drop policy if exists "avatars: borrar lo propio" on storage.objects;

create policy "avatars: subir con sesion" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');
create policy "avatars: editar lo propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));
create policy "avatars: borrar lo propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));

-- Las políticas de lectura pública ("Lectura pública de event-media",
-- "Avatares públicos", "Flyers públicos") y "Subida de flyers autenticada" se mantienen.


-- ---------------------------------------------------------------------------
-- 4. Tamaño máximo por archivo en el servidor (= máximo del plan PRO)
--    La app ya lo comprueba por plan; esto evita que alguien se lo salte.
-- ---------------------------------------------------------------------------
update storage.buckets set file_size_limit = 100 * 1024 * 1024 where id = 'event-media';
update storage.buckets set file_size_limit = 10 * 1024 * 1024  where id = 'flyers';
update storage.buckets set file_size_limit = 10 * 1024 * 1024  where id = 'avatars';

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Comprobación rápida (opcional): debe devolver la fila del trigger
-- select tgname from pg_trigger where tgname = 'trg_protect_profile_fields';
-- ---------------------------------------------------------------------------

-- 1. Quitar los triggers que lanzaban la limpieza en cada update
drop trigger if exists trg_cleanup_storage_on_profiles on public.profiles;
drop trigger if exists trg_cleanup_storage_on_events on public.events;

-- 2. Misma función que tenías (versión con collab_offers) + filtro de 24 h
--    + bucket event-media-pro (archivos de usuarios PRO, ver 03)
create or replace function public.cleanup_orphaned_storage_objects()
returns void as $$
declare
  used_urls text[];
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  select array_agg(distinct ref) into used_urls
  from (
    select avatar_url as ref from public.profiles where avatar_url is not null
    union
    select dj_audio_url as ref from public.profiles where dj_audio_url is not null
    union
    select club_audio_url as ref from public.profiles where club_audio_url is not null
    union
    select club_video_url as ref from public.profiles where club_video_url is not null
    union
    select elem->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.dj_media, '[]'::jsonb)) as elem
    where elem->>'url' is not null
    union
    select elem2->>'url' as ref
    from public.profiles p,
    lateral jsonb_array_elements(coalesce(p.club_media, '[]'::jsonb)) as elem2
    where elem2->>'url' is not null
    union
    select image_url as ref from public.events where image_url is not null
    union
    select video_url as ref from public.events where video_url is not null
    union
    select audio_url as ref from public.events where audio_url is not null
    union
    select unnest(media_storage_paths) as ref from public.events where media_storage_paths is not null
    union
    select slot->>'avatar_url' as ref
    from public.events e,
    lateral jsonb_array_elements(coalesce(e.lineup, '[]'::jsonb)) as slot
    where slot->>'avatar_url' is not null
    union
    select sender_avatar as ref from public.chat_messages where sender_avatar is not null
    union
    select image_url as ref from public.collab_offers where image_url is not null
  ) as all_refs
  where ref is not null and ref <> '';

  if used_urls is null then
    used_urls := array[]::text[];
  end if;

  delete from storage.objects so
  where so.bucket_id in ('avatars', 'flyers', 'event-media', 'event-media-pro')
    -- Solo archivos con más de 24 h: lo recién subido puede no estar guardado aún en su tabla
    and so.created_at < now() - interval '24 hours'
    and not exists (
      select 1
      from unnest(used_urls) as u(ref_str)
      where u.ref_str = so.name
         or u.ref_str like '%' || so.bucket_id || '/' || so.name || '%'
         or u.ref_str like '%/' || so.name
    );

exception when others then
  raise notice 'Aviso limpieza storage: %', sqlerrm;
end;
$$ language plpgsql security definer;

-- 3. Programarla a diario (04:30 UTC). pg_cron viene incluido en Supabase.
create extension if not exists pg_cron;
select cron.schedule(
  'ravexradar-limpieza-storage',
  '30 4 * * *',
  $cron$ select public.cleanup_orphaned_storage_objects(); $cron$
);

-- (Opcional) Borrar eventos de hace más de un mes, que ya tenías como función:
-- select cron.schedule('ravexradar-borrar-eventos-viejos', '0 5 * * *',
--   $cron$ select public.delete_events_older_than_one_month(); $cron$);

create or replace function public.user_is_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_pro is true
       and (p.pro_until is null or p.pro_until > now() - interval '3 days')
      from public.profiles p
     where p.id = uid
  ), false);
$$;

-- Límite de cada plan (= PLAN_LIMITS de proConfig.js)
create or replace function public.plan_limit(uid uuid, limit_key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.user_is_pro(uid) then
      case limit_key
        when 'maxActiveEvents'       then 30
        when 'maxStagesPerEvent'     then 10
        when 'maxDjMediaItems'       then 30
        when 'maxGalleryPhotos'      then 30
        when 'maxPrivateGroups'      then 20
        when 'maxSecondarySubgenres' then 5
      end
    else
      case limit_key
        when 'maxActiveEvents'       then 5
        when 'maxStagesPerEvent'     then 2
        when 'maxDjMediaItems'       then 4
        when 'maxGalleryPhotos'      then 4
        when 'maxPrivateGroups'      then 2
        when 'maxSecondarySubgenres' then 2
      end
  end;
$$;

-- ¿La fiesta sigue activa? (igual que evaluateEventTiming de la web, hora de Madrid)
create or replace function public.event_is_active(d date, t time, dur int)
returns boolean
language sql
stable
as $$
  select d is null
      or ((d + coalesce(t, time '23:00')) at time zone 'Europe/Madrid')
         + make_interval(hours => coalesce(nullif(dur, 0), 12)) > now();
$$;

-- Nº de escenarios distintos usados en el lineup de una fiesta
create or replace function public.lineup_stage_count(lineup jsonb)
returns int
language sql
immutable
as $$
  select count(distinct coalesce(nullif(trim(slot->>'stage'), ''), 'Main Stage'))::int
    from jsonb_array_elements(case when jsonb_typeof(lineup) = 'array' then lineup else '[]'::jsonb end) slot
   where jsonb_typeof(slot) = 'object';
$$;


-- ---------------------------------------------------------------------------
-- 2. Fiestas: nº de fiestas activas y escenarios por fiesta
-- ---------------------------------------------------------------------------
create or replace function public.enforce_event_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  max_events int;
  others_active int;
  max_stages int;
  new_stages int;
  old_stages int := 0;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or uid is null then
    return new;
  end if;

  -- Escenarios: solo se bloquea si la fiesta pasa a tener MÁS de los permitidos
  max_stages := public.plan_limit(uid, 'maxStagesPerEvent');
  new_stages := public.lineup_stage_count(new.lineup);
  if tg_op = 'UPDATE' then
    old_stages := public.lineup_stage_count(old.lineup);
  end if;
  if new_stages > max_stages and new_stages > old_stages then
    raise exception 'Has alcanzado el límite de % escenarios por fiesta de tu plan.', max_stages
      using errcode = 'P0001';
  end if;

  -- Fiestas activas (al publicar una nueva). Otra fecha de una fiesta que ya
  -- tienes activa (mismo nombre) no cuenta como fiesta nueva, igual que en la web.
  if tg_op = 'INSERT' and public.event_is_active(new.start_date, new.start_time, new.duration_hours) then
    max_events := public.plan_limit(uid, 'maxActiveEvents');
    select count(distinct lower(trim(e.name)))
      into others_active
      from public.events e
     where e.created_by = uid
       and lower(trim(e.name)) <> lower(trim(new.name))
       and public.event_is_active(e.start_date, e.start_time, e.duration_hours);
    if others_active + 1 > max_events then
      raise exception 'Has alcanzado el límite de % fiestas activas de tu plan.', max_events
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_event_limits on public.events;
create trigger trg_enforce_event_limits
  before insert or update on public.events
  for each row execute function public.enforce_event_limits();


-- ---------------------------------------------------------------------------
-- 3. Grupos de chat privados creados por cada usuario
-- ---------------------------------------------------------------------------
create or replace function public.enforce_private_group_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  max_groups int;
  current_groups int;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or uid is null or new.type <> 'private_group' then
    return new;
  end if;
  max_groups := public.plan_limit(uid, 'maxPrivateGroups');
  select count(*) into current_groups
    from public.chat_rooms
   where type = 'private_group' and created_by = uid;
  if current_groups >= max_groups then
    raise exception 'Has alcanzado el límite de % grupos privados de tu plan.', max_groups
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_private_group_limit on public.chat_rooms;
create trigger trg_enforce_private_group_limit
  before insert on public.chat_rooms
  for each row execute function public.enforce_private_group_limit();


-- ---------------------------------------------------------------------------
-- 4. Perfil: galería del DJ, galería de club/promotor y subgéneros
--    Solo se bloquea al AÑADIR por encima del límite: si alguien deja de ser PRO
--    con 30 elementos, puede seguir editando y borrando, pero no añadir.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_len int;
  old_len int;
  max_len int;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  -- Galería del DJ (sesiones, canciones y fotos)
  new_len := case when jsonb_typeof(new.dj_media) = 'array' then jsonb_array_length(new.dj_media) else 0 end;
  old_len := case when jsonb_typeof(old.dj_media) = 'array' then jsonb_array_length(old.dj_media) else 0 end;
  max_len := public.plan_limit(new.id, 'maxDjMediaItems');
  if new_len > max_len and new_len > old_len then
    raise exception 'Has alcanzado el límite de % elementos en tu galería.', max_len using errcode = 'P0001';
  end if;

  -- Galería de fotos de club / promotor
  new_len := case when jsonb_typeof(new.club_media) = 'array' then jsonb_array_length(new.club_media) else 0 end;
  old_len := case when jsonb_typeof(old.club_media) = 'array' then jsonb_array_length(old.club_media) else 0 end;
  max_len := public.plan_limit(new.id, 'maxGalleryPhotos');
  if new_len > max_len and new_len > old_len then
    raise exception 'Has alcanzado el límite de % fotos en tu galería.', max_len using errcode = 'P0001';
  end if;

  -- Subgéneros secundarios
  new_len := coalesce(array_length(new.secondary_subgenres, 1), 0);
  old_len := coalesce(array_length(old.secondary_subgenres, 1), 0);
  max_len := public.plan_limit(new.id, 'maxSecondarySubgenres');
  if new_len > max_len and new_len > old_len then
    raise exception 'Has alcanzado el límite de % subgéneros de tu plan.', max_len using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_limits on public.profiles;
create trigger trg_enforce_profile_limits
  before update on public.profiles
  for each row execute function public.enforce_profile_limits();


-- ---------------------------------------------------------------------------
-- 5. Tamaño de archivo por plan
--    Supabase limita el tamaño por bucket, así que hay dos buckets de media:
--      · event-media      → máx. 30 MB por archivo (plan gratis)
--      · event-media-pro  → máx. 100 MB por archivo, solo pueden subir los PRO
--    La web ya sube a uno u otro según el plan del usuario.
-- ---------------------------------------------------------------------------
update storage.buckets set file_size_limit = 30 * 1024 * 1024 where id = 'event-media';

insert into storage.buckets (id, name, public, file_size_limit)
values ('event-media-pro', 'event-media-pro', true, 100 * 1024 * 1024)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "event-media-pro: lectura publica" on storage.objects;
drop policy if exists "event-media-pro: subir solo PRO" on storage.objects;
drop policy if exists "event-media-pro: editar lo propio" on storage.objects;
drop policy if exists "event-media-pro: borrar lo propio" on storage.objects;

create policy "event-media-pro: lectura publica" on storage.objects
  for select using (bucket_id = 'event-media-pro');
create policy "event-media-pro: subir solo PRO" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-media-pro' and public.user_is_pro((select auth.uid())));
create policy "event-media-pro: editar lo propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-media-pro' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'event-media-pro' and owner_id = (select auth.uid()::text));
create policy "event-media-pro: borrar lo propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-media-pro' and owner_id = (select auth.uid()::text));

notify pgrst, 'reload schema';

-- 04_collab_offers_details.sql
-- Datos extra de las ofertas de colaboración (ciudad, fecha, franja, caché, aforo…).
alter table public.collab_offers
  add column if not exists details jsonb not null default '{}'::jsonb;

  -- 05_ofertas_dj_y_notificaciones.sql
-- 1) Los DJs pueden publicar ofertas: solo para otros DJs y con 1 activa como máximo.
--    Los DJs no pueden enviar ofertas (solo reciben aplicaciones).
-- 2) Aviso al creador cuando alguien aplica a su oferta (con "leída").
-- 3) Invitaciones a grupos privados: hay que aceptarlas antes de entrar.
-- Ejecútalo entero en el SQL Editor de Supabase. Se puede ejecutar más de una vez.

-- ============================================================================
-- 1. Reglas de las ofertas de colaboración
-- ============================================================================
create or replace function public.enforce_collab_offer_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_admin boolean;
  v_active int;
begin
  -- Desde el panel de Supabase (SQL Editor / service role) no hay límites
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  select role, coalesce(is_admin, false) into v_role, v_admin
  from public.profiles where id = new.creator_id;

  if v_admin or v_role in ('Admin', 'Club', 'Promotor') then
    return new;
  end if;

  if v_role is distinct from 'DJ' then
    raise exception 'Solo DJs, clubs y promotores pueden publicar ofertas de colaboración.';
  end if;

  if new.target_roles is null or new.target_roles <> array['DJ']::text[] then
    raise exception 'Como DJ solo puedes publicar ofertas dirigidas a otros DJs.';
  end if;

  if coalesce(new.status, 'active') = 'active' then
    select count(*) into v_active
    from public.collab_offers
    where creator_id = new.creator_id and status = 'active' and id <> new.id;
    if v_active >= 1 then
      raise exception 'Como DJ solo puedes tener 1 oferta activa. Finaliza la que tienes para publicar otra.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_collab_offer_rules on public.collab_offers;
create trigger trg_collab_offer_rules
  before insert or update on public.collab_offers
  for each row execute function public.enforce_collab_offer_rules();

-- Los DJs no pueden enviar ofertas a otros perfiles: los demás aplican
create or replace function public.enforce_collab_link_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.direction = 'invited' then
    select role into v_role from public.profiles where id = new.creator_id;
    if v_role = 'DJ' then
      raise exception 'Los DJs no pueden enviar ofertas: los demás DJs aplican a ellas.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_collab_link_rules on public.collab_links;
create trigger trg_collab_link_rules
  before insert on public.collab_links
  for each row execute function public.enforce_collab_link_rules();

-- ============================================================================
-- 2. Aviso de "nueva aplicación a tu oferta"
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collab_links' and column_name = 'creator_read'
  ) then
    alter table public.collab_links add column creator_read boolean not null default false;
    -- Las aplicaciones que ya existían no salen como nuevas
    update public.collab_links set creator_read = true;
  end if;
end $$;

drop policy if exists "Creador marca aplicaciones como leídas" on public.collab_links;
create policy "Creador marca aplicaciones como leídas" on public.collab_links
  for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

-- ============================================================================
-- 3. Invitaciones a grupos privados
-- ============================================================================
create table if not exists public.group_invitations (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  room_name text not null default 'Grupo privado',
  inviter_id uuid references public.profiles(id) on delete cascade not null,
  invitee_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (room_id, invitee_id)
);

alter table public.group_invitations enable row level security;

drop policy if exists "Ver mis invitaciones de grupo" on public.group_invitations;
create policy "Ver mis invitaciones de grupo" on public.group_invitations
  for select using (auth.uid() = inviter_id or auth.uid() = invitee_id);

-- Solo el creador del grupo invita
drop policy if exists "El creador del grupo invita" on public.group_invitations;
create policy "El creador del grupo invita" on public.group_invitations
  for insert with check (
    auth.uid() = inviter_id
    and exists (
      select 1 from public.chat_rooms cr
      where cr.id = room_id and cr.type = 'private_group' and cr.created_by = auth.uid()
    )
  );

-- El invitado responde; el creador puede volver a invitar tras un rechazo
drop policy if exists "Responder o reenviar invitación de grupo" on public.group_invitations;
create policy "Responder o reenviar invitación de grupo" on public.group_invitations
  for update using (auth.uid() = invitee_id or auth.uid() = inviter_id);

drop policy if exists "Cancelar invitación de grupo" on public.group_invitations;
create policy "Cancelar invitación de grupo" on public.group_invitations
  for delete using (auth.uid() = inviter_id or auth.uid() = invitee_id);

-- ¿Puede este usuario entrar en esta sala? (se salta el RLS de chat_rooms a propósito:
-- el invitado aún no ve el grupo hasta que entra)
create or replace function public.can_join_chat_room(p_room uuid, p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chat_rooms cr
    where cr.id = p_room
      and (
        cr.type <> 'private_group'
        or cr.created_by = p_user
        or exists (
          select 1 from public.group_invitations gi
          where gi.room_id = cr.id and gi.invitee_id = p_user and gi.status in ('pending', 'accepted')
        )
      )
  );
$$;

-- Tipo de una sala sin depender de si el usuario puede verla
create or replace function public.chat_room_type(p_room uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select type from public.chat_rooms where id = p_room;
$$;

-- Ya no se puede meter a nadie en un grupo privado sin que acepte:
-- en un grupo privado cada uno solo puede añadirse a sí mismo, y solo si le invitaron
drop policy if exists "Unirse o añadir a chat" on public.chat_participants;
create policy "Unirse o añadir a chat" on public.chat_participants
  for insert with check (
    auth.role() = 'authenticated'
    and (
      public.chat_room_type(room_id) is distinct from 'private_group'
      or (user_id = auth.uid() and public.can_join_chat_room(room_id, auth.uid()))
    )
  );

-- ============================================================================
-- 4. Tiempo real (para que los avisos lleguen sin recargar)
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'collab_links') then
    alter publication supabase_realtime add table public.collab_links;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'group_invitations') then
    alter publication supabase_realtime add table public.group_invitations;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- 06 · Marcos animados de avatar (ventaja PRO, solo DJs)
-- ----------------------------------------------------------------------------
-- · profiles.avatar_frame        → qué marco lleva (null = sin marco)
-- · profiles.avatar_frame_color  → variante de color (solo algunos marcos)
-- · Solo un DJ con PRO activo puede PONER o CAMBIAR el marco.
--   Si se le acaba el PRO, el valor se queda guardado (vuelve si renueva),
--   pero la web deja de mostrarlo. Quitarlo (null) siempre está permitido.
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_frame text,
  add column if not exists avatar_frame_color text;

alter table public.profiles drop constraint if exists profiles_avatar_frame_check;
alter table public.profiles add constraint profiles_avatar_frame_check
  check (
    avatar_frame is null
    or avatar_frame in ('fire', 'bolt', 'radar', 'glitch', 'neon', 'eq',
                        'waves', 'vinyl', 'laser', 'orbit', 'gold', 'seal')
  );

alter table public.profiles drop constraint if exists profiles_avatar_frame_color_check;
alter table public.profiles add constraint profiles_avatar_frame_color_check
  check (avatar_frame_color is null or avatar_frame_color ~ '^[a-z]{2,12}$');

create or replace function public.enforce_avatar_frame_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.profiles%rowtype;
  v_role text;
begin
  -- Desde el panel de Supabase (SQL Editor / service role) no hay límites
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Quitar el marco siempre se puede
  if new.avatar_frame is null then
    new.avatar_frame_color := null;
    return new;
  end if;

  -- Se mira la fila guardada (en un upsert, el INSERT trae is_pro/rol por defecto)
  select * into cur from public.profiles where id = new.id;

  if found then
    -- Si no cambia el marco, no se comprueba nada (p. ej. guarda la bio con el PRO caducado)
    if new.avatar_frame is not distinct from cur.avatar_frame
       and new.avatar_frame_color is not distinct from cur.avatar_frame_color then
      return new;
    end if;
    v_role := cur.role;
  else
    v_role := new.role;
  end if;

  if v_role is distinct from 'DJ' then
    raise exception 'Los marcos de avatar son solo para DJs.' using errcode = 'P0001';
  end if;

  if not public.user_is_pro(new.id) then
    raise exception 'Los marcos de avatar son una ventaja PRO.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_avatar_frame_pro on public.profiles;
create trigger trg_avatar_frame_pro
  before insert or update of avatar_frame, avatar_frame_color on public.profiles
  for each row execute function public.enforce_avatar_frame_pro();

-- ============================================================================
-- 07 · Marcos de avatar v3
-- ----------------------------------------------------------------------------
-- · Se elimina el marco "fire" (Fuego): quien lo tuviera se queda sin marco.
-- · Nuevos marcos: scope, pulse, hazard, led, tunnel, target, pin.
-- · Todos los marcos tienen ahora variantes de color (avatar_frame_color).
-- Requiere haber ejecutado antes la 06. Se puede ejecutar varias veces.
-- ============================================================================

-- Quitar el fuego a quien lo tenga (desde el SQL Editor no salta el trigger PRO)
update public.profiles
   set avatar_frame = null, avatar_frame_color = null
 where avatar_frame = 'fire';

alter table public.profiles drop constraint if exists profiles_avatar_frame_check;
alter table public.profiles add constraint profiles_avatar_frame_check
  check (
    avatar_frame is null
    or avatar_frame in (
      'radar', 'bolt', 'glitch', 'neon', 'eq',
      'scope', 'pulse', 'hazard', 'led', 'tunnel', 'target', 'pin',
      'waves', 'vinyl', 'laser', 'orbit', 'gold', 'seal'
    )
  );

-- ============================================================================
-- 08 · DJs fundadores (corona) + avisos (notificaciones) + avisos desde admin
-- ----------------------------------------------------------------------------
-- · profiles.is_founder: los 100 primeros DJs (sin contar perfiles de prueba
--   "seed") quedan como fundadores para siempre. Se asigna solo al pasar a DJ.
-- · Marco "crown" (Corona de fundador): solo DJs fundadores, sin necesidad de PRO.
-- · Tabla notifications: avisos para un usuario (fundador, avisos del admin…).
-- · admin_send_notification(): el admin manda un aviso a uno o varios tipos.
-- Requiere la 06 y la 07. Se puede ejecutar varias veces.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Perfiles de prueba (los del script de relleno): nunca cuentan
-- ---------------------------------------------------------------------------
create or replace function public.is_seed_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select coalesce((u.raw_user_meta_data ->> 'seed')::boolean, false)
        or coalesce(u.email, '') like '%@seed.ravexradar.invalid'
      from auth.users u
     where u.id = uid
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. Avisos
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('founder', 'broadcast')),
  title text not null,
  body text,
  action text,               -- qué hace al pulsarlo: 'open_frames'…
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists "Ver mis avisos" on public.notifications;
create policy "Ver mis avisos" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "Marcar mis avisos como leídos" on public.notifications;
create policy "Marcar mis avisos como leídos" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Borrar mis avisos" on public.notifications;
create policy "Borrar mis avisos" on public.notifications
  for delete using (user_id = auth.uid());
-- (Sin política de INSERT: solo los crean las funciones de abajo)

-- Desde la app solo se puede cambiar read_at
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke update on public.notifications from authenticated;
    grant update (read_at) on public.notifications to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update, delete on public.notifications from anon;
  end if;
end $$;

-- Tiempo real (la campanita se actualiza sola)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Fundadores
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_founder boolean not null default false;

create or replace function public.assign_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_app boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
  requester_is_admin boolean := false;
begin
  -- Desde la app nadie se pone (ni se quita) fundador a mano; el admin sí
  if is_app then
    select coalesce(p.is_admin, false) or p.role = 'Admin'
      into requester_is_admin
      from public.profiles p
     where p.id = auth.uid();
    if not coalesce(requester_is_admin, false) then
      if tg_op = 'INSERT' then
        new.is_founder := false;
      else
        new.is_founder := old.is_founder;
      end if;
    end if;
  end if;

  -- Pasa a ser DJ (o se crea como DJ) y aún quedan plazas → fundador
  if new.role = 'DJ'
     and not coalesce(new.is_founder, false)
     and (tg_op = 'INSERT' or old.role is distinct from 'DJ')
     and not public.is_seed_user(new.id) then
    perform pg_advisory_xact_lock(hashtext('ravexradar_founders'));
    if (select count(*) from public.profiles where is_founder) < 100 then
      new.is_founder := true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_founder on public.profiles;
create trigger trg_assign_founder
  before insert or update on public.profiles
  for each row execute function public.assign_founder();

-- Aviso al nuevo fundador (se pulsa y abre Editar perfil → Marco)
create or replace function public.notify_new_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_founder and (tg_op = 'INSERT' or not coalesce(old.is_founder, false))
     and not public.is_seed_user(new.id) then
    insert into public.notifications (user_id, kind, title, body, action)
    values (
      new.id,
      'founder',
      '¡Eres DJ Fundador de RAVEXRADAR! 👑',
      'Eres uno de los 100 primeros DJs de la web. Has desbloqueado la Corona de Fundador, un marco exclusivo para tu foto. Pulsa aquí para ponértela.',
      'open_frames'
    );
  end if;
  return new;
end;
$$;

-- (sin "update of is_founder": el cambio lo hace el trigger anterior, no la app)
drop trigger if exists trg_notify_new_founder on public.profiles;
drop trigger if exists trg_notify_new_founder_ins on public.profiles;
create trigger trg_notify_new_founder
  after update on public.profiles
  for each row when (new.is_founder and not old.is_founder)
  execute function public.notify_new_founder();
create trigger trg_notify_new_founder_ins
  after insert on public.profiles
  for each row when (new.is_founder)
  execute function public.notify_new_founder();

-- Los DJs que ya existen: los 100 primeros por fecha de alta son fundadores
-- (desde el SQL Editor no salta la protección; los avisos se crean solos)
with first_djs as (
  select p.id
    from public.profiles p
   where p.role = 'DJ'
     and not public.is_seed_user(p.id)
   order by p.created_at asc nulls last
   limit greatest(0, 100 - (select count(*) from public.profiles where is_founder))
)
update public.profiles p
   set is_founder = true
  from first_djs f
 where p.id = f.id
   and not p.is_founder;

-- ---------------------------------------------------------------------------
-- 4. Marco "crown": solo fundadores (sin PRO). El resto, PRO como antes.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_avatar_frame_check;
alter table public.profiles add constraint profiles_avatar_frame_check
  check (
    avatar_frame is null
    or avatar_frame in (
      'crown',
      'radar', 'bolt', 'glitch', 'neon', 'eq',
      'scope', 'pulse', 'hazard', 'led', 'tunnel', 'target', 'pin',
      'waves', 'vinyl', 'laser', 'orbit', 'gold', 'seal'
    )
  );

create or replace function public.enforce_avatar_frame_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.profiles%rowtype;
  v_role text;
  v_founder boolean;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.avatar_frame is null then
    new.avatar_frame_color := null;
    return new;
  end if;

  select * into cur from public.profiles where id = new.id;
  if found then
    if new.avatar_frame is not distinct from cur.avatar_frame
       and new.avatar_frame_color is not distinct from cur.avatar_frame_color then
      return new;
    end if;
    v_role := cur.role;
    v_founder := cur.is_founder;
  else
    v_role := new.role;
    v_founder := false;
  end if;

  if v_role is distinct from 'DJ' then
    raise exception 'Los marcos de avatar son solo para DJs.' using errcode = 'P0001';
  end if;

  if new.avatar_frame = 'crown' then
    if not coalesce(v_founder, false) then
      raise exception 'La Corona es solo para los DJs fundadores.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if not public.user_is_pro(new.id) then
    raise exception 'Los marcos de avatar son una ventaja PRO.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Avisos desde el panel de admin
-- ---------------------------------------------------------------------------
create table if not exists public.admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  roles text[] not null,
  sent_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_broadcasts enable row level security;

drop policy if exists "Admin ve los avisos enviados" on public.admin_broadcasts;
create policy "Admin ve los avisos enviados" on public.admin_broadcasts
  for select using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and (coalesce(p.is_admin, false) or p.role = 'Admin')
    )
  );

create or replace function public.admin_send_notification(p_title text, p_body text, p_roles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_count integer;
  v_roles text[];
begin
  select coalesce(p.is_admin, false) or p.role = 'Admin'
    into v_admin
    from public.profiles p
   where p.id = auth.uid();
  if not coalesce(v_admin, false) then
    raise exception 'Solo los administradores pueden enviar avisos.' using errcode = '42501';
  end if;

  p_title := btrim(coalesce(p_title, ''));
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_title) < 3 or char_length(p_title) > 90 then
    raise exception 'El título debe tener entre 3 y 90 caracteres.' using errcode = 'P0001';
  end if;
  if char_length(p_body) > 600 then
    raise exception 'El mensaje no puede pasar de 600 caracteres.' using errcode = 'P0001';
  end if;

  select array_agg(distinct r) into v_roles
    from unnest(coalesce(p_roles, '{}')) r
   where r in ('Raver', 'DJ', 'Club', 'Promotor');
  if v_roles is null then
    raise exception 'Elige al menos un tipo de usuario.' using errcode = 'P0001';
  end if;

  insert into public.notifications (user_id, kind, title, body)
  select p.id, 'broadcast', p_title, nullif(p_body, '')
    from public.profiles p
   where coalesce(p.role, 'Raver') = any (v_roles)
     and not public.is_seed_user(p.id);
  get diagnostics v_count = row_count;

  insert into public.admin_broadcasts (title, body, roles, sent_count, created_by)
  values (p_title, nullif(p_body, ''), v_roles, v_count, auth.uid());

  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.admin_send_notification(text, text, text[]) from anon;
  end if;
  revoke execute on function public.admin_send_notification(text, text, text[]) from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.admin_send_notification(text, text, text[]) to authenticated;
  end if;
end $$;

-- ============================================================================
-- 09 · Eventos propios del DJ (fiestas que NO están en el mapa)
-- Se guardan en el propio perfil, como available_dates.
-- Cada elemento: { id, date 'YYYY-MM-DD', name, venue, street, city, club_id|null }
-- Ejecútala en Supabase → SQL Editor. Es idempotente (puedes lanzarla 2 veces).
-- ============================================================================

alter table public.profiles
  add column if not exists dj_private_events jsonb not null default '[]'::jsonb;

-- Siempre un array y con un tope razonable (el front ya limita a 60)
alter table public.profiles drop constraint if exists profiles_dj_private_events_chk;
alter table public.profiles
  add constraint profiles_dj_private_events_chk
  check (
    jsonb_typeof(dj_private_events) = 'array'
    and jsonb_array_length(dj_private_events) <= 60
    and pg_column_size(dj_private_events) <= 32768
  );

comment on column public.profiles.dj_private_events is
  'Eventos propios del DJ fuera del mapa (calendario). Array de {id,date,name,venue,street,city,club_id}.';

-- No hace falta tocar RLS: el DJ ya puede actualizar su propia fila de profiles
-- y el resto de usuarios ya pueden leer perfiles (igual que available_dates).

-- ============================================================================
-- 10 · Clubs y promotoras "fantasma" (creados por server.mjs) + reclamaciones
-- ----------------------------------------------------------------------------
--  · Un perfil fantasma es una cuenta sin contraseña (email @ghost.ravexradar.invalid)
--    con los datos públicos del club/promotora de las fiestas importadas.
--  · Cualquier usuario con sesión puede reclamarlo (mensaje + email de contacto).
--  · El admin lo aprueba desde el panel → su cuenta pasa a ser ese club/promotora
--    (nombre, rol, ubicación) y se queda con sus fiestas. El fantasma se borra.
-- Ejecútala en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

-- 1. Columnas en profiles -----------------------------------------------------
alter table public.profiles add column if not exists is_ghost boolean not null default false;
alter table public.profiles add column if not exists ghost_key text;
alter table public.profiles add column if not exists ghost_source text;
create unique index if not exists profiles_ghost_key_uidx on public.profiles (ghost_key) where ghost_key is not null;

-- Desde la app nadie se marca/desmarca como fantasma (solo el servidor o el admin)
create or replace function public.protect_ghost_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := false;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  select coalesce(p.is_admin, false) or p.role = 'Admin' into v_admin from public.profiles p where p.id = auth.uid();
  if coalesce(v_admin, false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_ghost := false;
    new.ghost_key := null;
    new.ghost_source := null;
  else
    new.is_ghost := old.is_ghost;
    new.ghost_key := old.ghost_key;
    new.ghost_source := old.ghost_source;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_ghost_fields on public.profiles;
create trigger trg_protect_ghost_fields
  before insert or update on public.profiles
  for each row execute function public.protect_ghost_fields();

-- 2. Los fantasmas cuentan como "seed": no son fundadores ni reciben avisos ----
create or replace function public.is_seed_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select coalesce((u.raw_user_meta_data ->> 'seed')::boolean, false)
        or coalesce((u.raw_user_meta_data ->> 'ghost')::boolean, false)
        or coalesce(u.email, '') like '%@seed.ravexradar.invalid'
        or coalesce(u.email, '') like '%@ghost.ravexradar.invalid'
      from auth.users u
     where u.id = uid
  ), false);
$$;

-- 3. Reclamaciones ------------------------------------------------------------
create table if not exists public.ghost_claims (
  id uuid primary key default gen_random_uuid(),
  ghost_id uuid references public.profiles(id) on delete set null,
  ghost_username text not null,
  ghost_role text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  contact_email text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ghost_claims_status_idx on public.ghost_claims (status, created_at desc);
-- Una sola reclamación pendiente por usuario y perfil
create unique index if not exists ghost_claims_one_pending_uidx
  on public.ghost_claims (ghost_id, user_id) where status = 'pending';

alter table public.ghost_claims enable row level security;

drop policy if exists "Ver mis reclamaciones o todas si soy admin" on public.ghost_claims;
create policy "Ver mis reclamaciones o todas si soy admin" on public.ghost_claims
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (coalesce(p.is_admin, false) or p.role = 'Admin'))
  );

drop policy if exists "Reclamar un perfil fantasma" on public.ghost_claims;
create policy "Reclamar un perfil fantasma" on public.ghost_claims
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and exists (select 1 from public.profiles g where g.id = ghost_id and g.is_ghost)
    and char_length(btrim(message)) between 10 and 1500
    and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

drop policy if exists "Admin resuelve reclamaciones" on public.ghost_claims;
create policy "Admin resuelve reclamaciones" on public.ghost_claims
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and (coalesce(p.is_admin, false) or p.role = 'Admin'))
  );

-- 4. Avisos: nuevo tipo 'claim' -------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('founder', 'broadcast', 'claim'));

-- 5. Fusionar (aprobar) ---------------------------------------------------------
create or replace function public.admin_merge_ghost(p_claim_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin boolean;
  c public.ghost_claims%rowtype;
  g public.profiles%rowtype;
  u public.profiles%rowtype;
  v_name text;
begin
  select coalesce(p.is_admin, false) or p.role = 'Admin' into v_admin from public.profiles p where p.id = auth.uid();
  if not coalesce(v_admin, false) then
    raise exception 'Solo los administradores pueden fusionar perfiles.' using errcode = '42501';
  end if;

  select * into c from public.ghost_claims where id = p_claim_id for update;
  if not found or c.status <> 'pending' then
    raise exception 'Esta reclamación ya no está pendiente.' using errcode = 'P0001';
  end if;
  select * into g from public.profiles where id = c.ghost_id;
  if not found or not g.is_ghost then
    raise exception 'Ese perfil ya no es un perfil fantasma (¿ya se fusionó?).' using errcode = 'P0001';
  end if;
  select * into u from public.profiles where id = c.user_id;
  if not found or u.is_ghost then
    raise exception 'La cuenta que reclama no existe.' using errcode = 'P0001';
  end if;

  -- a) Las fiestas pasan a la cuenta real
  update public.events set venue_id = u.id where venue_id = g.id;
  update public.events set created_by = u.id where created_by = g.id;
  update public.events e
     set promoters_list = (
       select coalesce(jsonb_agg(
         case when x ->> 'id' = g.id::text
              then x || jsonb_build_object('id', u.id, 'username', g.username, 'avatar_url', coalesce(u.avatar_url, g.avatar_url))
              else x end), '[]'::jsonb)
         from jsonb_array_elements(e.promoters_list) x)
   where jsonb_typeof(e.promoters_list) = 'array'
     and e.promoters_list @> jsonb_build_array(jsonb_build_object('id', g.id::text));

  -- b) Se libera el nombre del fantasma y la cuenta real se queda con su identidad
  v_name := g.username;
  update public.profiles set username = left(g.username, 40) || '__fusionado_' || substr(g.id::text, 1, 6) where id = g.id;
  update public.profiles
     set username = v_name,
         role = case when u.role = 'Admin' then u.role else g.role end,
         city = coalesce(nullif(g.city, ''), u.city),
         lat = coalesce(g.lat, u.lat),
         lng = coalesce(g.lng, u.lng),
         street_address = coalesce(nullif(g.street_address, ''), u.street_address),
         avatar_url = coalesce(u.avatar_url, g.avatar_url),
         bio = coalesce(nullif(u.bio, ''), g.bio),
         avatar_frame = null,
         avatar_frame_color = null,
         onboarding_completed = true
   where id = u.id;

  -- c) Resolver reclamaciones y avisar
  update public.ghost_claims
     set status = 'approved', admin_note = nullif(btrim(coalesce(p_note, '')), ''), resolved_at = now()
   where id = c.id;
  update public.ghost_claims
     set status = 'rejected', admin_note = 'Otra cuenta ha reclamado este perfil.', resolved_at = now()
   where ghost_id = g.id and status = 'pending' and id <> c.id;

  insert into public.notifications (user_id, kind, title, body)
  values (
    u.id, 'claim',
    '¡Perfil reclamado! Ya eres ' || v_name,
    'Hemos fusionado tu cuenta con el perfil de ' || v_name || '. Ya tienes sus fiestas y su sitio en el mapa. Revisa tu perfil por si quieres cambiar algo.'
  );

  -- d) Fuera el fantasma (si no se puede borrar el usuario, se deja oculto)
  begin
    delete from auth.users where id = g.id;
  exception when others then
    update public.profiles set role = 'Raver', lat = null, lng = null where id = g.id;
  end;

  return u.id;
end;
$$;

create or replace function public.admin_reject_ghost_claim(p_claim_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  c public.ghost_claims%rowtype;
begin
  select coalesce(p.is_admin, false) or p.role = 'Admin' into v_admin from public.profiles p where p.id = auth.uid();
  if not coalesce(v_admin, false) then
    raise exception 'Solo los administradores pueden rechazar reclamaciones.' using errcode = '42501';
  end if;
  update public.ghost_claims
     set status = 'rejected', admin_note = nullif(btrim(coalesce(p_note, '')), ''), resolved_at = now()
   where id = p_claim_id and status = 'pending'
  returning * into c;
  if not found then
    raise exception 'Esta reclamación ya no está pendiente.' using errcode = 'P0001';
  end if;
  insert into public.notifications (user_id, kind, title, body)
  values (
    c.user_id, 'claim',
    'Tu reclamación de ' || c.ghost_username || ' no se ha aprobado',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'No hemos podido comprobar que el perfil sea tuyo. Escríbenos desde Soporte si quieres aportar más datos.')
  );
end;
$$;

do $$
begin
  revoke execute on function public.admin_merge_ghost(uuid, text) from public;
  revoke execute on function public.admin_reject_ghost_claim(uuid, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.admin_merge_ghost(uuid, text) from anon;
    revoke execute on function public.admin_reject_ghost_claim(uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.admin_merge_ghost(uuid, text) to authenticated;
    grant execute on function public.admin_reject_ghost_claim(uuid, text) to authenticated;
  end if;
end $$;

-- supabase/migrations/11_estudio_analisis_audio.sql
-- Caché de los análisis de canciones del Estudio (BPM, drops…).
-- Solo la usa el studio-server con la service role: sin políticas = nadie más
-- puede leer ni escribir (RLS activado).
create table if not exists public.studio_audio_analysis (
  key text primary key,
  source text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.studio_audio_analysis enable row level security;

revoke all on public.studio_audio_analysis from anon, authenticated;
