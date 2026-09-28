import { SearchComponent } from "obsidian";
import { firstGroupIdForPlugin } from "../groups";
import type { InstalledPlugin } from "../inventory";
import type { ViewContext } from "./context";
import { registerPluginDropTarget } from "./pluginDrop";
import { renderPluginRow } from "./pluginRow";
import { renderSectionDragHandle } from "./sectionDrag";
import { createPluginSection } from "./sectionShared";

export function renderUngrouped(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const ungrouped = plugins.filter(plugin => firstGroupIdForPlugin(context.data, plugin.id) === null);
  const { section, body } = createPluginSection(context, container, "Ungrouped", ungrouped.length, null);
  section.dataset.groupId = "";
  renderSectionDragHandle(container, section, "Ungrouped", null);
  const list = body.createDiv({ cls: "plugin-groups-admin-list" });
  renderUngroupedSearch(context, section, list, ungrouped);
  registerPluginDropTarget(context, section, null, plugins);
  renderUngroupedList(context, list, ungrouped);
  if (plugins.length === 0) body.createDiv({ cls: "plugin-groups-admin-empty", text: "No community plugins are installed." });
}

function renderUngroupedSearch(context: ViewContext, section: HTMLElement, list: HTMLElement, plugins: InstalledPlugin[]): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const searchContainer = heading.createDiv({ cls: "plugin-groups-admin-ungrouped-search" });
  const search = new SearchComponent(searchContainer);
  search.setPlaceholder("Search plugins").setValue(context.ungroupedSearch);
  search.inputEl.setAttribute("aria-label", "Search ungrouped plugins");
  search.onChange(value => {
    context.ungroupedSearch = value;
    renderUngroupedList(context, list, plugins);
  });
}

function renderUngroupedList(context: ViewContext, list: HTMLElement, plugins: InstalledPlugin[]): void {
  const query = context.ungroupedSearch.trim().toLocaleLowerCase();
  const matches = plugins.filter(plugin => plugin.name.toLocaleLowerCase().includes(query) || plugin.id.toLocaleLowerCase().includes(query));
  list.empty();
  if (matches.length === 0 && query) list.createDiv({ cls: "plugin-groups-admin-empty", text: "No matching plugins." });
  else if (matches.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of matches) renderPluginRow(context, list, plugin, null);
}
