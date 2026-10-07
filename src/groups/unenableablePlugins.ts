import type { GroupData } from "./data";
import type { InstalledPlugin } from "../plugins/inventory";

export type UnenableablePlugins = Record<string, string>;

export function isPluginUnenableable(unenableable: UnenableablePlugins, plugin: InstalledPlugin): boolean {
  return !plugin.enabled && Object.prototype.hasOwnProperty.call(unenableable, plugin.id) && unenableable[plugin.id] === plugin.version;
}

export function markPluginUnenableable(data: GroupData, plugin: InstalledPlugin): void {
  data.unenableablePlugins[plugin.id] = plugin.version;
}

export function forgetUnenableablePlugin(data: GroupData, id: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(data.unenableablePlugins, id)) return false;
  delete data.unenableablePlugins[id];
  return true;
}

export function normalizeSavedUnenableablePlugins(value: unknown): UnenableablePlugins {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
