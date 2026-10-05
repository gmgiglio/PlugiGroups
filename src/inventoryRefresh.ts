import type { App, EventRef } from "obsidian";
import { pluginInventorySignature } from "./inventory";
import { installedPlugins, subscribeToPluginInventoryChanges, subscribeToCorePluginChanges } from "./pluginApi";

export interface InventoryRefreshState {
  app: App;
  lastInventory: string;
  openViews: () => { refreshGroupsView: () => void }[];
}

export interface InventoryRefreshEvents {
  registerEvent: (event: EventRef) => void;
  onLayoutChange: (callback: () => void) => EventRef;
  onFocus: (callback: () => void) => void;
  onVisibilityChange: (callback: () => void) => void;
}

export function registerPluginInventoryRefreshListeners(state: InventoryRefreshState, events: InventoryRefreshEvents): void {
  const refresh = () => refreshViewsIfPluginInventoryChanged(state);
  const changeEvent = subscribeToPluginInventoryChanges(state.app, refresh);
  if (changeEvent) events.registerEvent(changeEvent);
  const coreChangeEvent = subscribeToCorePluginChanges(state.app, refresh);
  if (coreChangeEvent) events.registerEvent(coreChangeEvent);
  events.registerEvent(events.onLayoutChange(refresh));
  events.onFocus(refresh);
  events.onVisibilityChange(refresh);
}

export function refreshViewsIfPluginInventoryChanged(state: InventoryRefreshState): void {
  const signature = pluginInventorySignature(installedPlugins(state.app));
  if (signature === state.lastInventory) return;
  state.lastInventory = signature;
  for (const view of state.openViews()) view.refreshGroupsView();
}
