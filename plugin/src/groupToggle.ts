import type { InstalledPlugin } from "./inventory";

export type GroupEnabledState = "enabled" | "disabled" | "mixed";

export function toggleablePlugins(plugins: InstalledPlugin[], selfId: string): InstalledPlugin[] {
  return plugins.filter(plugin => plugin.id !== selfId);
}

export function groupEnabledState(plugins: InstalledPlugin[]): GroupEnabledState {
  const enabled = plugins.filter(plugin => plugin.enabled).length;
  if (enabled === 0) return "disabled";
  if (enabled === plugins.length) return "enabled";
  return "mixed";
}

export async function setGroupEnabled(plugins: InstalledPlugin[], enabled: boolean, setEnabled: (id: string, enabled: boolean) => Promise<void>): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.enabled !== enabled) await setEnabled(plugin.id, enabled);
  }
}
