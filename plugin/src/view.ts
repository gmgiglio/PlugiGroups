import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { addGroup, groupForPlugin, movePlugin, removeGroup, renameGroup } from "./groups";
import type { Group, GroupData } from "./groups";
import { groupEnabledState, setGroupEnabled, toggleablePlugins } from "./groupToggle";
import type { GroupEnabledState } from "./groupToggle";
import type { InstalledPlugin } from "./inventory";

export const VIEW_TYPE = "plugin-groups-admin-view";
const DRAG_TYPE = "application/x-plugin-groups-admin-id";

export interface ViewContext {
  data: GroupData;
  plugins: () => InstalledPlugin[];
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
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
  renderHeader(context, container);
  for (const group of context.data.groups) renderGroup(context, container, group, plugins);
  renderUngrouped(context, container, plugins);
}

function renderHeader(context: ViewContext, container: HTMLElement): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  header.createEl("h1", { text: "Plugin groups" });
  const form = header.createEl("form", { cls: "plugin-groups-admin-add" });
  const input = form.createEl("input", { attr: { type: "text", placeholder: "New group name", "aria-label": "New group name" } });
  form.createEl("button", { text: "Add group", attr: { type: "submit" } });
  form.addEventListener("submit", event => addGroupFromForm(event, context, container, input));
}

function addGroupFromForm(event: SubmitEvent, context: ViewContext, container: HTMLElement, input: HTMLInputElement): void {
  event.preventDefault();
  if (!addGroup(context.data, input.value, crypto.randomUUID())) {
    new Notice("Enter a unique group name.");
    return;
  }
  changed(context, container);
}

function renderGroup(context: ViewContext, container: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const groupPlugins = plugins.filter(plugin => groupForPlugin(context.data, plugin.id) === group.id);
  const section = createSection(container, group.name, groupPlugins.length);
  renderGroupActions(context, container, section, group, groupPlugins);
  renderDropTarget(context, container, section, group.id, plugins);
  renderPlugins(context, container, section, groupPlugins);
}

function renderUngrouped(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const ungrouped = plugins.filter(plugin => groupForPlugin(context.data, plugin.id) === null);
  const section = createSection(container, "Ungrouped", ungrouped.length);
  renderDropTarget(context, container, section, null, plugins);
  renderPlugins(context, container, section, ungrouped);
  if (plugins.length === 0) section.createDiv({ cls: "plugin-groups-admin-empty", text: "No community plugins are installed." });
}

function createSection(container: HTMLElement, name: string, count: number): HTMLElement {
  const section = container.createEl("section", { cls: "plugin-groups-admin-section" });
  const heading = section.createDiv({ cls: "plugin-groups-admin-section-header" });
  heading.createEl("h2", { text: name });
  heading.createEl("span", { cls: "plugin-groups-admin-count", text: String(count) });
  return section;
}

function renderGroupActions(context: ViewContext, container: HTMLElement, section: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const actions = heading.createDiv({ cls: "plugin-groups-admin-actions" });
  renderGroupToggle(context, container, actions, group, plugins);
  const rename = actions.createEl("button", { text: "Rename", attr: { type: "button", "aria-label": `Rename ${group.name}` } });
  const remove = actions.createEl("button", { text: "Delete", attr: { type: "button", "aria-label": `Delete ${group.name}` } });
  rename.addEventListener("click", () => showRenameInput(context, container, heading, group));
  remove.addEventListener("click", () => confirmRemoveGroup(context, container, group));
}

function renderGroupToggle(context: ViewContext, container: HTMLElement, actions: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const manageable = toggleablePlugins(plugins, context.selfId);
  const state = groupEnabledState(manageable);
  const busy = context.busyGroupIds.has(group.id);
  const label = actions.createEl("label", { cls: "plugin-groups-admin-toggle plugin-groups-admin-group-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": `Enable plugins in ${group.name}` } });
  toggle.checked = state === "enabled";
  toggle.indeterminate = state === "mixed";
  toggle.disabled = manageable.length === 0 || busy;
  if (plugins.some(plugin => plugin.id === context.selfId)) label.setAttribute("title", "Plugin Groups Admin stays enabled.");
  label.createEl("span", { cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  label.createEl("span", { text: groupToggleText(plugins, manageable, state, busy) });
  toggle.addEventListener("change", () => { void changeGroupEnabled(context, container, group, manageable, toggle.checked); });
}

function groupToggleText(plugins: InstalledPlugin[], manageable: InstalledPlugin[], state: GroupEnabledState, busy: boolean): string {
  if (busy) return "Updating…";
  if (manageable.length === 0) return plugins.length === 0 ? "Empty" : "No others";
  if (state === "mixed") return "Mixed";
  return state === "enabled" ? "Enabled" : "Disabled";
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
  if (removeGroup(context.data, group.id)) changed(context, container);
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
  const row = list.createDiv({ cls: "plugin-groups-admin-plugin" });
  row.draggable = true;
  row.addEventListener("dragstart", event => startDrag(event, plugin.id));
  row.createEl("span", { cls: "plugin-groups-admin-plugin-name", text: plugin.name });
  row.createEl("span", { cls: "plugin-groups-admin-version", text: plugin.version });
  renderEnabledToggle(context, container, row, plugin);
  renderMoveSelect(context, container, row, plugin);
}

function renderEnabledToggle(context: ViewContext, container: HTMLElement, row: HTMLElement, plugin: InstalledPlugin): void {
  const label = row.createEl("label", { cls: "plugin-groups-admin-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": `Enable ${plugin.name}` } });
  toggle.checked = plugin.enabled;
  toggle.disabled = plugin.id === context.selfId || context.busyGroupIds.has(groupForPlugin(context.data, plugin.id) ?? "");
  if (plugin.id === context.selfId) label.setAttribute("title", "This plugin cannot disable itself from its own tab.");
  label.createEl("span", { cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  label.createEl("span", { text: plugin.enabled ? "Enabled" : "Disabled" });
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
