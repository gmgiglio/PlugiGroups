import { App, Notice, setIcon, SuggestModal } from "obsidian";
import { showDestructiveConfirmation } from "../confirmation";
import { addPluginToGroup, removeGroup, renameGroup } from "../../groups/data";
import type { Group } from "../../groups/data";
import { enableOnlyGroupPlugins, groupEnabledState, groupStateAfterChange, nextGroupEnabledIds, pluginsEligibleForGroupToggle, rememberGroupMix, type GroupEnabledState } from "../../groups/toggle";
import type { InstalledPlugin } from "../../plugins/inventory";
import { runPluginOperationWithPendingState } from "../../plugins/pendingOperations";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "../context";
import { registerPluginDropTarget } from "../plugins/drop";
import { renderPluginRow } from "../plugins/row";
import { renderSectionDragHandle } from "./drag";
import { createPluginSection } from "./shared";

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

export function renderGroup(context: ViewContext, container: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const pluginsById = new Map(plugins.map(plugin => [plugin.id, plugin]));
  const groupPlugins = group.pluginIds.map(id => pluginsById.get(id)).filter((plugin): plugin is InstalledPlugin => plugin !== undefined);
  if (context.data.alphabeticalPluginOrder) groupPlugins.sort((first, second) => first.name.localeCompare(second.name));
  const { section, body } = createPluginSection(context, container, group.name, groupPlugins.length, group.id);
  section.dataset.groupId = group.id;
  section.classList.toggle("is-disabled", displayedGroupState(context, group, pluginsEligibleForGroupToggle(groupPlugins, context.selfId, context.data.unenableablePlugins)) === "disabled");
  renderSectionDragHandle(container, section, group.name, group.id);
  renderGroupActions(context, section, group, groupPlugins);
  registerPluginDropTarget(context, section, group.id, plugins);
  renderGroupPluginList(context, body, groupPlugins, group.id);
}

function renderGroupActions(context: ViewContext, section: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const actions = heading.createDiv({ cls: "plugin-groups-admin-actions" });
  const add = createGroupAction(actions, "plus", "Add plugin", `Add plugin to ${group.name}`);
  const rename = createGroupAction(actions, "pencil", "Rename", `Rename ${group.name}`);
  const remove = createGroupAction(actions, "trash-2", "Delete", `Delete ${group.name}`);
  remove.addClass("plugin-groups-admin-delete");
  renderGroupEnabledToggle(context, actions, group, plugins);
  add.addEventListener("click", () => new AddPluginModal(context.app, context, group).open());
  rename.addEventListener("click", () => showGroupRenameInput(context, heading, group));
  remove.addEventListener("click", () => confirmAndRemoveGroup(context, group));
}

function createGroupAction(actions: HTMLElement, icon: string, text: string, accessibleLabel: string): HTMLButtonElement {
  const button = actions.createEl("button", {
    cls: "plugin-groups-admin-group-action",
    attr: { type: "button", "aria-label": accessibleLabel },
  });
  const iconElement = button.createSpan({ cls: "plugin-groups-admin-action-icon", attr: { "aria-hidden": "true" } });
  setIcon(iconElement, icon);
  button.createSpan({ cls: "plugin-groups-admin-action-label", text, attr: { "aria-hidden": "true" } });
  return button;
}

function renderGroupEnabledToggle(context: ViewContext, actions: HTMLElement, group: Group, plugins: InstalledPlugin[]): void {
  const manageable = pluginsEligibleForGroupToggle(plugins, context.selfId, context.data.unenableablePlugins);
  const state = displayedGroupState(context, group, manageable);
  const busy = manageable.some(plugin => context.pendingPluginIds.has(plugin.id));
  const label = actions.createEl("label", { cls: "plugin-groups-admin-toggle plugin-groups-admin-group-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": `Plugins in ${group.name}` } });
  showGroupEnabledState(toggle, state);
  toggle.disabled = manageable.length === 0 || busy;
  label.classList.toggle("is-disabled", toggle.disabled);
  if (busy) label.setAttribute("title", "Updating plugins…");
  else if (plugins.some(plugin => plugin.id === context.selfId)) label.setAttribute("title", "PlugiGroups stays enabled.");
  label.createSpan({ cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void advanceGroupEnabledState(context, group, manageable); });
}

function displayedGroupState(context: ViewContext, group: Group, manageable: InstalledPlugin[]): GroupEnabledState {
  return context.pendingGroupStates.get(group.id) ?? groupEnabledState(manageable);
}

function showGroupEnabledState(toggle: HTMLInputElement, state: GroupEnabledState): void {
  toggle.checked = state === "enabled";
  toggle.indeterminate = state === "partial";
}

async function advanceGroupEnabledState(context: ViewContext, group: Group, plugins: InstalledPlugin[]): Promise<void> {
  const enabledIds = nextGroupEnabledIds(group, plugins);
  if (groupEnabledState(plugins) === "partial") {
    rememberGroupMix(group, plugins);
    context.queueGroupDataSave();
  }
  try {
    const started = await changeGroupShowingTargetState(context, group, plugins, enabledIds);
    if (!started) context.refreshOpenGroupsViews();
  } catch (error) {
    console.error(`Failed to change group ${group.name}`, error);
    new Notice(`Could not update all plugins in ${group.name}.`);
  }
}

async function changeGroupShowingTargetState(context: ViewContext, group: Group, plugins: InstalledPlugin[], enabledIds: string[]): Promise<boolean> {
  if (plugins.some(plugin => context.pendingPluginIds.has(plugin.id))) return false;
  context.pendingGroupStates.set(group.id, groupStateAfterChange(plugins, enabledIds));
  try {
    return await runPluginOperationWithPendingState(context.pendingPluginIds, plugins.map(plugin => plugin.id), context.refreshOpenGroupsViews,
      () => enableOnlyGroupPlugins(plugins, enabledIds, context.setPluginEnabled));
  } finally {
    context.pendingGroupStates.delete(group.id);
    context.refreshOpenGroupsViews();
  }
}

export function showGroupRenameInput(context: ViewContext, heading: HTMLElement, group: Group): void {
  const title = heading.querySelector("h2")!;
  const input = heading.createEl("input");
  input.value = group.name;
  input.setAttribute("aria-label", `New name for ${group.name}`);
  title.replaceWith(input);
  input.focus();
  input.select();
  input.addEventListener("keydown", event => handleGroupRenameKey(event, context, group, input));
  input.addEventListener("blur", () => context.refreshOpenGroupsViews(), { once: true });
}

function handleGroupRenameKey(event: KeyboardEvent, context: ViewContext, group: Group, input: HTMLInputElement): void {
  if (event.key === "Escape") context.refreshOpenGroupsViews();
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (renameGroup(context.data, group.id, input.value)) saveGroupChangesAndRefreshViews(context);
  else if (input.value.trim() !== group.name) new Notice("Enter a unique group name.");
  if (input.isConnected) context.refreshOpenGroupsViews();
}

function confirmAndRemoveGroup(context: ViewContext, group: Group): void {
  if (!context.data.confirmGroupDeletion) {
    removeGroupAndRefresh(context, group);
    return;
  }
  const message = context.data.allowMultipleGroups
    ? "Plugins in other groups will keep those memberships."
    : "Its plugins will move to Ungrouped.";
  showDestructiveConfirmation(context.app, `Delete “${group.name}”?`, message, "Delete", () => removeGroupAndRefresh(context, group));
}

function removeGroupAndRefresh(context: ViewContext, group: Group): void {
  if (!removeGroup(context.data, group.id)) return;
  saveGroupChangesAndRefreshViews(context);
}

function renderGroupPluginList(context: ViewContext, section: HTMLElement, plugins: InstalledPlugin[], groupId: string): void {
  const list = section.createDiv({ cls: "plugin-groups-admin-list" });
  if (plugins.length === 0) list.createDiv({ cls: "plugin-groups-admin-empty", text: "Drop plugins here" });
  for (const plugin of plugins) renderPluginRow(context, list, plugin, groupId);
}
