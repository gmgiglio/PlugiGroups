export interface Group {
  id: string;
  name: string;
  pluginIds: string[];
}

export interface GroupData {
  groups: Group[];
}

export function dataFromSaved(value: unknown): GroupData {
  const source = isRecord(value) && Array.isArray(value.groups) ? value.groups : [];
  const groups: Group[] = [];
  const groupIds = new Set<string>();
  const pluginIds = new Set<string>();
  for (const entry of source) {
    const group = groupFromSaved(entry, groupIds, pluginIds);
    if (group !== null) groups.push(group);
  }
  return { groups };
}

function groupFromSaved(value: unknown, groupIds: Set<string>, pluginIds: Set<string>): Group | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (!value.id || !value.name.trim() || groupIds.has(value.id)) return null;
  groupIds.add(value.id);
  const candidates = Array.isArray(value.pluginIds) ? value.pluginIds : [];
  const assigned: string[] = [];
  for (const id of candidates) {
    if (typeof id !== "string" || !id || pluginIds.has(id)) continue;
    assigned.push(id);
    pluginIds.add(id);
  }
  return { id: value.id, name: value.name.trim(), pluginIds: assigned };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function addGroup(data: GroupData, name: string, id: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || data.groups.some(group => group.id === id || group.name.toLowerCase() === trimmed.toLowerCase())) return false;
  data.groups.push({ id, name: trimmed, pluginIds: [] });
  return true;
}

export function renameGroup(data: GroupData, id: string, name: string): boolean {
  const group = data.groups.find(group => group.id === id);
  const trimmed = name.trim();
  if (!group || !trimmed || data.groups.some(other => other.id !== id && other.name.toLowerCase() === trimmed.toLowerCase())) return false;
  if (group.name === trimmed) return false;
  group.name = trimmed;
  return true;
}

export function removeGroup(data: GroupData, id: string): boolean {
  const index = data.groups.findIndex(group => group.id === id);
  if (index < 0) return false;
  data.groups.splice(index, 1);
  return true;
}

export function groupForPlugin(data: GroupData, pluginId: string): string | null {
  return data.groups.find(group => group.pluginIds.includes(pluginId))?.id ?? null;
}

export function movePlugin(data: GroupData, pluginId: string, groupId: string | null): boolean {
  if (groupId !== null && !data.groups.some(group => group.id === groupId)) return false;
  if (groupForPlugin(data, pluginId) === groupId) return false;
  for (const group of data.groups) group.pluginIds = group.pluginIds.filter(id => id !== pluginId);
  if (groupId !== null) data.groups.find(group => group.id === groupId)!.pluginIds.push(pluginId);
  return true;
}
