import { App, Menu, Modal, Notice, Platform } from "obsidian";
import type { InstalledPlugin } from "./inventory";
import { openPluginHotkeys, openPluginSettings, pluginExtras, pluginHasCommands, revealPluginFolder, uninstallPlugin } from "./pluginApi";
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
  const extras = pluginExtras(app, plugin.id);
  const menu = new Menu();
  menu.addItem(item => item.setTitle("Settings").setIcon("settings").onClick(() => openSettings(app, plugin)));
  if (pluginHasCommands(app, plugin.id)) menu.addItem(item => item.setTitle("Hotkeys").setIcon("keyboard").onClick(() => openPluginHotkeys(app, plugin.id)));
  menu.addItem(item => item.setTitle("View details").setIcon("info").onClick(() => openDetails(plugin.id)));
  menu.addItem(item => item.setTitle("Open community page").setIcon("external-link").onClick(() => openCommunityPage(plugin.id)));
  addManifestActions(menu, app, plugin, extras);
  menu.addSeparator();
  menu.addItem(item => item.setTitle("Uninstall").setIcon("trash-2").setWarning(true).onClick(() => { void confirmUninstallPlugin(app, plugin); }));
  menu.showAtMouseEvent(event);
}

function addManifestActions(menu: Menu, app: App, plugin: InstalledPlugin, extras: PluginExtras): void {
  const { fundingUrl, folder } = extras;
  if (fundingUrl) menu.addItem(item => item.setTitle("Donate").setIcon("heart").onClick(() => openFunding(app, plugin, fundingUrl)));
  if (Platform.isDesktopApp && folder) menu.addItem(item => item.setTitle(Platform.isMacOS ? "Reveal in Finder" : "Show in system explorer").setIcon("folder-open").onClick(() => revealPluginFolder(app, folder)));
}

function openSettings(app: App, plugin: InstalledPlugin): void {
  const destination = openPluginSettings(app, plugin.id);
  if (destination === "community") new Notice(`${plugin.name} has no settings page. Showing Community plugins.`);
  if (destination === "unavailable") new Notice("Could not open Obsidian settings.");
}

function openDetails(id: string): void {
  window.open(`obsidian://show-plugin?id=${encodeURIComponent(id)}`);
}

function openCommunityPage(id: string): void {
  window.open(`https://obsidian.md/plugins?id=${encodeURIComponent(id)}`);
}

function openFunding(app: App, plugin: InstalledPlugin, fundingUrl: FundingUrl): void {
  if (typeof fundingUrl === "string") window.open(fundingUrl);
  else new FundingModal(app, plugin, Object.entries(fundingUrl)).open();
}

async function confirmUninstallPlugin(app: App, plugin: InstalledPlugin): Promise<void> {
  if (!window.confirm(`Uninstall ${plugin.name}?`)) return;
  try {
    await uninstallPlugin(app, plugin.id);
  } catch (error) {
    console.error(`Failed to uninstall ${plugin.name}`, error);
    new Notice(`Could not uninstall ${plugin.name}.`);
  }
}
