import type { App } from "obsidian";
import type { GroupData } from "../groups";
import type { GroupEnabledState } from "../groupToggle";
import type { InstalledPlugin } from "../inventory";
import type { SettingsDestination } from "../pluginApi";

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
