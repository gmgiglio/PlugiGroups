import type { App, EventRef } from "obsidian";
import { inventorySignature } from "./inventory";
import { installedPlugins, onPluginInventoryChanged } from "./pluginApi";

export interface InventoryRefreshState {
  app: App;
  lastInventory: string;
  views: () => { refresh: () => void }[];
}

export interface InventoryRefreshEvents {
  registerEvent: (event: EventRef) => void;
  onLayoutChange: (callback: () => void) => EventRef;
  onFocus: (callback: () => void) => void;
  onVisibilityChange: (callback: () => void) => void;
}

export function registerInventoryRefresh(state: InventoryRefreshState, events: InventoryRefreshEvents): void {
  const refresh = () => refreshInventory(state);
  const changeEvent = onPluginInventoryChanged(state.app, refresh);
  if (changeEvent) events.registerEvent(changeEvent);
  events.registerEvent(events.onLayoutChange(refresh));
  events.onFocus(refresh);
  events.onVisibilityChange(refresh);
}

export function refreshInventory(state: InventoryRefreshState): void {
  const signature = inventorySignature(installedPlugins(state.app));
  if (signature === state.lastInventory) return;
  state.lastInventory = signature;
  for (const view of state.views()) view.refresh();
}
