create index if not exists idx_agent_project_checkpoints_user_id_fk on public.agent_project_checkpoints(user_id);
create index if not exists idx_api_request_usage_user_id_fk on public.api_request_usage(user_id);
create index if not exists idx_auth_events_user_id_fk on public.auth_events(user_id);
create index if not exists idx_community_comments_user_id_fk on public.community_comments(user_id);
create index if not exists idx_community_likes_user_id_fk on public.community_likes(user_id);
create index if not exists idx_community_posts_user_id_fk on public.community_posts(user_id);
create index if not exists idx_contact_messages_user_id_fk on public.contact_messages(user_id);
create index if not exists idx_developer_vault_items_uploader_id_fk on public.developer_vault_items(uploader_id);
create index if not exists idx_direct_call_signals_from_user_id_fk on public.direct_call_signals(from_user_id);
create index if not exists idx_direct_conversation_hidden_user_id_fk on public.direct_conversation_hidden(user_id);
create index if not exists idx_files_user_id_fk on public.files(user_id);
create index if not exists idx_invite_redemptions_user_id_fk on public.invite_redemptions(user_id);
create index if not exists idx_project_requests_user_id_fk on public.project_requests(user_id);
create index if not exists idx_software_requests_user_id_fk on public.software_requests(user_id);
create index if not exists idx_videos_user_id_fk on public.videos(user_id);
create index if not exists idx_workspace_groups_created_by_fk on public.workspace_groups(created_by);
create index if not exists idx_workspace_messages_user_id_fk on public.workspace_messages(user_id);

create or replace function public.is_workspace_member(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null
     and auth.uid() = _user_id
     and (
       public.has_role(_user_id, 'admin')
       or public.has_role(_user_id, 'developer')
       or exists (
         select 1
         from public.project_requests
         where user_id = _user_id
           and status = 'approved'
       )
     );
$function$;

create or replace function public.sync_site_settings_branding_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.site_branding_settings is null then
      new.site_branding_settings := new.ad_settings;
    else
      new.ad_settings := new.site_branding_settings;
    end if;
  elsif new.ad_settings is distinct from old.ad_settings
    and new.site_branding_settings is not distinct from old.site_branding_settings then
    new.site_branding_settings := new.ad_settings;
  elsif new.site_branding_settings is distinct from old.site_branding_settings then
    new.ad_settings := new.site_branding_settings;
  end if;
  return new;
end;
$function$;
