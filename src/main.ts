import { Notice, Plugin, PluginSettingTab, WorkspaceLeaf } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { normalizeSavedGroupData, setMultipleGroupsAllowed } from "./groups";
import type { GroupData } from "./groups";
import { pluginInventorySignature } from "./inventory";
import { registerPluginInventoryRefreshListeners } from "./inventoryRefresh";
import { closeObsidianSettings, installedCommunityPlugins, openPluginSettingsOrCommunityTab, setPluginEnabled } from "./pluginApi";
import { GroupsView, VIEW_TYPE } from "./view";

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
      ungroupedSearch: "",
      getInstalledPlugins: () => installedCommunityPlugins(this.app),
      setPluginEnabled: (id, enabled) => setPluginEnabled(this.app, id, enabled),
      openPluginSettings: id => openPluginSettingsOrCommunityTab(this.app, id),
      selfId: this.manifest.id,
      pendingPluginIds,
      refreshOpenGroupsViews: () => refreshOpenGroupsViews(this),
      queueGroupDataSave: () => queueGroupDataSave(this),
    }));
    updateRibbonButton(this);
    this.addCommand({ id: "open-plugin-groups", name: "Open groups", callback: () => { void openGroupsTab(this); } });
    this.addSettingTab(new GroupsSettingTab(this));
    registerGroupsViewInventoryRefresh(this);
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
            void openGroupsTab(this.plugin);
          }));
        },
      },
      {
        name: "Show ribbon button",
        desc: "Show the PlugiGroups button in the ribbon.",
        control: { type: "toggle", key: "showRibbonButton" },
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
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "showRibbonButton") return this.plugin.data.showRibbonButton;
    if (key === "allowMultipleGroups") return this.plugin.data.allowMultipleGroups;
    if (key === "confirmGroupDeletion") return this.plugin.data.confirmGroupDeletion;
    return undefined;
  }

  setControlValue(key: string, value: unknown): void {
    if (typeof value !== "boolean") return;
    if (key === "showRibbonButton") setRibbonButtonSetting(this.plugin, value);
    if (key === "allowMultipleGroups") setMultipleGroupsSetting(this.plugin, value);
    if (key === "confirmGroupDeletion") setGroupDeletionConfirmationSetting(this.plugin, value);
  }
}

function setGroupDeletionConfirmationSetting(plugin: PlugiGroups, enabled: boolean): void {
  plugin.data.confirmGroupDeletion = enabled;
  queueGroupDataSave(plugin);
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
    plugin.ribbonButton = plugin.addRibbonIcon("layout-grid", "Open PlugiGroups", () => { void openGroupsTab(plugin); });
  } else if (!plugin.data.showRibbonButton && plugin.ribbonButton !== null) {
    plugin.ribbonButton.remove();
    plugin.ribbonButton = null;
  }
}

function registerGroupsViewInventoryRefresh(plugin: PlugiGroups): void {
  registerPluginInventoryRefreshListeners({
    app: plugin.app,
    lastInventory: pluginInventorySignature(installedCommunityPlugins(plugin.app)),
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

async function openGroupsTab(plugin: PlugiGroups): Promise<void> {
  const workspace = plugin.app.workspace;
  const leaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf("tab");
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}

function refreshGroupsViewInLeaf(leaf: WorkspaceLeaf): void {
  if (leaf.view instanceof GroupsView) leaf.view.refreshGroupsView();
}

function refreshOpenGroupsViews(plugin: PlugiGroups): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) refreshGroupsViewInLeaf(leaf);
}

function queueGroupDataSave(plugin: PlugiGroups): void {
  plugin.saveQueue = plugin.saveQueue.then(() => plugin.saveData(plugin.data)).catch(error => {
    console.error("Failed to save plugin groups", error);
    new Notice("Could not save plugin groups.");
  });
}
