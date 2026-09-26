import { App, ItemView, Notice, SearchComponent, setIcon, SuggestModal, WorkspaceLeaf } from "obsidian";
import { addGroup, addPluginToGroup, groupForPlugin, movePlugin, removeGroup, removePluginFromGroup, renameGroup, reorderSection, sectionIds } from "./groups";
import type { Group, GroupData } from "./groups";
import { groupEnabledState, setGroupEnabled, toggleablePlugins } from "./groupToggle";
import type { InstalledPlugin } from "./inventory";
import type { SettingsDestination } from "./settings";

export const VIEW_TYPE = "plugin-groups-admin-view";
const DRAG_TYPE = "application/x-plugin-groups-admin-id";
const DRAG_SOURCE_TYPE = "application/x-plugin-groups-admin-source";
const GROUP_DRAG_TYPE = "application/x-plugin-groups-admin-group";
const UNGROUPED_DRAG_TYPE = "application/x-plugin-groups-admin-ungrouped";

export interface ViewContext {
  app: App;
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
    this.registerDomEvent(this.contentEl, "dragover", event => allowGroupDrop(event, this.contentEl));
    this.registerDomEvent(this.contentEl, "drop", event => dropGroup(event, this.context, this.contentEl));
    this.refresh();
  }

  refresh(): void {
    renderView(this.context, this.contentEl);
  }
}

class AddPluginModal extends SuggestModal<InstalledPlugin> {
  constructor(app: App, private readonly context: ViewContext, private readonly container: HTMLElement, private readonly group: Group) {
    super(app);
    this.setPlaceholder(`Add a plugin to ${group.name}`);
    this.emptyStateText = "No available plugins";
  }

  getSuggestions(query: string): InstalledPlugin[] {
    const search = query.trim().toLocaleLowerCase();
    return this.context.plugins()
      .filter(plugin => !this.group.pluginIds.includes(plugin.id))
      .filter(plugin => plugin.name.toLocaleLowerCase().includes(search) || plugin.id.toLocaleLowerCase().includes(search))
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  renderSuggestion(plugin: InstalledPlugin, element: HTMLElement): void {
    element.setText(plugin.name);
  }

  onChooseSuggestion(plugin: InstalledPlugin): void {
    if (addPluginToGroup(this.context.data, plugin.id, this.group.id)) changed(this.context, this.container);
  }
}

function renderView(context: ViewContext, container: HTMLElement): void {
  container.empty();
  container.addClass("plugin-groups-admin");
  const plugins = context.plugins();
  renderHeader(context, container, plugins);
  for (const id of sectionIds(context.data)) {
    if (id === null) renderUngrouped(context, container, plugins);
    else renderGroup(context, container, context.data.groups.find(group => group.id === id)!, plugins);
  }
}

function renderHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  renderHeading(header, context.data.groups.length, plugins);
  renderSettingsButton(context, header);
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

function renderSettingsButton(context: ViewContext, header: HTMLElement): void {
  const button = header.createEl("button", { text: "Settings", attr: { type: "button", "aria-label": "Open Plugin Groups Admin settings" } });
  button.addEventListener("click", () => {
    if (context.openSettings(context.selfId) === "unavailable") new Notice("Could not open Obsidian settings.");
  });
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
  const groupPlugins = plugins.filter(plugin => group.pluginIds.includes(plugin.id));
  const { section, body } = createSection(context, container, group.name, groupPlugins.length, group.id);
  section.dataset.groupId = group.id;
  renderGroupReordering(container, section, group.name, group.id);
  renderGroupActions(context, container, section, group, groupPlugins);
  renderDropTarget(context, container, section, group.id, plugins);
  renderPlugins(context, container, body, groupPlugins, group.id);
}

function renderGroupReordering(container: HTMLElement, section: HTMLElement, name: string, groupId: string | null): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const handle = heading.createEl("span", { cls: "plugin-groups-admin-group-grip", attr: { draggable: "true", role: "img", "aria-label": `Drag to reorder ${name}`, title: `Drag to reorder ${name}` } });
  heading.prepend(handle);
  setIcon(handle, "grip-vertical");
  handle.addEventListener("dragstart", event => startGroupDrag(event, container, section, groupId));
  handle.addEventListener("dragend", () => clearGroupDropHighlights(container));
}

function startGroupDrag(event: DragEvent, container: HTMLElement, section: HTMLElement, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(groupId === null ? UNGROUPED_DRAG_TYPE : GROUP_DRAG_TYPE, groupId ?? "ungrouped");
  showGroupDropTarget(container, { section, groupId, position: "before", y: section.getBoundingClientRect().top });
}

interface GroupDropTarget {
  section: HTMLElement;
  groupId: string | null;
  position: "before" | "after";
  y: number;
}

function groupDropTargets(container: HTMLElement): GroupDropTarget[] {
  const sections = Array.from(container.querySelectorAll<HTMLElement>(".plugin-groups-admin-section[data-group-id]"));
  const targets = sections.map((section, index): GroupDropTarget => ({
    section, groupId: section.dataset.groupId || null, position: "before",
    y: index === 0 ? section.getBoundingClientRect().top : (sections[index - 1].getBoundingClientRect().bottom + section.getBoundingClientRect().top) / 2,
  }));
  const last = sections[sections.length - 1];
  if (last) targets.push({ section: last, groupId: last.dataset.groupId || null, position: "after", y: last.getBoundingClientRect().bottom + 10 });
  return targets;
}

function nearestGroupDropTarget(container: HTMLElement, y: number): GroupDropTarget | null {
  const targets = groupDropTargets(container);
  return targets.reduce<GroupDropTarget | null>((nearest, target) =>
    nearest === null || Math.abs(target.y - y) < Math.abs(nearest.y - y) ? target : nearest, null);
}

function showGroupDropTarget(container: HTMLElement, target: GroupDropTarget): void {
  const className = target.position === "before" ? "is-group-drop-before" : "is-group-drop-after";
  if (target.section.hasClass(className)) return;
  clearGroupDropHighlights(container);
  target.section.addClass(className);
}

function allowGroupDrop(event: DragEvent, container: HTMLElement): void {
  if (!isSectionDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const target = nearestGroupDropTarget(container, event.clientY);
  if (target) showGroupDropTarget(container, target);
}

function dropGroup(event: DragEvent, context: ViewContext, container: HTMLElement): void {
  const transfer = event.dataTransfer;
  if (!isSectionDrag(transfer)) return;
  const groupId = transfer.types.includes(UNGROUPED_DRAG_TYPE) ? null : transfer.getData(GROUP_DRAG_TYPE);
  event.preventDefault();
  const target = nearestGroupDropTarget(container, event.clientY);
  clearGroupDropHighlights(container);
  if (target && reorderSection(context.data, groupId, target.groupId, target.position)) changed(context, container);
}

function isSectionDrag(transfer: DataTransfer | null): transfer is DataTransfer {
  return transfer !== null && (transfer.types.includes(GROUP_DRAG_TYPE) || transfer.types.includes(UNGROUPED_DRAG_TYPE));
}

function clearGroupDropHighlights(container: HTMLElement): void {
  for (const section of Array.from(container.querySelectorAll(".plugin-groups-admin-section"))) section.classList.remove("is-group-drop-before", "is-group-drop-after");
}

function renderUngrouped(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const ungrouped = plugins.filter(plugin => groupForPlugin(context.data, plugin.id) === null);
  const { section, body } = createSection(context, container, "Ungrouped", ungrouped.length, null);
  section.dataset.groupId = "";
  renderGroupReordering(container, section, "Ungrouped", null);
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
  for (const plugin of matches) renderPlugin(context, container, list, plugin, null);
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
  const add = actions.createEl("button", { text: "+ Add plugin", attr: { type: "button", "aria-label": `Add plugin to ${group.name}` } });
  const rename = actions.createEl("button", { text: "Rename", attr: { type: "button", "aria-label": `Rename ${group.name}` } });
  const remove = actions.createEl("button", { cls: "plugin-groups-admin-delete", text: "Delete", attr: { type: "button", "aria-label": `Delete ${group.name}` } });
  renderGroupToggle(context, container, actions, group, plugins);
  add.addEventListener("click", () => new AddPluginModal(context.app, context, container, group).open());
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
  const message = context.data.allowMultipleGroups
    ? `Delete “${group.name}”? Plugins in other groups will keep those memberships.`
    : `Delete “${group.name}”? Its plugins will move to Ungrouped.`;
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
  const sourceId = event.dataTransfer?.getData(DRAG_SOURCE_TYPE) || null;
  const updated = context.data.allowMultipleGroups
    ? groupId === null ? sourceId !== null && removePluginFromGroup(context.data, pluginId, sourceId) : addPluginToGroup(context.data, pluginId, groupId)
    : movePlugin(context.data, pluginId, groupId);
  if (updated) changed(context, container);
}

function renderPlugins(context: ViewContext, container: HTMLElement, section: HTMLElement, plugins: InstalledPlugin[], groupId: string): void {
  const list = section.createDiv({ cls: "plugin-groups-admin-list" });
  if (plugins.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of plugins) renderPlugin(context, container, list, plugin, groupId);
}

function renderPlugin(context: ViewContext, container: HTMLElement, list: HTMLElement, plugin: InstalledPlugin, groupId: string | null): void {
  const row = list.createDiv({ cls: `plugin-groups-admin-plugin${plugin.enabled ? "" : " is-disabled"}` });
  setIcon(row.createSpan({ cls: "plugin-groups-admin-grip", attr: { "aria-hidden": "true" } }), "grip-vertical");
  row.draggable = true;
  row.addEventListener("dragstart", event => startDrag(event, plugin.id, groupId));
  row.addEventListener("click", event => openPluginFromRow(event, context, plugin));
  const details = row.createDiv({ cls: "plugin-groups-admin-plugin-details" });
  const name = details.createEl("button", { cls: "plugin-groups-admin-plugin-name", text: plugin.name, attr: { type: "button" } });
  name.addEventListener("click", () => openPlugin(context, plugin));
  if (plugin.description) details.createDiv({ cls: "plugin-groups-admin-plugin-description", text: plugin.description });
  row.createEl("span", { cls: "plugin-groups-admin-version", text: `v${plugin.version}` });
  renderEnabledToggle(context, container, row, plugin);
}

function openPluginFromRow(event: MouseEvent, context: ViewContext, plugin: InstalledPlugin): void {
  if (event.target instanceof Element && event.target.closest("button, input, label")) return;
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
  toggle.disabled = plugin.id === context.selfId || context.data.groups.some(group => group.pluginIds.includes(plugin.id) && context.busyGroupIds.has(group.id));
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

function startDrag(event: DragEvent, pluginId: string, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, pluginId);
  event.dataTransfer.setData(DRAG_SOURCE_TYPE, groupId ?? "");
}

function changed(context: ViewContext, container: HTMLElement): void {
  context.save();
  renderView(context, container);
}
