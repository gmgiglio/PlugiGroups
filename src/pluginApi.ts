import type { App, EventRef, PluginManifest } from "obsidian";
import type { InstalledPlugin } from "./inventory";

export type SettingsDestination = "plugin" | "community" | "core" | "unavailable";
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

interface CorePlugin {
  enabled: boolean;
  instance: { name: string; description: string; hiddenFromList?: boolean };
  enable?: (save: boolean) => Promise<void>;
  disable?: (save: boolean) => void;
}

interface CorePluginManager {
  plugins: Record<string, CorePlugin>;
  on?: (name: "change", callback: () => void) => EventRef;
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
  internalPlugins?: CorePluginManager;
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
      kind: "community" as const,
      name: manifest.name || id,
      description: manifest.description || "",
      version: manifest.version || "",
      author: manifest.author || "",
      enabled: manager.enabledPlugins?.has(id) ?? false,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function installedPlugins(app: App, includeCorePlugins: boolean = true): InstalledPlugin[] {
  return [...installedCommunityPlugins(app), ...(includeCorePlugins ? installedCorePlugins(app) : [])]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function installedCorePlugins(app: App): InstalledPlugin[] {
  const plugins = (app as AppInternals).internalPlugins?.plugins ?? {};
  return Object.entries(plugins).filter(([, plugin]) => !plugin.instance.hiddenFromList)
    .map(([id, plugin]) => ({ id: `core:${id}`, kind: "core", name: plugin.instance.name || id,
      description: plugin.instance.description || "", version: "", author: "", enabled: plugin.enabled }));
}

function corePluginId(id: string): string | null {
  return id.startsWith("core:") ? id.slice(5) : null;
}

export function subscribeToCorePluginChanges(app: App, callback: () => void): EventRef | null {
  return (app as AppInternals).internalPlugins?.on?.("change", callback) ?? null;
}

async function setCorePluginEnabled(app: App, id: string, enabled: boolean): Promise<void> {
  const plugin = (app as AppInternals).internalPlugins?.plugins?.[id];
  if (!plugin || plugin.instance.hiddenFromList) throw new Error(`Core plugin ${id} is not available`);
  if (plugin.enabled === enabled) return;
  if (!plugin.enable || !plugin.disable) throw new Error("Obsidian's core plugin controls are unavailable");
  if (enabled) await plugin.enable(true);
  else plugin.disable(true);
  if (plugin.enabled !== enabled) throw new Error(`Could not change core plugin ${id}`);
}

export function subscribeToPluginInventoryChanges(app: App, callback: () => void): EventRef | null {
  return (app as AppInternals).plugins?.on?.("changed", callback) ?? null;
}

export async function setPluginEnabled(app: App, id: string, enabled: boolean): Promise<void> {
  const coreId = corePluginId(id);
  if (coreId !== null) return setCorePluginEnabled(app, coreId, enabled);
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
  if (corePluginId(id) !== null) throw new Error("Core plugins cannot be uninstalled");
  const uninstall = (app as AppInternals).plugins?.uninstallPlugin;
  if (!uninstall) throw new Error("Obsidian's plugin controls are unavailable");
  await uninstall.call((app as AppInternals).plugins, id);
}

export function pluginHasCommands(app: App, id: string): boolean {
  const commands = (app as AppInternals).commands?.commands ?? {};
  return Object.keys(commands).some(commandId => commandId.startsWith(`${corePluginId(id) ?? id}:`));
}

export function openPluginHotkeys(app: App, id: string): void {
  const settings = (app as AppInternals).setting;
  settings?.open?.();
  const tab = settings?.openTabById?.("hotkeys") as HotkeysTab | undefined;
  tab?.setQuery?.(corePluginId(id) ?? id);
}

export function revealPluginFolder(app: App, path: string): void {
  (app as AppInternals).showInFolder?.(path);
}

export function closeObsidianSettings(app: App): void {
  (app as AppInternals).setting?.close?.();
}

export function pluginHasSettingsTab(app: App, pluginId: string): boolean {
  return (app as AppInternals).setting?.pluginTabs?.some(tab => tab.id === (corePluginId(pluginId) ?? pluginId)) ?? false;
}

export function openPluginSettingsOrCommunityTab(app: App, pluginId: string): SettingsDestination {
  const settings = (app as AppInternals).setting;
  if (!settings?.open || !settings.openTabById) return "unavailable";
  settings.open();
  if (pluginHasSettingsTab(app, pluginId)) {
    settings.openTabById(corePluginId(pluginId) ?? pluginId);
    return "plugin";
  }
  if (corePluginId(pluginId) !== null) {
    settings.openTabById("plugins");
    return "core";
  }
  settings.openTabById("community-plugins");
  settings.settingTabs?.find(tab => tab.id === "community-plugins")?.revealPlugin?.(pluginId);
  return "community";
}
