import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { dataFromSaved } from "./groups";
import type { GroupData } from "./groups";
import { installedPlugins, inventorySignature, setPluginEnabled } from "./inventory";
import { openPluginSettings } from "./settings";
import { GroupsView, VIEW_TYPE } from "./view";

export default class PluginGroupsAdmin extends Plugin {
  data: GroupData = { groups: [] };
  lastInventory = "";
  saveQueue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    this.data = dataFromSaved(await this.loadData());
    this.lastInventory = inventorySignature(installedPlugins(this.app));
    this.registerView(VIEW_TYPE, leaf => new GroupsView(leaf, {
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
    this.addRibbonIcon("layout-grid", "Open plugin groups", () => { void openGroups(this); });
    this.addCommand({ id: "open-plugin-groups", name: "Open plugin groups", callback: () => { void openGroups(this); } });
    registerInventoryRefresh(this);
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
}

function registerInventoryRefresh(plugin: PluginGroupsAdmin): void {
  plugin.registerEvent(plugin.app.workspace.on("layout-change", () => refreshInventory(plugin)));
  plugin.registerDomEvent(window, "focus", () => refreshInventory(plugin));
  plugin.registerDomEvent(document, "visibilitychange", () => refreshInventory(plugin));
  plugin.registerInterval(window.setInterval(() => refreshInventory(plugin), 1500));
}

async function openGroups(plugin: PluginGroupsAdmin): Promise<void> {
  const workspace = plugin.app.workspace;
  const leaf = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? workspace.getLeaf("tab");
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  await workspace.revealLeaf(leaf);
}

function refreshInventory(plugin: PluginGroupsAdmin): void {
  const signature = inventorySignature(installedPlugins(plugin.app));
  if (signature === plugin.lastInventory) return;
  plugin.lastInventory = signature;
  for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) refreshLeaf(leaf);
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
