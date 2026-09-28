import { App, Menu, Modal, Notice, Platform } from "obsidian";
import type { InstalledPlugin } from "./inventory";
import { openPluginHotkeys, openPluginSettingsOrCommunityTab, pluginFundingAndFolderDetails, pluginHasCommands, revealPluginFolder, uninstallPlugin } from "./pluginApi";
import type { FundingUrl, PluginExtras } from "./pluginApi";

class FundingModal extends Modal {
  constructor(app: App, private readonly plugin: InstalledPlugin, private readonly links: [string, string][]) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(`Donate to ${this.plugin.name}`);
    for (const [label, url] of this.links) {
      const button = this.contentEl.createEl("button", { text: label });
      button.addEventListener("click", () => { window.open(url); this.close(); });
    }
  }
}

export function showPluginMenu(app: App, plugin: InstalledPlugin, event: MouseEvent): void {
  const extras = pluginFundingAndFolderDetails(app, plugin.id);
  const menu = new Menu();
  menu.addItem(item => item.setTitle("Settings").setIcon("settings").onClick(() => openPluginSettingsWithFeedback(app, plugin)));
  if (pluginHasCommands(app, plugin.id)) menu.addItem(item => item.setTitle("Hotkeys").setIcon("keyboard").onClick(() => openPluginHotkeys(app, plugin.id)));
  menu.addItem(item => item.setTitle("View details").setIcon("info").onClick(() => openPluginDetailsPage(plugin.id)));
  menu.addItem(item => item.setTitle("Open community page").setIcon("external-link").onClick(() => openPluginCommunityPage(plugin.id)));
  addFundingAndFolderMenuActions(menu, app, plugin, extras);
  menu.addSeparator();
  menu.addItem(item => item.setTitle("Uninstall").setIcon("trash-2").setWarning(true).onClick(() => { void confirmAndUninstallPlugin(app, plugin); }));
  menu.showAtMouseEvent(event);
}

function addFundingAndFolderMenuActions(menu: Menu, app: App, plugin: InstalledPlugin, extras: PluginExtras): void {
  const { fundingUrl, folder } = extras;
  if (fundingUrl) menu.addItem(item => item.setTitle("Donate").setIcon("heart").onClick(() => showPluginFundingOptions(app, plugin, fundingUrl)));
  if (Platform.isDesktopApp && folder) menu.addItem(item => item.setTitle(Platform.isMacOS ? "Reveal in Finder" : "Show in system explorer").setIcon("folder-open").onClick(() => revealPluginFolder(app, folder)));
}

function openPluginSettingsWithFeedback(app: App, plugin: InstalledPlugin): void {
  const destination = openPluginSettingsOrCommunityTab(app, plugin.id);
  if (destination === "community") new Notice(`${plugin.name} has no settings page. Showing Community plugins.`);
  if (destination === "unavailable") new Notice("Could not open Obsidian settings.");
}

function openPluginDetailsPage(id: string): void {
  window.open(`obsidian://show-plugin?id=${encodeURIComponent(id)}`);
}

function openPluginCommunityPage(id: string): void {
  window.open(`https://obsidian.md/plugins?id=${encodeURIComponent(id)}`);
}

function showPluginFundingOptions(app: App, plugin: InstalledPlugin, fundingUrl: FundingUrl): void {
  if (typeof fundingUrl === "string") window.open(fundingUrl);
  else new FundingModal(app, plugin, Object.entries(fundingUrl)).open();
}

async function confirmAndUninstallPlugin(app: App, plugin: InstalledPlugin): Promise<void> {
  if (!window.confirm(`Uninstall ${plugin.name}?`)) return;
  try {
    await uninstallPlugin(app, plugin.id);
  } catch (error) {
    console.error(`Failed to uninstall ${plugin.name}`, error);
    new Notice(`Could not uninstall ${plugin.name}.`);
  }
}
