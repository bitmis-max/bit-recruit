-- Preserve the current newest-first display order, then let admins reorder events.

alter table public.events
  add column if not exists sort_order integer;

with ranked_events as (
  select id,
         row_number() over (partition by club_id order by created_at desc, id asc) - 1 as position
  from public.events
  where sort_order is null
)
update public.events as event
set sort_order = ranked_events.position
from ranked_events
where event.id = ranked_events.id;

alter table public.events
  alter column sort_order set default 0,
  alter column sort_order set not null;

create index if not exists events_club_sort_order_idx
  on public.events (club_id, sort_order, created_at desc);
