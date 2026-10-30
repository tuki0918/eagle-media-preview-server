export interface TagOverviewResponse {
  groups?: unknown[];
  starred?: unknown[];
  tags?: unknown[];
}

export interface TagEntry {
  count: number;
  name: string;
}

export interface TagGroupSection {
  color: string;
  id: string;
  name: string;
  tags: TagEntry[];
}

export interface TagSections {
  groups: TagGroupSection[];
  starred: TagEntry[];
  total: number;
  ungrouped: TagEntry[];
}

interface NormalizedGroup {
  color: string;
  id: string;
  name: string;
  tagNames: string[];
}

/**
 * Splits the library's tags into starred tags, one list per tag group, and the remaining ungrouped
 * tags. Starred tags only appear in the starred section, matching how they are pinned above the rest.
 */
export function buildTagSections(overview: TagOverviewResponse | null | undefined, query = ""): TagSections {
  const tags = uniqueTagEntries(overview?.tags);
  const tagsByName = new Map(tags.map((tag) => [tag.name, tag]));
  const starredNames = new Set(uniqueTagEntries(overview?.starred).map((tag) => tag.name));
  const groups = normalizeGroups(overview?.groups);
  const groupKeys = new Map<string, string>();
  for (const group of groups) {
    groupKeys.set(group.id, group.id);
    groupKeys.set(group.name, group.id);
  }

  // A tag can name its groups (by id or name) and a group can list its tags; accept either side.
  const membersByGroup = new Map(groups.map((group) => [group.id, new Set(group.tagNames)]));
  for (const tag of rawTagRecords(overview?.tags)) {
    for (const groupRef of stringList(tag.groups)) {
      const groupId = groupKeys.get(groupRef);
      if (groupId) membersByGroup.get(groupId)?.add(String(tag.name).trim());
    }
  }

  const matches = tagMatcher(query);
  const groupedNames = new Set<string>();
  const groupSections: TagGroupSection[] = [];
  for (const group of groups) {
    const members = [...(membersByGroup.get(group.id) || [])].filter(Boolean);
    for (const name of members) groupedNames.add(name);
    const sectionTags = sortTags(
      members
        .filter((name) => !starredNames.has(name) && matches(name))
        .map((name) => tagsByName.get(name) || { name, count: 0 }),
    );
    if (sectionTags.length) groupSections.push({ color: group.color, id: group.id, name: group.name, tags: sectionTags });
  }

  const starred = sortTags(
    [...starredNames].filter(matches).map((name) => tagsByName.get(name) || { name, count: 0 }),
  );
  const ungrouped = sortTags(tags.filter((tag) => !starredNames.has(tag.name) && !groupedNames.has(tag.name) && matches(tag.name)));
  const visibleNames = new Set([...starred, ...ungrouped, ...groupSections.flatMap((group) => group.tags)].map((tag) => tag.name));

  return { groups: groupSections, starred, total: visibleNames.size, ungrouped };
}

function tagMatcher(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return (name: string) => !needle || name.toLocaleLowerCase().includes(needle);
}

function sortTags(tags: TagEntry[]) {
  return tags.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
}

function uniqueTagEntries(value: unknown): TagEntry[] {
  const entries = new Map<string, TagEntry>();
  for (const tag of rawTagRecords(value)) {
    const name = String(tag.name).trim();
    if (!name || entries.has(name)) continue;
    entries.set(name, { name, count: tagCount(tag) });
  }
  return [...entries.values()];
}

function rawTagRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? { name: tag } : tag))
    .filter((tag): tag is Record<string, unknown> => isRecord(tag) && typeof tag.name === "string");
}

function tagCount(tag: Record<string, unknown>) {
  const count = Number(tag.imageCount ?? tag.count ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function normalizeGroups(value: unknown): NormalizedGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: NormalizedGroup[] = [];
  for (const group of value) {
    if (!isRecord(group)) continue;
    const name = typeof group.name === "string" ? group.name.trim() : "";
    const id = typeof group.id === "string" && group.id.trim() ? group.id.trim() : name;
    if (!id) continue;
    groups.push({
      color: typeof group.color === "string" ? group.color : "",
      id,
      name: name || id,
      tagNames: stringList(group.tags),
    });
  }
  return groups;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry : isRecord(entry) && typeof entry.name === "string" ? entry.name : ""))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
