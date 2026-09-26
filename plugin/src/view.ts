import { ItemView, Notice, SearchComponent, setIcon, WorkspaceLeaf } from "obsidian";
import { addGroup, groupForPlugin, movePlugin, removeGroup, renameGroup } from "./groups";
import type { Group, GroupData } from "./groups";
import { groupEnabledState, setGroupEnabled, toggleablePlugins } from "./groupToggle";
import type { InstalledPlugin } from "./inventory";
import type { SettingsDestination } from "./settings";

export const VIEW_TYPE = "plugin-groups-admin-view";
const DRAG_TYPE = "application/x-plugin-groups-admin-id";

export interface ViewContext {
  data: GroupData;
  ungroupedSearch: string;
  collapsedGroupIds: Set<string | null>;
  plugins: () => InstalledPlugin[];
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  openSettings: (id: string) => SettingsDestination;
  selfId: string;
  busyGroupIds: Set<string>;
  save: () => void;
}

export class GroupsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly context: ViewContext) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Plugin groups"; }
  getIcon(): string { return "layout-grid"; }

  async onOpen(): Promise<void> {
    this.refresh();
  }

  refresh(): void {
    renderView(this.context, this.contentEl);
  }
}

function renderView(context: ViewContext, container: HTMLElement): void {
  container.empty();
  container.addClass("plugin-groups-admin");
  const plugins = context.plugins();
  renderHeader(context, container, plugins);
  for (const group of context.data.groups) renderGroup(context, container, group, plugins);
  renderUngrouped(context, container, plugins);
}

function renderHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  renderHeading(header, context.data.groups.length, plugins);
  const addButton = header.createEl("button", { cls: "mod-cta plugin-groups-admin-add-button", text: "+ Add group", attr: { type: "button" } });
  const form = header.createEl("form", { cls: "plugin-groups-admin-add" });
  form.hidden = true;
  const input = form.createEl("input", { attr: { type: "text", placeholder: "New group name", "aria-label": "New group name" } });
  form.createEl("button", { cls: "mod-cta", text: "Create group", attr: { type: "submit" } });
  const cancel = form.createEl("button", { text: "Cancel", attr: { type: "button" } });
  addButton.addEventListener("click", () => {
    addButton.hidden = true;
    form.hidden = false;
    input.focus();
  });
  cancel.addEventListener("click", () => hideAddGroupForm(form, addButton, input));
  form.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    hideAddGroupForm(form, addButton, input);
  });
  form.addEventListener("submit", event => addGroupFromForm(event, context, container, input));
}

function hideAddGroupForm(form: HTMLFormElement, addButton: HTMLButtonElement, input: HTMLInputElement): void {
  input.value = "";
  form.hidden = true;
  addButton.hidden = false;
  addButton.focus();
}

function renderHeading(header: HTMLElement, groupCount: number, plugins: InstalledPlugin[]): void {
  const heading = header.createDiv({ cls: "plugin-groups-admin-heading" });
  heading.createEl("h1", { text: "Plugin groups" });
  heading.createEl("p", { cls: "plugin-groups-admin-description", text: "A place for every plugin. Drag to organize, click to configure." });
  const summary = heading.createDiv({ cls: "plugin-groups-admin-summary" });
  summary.createSpan({ text: `${groupCount} ${groupCount === 1 ? "group" : "groups"}` });
  summary.createSpan({ text: `${plugins.length} installed` });
  summary.createSpan({ text: `${plugins.filter(plugin => plugin.enabled).length} enabled` });
}

function addGroupFromForm(event: SubmitEvent, context: ViewContext, container: HTMLElement, input: HTMLInputElement): void {
  event.preventDefault();
  if (!addGroup(context.data, input.value, crypto.randomUUID())) {
    new Notice("Enter a unique group name.");
    input.focus();
    return;
  }
  changed(context, container);
}

function renderGroup(context: ViewContext, container: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const groupPlugins = plugins.filter(plugin => groupForPlugin(context.data, plugin.id) === group.id);
  const { section, body } = createSection(context, container, group.name, groupPlugins.length, group.id);
  renderGroupActions(context, container, section, group, groupPlugins);
  renderDropTarget(context, container, section, group.id, plugins);
  renderPlugins(context, container, body, groupPlugins);
}

function renderUngrouped(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const ungrouped = plugins.filter(plugin => groupForPlugin(context.data, plugin.id) === null);
  const { section, body } = createSection(context, container, "Ungrouped", ungrouped.length, null);
  const list = body.createDiv({ cls: "plugin-groups-admin-list" });
  renderUngroupedSearch(context, container, section, list, ungrouped);
  renderDropTarget(context, container, section, null, plugins);
  renderUngroupedList(context, container, list, ungrouped);
  if (plugins.length === 0) body.createDiv({ cls: "plugin-groups-admin-empty", text: "No community plugins are installed." });
}

function renderUngroupedSearch(context: ViewContext, container: HTMLElement, section: HTMLElement, list: HTMLElement, plugins: InstalledPlugin[]): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const searchContainer = heading.createDiv({ cls: "plugin-groups-admin-ungrouped-search" });
  const search = new SearchComponent(searchContainer);
  search.setPlaceholder("Search plugins").setValue(context.ungroupedSearch);
  search.inputEl.setAttribute("aria-label", "Search ungrouped plugins");
  search.onChange(value => {
    context.ungroupedSearch = value;
    renderUngroupedList(context, container, list, plugins);
  });
}

function renderUngroupedList(context: ViewContext, container: HTMLElement, list: HTMLElement, plugins: InstalledPlugin[]): void {
  const query = context.ungroupedSearch.trim().toLocaleLowerCase();
  const matches = plugins.filter(plugin => plugin.name.toLocaleLowerCase().includes(query) || plugin.id.toLocaleLowerCase().includes(query));
  list.empty();
  if (matches.length === 0 && query) list.createDiv({ cls: "plugin-groups-admin-empty", text: "No matching plugins." });
  else if (matches.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of matches) renderPlugin(context, container, list, plugin);
}

interface GroupSection {
  section: HTMLElement;
  body: HTMLElement;
}

function createSection(context: ViewContext, container: HTMLElement, name: string, count: number, groupId: string | null): GroupSection {
  const section = container.createEl("section", { cls: "plugin-groups-admin-section" });
  const heading = section.createDiv({ cls: "plugin-groups-admin-section-header" });
  const body = section.createDiv({ cls: "plugin-groups-admin-section-body" });
  body.id = `plugin-groups-admin-body-${crypto.randomUUID()}`;
  body.hidden = context.collapsedGroupIds.has(groupId);
  section.classList.toggle("is-collapsed", body.hidden);
  renderCollapseButton(context, section, heading, body, name, groupId);
  heading.createEl("span", { cls: "plugin-groups-admin-count", text: String(count) });
  return { section, body };
}

function renderCollapseButton(context: ViewContext, section: HTMLElement, heading: HTMLElement, body: HTMLElement, name: string, groupId: string | null): void {
  const title = heading.createEl("h2");
  const button = title.createEl("button", { cls: "plugin-groups-admin-collapse", attr: { type: "button", "aria-controls": body.id } });
  setIcon(button.createSpan({ cls: "plugin-groups-admin-chevron" }), "chevron-down");
  button.createSpan({ text: name });
  updateCollapseButton(button, name, body.hidden);
  button.addEventListener("click", () => toggleSection(context, section, body, button, name, groupId));
}

function toggleSection(context: ViewContext, section: HTMLElement, body: HTMLElement, button: HTMLButtonElement, name: string, groupId: string | null): void {
  body.hidden = !body.hidden;
  if (body.hidden) context.collapsedGroupIds.add(groupId);
  else context.collapsedGroupIds.delete(groupId);
  section.classList.toggle("is-collapsed", body.hidden);
  updateCollapseButton(button, name, body.hidden);
}

function updateCollapseButton(button: HTMLButtonElement, name: string, collapsed: boolean): void {
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${name}`);
}

function renderGroupActions(context: ViewContext, container: HTMLElement, section: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const actions = heading.createDiv({ cls: "plugin-groups-admin-actions" });
  const rename = actions.createEl("button", { text: "Rename", attr: { type: "button", "aria-label": `Rename ${group.name}` } });
  const remove = actions.createEl("button", { cls: "plugin-groups-admin-delete", text: "Delete", attr: { type: "button", "aria-label": `Delete ${group.name}` } });
  renderGroupToggle(context, container, actions, group, plugins);
  rename.addEventListener("click", () => showRenameInput(context, container, heading, group));
  remove.addEventListener("click", () => confirmRemoveGroup(context, container, group));
}

function renderGroupToggle(context: ViewContext, container: HTMLElement, actions: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const manageable = toggleablePlugins(plugins, context.selfId);
  const state = groupEnabledState(manageable);
  const busy = context.busyGroupIds.has(group.id);
  const label = actions.createEl("label", { cls: "plugin-groups-admin-toggle plugin-groups-admin-group-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": `Plugins in ${group.name}` } });
  toggle.checked = state === "enabled";
  toggle.disabled = manageable.length === 0 || busy;
  if (busy) label.setAttribute("title", "Updating plugins…");
  else if (plugins.some(plugin => plugin.id === context.selfId)) label.setAttribute("title", "Plugin Groups Admin stays enabled.");
  label.createEl("span", { cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void changeGroupEnabled(context, container, group, manageable, toggle.checked); });
}

async function changeGroupEnabled(context: ViewContext, container: HTMLElement, group: Group, plugins: InstalledPlugin[], enabled: boolean): Promise<void> {
  context.busyGroupIds.add(group.id);
  renderView(context, container);
  try {
    await setGroupEnabled(plugins, enabled, context.setEnabled);
  } catch (error) {
    console.error(`Failed to change group ${group.name}`, error);
    new Notice(`Could not update all plugins in ${group.name}.`);
  }
  context.busyGroupIds.delete(group.id);
  renderView(context, container);
}

function showRenameInput(context: ViewContext, container: HTMLElement, heading: HTMLElement, group: Group): void {
  const title = heading.querySelector("h2")!;
  const input = document.createElement("input");
  input.value = group.name;
  input.setAttribute("aria-label", `New name for ${group.name}`);
  title.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener("keydown", event => handleRenameKey(event, context, container, group, input));
  input.addEventListener("blur", () => renderView(context, container), { once: true });
}

function handleRenameKey(event: KeyboardEvent, context: ViewContext, container: HTMLElement, group: Group, input: HTMLInputElement): void {
  if (event.key === "Escape") renderView(context, container);
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (renameGroup(context.data, group.id, input.value)) changed(context, container);
  else if (input.value.trim() !== group.name) new Notice("Enter a unique group name.");
  if (input.isConnected) renderView(context, container);
}

function confirmRemoveGroup(context: ViewContext, container: HTMLElement, group: Group): void {
  const message = `Delete “${group.name}”? Its plugins will move to Ungrouped.`;
  if (!window.confirm(message)) return;
  if (!removeGroup(context.data, group.id)) return;
  context.collapsedGroupIds.delete(group.id);
  changed(context, container);
}

function renderDropTarget(context: ViewContext, container: HTMLElement, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.addEventListener("dragover", event => allowDrop(event, section));
  section.addEventListener("dragleave", event => clearDropHighlight(event, section));
  section.addEventListener("drop", event => handleDrop(event, context, container, section, groupId, plugins));
}

function allowDrop(event: DragEvent, section: HTMLElement): void {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  section.addClass("is-drag-over");
}

function clearDropHighlight(event: DragEvent, section: HTMLElement): void {
  if (!section.contains(event.relatedTarget as Node)) section.removeClass("is-drag-over");
}

function handleDrop(event: DragEvent, context: ViewContext, container: HTMLElement, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.removeClass("is-drag-over");
  const pluginId = event.dataTransfer?.getData(DRAG_TYPE) ?? "";
  if (!plugins.some(plugin => plugin.id === pluginId)) return;
  event.preventDefault();
  if (movePlugin(context.data, pluginId, groupId)) changed(context, container);
}

function renderPlugins(context: ViewContext, container: HTMLElement, section: HTMLElement, plugins: InstalledPlugin[]): void {
  const list = section.createDiv({ cls: "plugin-groups-admin-list" });
  if (plugins.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of plugins) renderPlugin(context, container, list, plugin);
}

function renderPlugin(context: ViewContext, container: HTMLElement, list: HTMLElement, plugin: InstalledPlugin): void {
  const row = list.createDiv({ cls: `plugin-groups-admin-plugin${plugin.enabled ? "" : " is-disabled"}` });
  setIcon(row.createSpan({ cls: "plugin-groups-admin-grip", attr: { "aria-hidden": "true" } }), "grip-vertical");
  row.draggable = true;
  row.addEventListener("dragstart", event => startDrag(event, plugin.id));
  row.addEventListener("click", event => openPluginFromRow(event, context, plugin));
  const name = row.createEl("button", { cls: "plugin-groups-admin-plugin-name", text: plugin.name, attr: { type: "button" } });
  name.addEventListener("click", () => openPlugin(context, plugin));
  row.createEl("span", { cls: "plugin-groups-admin-version", text: `v${plugin.version}` });
  renderMoveSelect(context, container, row, plugin);
  renderEnabledToggle(context, container, row, plugin);
}

function openPluginFromRow(event: MouseEvent, context: ViewContext, plugin: InstalledPlugin): void {
  if (event.target instanceof Element && event.target.closest("button, select, input, label")) return;
  openPlugin(context, plugin);
}

function openPlugin(context: ViewContext, plugin: InstalledPlugin): void {
  const destination = context.openSettings(plugin.id);
  if (destination === "community") new Notice(`${plugin.name} has no settings page. Showing Community plugins.`);
  if (destination === "unavailable") new Notice("Could not open Obsidian settings.");
}

function renderEnabledToggle(context: ViewContext, container: HTMLElement, row: HTMLElement, plugin: InstalledPlugin): void {
  const label = row.createEl("label", { cls: "plugin-groups-admin-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": plugin.name } });
  toggle.checked = plugin.enabled;
  toggle.disabled = plugin.id === context.selfId || context.busyGroupIds.has(groupForPlugin(context.data, plugin.id) ?? "");
  if (plugin.id === context.selfId) label.setAttribute("title", "This plugin cannot disable itself from its own tab.");
  label.createEl("span", { cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void changeEnabled(context, container, plugin, toggle); });
}

async function changeEnabled(context: ViewContext, container: HTMLElement, plugin: InstalledPlugin, toggle: HTMLInputElement): Promise<void> {
  toggle.disabled = true;
  try {
    await context.setEnabled(plugin.id, toggle.checked);
  } catch (error) {
    console.error(`Failed to change ${plugin.name}`, error);
    new Notice(`Could not change ${plugin.name}.`);
  }
  renderView(context, container);
}

function startDrag(event: DragEvent, pluginId: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, pluginId);
}

function renderMoveSelect(context: ViewContext, container: HTMLElement, row: HTMLElement, plugin: InstalledPlugin): void {
  const select = row.createEl("select", { attr: { "aria-label": `Move ${plugin.name} to group` } });
  select.createEl("option", { text: "Ungrouped", attr: { value: "" } });
  for (const group of context.data.groups) select.createEl("option", { text: group.name, attr: { value: group.id } });
  select.value = groupForPlugin(context.data, plugin.id) ?? "";
  select.addEventListener("change", () => {
    if (movePlugin(context.data, plugin.id, select.value || null)) changed(context, container);
  });
}

function changed(context: ViewContext, container: HTMLElement): void {
  context.save();
  renderView(context, container);
}
