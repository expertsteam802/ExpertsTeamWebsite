alter table public.agent_project_files
  drop constraint if exists agent_project_files_path_valid;

alter table public.agent_project_files
  add constraint agent_project_files_path_valid check (
    length(file_path) between 1 and 1024
    and position(chr(92) in file_path) = 0
    and file_path !~ $re$(^/|(^|/)\.\.?(/|$)|(^|/)\.env($|\.)|(^|/)node_modules(/|$)|(^|/)\.git(/|$))$re$
  );
