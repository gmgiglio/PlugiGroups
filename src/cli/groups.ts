import { orderedSectionIdsIncludingUngrouped, type Group, type GroupData } from "../groups";
import type { InstalledPlugin } from "../inventory";

export const UNGROUPED_ID = "ungrouped";
export const UNGROUPED_NAME = "Ungrouped";

export function ungroupedPluginIds(data: GroupData, plugins: InstalledPlugin[]): string[] {
  const assigned = new Set(data.groups.flatMap(group => group.pluginIds));
  return plugins.filter(plugin => !assigned.has(plugin.id)).map(plugin => plugin.id);
}

export function cliGroups(data: GroupData, plugins: InstalledPlugin[]): Group[] {
  const ungrouped: Group = { id: UNGROUPED_ID, name: UNGROUPED_NAME, pluginIds: ungroupedPluginIds(data, plugins) };
  return orderedSectionIdsIncludingUngrouped(data).map(id => id === null ? ungrouped : data.groups.find(group => group.id === id)!);
}

export function groupSectionId(group: Group): string | null {
  return group.id === UNGROUPED_ID ? null : group.id;
}
