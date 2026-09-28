import { Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { dataFromSaved, setMultipleGroupsAllowed } from "./groups";
import type { GroupData } from "./groups";
import { inventorySignature } from "./inventory";
import { registerInventoryRefresh } from "./inventoryRefresh";
import { closeSettings, installedPlugins, openPluginSettings, setPluginEnabled } from "./pluginApi";
import { GroupsView, VIEW_TYPE } from "./view";

export default class PluginGroupsAdmin extends Plugin {
  data: GroupData = { groups: [], allowMultipleGroups: false, showRibbonButton: true, ungroupedIndex: 0 };
  saveQueue: Promise<void> = Promise.resolve();
  ribbonButton: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.data = dataFromSaved(await this.loadData());
    this.registerView(VIEW_TYPE, leaf => new GroupsView(leaf, {
      app: this.app,
      data: this.data,
      ungroupedSearch: "",
      collapsedGroupIds: new Set<string | null>(),
      plugins: () => installedPlugins(this.app),
      setEnabled: (id, enabled) => setPluginEnabled(this.app, id, enabled),
      openSettings: id => openPluginSettings(this.app, id),
      selfId: this.manifest.id,
      busyGroupIds: new Set<string>(),
      save: () => queueSave(this),
    }));
    updateRibbonButton(this);
    this.addCommand({ id: "open-plugin-groups", name: "Open plugin groups", callback: () => { void openGroups(this); } });
    this.addSettingTab(new GroupsSettingTab(this));
    registerPluginInventoryRefresh(this);
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

class GroupsSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: PluginGroupsAdmin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    renderGroupsNavigation(this.plugin, this.containerEl);
    new Setting(this.containerEl)
      .setName("Show ribbon button")
      .setDesc("Show the Plugin groups button in the ribbon.")
      .addToggle(toggle => toggle.setValue(this.plugin.data.showRibbonButton).onChange(visible => {
        this.plugin.data.showRibbonButton = visible;
        updateRibbonButton(this.plugin);
        queueSave(this.plugin);
      }));
    new Setting(this.containerEl)
      .setName("Allow plugins in multiple groups")
      .setDesc("When turned off, each plugin stays in its first group.")
      .addToggle(toggle => toggle.setValue(this.plugin.data.allowMultipleGroups).onChange(allowed => {
        setMultipleGroupsAllowed(this.plugin.data, allowed);
        queueSave(this.plugin);
        for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) refreshLeaf(leaf);
      }));
  }
}

function updateRibbonButton(plugin: PluginGroupsAdmin): void {
  if (plugin.data.showRibbonButton && plugin.ribbonButton === null) {
    plugin.ribbonButton = plugin.addRibbonIcon("layout-grid", "Open plugin groups", () => { void openGroups(plugin); });
  } else if (!plugin.data.showRibbonButton && plugin.ribbonButton !== null) {
    plugin.ribbonButton.remove();
    plugin.ribbonButton = null;
  }
}

function renderGroupsNavigation(plugin: PluginGroupsAdmin, container: HTMLElement): void {
  new Setting(container)
    .setName("Plugin groups")
    .setDesc("Organize your installed plugins into groups.")
    .addButton(button => button.setButtonText("Open plugin groups").onClick(() => {
      closeSettings(plugin.app);
      void openGroups(plugin);
    }));
}

function registerPluginInventoryRefresh(plugin: PluginGroupsAdmin): void {
  registerInventoryRefresh({
    app: plugin.app,
    lastInventory: inventorySignature(installedPlugins(plugin.app)),
    views: () => plugin.app.workspace.getLeavesOfType(VIEW_TYPE)
      .map(leaf => leaf.view)
      .filter((view): view is GroupsView => view instanceof GroupsView),
  }, {
    registerEvent: event => plugin.registerEvent(event),
    onLayoutChange: callback => plugin.app.workspace.on("layout-change", callback),
    onFocus: callback => plugin.registerDomEvent(window, "focus", callback),
    onVisibilityChange: callback => plugin.registerDomEvent(document, "visibilitychange", callback),
  });
}

async function openGroups(plugin: PluginGroupsAdmin): Promise<void> {
  const workspace = plugin.app.workspace;
  const leaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf("tab");
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}

function refreshLeaf(leaf: WorkspaceLeaf): void {
  if (leaf.view instanceof GroupsView) leaf.view.refresh();
}

function queueSave(plugin: PluginGroupsAdmin): void {
  plugin.saveQueue = plugin.saveQueue.then(() => plugin.saveData(plugin.data)).catch(error => {
    console.error("Failed to save plugin groups", error);
    new Notice("Could not save plugin groups.");
  });
}
