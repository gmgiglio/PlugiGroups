import { setIcon } from "obsidian";
import { renderGroupsSearch, type GroupsSearchState } from "./search";
import { createHeaderAction } from "./action";
import { showGroupRenameInput } from "../sections/group";
import { addGroup, setCollapseMode, type CollapseMode } from "../../groups/data";
import type { InstalledPlugin } from "../../plugins/inventory";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "../context";

export function renderGroupsHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[], search: GroupsSearchState): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  const controls = header.createDiv({ cls: "plugin-groups-admin-group-controls" });
  const stats = controls.createDiv({ cls: "plugin-groups-admin-stats-controls" });
  renderGroupsSummary(stats, context.data.groups.length, plugins);
  renderViewOptions(context, stats);
  const actions = controls.createDiv({ cls: "plugin-groups-admin-header-actions" });
  renderAddGroupButton(context, actions, container, search);
  renderGroupsSearch(search, header, container, context);
}

function renderViewOptions(context: ViewContext, container: HTMLElement): void {
  const options = container.createDiv({ cls: "plugin-groups-admin-view-options", attr: { role: "group", "aria-label": "View options" } });
  renderCollapseCycle(context, options);
  renderAlphabeticalOrderToggle(context, options);
}

function renderAlphabeticalOrderToggle(context: ViewContext, container: HTMLElement): void {
  const alphabetical = context.data.alphabeticalPluginOrder;
  const text = alphabetical ? "A–Z order" : "custom order";
  const button = createHeaderAction(container, alphabetical ? "arrow-down-az" : "list-ordered", text, "plugin-groups-admin-alphabetical-order", "Alphabetical plugin order");
  button.setAttribute("aria-pressed", String(alphabetical));
  button.setAttribute("title", `${text}. Click to ${alphabetical ? "restore custom plugin order" : "sort plugins alphabetically"}.`);
  button.addEventListener("click", () => toggleAlphabeticalOrder(context, button));
}

function toggleAlphabeticalOrder(context: ViewContext, button: HTMLButtonElement): void {
  const focused = button.ownerDocument.activeElement === button;
  const view = button.closest<HTMLElement>(".plugin-groups-admin")!;
  context.data.alphabeticalPluginOrder = !context.data.alphabeticalPluginOrder;
  saveGroupChangesAndRefreshViews(context);
  if (focused) view.querySelector<HTMLButtonElement>(".plugin-groups-admin-alphabetical-order")!.focus({ preventScroll: true });
}

const COLLAPSE_CYCLE: Record<CollapseMode, { readonly next: CollapseMode; readonly icon: string; readonly label: string; readonly nextLabel: string }> = {
  individual: { next: "collapsed", icon: "list-collapse", label: "some expanded", nextLabel: "collapse all groups" },
  collapsed: { next: "expanded", icon: "chevrons-down-up", label: "all collapsed", nextLabel: "expand all groups" },
  expanded: { next: "individual", icon: "chevrons-up-down", label: "all expanded", nextLabel: "use saved group states" },
};

function renderCollapseCycle(context: ViewContext, container: HTMLElement): void {
  const state = COLLAPSE_CYCLE[context.data.collapseMode];
  const label = `${state.label}. Click to ${state.nextLabel}.`;
  const button = container.createEl("button", { cls: "plugin-groups-admin-collapse-cycle", attr: { type: "button", "aria-label": label, title: label, "data-current-mode": context.data.collapseMode } });
  setIcon(button.createSpan({ cls: "plugin-groups-admin-action-icon", attr: { "aria-hidden": "true" } }), state.icon);
  button.createSpan({ cls: "plugin-groups-admin-action-label", text: state.label, attr: { "aria-hidden": "true" } });
  button.addEventListener("click", () => cycleCollapseMode(context, button, state.next));
}

function cycleCollapseMode(context: ViewContext, button: HTMLButtonElement, next: CollapseMode): void {
  const focused = button.ownerDocument.activeElement === button;
  const view = button.closest<HTMLElement>(".plugin-groups-admin")!;
  setCollapseMode(context.data, next);
  saveGroupChangesAndRefreshViews(context);
  if (focused) view.querySelector<HTMLButtonElement>(".plugin-groups-admin-collapse-cycle")!.focus({ preventScroll: true });
}

function renderAddGroupButton(context: ViewContext, actions: HTMLElement, container: HTMLElement, search: GroupsSearchState): void {
  const button = createHeaderAction(actions, "plus", "Add group", "plugin-groups-admin-add-button", "Add group");
  button.addEventListener("click", () => createGroupAndStartRename(context, container, search));
}

function createGroupAndStartRename(context: ViewContext, container: HTMLElement, search: GroupsSearchState): void {
  let number = 1;
  while (!addGroup(context.data, number === 1 ? "New group" : `New group ${number}`)) number++;
  const group = context.data.groups[0];
  search.query = "";
  saveGroupChangesAndRefreshViews(context);
  const section = container.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`)!;
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  showGroupRenameInput(context, heading, group);
}

function renderGroupsSummary(container: HTMLElement, groupCount: number, plugins: InstalledPlugin[]): void {
  const summary = container.createDiv({ cls: "plugin-groups-admin-summary" });
  summary.createSpan({ text: `${groupCount} ${groupCount === 1 ? "group" : "groups"}` });
  summary.createSpan({ text: `${plugins.length} installed` });
  summary.createSpan({ text: `${plugins.filter(plugin => plugin.enabled).length} enabled` });
}
