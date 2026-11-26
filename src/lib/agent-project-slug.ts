export type SlugProject = { id: string; name: string };

export function baseProjectSlug(name: string) {
  return name.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

export function projectSlug(project: SlugProject, projects: SlugProject[]) {
  const base = baseProjectSlug(project.name);
  const duplicates = projects.filter((item) => baseProjectSlug(item.name) === base);
  return duplicates.length > 1 ? `${base}-${project.id.slice(0, 6)}` : base;
}
