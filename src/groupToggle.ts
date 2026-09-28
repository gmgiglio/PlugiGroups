import type { InstalledPlugin } from "./inventory";

export type GroupEnabledState = "enabled" | "disabled";

export function pluginsEligibleForGroupToggle(plugins: InstalledPlugin[], selfId: string): InstalledPlugin[] {
  return plugins.filter(plugin => plugin.id !== selfId);
}

export function groupEnabledState(plugins: InstalledPlugin[]): GroupEnabledState {
  return plugins.some(plugin => plugin.enabled) ? "enabled" : "disabled";
}

export async function setGroupPluginsEnabled(plugins: InstalledPlugin[], enabled: boolean, setPluginEnabled: (id: string, enabled: boolean) => Promise<void>): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.enabled !== enabled) await setPluginEnabled(plugin.id, enabled);
  }
}
