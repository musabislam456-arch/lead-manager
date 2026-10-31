-- RLS tests. Run in Supabase SQL Editor AFTER schema.sql and AFTER creating the owner user.
-- Each check prints PASS/FAIL via NOTICE. Test data is deleted at the end. NOT yet executed by the author.
do $$
declare a uuid; b uuid := gen_random_uuid(); n int; seed uuid;
begin
  select id into a from auth.users order by created_at limit 1;
  if a is null then raise exception 'Create the owner user first (Authentication > Users).'; end if;
  insert into public.leads(user_id, business_name) values (a, '__rls_test__') returning id into seed;

  -- 1. Logged-out (anon) must be denied
  set local role anon;
  begin perform 1 from public.leads; raise notice 'FAIL 1: anon could SELECT';
  exception when insufficient_privilege then raise notice 'PASS 1: anon SELECT denied'; end;
  begin insert into public.leads(user_id, business_name) values (a, 'x'); raise notice 'FAIL 2: anon could INSERT';
  exception when insufficient_privilege then raise notice 'PASS 2: anon INSERT denied'; end;
  reset role;

  -- 2. Different authenticated user (B) must see/modify nothing of A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.leads; raise notice '% 3: other user sees % rows (expected 0)', case when n = 0 then 'PASS' else 'FAIL' end, n;
  update public.leads set business_name = 'hacked' where id = seed; get diagnostics n = row_count;
  raise notice '% 4: other user UPDATE affected % rows (expected 0)', case when n = 0 then 'PASS' else 'FAIL' end, n;
  delete from public.leads where id = seed; get diagnostics n = row_count;
  raise notice '% 5: other user DELETE affected % rows (expected 0)', case when n = 0 then 'PASS' else 'FAIL' end, n;
  begin insert into public.leads(user_id, business_name) values (a, 'forged'); raise notice 'FAIL 6: B inserted row for A';
  exception when insufficient_privilege then raise notice 'PASS 6: B cannot insert rows owned by A'; end;
  reset role;

  -- 3. Owner (A) can read/update own rows but cannot hand a row to someone else
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.leads where id = seed; raise notice '% 7: owner sees own row', case when n = 1 then 'PASS' else 'FAIL' end;
  update public.leads set business_name = '__rls_test_ok__' where id = seed; get diagnostics n = row_count;
  raise notice '% 8: owner UPDATE affected % row(s) (expected 1)', case when n = 1 then 'PASS' else 'FAIL' end, n;
  begin update public.leads set user_id = b where id = seed; raise notice 'FAIL 9: owner reassigned row to B';
  exception when insufficient_privilege then raise notice 'PASS 9: reassigning user_id denied'; end;
  reset role;

  delete from public.leads where id = seed;  -- cleanup (superuser)
end $$;
