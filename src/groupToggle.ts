import type { InstalledPlugin } from "./inventory";

export type GroupEnabledState = "enabled" | "disabled";

export function toggleablePlugins(plugins: InstalledPlugin[], selfId: string): InstalledPlugin[] {
  return plugins.filter(plugin => plugin.id !== selfId);
}

export function groupEnabledState(plugins: InstalledPlugin[]): GroupEnabledState {
  return plugins.some(plugin => plugin.enabled) ? "enabled" : "disabled";
}

export async function setGroupEnabled(plugins: InstalledPlugin[], enabled: boolean, setEnabled: (id: string, enabled: boolean) => Promise<void>): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.enabled !== enabled) await setEnabled(plugin.id, enabled);
  }
}
