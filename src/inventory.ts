export interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
}

export function inventorySignature(plugins: InstalledPlugin[]): string {
  return JSON.stringify(plugins.map(({ id, name, description, version, author, enabled }) => [id, name, description, version, author, enabled]));
}
