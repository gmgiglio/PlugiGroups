import { App, ItemView, Notice, SearchComponent, setIcon, SuggestModal, WorkspaceLeaf } from "obsidian";
import { addGroup, addPluginToGroup, firstGroupIdForPlugin, movePluginToGroup, removeGroup, removePluginFromGroup, renameGroup, reorderSection, orderedSectionIdsIncludingUngrouped } from "./groups";
import type { Group, GroupData } from "./groups";
import { groupEnabledState, setGroupPluginsEnabled, pluginsEligibleForGroupToggle } from "./groupToggle";
import type { InstalledPlugin } from "./inventory";
import { runPluginOperationWithPendingState } from "./pendingPluginOperations";
import { showPluginMenu } from "./pluginMenu";
import type { SettingsDestination } from "./pluginApi";

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
  getInstalledPlugins: () => InstalledPlugin[];
  setPluginEnabled: (id: string, enabled: boolean) => Promise<void>;
  openPluginSettings: (id: string) => SettingsDestination;
  selfId: string;
  pendingPluginIds: Set<string>;
  refreshOpenGroupsViews: () => void;
  queueGroupDataSave: () => void;
}

export class GroupsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly context: ViewContext) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Plugin groups"; }
  getIcon(): string { return "layout-grid"; }

  async onOpen(): Promise<void> {
    this.registerDomEvent(this.contentEl, "dragover", event => allowSectionReorderDrop(event, this.contentEl));
    this.registerDomEvent(this.contentEl, "drop", event => dropReorderedSection(event, this.context, this.contentEl));
    this.refreshGroupsView();
  }

  refreshGroupsView(): void {
    renderGroupsView(this.context, this.contentEl);
  }
}

class AddPluginModal extends SuggestModal<InstalledPlugin> {
  constructor(app: App, private readonly context: ViewContext, private readonly group: Group) {
    super(app);
    this.setPlaceholder(`Add a plugin to ${group.name}`);
    this.emptyStateText = "No available plugins";
  }

  getSuggestions(query: string): InstalledPlugin[] {
    const search = query.trim().toLocaleLowerCase();
    return this.context.getInstalledPlugins()
      .filter(plugin => !this.group.pluginIds.includes(plugin.id))
      .filter(plugin => plugin.name.toLocaleLowerCase().includes(search) || plugin.id.toLocaleLowerCase().includes(search))
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  renderSuggestion(plugin: InstalledPlugin, element: HTMLElement): void {
    element.setText(plugin.name);
  }

  onChooseSuggestion(plugin: InstalledPlugin): void {
    if (addPluginToGroup(this.context.data, plugin.id, this.group.id)) saveGroupChangesAndRefreshViews(this.context);
  }
}

function renderGroupsView(context: ViewContext, container: HTMLElement): void {
  container.empty();
  container.addClass("plugin-groups-admin");
  const plugins = context.getInstalledPlugins();
  renderGroupsHeader(context, container, plugins);
  for (const id of orderedSectionIdsIncludingUngrouped(context.data)) {
    if (id === null) renderUngrouped(context, container, plugins);
    else renderGroup(context, container, context.data.groups.find(group => group.id === id)!, plugins);
  }
}

function renderGroupsHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  renderGroupsSummaryHeading(header, context.data.groups.length, plugins);
  renderPluginSettingsButton(context, header);
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
  form.addEventListener("submit", event => addGroupFromForm(event, context, input));
}

function renderPluginSettingsButton(context: ViewContext, header: HTMLElement): void {
  const button = header.createEl("button", { text: "Settings", attr: { type: "button", "aria-label": "Open Plugin Groups Admin settings" } });
  button.addEventListener("click", () => {
    if (context.openPluginSettings(context.selfId) === "unavailable") new Notice("Could not open Obsidian settings.");
  });
}

function hideAddGroupForm(form: HTMLFormElement, addButton: HTMLButtonElement, input: HTMLInputElement): void {
  input.value = "";
  form.hidden = true;
  addButton.hidden = false;
  addButton.focus();
}

function renderGroupsSummaryHeading(header: HTMLElement, groupCount: number, plugins: InstalledPlugin[]): void {
  const heading = header.createDiv({ cls: "plugin-groups-admin-heading" });
  heading.createEl("h1", { text: "Plugin groups" });
  heading.createEl("p", { cls: "plugin-groups-admin-description", text: "A place for every plugin. Drag to organize, click to configure." });
  const summary = heading.createDiv({ cls: "plugin-groups-admin-summary" });
  summary.createSpan({ text: `${groupCount} ${groupCount === 1 ? "group" : "groups"}` });
  summary.createSpan({ text: `${plugins.length} installed` });
  summary.createSpan({ text: `${plugins.filter(plugin => plugin.enabled).length} enabled` });
}

function addGroupFromForm(event: SubmitEvent, context: ViewContext, input: HTMLInputElement): void {
  event.preventDefault();
  if (!addGroup(context.data, input.value)) {
    new Notice("Enter a unique group name.");
    input.focus();
    return;
  }
  saveGroupChangesAndRefreshViews(context);
}

function renderGroup(context: ViewContext, container: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const groupPlugins = plugins.filter(plugin => group.pluginIds.includes(plugin.id));
  const { section, body } = createPluginSection(context, container, group.name, groupPlugins.length, group.id);
  section.dataset.groupId = group.id;
  renderSectionDragHandle(container, section, group.name, group.id);
  renderGroupActions(context, container, section, group, groupPlugins);
  registerPluginDropTarget(context, section, group.id, plugins);
  renderGroupPluginList(context, container, body, groupPlugins, group.id);
}

function renderSectionDragHandle(container: HTMLElement, section: HTMLElement, name: string, groupId: string | null): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const handle = heading.createEl("span", { cls: "plugin-groups-admin-group-grip", attr: { draggable: "true", role: "img", "aria-label": `Drag to reorder ${name}`, title: `Drag to reorder ${name}` } });
  heading.prepend(handle);
  setIcon(handle, "grip-vertical");
  handle.addEventListener("dragstart", event => startSectionDrag(event, container, section, groupId));
  handle.addEventListener("dragend", () => clearSectionReorderDropHighlights(container));
}

function startSectionDrag(event: DragEvent, container: HTMLElement, section: HTMLElement, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(groupId === null ? UNGROUPED_DRAG_TYPE : GROUP_DRAG_TYPE, groupId ?? "ungrouped");
  highlightSectionReorderDropTarget(container, { section, groupId, position: "before", y: section.getBoundingClientRect().top });
}

interface GroupDropTarget {
  section: HTMLElement;
  groupId: string | null;
  position: "before" | "after";
  y: number;
}

function sectionReorderDropTargets(container: HTMLElement): GroupDropTarget[] {
  const sections = Array.from(container.querySelectorAll<HTMLElement>(".plugin-groups-admin-section[data-group-id]"));
  const targets = sections.map((section, index): GroupDropTarget => ({
    section, groupId: section.dataset.groupId || null, position: "before",
    y: index === 0 ? section.getBoundingClientRect().top : (sections[index - 1].getBoundingClientRect().bottom + section.getBoundingClientRect().top) / 2,
  }));
  const last = sections[sections.length - 1];
  if (last) targets.push({ section: last, groupId: last.dataset.groupId || null, position: "after", y: last.getBoundingClientRect().bottom + 10 });
  return targets;
}

function nearestSectionReorderDropTarget(container: HTMLElement, y: number): GroupDropTarget | null {
  const targets = sectionReorderDropTargets(container);
  return targets.reduce<GroupDropTarget | null>((nearest, target) =>
    nearest === null || Math.abs(target.y - y) < Math.abs(nearest.y - y) ? target : nearest, null);
}

function highlightSectionReorderDropTarget(container: HTMLElement, target: GroupDropTarget): void {
  const className = target.position === "before" ? "is-group-drop-before" : "is-group-drop-after";
  if (target.section.hasClass(className)) return;
  clearSectionReorderDropHighlights(container);
  target.section.addClass(className);
}

function allowSectionReorderDrop(event: DragEvent, container: HTMLElement): void {
  if (!isSectionDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const target = nearestSectionReorderDropTarget(container, event.clientY);
  if (target) highlightSectionReorderDropTarget(container, target);
}

function dropReorderedSection(event: DragEvent, context: ViewContext, container: HTMLElement): void {
  const transfer = event.dataTransfer;
  if (!isSectionDrag(transfer)) return;
  const groupId = transfer.types.includes(UNGROUPED_DRAG_TYPE) ? null : transfer.getData(GROUP_DRAG_TYPE);
  event.preventDefault();
  const target = nearestSectionReorderDropTarget(container, event.clientY);
  clearSectionReorderDropHighlights(container);
  if (target && reorderSection(context.data, groupId, target.groupId, target.position)) saveGroupChangesAndRefreshViews(context);
}

function isSectionDrag(transfer: DataTransfer | null): transfer is DataTransfer {
  return transfer !== null && (transfer.types.includes(GROUP_DRAG_TYPE) || transfer.types.includes(UNGROUPED_DRAG_TYPE));
}

function clearSectionReorderDropHighlights(container: HTMLElement): void {
  for (const section of Array.from(container.querySelectorAll(".plugin-groups-admin-section"))) section.classList.remove("is-group-drop-before", "is-group-drop-after");
}

function renderUngrouped(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const ungrouped = plugins.filter(plugin => firstGroupIdForPlugin(context.data, plugin.id) === null);
  const { section, body } = createPluginSection(context, container, "Ungrouped", ungrouped.length, null);
  section.dataset.groupId = "";
  renderSectionDragHandle(container, section, "Ungrouped", null);
  const list = body.createDiv({ cls: "plugin-groups-admin-list" });
  renderUngroupedSearch(context, container, section, list, ungrouped);
  registerPluginDropTarget(context, section, null, plugins);
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
  for (const plugin of matches) renderPluginRow(context, container, list, plugin, null);
}

interface GroupSection {
  section: HTMLElement;
  body: HTMLElement;
}

function createPluginSection(context: ViewContext, container: HTMLElement, name: string, count: number, groupId: string | null): GroupSection {
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
  updateCollapseButtonState(button, name, body.hidden);
  button.addEventListener("click", () => toggleSectionCollapse(context, section, body, button, name, groupId));
}

function toggleSectionCollapse(context: ViewContext, section: HTMLElement, body: HTMLElement, button: HTMLButtonElement, name: string, groupId: string | null): void {
  body.hidden = !body.hidden;
  if (body.hidden) context.collapsedGroupIds.add(groupId);
  else context.collapsedGroupIds.delete(groupId);
  section.classList.toggle("is-collapsed", body.hidden);
  updateCollapseButtonState(button, name, body.hidden);
}

function updateCollapseButtonState(button: HTMLButtonElement, name: string, collapsed: boolean): void {
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${name}`);
}

function renderGroupActions(context: ViewContext, container: HTMLElement, section: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const actions = heading.createDiv({ cls: "plugin-groups-admin-actions" });
  const add = actions.createEl("button", { text: "+ Add plugin", attr: { type: "button", "aria-label": `Add plugin to ${group.name}` } });
  const rename = actions.createEl("button", { text: "Rename", attr: { type: "button", "aria-label": `Rename ${group.name}` } });
  const remove = actions.createEl("button", { cls: "plugin-groups-admin-delete", text: "Delete", attr: { type: "button", "aria-label": `Delete ${group.name}` } });
  renderGroupEnabledToggle(context, container, actions, group, plugins);
  add.addEventListener("click", () => new AddPluginModal(context.app, context, group).open());
  rename.addEventListener("click", () => showGroupRenameInput(context, container, heading, group));
  remove.addEventListener("click", () => confirmAndRemoveGroup(context, group));
}

function renderGroupEnabledToggle(context: ViewContext, container: HTMLElement, actions: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const manageable = pluginsEligibleForGroupToggle(plugins, context.selfId);
  const state = groupEnabledState(manageable);
  const busy = manageable.some(plugin => context.pendingPluginIds.has(plugin.id));
  const label = actions.createEl("label", { cls: "plugin-groups-admin-toggle plugin-groups-admin-group-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": `Plugins in ${group.name}` } });
  toggle.checked = state === "enabled";
  toggle.disabled = manageable.length === 0 || busy;
  if (busy) label.setAttribute("title", "Updating plugins…");
  else if (plugins.some(plugin => plugin.id === context.selfId)) label.setAttribute("title", "Plugin Groups Admin stays enabled.");
  label.createEl("span", { cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void changeGroupPluginsEnabled(context, container, group, manageable, toggle.checked); });
}

async function changeGroupPluginsEnabled(context: ViewContext, container: HTMLElement, group: Group, plugins: InstalledPlugin[], enabled: boolean): Promise<void> {
  try {
    const started = await runPluginOperationWithPendingState(
      context.pendingPluginIds,
      plugins.map(plugin => plugin.id),
      context.refreshOpenGroupsViews,
      () => setGroupPluginsEnabled(plugins, enabled, context.setPluginEnabled),
    );
    if (!started) renderGroupsView(context, container);
  } catch (error) {
    console.error(`Failed to change group ${group.name}`, error);
    new Notice(`Could not update all plugins in ${group.name}.`);
  }
}

function showGroupRenameInput(context: ViewContext, container: HTMLElement, heading: HTMLElement, group: Group): void {
  const title = heading.querySelector("h2")!;
  const input = document.createElement("input");
  input.value = group.name;
  input.setAttribute("aria-label", `New name for ${group.name}`);
  title.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener("keydown", event => handleGroupRenameKey(event, context, container, group, input));
  input.addEventListener("blur", () => renderGroupsView(context, container), { once: true });
}

function handleGroupRenameKey(event: KeyboardEvent, context: ViewContext, container: HTMLElement, group: Group, input: HTMLInputElement): void {
  if (event.key === "Escape") renderGroupsView(context, container);
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (renameGroup(context.data, group.id, input.value)) saveGroupChangesAndRefreshViews(context);
  else if (input.value.trim() !== group.name) new Notice("Enter a unique group name.");
  if (input.isConnected) renderGroupsView(context, container);
}

function confirmAndRemoveGroup(context: ViewContext, group: Group): void {
  const message = context.data.allowMultipleGroups
    ? `Delete “${group.name}”? Plugins in other groups will keep those memberships.`
    : `Delete “${group.name}”? Its plugins will move to Ungrouped.`;
  if (!window.confirm(message)) return;
  if (!removeGroup(context.data, group.id)) return;
  context.collapsedGroupIds.delete(group.id);
  saveGroupChangesAndRefreshViews(context);
}

function registerPluginDropTarget(context: ViewContext, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.addEventListener("dragover", event => allowPluginDrop(event, section));
  section.addEventListener("dragleave", event => clearPluginDropHighlight(event, section));
  section.addEventListener("drop", event => handlePluginDrop(event, context, section, groupId, plugins));
}

function allowPluginDrop(event: DragEvent, section: HTMLElement): void {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  section.addClass("is-drag-over");
}

function clearPluginDropHighlight(event: DragEvent, section: HTMLElement): void {
  if (!section.contains(event.relatedTarget as Node)) section.removeClass("is-drag-over");
}

function handlePluginDrop(event: DragEvent, context: ViewContext, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.removeClass("is-drag-over");
  const pluginId = event.dataTransfer?.getData(DRAG_TYPE) ?? "";
  if (!plugins.some(plugin => plugin.id === pluginId)) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData(DRAG_SOURCE_TYPE) || null;
  const updated = context.data.allowMultipleGroups
    ? groupId === null ? sourceId !== null && removePluginFromGroup(context.data, pluginId, sourceId) : addPluginToGroup(context.data, pluginId, groupId)
    : movePluginToGroup(context.data, pluginId, groupId);
  if (updated) saveGroupChangesAndRefreshViews(context);
}

function renderGroupPluginList(context: ViewContext, container: HTMLElement, section: HTMLElement, plugins: InstalledPlugin[], groupId: string): void {
  const list = section.createDiv({ cls: "plugin-groups-admin-list" });
  if (plugins.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of plugins) renderPluginRow(context, container, list, plugin, groupId);
}

function renderPluginRow(context: ViewContext, container: HTMLElement, list: HTMLElement, plugin: InstalledPlugin, groupId: string | null): void {
  const row = list.createDiv({ cls: `plugin-groups-admin-plugin${plugin.enabled ? "" : " is-disabled"}${groupId === null ? "" : " is-grouped"}` });
  setIcon(row.createSpan({ cls: "plugin-groups-admin-grip", attr: { "aria-hidden": "true" } }), "grip-vertical");
  row.draggable = true;
  row.addEventListener("dragstart", event => startPluginDrag(event, plugin.id, groupId));
  row.addEventListener("click", event => openPluginSettingsFromRow(event, context, plugin));
  const details = row.createDiv({ cls: "plugin-groups-admin-plugin-details" });
  const name = details.createEl("button", { cls: "plugin-groups-admin-plugin-name", text: plugin.name, attr: { type: "button" } });
  name.addEventListener("click", () => openPluginSettingsWithFeedback(context, plugin));
  renderPluginDescription(details, plugin);
  renderPluginMenuButton(context, row, plugin);
  renderPluginEnabledToggle(context, container, row, plugin);
  if (groupId !== null) renderRemovePluginButton(context, row, plugin, groupId);
}

function renderPluginMenuButton(context: ViewContext, row: HTMLElement, plugin: InstalledPlugin): void {
  const button = row.createEl("button", { cls: "plugin-groups-admin-plugin-menu", text: "⋯", attr: { type: "button", "aria-label": `More options for ${plugin.name}`, title: `More options for ${plugin.name}` } });
  button.addEventListener("click", event => showPluginMenu(context.app, plugin, event));
}

function renderPluginDescription(details: HTMLElement, plugin: InstalledPlugin): void {
  const metadata = [plugin.version && `v${plugin.version}`, plugin.author && `by ${plugin.author}`]
    .filter(Boolean).join(" · ");
  if (!plugin.description && !metadata) return;
  const description = details.createDiv({ cls: "plugin-groups-admin-plugin-description" });
  if (plugin.description) description.appendText(plugin.description);
  if (!metadata) return;
  description.createEl("em", { text: `${plugin.description ? " · " : ""}${metadata}` });
}

function renderRemovePluginButton(context: ViewContext, row: HTMLElement, plugin: InstalledPlugin, groupId: string): void {
  const button = row.createEl("button", { cls: "plugin-groups-admin-remove-plugin", attr: { type: "button", "aria-label": `Remove ${plugin.name} from this group`, title: `Remove ${plugin.name} from this group` } });
  setIcon(button, "x");
  button.addEventListener("click", () => {
    if (removePluginFromGroup(context.data, plugin.id, groupId)) saveGroupChangesAndRefreshViews(context);
  });
}

function openPluginSettingsFromRow(event: MouseEvent, context: ViewContext, plugin: InstalledPlugin): void {
  if (event.target instanceof Element && event.target.closest("button, input, label")) return;
  openPluginSettingsWithFeedback(context, plugin);
}

function openPluginSettingsWithFeedback(context: ViewContext, plugin: InstalledPlugin): void {
  const destination = context.openPluginSettings(plugin.id);
  if (destination === "community") new Notice(`${plugin.name} has no settings page. Showing Community plugins.`);
  if (destination === "unavailable") new Notice("Could not open Obsidian settings.");
}

function renderPluginEnabledToggle(context: ViewContext, container: HTMLElement, row: HTMLElement, plugin: InstalledPlugin): void {
  const label = row.createEl("label", { cls: "plugin-groups-admin-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": plugin.name } });
  toggle.checked = plugin.enabled;
  toggle.disabled = plugin.id === context.selfId || context.pendingPluginIds.has(plugin.id);
  if (plugin.id === context.selfId) label.setAttribute("title", "This plugin cannot disable itself from its own tab.");
  label.createEl("span", { cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void changePluginEnabled(context, container, plugin, toggle); });
}

async function changePluginEnabled(context: ViewContext, container: HTMLElement, plugin: InstalledPlugin, toggle: HTMLInputElement): Promise<void> {
  try {
    const enabled = toggle.checked;
    const started = await runPluginOperationWithPendingState(
      context.pendingPluginIds,
      [plugin.id],
      context.refreshOpenGroupsViews,
      () => context.setPluginEnabled(plugin.id, enabled),
    );
    if (!started) renderGroupsView(context, container);
  } catch (error) {
    console.error(`Failed to change ${plugin.name}`, error);
    new Notice(`Could not change ${plugin.name}.`);
  }
}

function startPluginDrag(event: DragEvent, pluginId: string, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, pluginId);
  event.dataTransfer.setData(DRAG_SOURCE_TYPE, groupId ?? "");
}

function saveGroupChangesAndRefreshViews(context: ViewContext): void {
  context.queueGroupDataSave();
  context.refreshOpenGroupsViews();
}
