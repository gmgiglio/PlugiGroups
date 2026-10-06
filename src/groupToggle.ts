import type { Group } from "./groups";
import type { InstalledPlugin } from "./inventory";
import { isPluginUnenableable, type UnenableablePlugins } from "./unenableablePlugins";

export type GroupEnabledState = "enabled" | "partial" | "disabled";

export function pluginsEligibleForGroupToggle(plugins: InstalledPlugin[], selfId: string, unenableable: UnenableablePlugins): InstalledPlugin[] {
  return plugins.filter(plugin => plugin.id !== selfId && !isPluginUnenableable(unenableable, plugin));
}

export function groupEnabledState(plugins: InstalledPlugin[]): GroupEnabledState {
  if (!plugins.some(plugin => plugin.enabled)) return "disabled";
  return plugins.every(plugin => plugin.enabled) ? "enabled" : "partial";
}

export function groupStateAfterChange(plugins: InstalledPlugin[], enabledIds: string[]): GroupEnabledState {
  return groupEnabledState(plugins.map(plugin => ({ ...plugin, enabled: enabledIds.includes(plugin.id) })));
}

export function rememberGroupMix(group: Group, plugins: InstalledPlugin[]): void {
  if (groupEnabledState(plugins) === "partial") group.savedMixPluginIds = plugins.filter(plugin => plugin.enabled).map(plugin => plugin.id);
  else delete group.savedMixPluginIds;
}

export function rememberMixesOfGroupsContaining(groups: Group[], pluginId: string, installed: InstalledPlugin[], selfId: string, unenableable: UnenableablePlugins): void {
  for (const group of groups.filter(candidate => candidate.pluginIds.includes(pluginId))) {
    const members = installed.filter(plugin => group.pluginIds.includes(plugin.id));
    rememberGroupMix(group, pluginsEligibleForGroupToggle(members, selfId, unenableable));
  }
}

export function nextGroupEnabledIds(group: Group, plugins: InstalledPlugin[]): string[] {
  const state = groupEnabledState(plugins);
  if (state === "enabled") return [];
  if (state === "partial") return plugins.map(plugin => plugin.id);
  const savedMix = savedMixPresentIn(group, plugins);
  return isPartialMix(savedMix, plugins) ? savedMix : plugins.map(plugin => plugin.id);
}

function isPartialMix(enabledIds: string[], plugins: InstalledPlugin[]): boolean {
  return enabledIds.length > 0 && enabledIds.length < plugins.length;
}

function savedMixPresentIn(group: Group, plugins: InstalledPlugin[]): string[] {
  const savedMix = group.savedMixPluginIds ?? [];
  return plugins.map(plugin => plugin.id).filter(id => savedMix.includes(id));
}

export async function setGroupPluginsEnabled(plugins: InstalledPlugin[], enabled: boolean, setPluginEnabled: (id: string, enabled: boolean) => Promise<void>): Promise<void> {
  await enableOnlyGroupPlugins(plugins, enabled ? plugins.map(plugin => plugin.id) : [], setPluginEnabled);
}

export async function enableOnlyGroupPlugins(plugins: InstalledPlugin[], enabledIds: string[], setPluginEnabled: (id: string, enabled: boolean) => Promise<void>): Promise<void> {
  const failures: unknown[] = [];
  for (const plugin of plugins) {
    const enabled = enabledIds.includes(plugin.id);
    if (plugin.enabled !== enabled) await setPluginEnabled(plugin.id, enabled).catch((error: unknown) => { failures.push(error); });
  }
  if (failures.length > 0) throw failures[0];
}
