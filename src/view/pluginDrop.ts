import { addPluginToGroup, movePluginToGroup, removePluginFromGroup } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";

const DRAG_TYPE = "application/x-plugin-groups-admin-id";
const DRAG_SOURCE_TYPE = "application/x-plugin-groups-admin-source";

export function registerPluginDropTarget(context: ViewContext, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.addEventListener("dragover", event => allowPluginDrop(event, section));
  section.addEventListener("dragleave", event => clearPluginDropHighlight(event, section));
  section.addEventListener("drop", event => handlePluginDrop(event, context, section, groupId, plugins));
}

function allowPluginDrop(event: DragEvent, section: HTMLElement): void {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  section.addClass("is-drag-over");
}

function clearPluginDropHighlight(event: DragEvent, section: HTMLElement): void {
  if (!section.contains(event.relatedTarget as Node)) section.removeClass("is-drag-over");
}

function handlePluginDrop(event: DragEvent, context: ViewContext, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.removeClass("is-drag-over");
  const pluginId = event.dataTransfer?.getData(DRAG_TYPE) ?? "";
  if (!plugins.some(plugin => plugin.id === pluginId)) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData(DRAG_SOURCE_TYPE) || null;
  const updated = context.data.allowMultipleGroups
    ? groupId === null ? sourceId !== null && removePluginFromGroup(context.data, pluginId, sourceId) : addPluginToGroup(context.data, pluginId, groupId)
    : movePluginToGroup(context.data, pluginId, groupId);
  if (updated) saveGroupChangesAndRefreshViews(context);
}

export function startPluginDrag(event: DragEvent, pluginId: string, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, pluginId);
  event.dataTransfer.setData(DRAG_SOURCE_TYPE, groupId ?? "");
}
