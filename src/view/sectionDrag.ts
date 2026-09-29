import { setIcon } from "obsidian";
import { reorderSection } from "../groups";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";

const GROUP_DRAG_TYPE = "application/x-plugin-groups-admin-group";
const UNGROUPED_DRAG_TYPE = "application/x-plugin-groups-admin-ungrouped";

export function renderSectionDragHandle(container: HTMLElement, section: HTMLElement, name: string, groupId: string | null): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const handle = heading.createSpan({ cls: "plugin-groups-admin-group-grip", attr: { draggable: "true", role: "img", "aria-label": `Drag to reorder ${name}`, title: `Drag to reorder ${name}` } });
  heading.prepend(handle);
  setIcon(handle, "grip-vertical");
  handle.addEventListener("dragstart", event => startSectionDrag(event, container, section, groupId));
  handle.addEventListener("dragend", () => clearSectionReorderDropHighlights(container));
}

function startSectionDrag(event: DragEvent, container: HTMLElement, section: HTMLElement, groupId: string | null): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(groupId === null ? UNGROUPED_DRAG_TYPE : GROUP_DRAG_TYPE, groupId ?? "ungrouped");
  highlightSectionReorderDropTarget(container, { section, groupId, position: "before", y: section.getBoundingClientRect().top });
}

interface GroupDropTarget {
  section: HTMLElement;
  groupId: string | null;
  position: "before" | "after";
  y: number;
}

function sectionReorderDropTargets(container: HTMLElement): GroupDropTarget[] {
  const sections = Array.from(container.querySelectorAll<HTMLElement>(".plugin-groups-admin-section[data-group-id]"));
  const targets = sections.map((section, index): GroupDropTarget => ({
    section, groupId: section.dataset.groupId || null, position: "before",
    y: index === 0 ? section.getBoundingClientRect().top : (sections[index - 1].getBoundingClientRect().bottom + section.getBoundingClientRect().top) / 2,
  }));
  const last = sections[sections.length - 1];
  if (last) targets.push({ section: last, groupId: last.dataset.groupId || null, position: "after", y: last.getBoundingClientRect().bottom + 10 });
  return targets;
}

function nearestSectionReorderDropTarget(container: HTMLElement, y: number): GroupDropTarget | null {
  const targets = sectionReorderDropTargets(container);
  return targets.reduce<GroupDropTarget | null>((nearest, target) =>
    nearest === null || Math.abs(target.y - y) < Math.abs(nearest.y - y) ? target : nearest, null);
}

function highlightSectionReorderDropTarget(container: HTMLElement, target: GroupDropTarget): void {
  const className = target.position === "before" ? "is-group-drop-before" : "is-group-drop-after";
  if (target.section.hasClass(className)) return;
  clearSectionReorderDropHighlights(container);
  target.section.addClass(className);
}

export function allowSectionReorderDrop(event: DragEvent, container: HTMLElement): void {
  if (!isSectionDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const target = nearestSectionReorderDropTarget(container, event.clientY);
  if (target) highlightSectionReorderDropTarget(container, target);
}

export function dropReorderedSection(event: DragEvent, context: ViewContext, container: HTMLElement): void {
  const transfer = event.dataTransfer;
  if (!isSectionDrag(transfer)) return;
  const groupId = transfer.types.includes(UNGROUPED_DRAG_TYPE) ? null : transfer.getData(GROUP_DRAG_TYPE);
  event.preventDefault();
  const target = nearestSectionReorderDropTarget(container, event.clientY);
  clearSectionReorderDropHighlights(container);
  if (target && reorderSection(context.data, groupId, target.groupId, target.position)) saveGroupChangesAndRefreshViews(context);
}

function isSectionDrag(transfer: DataTransfer | null): transfer is DataTransfer {
  return transfer !== null && (transfer.types.includes(GROUP_DRAG_TYPE) || transfer.types.includes(UNGROUPED_DRAG_TYPE));
}

function clearSectionReorderDropHighlights(container: HTMLElement): void {
  for (const section of Array.from(container.querySelectorAll(".plugin-groups-admin-section"))) section.classList.remove("is-group-drop-before", "is-group-drop-after");
}
