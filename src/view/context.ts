import type { App } from "obsidian";
import type { GroupData } from "../groups/data";
import type { GroupEnabledState } from "../groups/toggle";
import type { InstalledPlugin } from "../plugins/inventory";
import type { SettingsDestination } from "../plugins/api";

export interface ViewContext {
  app: App;
  data: GroupData;
  getInstalledPlugins: () => InstalledPlugin[];
  setPluginEnabled: (id: string, enabled: boolean) => Promise<void>;
  openPluginSettings: (id: string) => SettingsDestination;
  selfId: string;
  pendingPluginIds: Set<string>;
  pendingGroupStates: Map<string, GroupEnabledState>;
  refreshOpenGroupsViews: () => void;
  queueGroupDataSave: () => void;
}

export function saveGroupChangesAndRefreshViews(context: ViewContext): void {
  context.queueGroupDataSave();
  context.refreshOpenGroupsViews();
}
