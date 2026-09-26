import type { App } from "obsidian";

export type SettingsDestination = "plugin" | "community" | "unavailable";

interface SettingsManager {
  open?: () => void;
  close?: () => void;
  openTabById?: (id: string) => unknown;
  pluginTabs?: { id: string }[];
  settingTabs?: { id: string; revealPlugin?: (id: string) => void }[];
}

interface AppWithSettings extends App {
  setting?: SettingsManager;
}

export function closeSettings(app: App): void {
  (app as AppWithSettings).setting?.close?.();
}

export function openPluginSettings(app: App, pluginId: string): SettingsDestination {
  const settings = (app as AppWithSettings).setting;
  if (!settings?.open || !settings.openTabById) return "unavailable";
  settings.open();
  if (settings.pluginTabs?.some(tab => tab.id === pluginId)) {
    settings.openTabById(pluginId);
    return "plugin";
  }
  settings.openTabById("community-plugins");
  settings.settingTabs?.find(tab => tab.id === "community-plugins")?.revealPlugin?.(pluginId);
  return "community";
}
