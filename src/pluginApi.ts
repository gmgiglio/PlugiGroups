import type { App, EventRef, PluginManifest } from "obsidian";
import type { InstalledPlugin } from "./inventory";

export type SettingsDestination = "plugin" | "community" | "unavailable";
export type FundingUrl = string | Record<string, string>;

export interface PluginExtras {
  fundingUrl: FundingUrl | null;
  folder: string | null;
}

interface PluginManager {
  manifests: Record<string, PluginManifest & { fundingUrl?: FundingUrl }>;
  enabledPlugins: Set<string>;
  enablePluginAndSave?: (id: string) => Promise<boolean>;
  disablePluginAndSave?: (id: string) => Promise<void>;
  uninstallPlugin?: (id: string) => Promise<void>;
  on?: (name: "changed", callback: () => void) => EventRef;
}

interface SettingsManager {
  open?: () => void;
  close?: () => void;
  openTabById?: (id: string) => unknown;
  pluginTabs?: { id: string }[];
  settingTabs?: { id: string; revealPlugin?: (id: string) => void }[];
}

interface HotkeysTab {
  setQuery?: (query: string) => void;
}

interface AppInternals extends App {
  plugins?: PluginManager;
  setting?: SettingsManager;
  commands?: { commands: Record<string, unknown> };
  showInFolder?: (path: string) => void;
}

export function installedCommunityPlugins(app: App): InstalledPlugin[] {
  const manager = (app as AppInternals).plugins;
  if (!manager?.manifests) return [];
  return Object.entries(manager.manifests)
    .map(([id, manifest]) => ({
      id,
      name: manifest.name || id,
      description: manifest.description || "",
      version: manifest.version || "",
      author: manifest.author || "",
      enabled: manager.enabledPlugins?.has(id) ?? false,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function subscribeToPluginInventoryChanges(app: App, callback: () => void): EventRef | null {
  return (app as AppInternals).plugins?.on?.("changed", callback) ?? null;
}

export async function setPluginEnabled(app: App, id: string, enabled: boolean): Promise<void> {
  const manager = (app as AppInternals).plugins;
  if (!manager?.manifests?.[id]) throw new Error(`Plugin ${id} is not installed`);
  if (manager.enabledPlugins.has(id) === enabled) return;
  if (enabled) {
    if (!manager.enablePluginAndSave) throw new Error("Obsidian's plugin controls are unavailable");
    if (!await manager.enablePluginAndSave(id)) throw new Error(`Could not enable plugin ${id}`);
    return;
  }
  if (!manager.disablePluginAndSave) throw new Error("Obsidian's plugin controls are unavailable");
  await manager.disablePluginAndSave(id);
}

export function pluginFundingAndFolderDetails(app: App, id: string): PluginExtras {
  const manifest = (app as AppInternals).plugins?.manifests?.[id];
  return { fundingUrl: manifest?.fundingUrl ?? null, folder: manifest?.dir ?? null };
}

export async function uninstallPlugin(app: App, id: string): Promise<void> {
  const uninstall = (app as AppInternals).plugins?.uninstallPlugin;
  if (!uninstall) throw new Error("Obsidian's plugin controls are unavailable");
  await uninstall.call((app as AppInternals).plugins, id);
}

export function pluginHasCommands(app: App, id: string): boolean {
  const commands = (app as AppInternals).commands?.commands ?? {};
  return Object.keys(commands).some(commandId => commandId.startsWith(`${id}:`));
}

export function openPluginHotkeys(app: App, id: string): void {
  const settings = (app as AppInternals).setting;
  settings?.open?.();
  const tab = settings?.openTabById?.("hotkeys") as HotkeysTab | undefined;
  tab?.setQuery?.(id);
}

export function revealPluginFolder(app: App, path: string): void {
  (app as AppInternals).showInFolder?.(path);
}

export function closeObsidianSettings(app: App): void {
  (app as AppInternals).setting?.close?.();
}

export function pluginHasSettingsTab(app: App, pluginId: string): boolean {
  return (app as AppInternals).setting?.pluginTabs?.some(tab => tab.id === pluginId) ?? false;
}

export function openPluginSettingsOrCommunityTab(app: App, pluginId: string): SettingsDestination {
  const settings = (app as AppInternals).setting;
  if (!settings?.open || !settings.openTabById) return "unavailable";
  settings.open();
  if (pluginHasSettingsTab(app, pluginId)) {
    settings.openTabById(pluginId);
    return "plugin";
  }
  settings.openTabById("community-plugins");
  settings.settingTabs?.find(tab => tab.id === "community-plugins")?.revealPlugin?.(pluginId);
  return "community";
}
