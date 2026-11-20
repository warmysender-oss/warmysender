export function cleanListName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return { ok: false, error: "Give the list a name." };
  if (cleaned.length > 80) return { ok: false, error: "List name must be 80 characters or fewer." };
  return { ok: true, name: cleaned };
}

export function membershipsToAdd(
  existing: Array<{ listId: string; contactId: string }>,
  listIds: string[],
  contactIds: string[],
): Array<{ listId: string; contactId: string }> {
  const have = new Set(existing.map((row) => `${row.listId}\0${row.contactId}`));
  const created: Array<{ listId: string; contactId: string }> = [];
  for (const listId of listIds) {
    for (const contactId of contactIds) {
      const key = `${listId}\0${contactId}`;
      if (have.has(key)) continue;
      have.add(key);
      created.push({ listId, contactId });
    }
  }
  return created;
}

export function contactIdsInLists(
  memberships: Array<{ listId: string; contactId: string }>,
  listIds: string[],
): string[] {
  const wanted = new Set(listIds);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const membership of memberships) {
    if (!wanted.has(membership.listId) || seen.has(membership.contactId)) continue;
    seen.add(membership.contactId);
    ids.push(membership.contactId);
  }
  return ids;
}
