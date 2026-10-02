import { App, Notice, setIcon, SuggestModal } from "obsidian";
import { showDestructiveConfirmation } from "../confirmation";
import { addPluginToGroup, removeGroup, renameGroup } from "../groups";
import type { Group } from "../groups";
import { groupEnabledState, setGroupPluginsEnabled, pluginsEligibleForGroupToggle } from "../groupToggle";
import type { InstalledPlugin } from "../inventory";
import { runPluginOperationWithPendingState } from "../pendingPluginOperations";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";
import { registerPluginDropTarget } from "./pluginDrop";
import { renderPluginRow } from "./pluginRow";
import { renderSectionDragHandle } from "./sectionDrag";
import { createPluginSection } from "./sectionShared";

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
  const groupPlugins = plugins.filter(plugin => group.pluginIds.includes(plugin.id));
  const { section, body } = createPluginSection(context, container, group.name, groupPlugins.length, group.id);
  section.dataset.groupId = group.id;
  section.classList.toggle("is-disabled", groupEnabledState(pluginsEligibleForGroupToggle(groupPlugins, context.selfId)) === "disabled");
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
  const manageable = pluginsEligibleForGroupToggle(plugins, context.selfId);
  const state = groupEnabledState(manageable);
  const busy = manageable.some(plugin => context.pendingPluginIds.has(plugin.id));
  const label = actions.createEl("label", { cls: "plugin-groups-admin-toggle plugin-groups-admin-group-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": `Plugins in ${group.name}` } });
  toggle.checked = state === "enabled";
  toggle.disabled = manageable.length === 0 || busy;
  label.classList.toggle("is-disabled", toggle.disabled);
  if (busy) label.setAttribute("title", "Updating plugins…");
  else if (plugins.some(plugin => plugin.id === context.selfId)) label.setAttribute("title", "PlugiGroups stays enabled.");
  label.createSpan({ cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void changeGroupPluginsEnabled(context, group, manageable, toggle.checked); });
}

async function changeGroupPluginsEnabled(context: ViewContext, group: Group, plugins: InstalledPlugin[], enabled: boolean): Promise<void> {
  try {
    const started = await runPluginOperationWithPendingState(
      context.pendingPluginIds,
      plugins.map(plugin => plugin.id),
      context.refreshOpenGroupsViews,
      () => setGroupPluginsEnabled(plugins, enabled, context.setPluginEnabled),
    );
    if (!started) context.refreshOpenGroupsViews();
  } catch (error) {
    console.error(`Failed to change group ${group.name}`, error);
    new Notice(`Could not update all plugins in ${group.name}.`);
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
