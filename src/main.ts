import { Notice, Plugin, PluginSettingTab, WorkspaceLeaf } from "obsidian";
import type { SettingDefinitionItem, Workspace } from "obsidian";
import { normalizeSavedGroupData, setMultipleGroupsAllowed } from "./groups/data";
import type { GroupData, OpenLocation } from "./groups/data";
import { pluginInventorySignature } from "./plugins/inventory";
import { registerPluginInventoryRefreshListeners } from "./plugins/inventoryRefresh";
import { registerDedicatedGroupsWindows } from "./dedicatedWindow";
import { closeObsidianSettings, installedPlugins, openPluginSettingsOrCommunityTab, setPluginEnabled } from "./plugins/api";
import { GroupsView, VIEW_TYPE } from "./view";
import { registerGroupsCli } from "./cli";
import { cloneGroupData } from "./cli/parameters";
import { forgetUnenableablePlugin, markPluginUnenableable } from "./groups/unenableablePlugins";

export default class PlugiGroups extends Plugin {
  data: GroupData = normalizeSavedGroupData(null);
  saveQueue: Promise<void> = Promise.resolve();
  ribbonButton: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.data = normalizeSavedGroupData(await this.loadData());
    const pendingPluginIds = new Set<string>();
    this.registerView(VIEW_TYPE, leaf => new GroupsView(leaf, {
      app: this.app,
      data: this.data,
      getInstalledPlugins: () => installedPlugins(this.app, this.data.includeCorePlugins),
      setPluginEnabled: (id, enabled) => setPluginEnabledRecordingRefusals(this, id, enabled),
      openPluginSettings: id => openPluginSettingsOrCommunityTab(this.app, id),
      selfId: this.manifest.id,
      pendingPluginIds,
      pendingGroupStates: new Map(),
      refreshOpenGroupsViews: () => refreshOpenGroupsViews(this),
      queueGroupDataSave: () => queueGroupDataSave(this),
    }));
    updateRibbonButton(this);
    this.addCommand({ id: "open-plugin-groups", name: "Open groups", callback: () => { void openGroupsView(this); } });
    this.addSettingTab(new GroupsSettingTab(this));
    registerGroupsViewInventoryRefresh(this);
    registerDedicatedGroupsWindows(this, VIEW_TYPE);
    registerPluginCli(this, pendingPluginIds);
  }
}

class GroupsSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: PlugiGroups) {
    super(plugin.app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "PlugiGroups",
        desc: "Organize your installed plugins into groups.",
        render: setting => {
          setting.addButton(button => button.setButtonText("Open PlugiGroups").onClick(() => {
            closeObsidianSettings(this.plugin.app);
            void openGroupsView(this.plugin);
          }));
        },
      },
      {
        type: "group",
        heading: "Access",
        items: [
          {
            name: "Open PlugiGroups in",
            desc: "Choose where the ribbon, command palette, and settings button open PlugiGroups.",
            control: { type: "dropdown", key: "openLocation", options: { tab: "Tab", window: "Separate window" } },
          },
          {
            name: "Show ribbon button",
            desc: "Show the PlugiGroups button in the ribbon.",
            control: { type: "toggle", key: "showRibbonButton" },
          },
        ],
      },
      {
        type: "group",
        heading: "Groups",
        items: [
          {
            name: "Include core plugins",
            desc: "Show and manage core plugins alongside community plugins. Excluding them preserves their group memberships.",
            control: { type: "toggle", key: "includeCorePlugins" },
          },
          {
            name: "Allow plugins in multiple groups",
            desc: "When turned off, each plugin stays in its first group.",
            control: { type: "toggle", key: "allowMultipleGroups" },
          },
          {
            name: "Confirm before deleting groups",
            desc: "Show a confirmation dialog before deleting a group.",
            control: { type: "toggle", key: "confirmGroupDeletion" },
          },
        ],
      },
      {
        type: "group",
        heading: "Display",
        items: [
          {
            name: "Always show plugin descriptions",
            desc: "Keep descriptions, versions, and authors visible below plugin names. When turned off, they appear while hovering over or focusing a plugin row.",
            control: { type: "toggle", key: "showPluginDescriptions" },
          },
          {
            name: "Show drag handles only on hover",
            desc: "Show group and plugin drag handles when hovered. Turn off to always show them.",
            control: { type: "toggle", key: "showDragHandlesOnHover" },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "openLocation") return this.plugin.data.openLocation;
    if (key === "includeCorePlugins") return this.plugin.data.includeCorePlugins;
    if (key === "showPluginDescriptions") return this.plugin.data.showPluginDescriptions;
    if (key === "showDragHandlesOnHover") return this.plugin.data.showDragHandlesOnHover;
    if (key === "showRibbonButton") return this.plugin.data.showRibbonButton;
    if (key === "allowMultipleGroups") return this.plugin.data.allowMultipleGroups;
    if (key === "confirmGroupDeletion") return this.plugin.data.confirmGroupDeletion;
    return undefined;
  }

  setControlValue(key: string, value: unknown): void {
    if (key === "openLocation" && (value === "tab" || value === "window")) setOpenLocationSetting(this.plugin, value);
    if (typeof value !== "boolean") return;
    if (key === "includeCorePlugins") setIncludeCorePluginsSetting(this.plugin, value);
    if (key === "showPluginDescriptions") setPluginDescriptionsSetting(this.plugin, value);
    if (key === "showDragHandlesOnHover") setDragHandlesOnHoverSetting(this.plugin, value);
    if (key === "showRibbonButton") setRibbonButtonSetting(this.plugin, value);
    if (key === "allowMultipleGroups") setMultipleGroupsSetting(this.plugin, value);
    if (key === "confirmGroupDeletion") setGroupDeletionConfirmationSetting(this.plugin, value);
  }
}

function setPluginDescriptionsSetting(plugin: PlugiGroups, visible: boolean): void {
  plugin.data.showPluginDescriptions = visible;
  queueGroupDataSave(plugin);
  refreshOpenGroupsViews(plugin);
}

function setIncludeCorePluginsSetting(plugin: PlugiGroups, included: boolean): void {
  plugin.data.includeCorePlugins = included;
  queueGroupDataSave(plugin);
  refreshOpenGroupsViews(plugin);
}

function setOpenLocationSetting(plugin: PlugiGroups, location: OpenLocation): void {
  plugin.data.openLocation = location;
  queueGroupDataSave(plugin);
}

function setGroupDeletionConfirmationSetting(plugin: PlugiGroups, enabled: boolean): void {
  plugin.data.confirmGroupDeletion = enabled;
  queueGroupDataSave(plugin);
}

function setDragHandlesOnHoverSetting(plugin: PlugiGroups, enabled: boolean): void {
  plugin.data.showDragHandlesOnHover = enabled;
  queueGroupDataSave(plugin);
  refreshOpenGroupsViews(plugin);
}

function setRibbonButtonSetting(plugin: PlugiGroups, visible: boolean): void {
  plugin.data.showRibbonButton = visible;
  updateRibbonButton(plugin);
  queueGroupDataSave(plugin);
}

function setMultipleGroupsSetting(plugin: PlugiGroups, allowed: boolean): void {
  setMultipleGroupsAllowed(plugin.data, allowed);
  queueGroupDataSave(plugin);
  for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) refreshGroupsViewInLeaf(leaf);
}

function updateRibbonButton(plugin: PlugiGroups): void {
  if (plugin.data.showRibbonButton && plugin.ribbonButton === null) {
    plugin.ribbonButton = plugin.addRibbonIcon("layout-grid", "Open PlugiGroups", () => { void openGroupsView(plugin); });
  } else if (!plugin.data.showRibbonButton && plugin.ribbonButton !== null) {
    plugin.ribbonButton.remove();
    plugin.ribbonButton = null;
  }
}

function registerGroupsViewInventoryRefresh(plugin: PlugiGroups): void {
  registerPluginInventoryRefreshListeners({
    app: plugin.app,
    lastInventory: pluginInventorySignature(installedPlugins(plugin.app)),
    openViews: () => plugin.app.workspace.getLeavesOfType(VIEW_TYPE)
      .map(leaf => leaf.view)
      .filter((view): view is GroupsView => view instanceof GroupsView),
  }, {
    registerEvent: event => plugin.registerEvent(event),
    onLayoutChange: callback => plugin.app.workspace.on("layout-change", callback),
    onFocus: callback => plugin.registerDomEvent(window, "focus", callback),
    onVisibilityChange: callback => plugin.registerDomEvent(document, "visibilitychange", callback),
  });
}

async function openGroupsView(plugin: PlugiGroups): Promise<void> {
  const workspace = plugin.app.workspace;
  const location = plugin.data.openLocation;
  const leaf = workspace.getLeavesOfType(VIEW_TYPE).find(leaf =>
    (leaf.getContainer() === workspace.rootSplit) === (location === "tab"))
    ?? (location === "tab" ? createMainWindowTab(workspace) : workspace.getLeaf("window"));
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}

function createMainWindowTab(workspace: Workspace): WorkspaceLeaf {
  const mainLeaf = workspace.getMostRecentLeaf(workspace.rootSplit);
  if (!mainLeaf) return workspace.createLeafInParent(workspace.rootSplit, 0);
  workspace.setActiveLeaf(mainLeaf, { focus: false });
  return workspace.getLeaf("tab");
}

function refreshGroupsViewInLeaf(leaf: WorkspaceLeaf): void {
  if (leaf.view instanceof GroupsView) leaf.view.refreshGroupsView();
}

function refreshOpenGroupsViews(plugin: PlugiGroups): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) refreshGroupsViewInLeaf(leaf);
}

async function setPluginEnabledRecordingRefusals(plugin: PlugiGroups, id: string, enabled: boolean): Promise<void> {
  try {
    await setPluginEnabled(plugin.app, id, enabled);
  } catch (error) {
    if (enabled) recordUnenableablePlugin(plugin, id);
    throw error;
  }
  if (enabled && forgetUnenableablePlugin(plugin.data, id)) queueGroupDataSave(plugin);
}

function recordUnenableablePlugin(plugin: PlugiGroups, id: string): void {
  const installed = installedPlugins(plugin.app).find(candidate => candidate.id === id);
  if (!installed || installed.enabled) return;
  markPluginUnenableable(plugin.data, installed);
  queueGroupDataSave(plugin);
}

function queueGroupDataSave(plugin: PlugiGroups): void {
  void saveGroupData(plugin, plugin.data).catch(error => {
    console.error("Failed to save plugin groups", error);
    new Notice("Could not save plugin groups.");
  });
}

function saveGroupData(plugin: PlugiGroups, data: GroupData): Promise<void> {
  const snapshot = cloneGroupData(data);
  const result = plugin.saveQueue.then(() => plugin.saveData(snapshot));
  plugin.saveQueue = result.catch(() => undefined);
  return result;
}

function registerPluginCli(plugin: PlugiGroups, pendingPluginIds: Set<string>): void {
  registerGroupsCli({
    data: plugin.data, selfId: plugin.manifest.id, pendingPluginIds,
    getInstalledPlugins: () => installedPlugins(plugin.app, plugin.data.includeCorePlugins),
    commitData: data => commitCliGroupData(plugin, data),
    refreshViews: () => refreshOpenGroupsViews(plugin),
    setPluginEnabled: (id, enabled) => setPluginEnabledRecordingRefusals(plugin, id, enabled),
    filterViews: (query, scope) => filterOpenGroupsViews(plugin, query, scope),
  }, (command, description, flags, handler) => plugin.registerCliHandler(command, description, flags, handler));
}

async function commitCliGroupData(plugin: PlugiGroups, data: GroupData): Promise<void> {
  const previous = cloneGroupData(plugin.data);
  const applied = JSON.stringify(data);
  applyCliGroupData(plugin, data);
  try { await saveGroupData(plugin, data); }
  catch (error) {
    if (JSON.stringify(plugin.data) === applied) applyCliGroupData(plugin, previous);
    throw error;
  }
}

function applyCliGroupData(plugin: PlugiGroups, data: GroupData): void {
  Object.assign(plugin.data, data);
  updateRibbonButton(plugin);
  refreshOpenGroupsViews(plugin);
}

function filterOpenGroupsViews(plugin: PlugiGroups, query: string, scope: string | null): number {
  const views = plugin.app.workspace.getLeavesOfType(VIEW_TYPE).map(leaf => leaf.view)
    .filter((view): view is GroupsView => view instanceof GroupsView);
  for (const view of views) view.setSearchFilter(query, scope);
  return views.length;
}
