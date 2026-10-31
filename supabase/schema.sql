-- Lead Manager schema (run in Supabase SQL Editor)
create sequence if not exists public.lead_number_seq;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id text not null default ('LM-' || lpad(nextval('public.lead_number_seq')::text, 6, '0')),
  date_added date not null default current_date,
  business_name text not null check (length(btrim(business_name)) > 0),
  business_category text,
  country text,
  state text,
  city text,
  full_business_address text,
  google_maps_profile_link text,
  facebook_profile_link text,
  instagram_profile_link text,
  website_url text,
  website_status text not null default 'Website Status Unverified'
    check (website_status in ('No Website Found','Active Website','Broken Website','Outdated Website','Website Status Unverified')),
  contact_person_owner text,
  phone_number_1 text,
  phone_number_2 text,
  email_address text,
  contact_channel text
    check (contact_channel is null or contact_channel in ('Facebook Messenger','WhatsApp','Email','Instagram DM','Other')),
  research_notes text,
  personalized_first_message text,
  message_sent_date date,
  response_conversation_notes text,
  lead_status text not null default 'New'
    check (lead_status in ('New','Researching','Ready to Contact','Contacted','Replied','Interested','Follow-up Needed','Not Interested','No Response','Not a Suitable Lead','Closed')),
  next_follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lead_id)
);

create index if not exists leads_user_status_idx on public.leads (user_id, lead_status);
create index if not exists leads_user_followup_idx on public.leads (user_id, next_follow_up_date);
create index if not exists leads_user_dedupe_idx on public.leads (user_id, lower(business_name), lower(city), lower(country));

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.leads enable row level security;
alter table public.leads force row level security;

revoke all on public.leads from anon, public;
revoke all on sequence public.lead_number_seq from anon, public;
grant select, insert, update, delete on public.leads to authenticated;
grant usage on sequence public.lead_number_seq to authenticated;

drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;

create policy leads_select on public.leads for select to authenticated
  using ((select auth.uid()) = user_id);
create policy leads_insert on public.leads for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy leads_update on public.leads for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy leads_delete on public.leads for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- RLS TESTS (manual, SQL Editor) ----------
-- 1) Logged-out (anon) access must FAIL with "permission denied":
--    begin; set local role anon; select * from public.leads; rollback;
-- 2) Authenticated user A sees only own rows:
--    begin; set local role authenticated;
--    select set_config('request.jwt.claims', '{"sub":"<USER_A_UUID>","role":"authenticated"}', true);
--    select count(*) from public.leads; rollback;
-- 3) User B (different uuid) must see 0 rows of A, and inserting user_id = A must fail:
--    ... set sub = <USER_B_UUID>; insert into public.leads(user_id,business_name) values ('<USER_A_UUID>','x'); -- ERROR RLS
