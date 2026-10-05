export interface InstalledPlugin {
  id: string;
  kind: "community" | "core";
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
}

export function pluginInventorySignature(plugins: InstalledPlugin[]): string {
  return JSON.stringify(plugins.map(({ id, kind, name, description, version, author, enabled }) => [id, kind, name, description, version, author, enabled]));
}
