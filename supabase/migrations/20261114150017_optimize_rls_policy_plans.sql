-- Collapse duplicate or overlapping read/write policies without changing access.
drop policy if exists "Owners read own apps" on public.agent_projects;
drop policy if exists "Published apps are publicly viewable" on public.agent_projects;
create policy "Owners and published apps readable"
  on public.agent_projects for select to anon, authenticated
  using (published = true or user_id = (select auth.uid()));

drop policy if exists "Users manage own chats" on public.ai_chats;
drop policy if exists "Users insert own snippets" on public.ai_snippets;

drop policy if exists "Admins can update any profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users and admins update profiles"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins insert site settings"
  on public.site_settings for insert to authenticated
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins update site settings"
  on public.site_settings for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins delete site settings"
  on public.site_settings for delete to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists "Admins manage contacts" on public.team_contacts;
create policy "Admins insert contacts"
  on public.team_contacts for insert to authenticated
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins update contacts"
  on public.team_contacts for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins delete contacts"
  on public.team_contacts for delete to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists "Admins manage team roles" on public.workspace_roles;
create policy "Admins insert team roles"
  on public.workspace_roles for insert to authenticated
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins update team roles"
  on public.workspace_roles for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins delete team roles"
  on public.workspace_roles for delete to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- Cache auth function results once per statement instead of once per row.
do $$
declare
  policy_row record;
  new_qual text;
  new_check text;
  normalized text;
  using_clause text;
  check_clause text;
  changed boolean;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
  loop
    new_qual := policy_row.qual;
    new_check := policy_row.with_check;
    changed := false;

    if new_qual is not null then
      normalized := regexp_replace(lower(new_qual), '\s+', '', 'g');
      if position('(selectauth.uid())' in normalized) = 0
         and position('(select(auth.uid())' in normalized) = 0 then
        new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
        changed := changed or new_qual is distinct from policy_row.qual;
      end if;
      normalized := regexp_replace(lower(new_qual), '\s+', '', 'g');
      if position('(selectauth.role())' in normalized) = 0
         and position('(select(auth.role())' in normalized) = 0 then
        new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
        changed := changed or new_qual is distinct from policy_row.qual;
      end if;
    end if;

    if new_check is not null then
      normalized := regexp_replace(lower(new_check), '\s+', '', 'g');
      if position('(selectauth.uid())' in normalized) = 0
         and position('(select(auth.uid())' in normalized) = 0 then
        new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
        changed := changed or new_check is distinct from policy_row.with_check;
      end if;
      normalized := regexp_replace(lower(new_check), '\s+', '', 'g');
      if position('(selectauth.role())' in normalized) = 0
         and position('(select(auth.role())' in normalized) = 0 then
        new_check := replace(new_check, 'auth.role()', '(select auth.role())');
        changed := changed or new_check is distinct from policy_row.with_check;
      end if;
    end if;

    if changed then
      using_clause := case when new_qual is null then '' else format(' USING (%s)', new_qual) end;
      check_clause := case when new_check is null then '' else format(' WITH CHECK (%s)', new_check) end;
      execute format(
        'ALTER POLICY %I ON %I.%I%s%s',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        using_clause,
        check_clause
      );
    end if;
  end loop;
end
$$;
