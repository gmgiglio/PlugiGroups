import type { App, PluginManifest } from "obsidian";

export interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
}

interface CommunityPluginManager {
  manifests: Record<string, PluginManifest>;
  enabledPlugins: Set<string>;
  enablePluginAndSave?: (id: string) => Promise<void>;
  disablePluginAndSave?: (id: string) => Promise<void>;
}

interface AppWithPlugins extends App {
  plugins?: CommunityPluginManager;
}

export function installedPlugins(app: App): InstalledPlugin[] {
  const manager = (app as AppWithPlugins).plugins;
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

export function inventorySignature(plugins: InstalledPlugin[]): string {
  return JSON.stringify(plugins.map(({ id, name, description, version, author, enabled }) => [id, name, description, version, author, enabled]));
}

export async function setPluginEnabled(app: App, id: string, enabled: boolean): Promise<void> {
  const manager = (app as AppWithPlugins).plugins;
  if (!manager?.manifests[id]) throw new Error(`Plugin ${id} is not installed`);
  if (manager.enabledPlugins.has(id) === enabled) return;
  const change = enabled ? manager.enablePluginAndSave : manager.disablePluginAndSave;
  if (!change) throw new Error("Obsidian's plugin controls are unavailable");
  await change.call(manager, id);
}
