grant insert,update,delete on public.user_plugin_permissions to authenticated;
create policy "Users can manage their own plugin permissions" on public.user_plugin_permissions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
