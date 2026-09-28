export interface Group {
  id: string;
  name: string;
  pluginIds: string[];
}

export interface GroupData {
  groups: Group[];
  allowMultipleGroups: boolean;
  showRibbonButton: boolean;
  ungroupedIndex: number;
}

export function dataFromSaved(value: unknown): GroupData {
  const source = isRecord(value) && Array.isArray(value.groups) ? value.groups : [];
  const groups: Group[] = [];
  const groupIds = new Set<string>();
  const allowMultipleGroups = isRecord(value) && value.allowMultipleGroups === true;
  const showRibbonButton = !isRecord(value) || value.showRibbonButton !== false;
  const pluginIds = new Set<string>();
  for (const entry of source) {
    const group = groupFromSaved(entry, groupIds, pluginIds, allowMultipleGroups);
    if (group !== null) groups.push(group);
  }
  return { groups, allowMultipleGroups, showRibbonButton, ungroupedIndex: ungroupedIndexFromSaved(value, groups.length) };
}

function ungroupedIndexFromSaved(value: unknown, groupCount: number): number {
  const index = isRecord(value) ? value.ungroupedIndex : null;
  return typeof index === "number" && Number.isInteger(index)
    ? Math.max(0, Math.min(index, groupCount)) : groupCount;
}

function groupFromSaved(value: unknown, groupIds: Set<string>, pluginIds: Set<string>, allowMultipleGroups: boolean): Group | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (!value.id || !value.name.trim() || groupIds.has(value.id)) return null;
  groupIds.add(value.id);
  const candidates = Array.isArray(value.pluginIds) ? value.pluginIds : [];
  const assigned: string[] = [];
  for (const id of candidates) {
    if (typeof id !== "string" || !id || assigned.includes(id) || (!allowMultipleGroups && pluginIds.has(id))) continue;
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
  if (data.ungroupedIndex === data.groups.length) data.ungroupedIndex++;
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
  if (index < data.ungroupedIndex) data.ungroupedIndex--;
  data.groups.splice(index, 1);
  return true;
}

export function sectionIds(data: GroupData): (string | null)[] {
  const ids: (string | null)[] = data.groups.map(group => group.id);
  ids.splice(data.ungroupedIndex, 0, null);
  return ids;
}

export function reorderSection(data: GroupData, id: string | null, targetId: string | null, position: "before" | "after"): boolean {
  const order = sectionIds(data);
  const from = order.indexOf(id);
  const target = order.indexOf(targetId);
  if (from < 0 || target < 0 || from === target) return false;
  const destination = target + (position === "after" ? 1 : 0) - (from < target ? 1 : 0);
  if (from === destination) return false;
  const [sectionId] = order.splice(from, 1);
  order.splice(destination, 0, sectionId);
  setSectionOrder(data, order);
  return true;
}

function setSectionOrder(data: GroupData, order: (string | null)[]): void {
  const groupsById = new Map(data.groups.map(group => [group.id, group]));
  data.groups = order.filter((id): id is string => id !== null).map(id => groupsById.get(id)!);
  data.ungroupedIndex = order.indexOf(null);
}

export function groupForPlugin(data: GroupData, pluginId: string): string | null {
  return data.groups.find(group => group.pluginIds.includes(pluginId))?.id ?? null;
}

export function setMultipleGroupsAllowed(data: GroupData, allowed: boolean): void {
  data.allowMultipleGroups = allowed;
  if (allowed) return;
  const assigned = new Set<string>();
  for (const group of data.groups) {
    group.pluginIds = group.pluginIds.filter(id => !assigned.has(id));
    for (const id of group.pluginIds) assigned.add(id);
  }
}

export function addPluginToGroup(data: GroupData, pluginId: string, groupId: string): boolean {
  const group = data.groups.find(group => group.id === groupId);
  if (!group || group.pluginIds.includes(pluginId)) return false;
  if (!data.allowMultipleGroups) return movePlugin(data, pluginId, groupId);
  group.pluginIds.push(pluginId);
  return true;
}

export function removePluginFromGroup(data: GroupData, pluginId: string, groupId: string): boolean {
  const group = data.groups.find(group => group.id === groupId);
  if (!group?.pluginIds.includes(pluginId)) return false;
  group.pluginIds = group.pluginIds.filter(id => id !== pluginId);
  return true;
}

export function movePlugin(data: GroupData, pluginId: string, groupId: string | null): boolean {
  if (groupId !== null && !data.groups.some(group => group.id === groupId)) return false;
  if (groupForPlugin(data, pluginId) === groupId) return false;
  for (const group of data.groups) group.pluginIds = group.pluginIds.filter(id => id !== pluginId);
  if (groupId !== null) data.groups.find(group => group.id === groupId)!.pluginIds.push(pluginId);
  return true;
}
