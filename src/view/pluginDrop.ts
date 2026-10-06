import { addPluginToGroup, movePluginToGroup, removePluginFromGroup, reorderPluginInGroup } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";

const DRAG_TYPE = "application/x-plugin-groups-admin-id";
const DRAG_SOURCE_TYPE = "application/x-plugin-groups-admin-source";

export function registerPluginDropTarget(context: ViewContext, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  section.addEventListener("dragover", event => allowPluginDrop(event, context, section, groupId));
  section.addEventListener("dragleave", event => clearPluginDropHighlight(event, section));
  section.addEventListener("drop", event => handlePluginDrop(event, context, section, groupId, plugins));
}

function allowPluginDrop(event: DragEvent, context: ViewContext, section: HTMLElement, groupId: string | null): void {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearPluginDropHighlights(section.closest(".plugin-groups-admin") ?? section);
  section.addClass("is-drag-over");
  const target = groupId === null || context.data.alphabeticalPluginOrder ? null : pluginDropTarget(section, event);
  if (target) target.row.addClass(`is-plugin-drop-${target.position}`);
}

function clearPluginDropHighlight(event: DragEvent, section: HTMLElement): void {
  if (!section.contains(event.relatedTarget as Node)) clearPluginDropHighlights(section);
}

function handlePluginDrop(event: DragEvent, context: ViewContext, section: HTMLElement, groupId: string | null, plugins: InstalledPlugin[]): void {
  clearPluginDropHighlights(section);
  const pluginId = event.dataTransfer?.getData(DRAG_TYPE) ?? "";
  if (!plugins.some(plugin => plugin.id === pluginId)) return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData(DRAG_SOURCE_TYPE) || null;
  const target = groupId === null || context.data.alphabeticalPluginOrder ? null : pluginDropTarget(section, event);
  const updated = assignDroppedPlugin(context, pluginId, sourceId, groupId);
  const reordered = groupId !== null && target !== null
    && reorderPluginInGroup(context.data, groupId, pluginId, target.row.dataset.pluginId!, target.position);
  if (updated || reordered) saveGroupChangesAndRefreshViews(context);
}

function assignDroppedPlugin(context: ViewContext, pluginId: string, sourceId: string | null, groupId: string | null): boolean {
  if (sourceId === groupId) return false;
  if (!context.data.allowMultipleGroups) return movePluginToGroup(context.data, pluginId, groupId);
  if (groupId !== null) return addPluginToGroup(context.data, pluginId, groupId);
  return sourceId !== null && removePluginFromGroup(context.data, pluginId, sourceId);
}

interface PluginDropTarget {
  readonly row: HTMLElement;
  readonly position: "before" | "after";
}

function pluginDropTarget(section: HTMLElement, event: DragEvent): PluginDropTarget | null {
  if (section.querySelector<HTMLElement>(".plugin-groups-admin-section-body")?.hidden) return null;
  const rows = Array.from(section.querySelectorAll<HTMLElement>(".plugin-groups-admin-plugin:not([hidden])"));
  if (rows.length === 0) return null;
  const row = rows.find(row => event.clientY < row.getBoundingClientRect().bottom) ?? rows[rows.length - 1];
  const bounds = row.getBoundingClientRect();
  return { row, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" };
}

export function clearPluginDropHighlights(container: Element): void {
  container.classList.remove("is-drag-over");
  for (const element of Array.from(container.querySelectorAll(".is-drag-over, .is-plugin-drop-before, .is-plugin-drop-after"))) {
    element.classList.remove("is-drag-over", "is-plugin-drop-before", "is-plugin-drop-after");
  }
}

export function startPluginDrag(event: DragEvent, pluginId: string, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, pluginId);
  event.dataTransfer.setData(DRAG_SOURCE_TYPE, groupId ?? "");
}
