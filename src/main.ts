import { Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { normalizeSavedGroupData, setMultipleGroupsAllowed } from "./groups";
import type { GroupData } from "./groups";
import { pluginInventorySignature } from "./inventory";
import { registerPluginInventoryRefreshListeners } from "./inventoryRefresh";
import { closeObsidianSettings, installedCommunityPlugins, openPluginSettingsOrCommunityTab, setPluginEnabled } from "./pluginApi";
import { GroupsView, VIEW_TYPE } from "./view";

export default class PlugiGroups extends Plugin {
  data: GroupData = { groups: [], allowMultipleGroups: false, showRibbonButton: true, ungroupedIndex: 0 };
  saveQueue: Promise<void> = Promise.resolve();
  ribbonButton: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.data = normalizeSavedGroupData(await this.loadData());
    const pendingPluginIds = new Set<string>();
    this.registerView(VIEW_TYPE, leaf => new GroupsView(leaf, {
      app: this.app,
      data: this.data,
      ungroupedSearch: "",
      collapsedGroupIds: new Set<string | null>(),
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

  display(): void {
    this.containerEl.empty();
    renderOpenGroupsSetting(this.plugin, this.containerEl);
    new Setting(this.containerEl)
      .setName("Show ribbon button")
      .setDesc("Show the PlugiGroups button in the ribbon.")
      .addToggle(toggle => toggle.setValue(this.plugin.data.showRibbonButton).onChange(visible => {
        this.plugin.data.showRibbonButton = visible;
        updateRibbonButton(this.plugin);
        queueGroupDataSave(this.plugin);
      }));
    new Setting(this.containerEl)
      .setName("Allow plugins in multiple groups")
      .setDesc("When turned off, each plugin stays in its first group.")
      .addToggle(toggle => toggle.setValue(this.plugin.data.allowMultipleGroups).onChange(allowed => {
        setMultipleGroupsAllowed(this.plugin.data, allowed);
        queueGroupDataSave(this.plugin);
        for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) refreshGroupsViewInLeaf(leaf);
      }));
  }
}

function updateRibbonButton(plugin: PlugiGroups): void {
  if (plugin.data.showRibbonButton && plugin.ribbonButton === null) {
    plugin.ribbonButton = plugin.addRibbonIcon("layout-grid", "Open PlugiGroups", () => { void openGroupsTab(plugin); });
  } else if (!plugin.data.showRibbonButton && plugin.ribbonButton !== null) {
    plugin.ribbonButton.remove();
    plugin.ribbonButton = null;
  }
}

function renderOpenGroupsSetting(plugin: PlugiGroups, container: HTMLElement): void {
  new Setting(container)
    .setName("PlugiGroups")
    .setDesc("Organize your installed plugins into groups.")
    .addButton(button => button.setButtonText("Open PlugiGroups").onClick(() => {
      closeObsidianSettings(plugin.app);
      void openGroupsTab(plugin);
    }));
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
