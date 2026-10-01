import { renderUngroupedSearch } from "./ungroupedSearch";
import type { GroupsSearchState } from "./search";
import { firstGroupIdForPlugin } from "../groups";
import type { InstalledPlugin } from "../inventory";
import type { ViewContext } from "./context";
import { registerPluginDropTarget } from "./pluginDrop";
import { renderPluginRow } from "./pluginRow";
import { renderSectionDragHandle } from "./sectionDrag";
import { createPluginSection } from "./sectionShared";

export function renderUngrouped(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[], search: GroupsSearchState): void {
  const ungrouped = plugins.filter(plugin => firstGroupIdForPlugin(context.data, plugin.id) === null);
  const { section, body } = createPluginSection(context, container, "Ungrouped", ungrouped.length, null);
  section.dataset.groupId = "";
  renderSectionDragHandle(container, section, "Ungrouped", null);
  const list = body.createDiv({ cls: "plugin-groups-admin-list" });
  registerPluginDropTarget(context, section, null, plugins);
  renderUngroupedList(context, list, ungrouped);
  renderUngroupedSearch(search, section, container, context);
  if (plugins.length === 0) body.createDiv({ cls: "plugin-groups-admin-empty", text: "No community plugins are installed." });
}

function renderUngroupedList(context: ViewContext, list: HTMLElement, plugins: InstalledPlugin[]): void {
  if (plugins.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of plugins) renderPluginRow(context, list, plugin, null);
}
