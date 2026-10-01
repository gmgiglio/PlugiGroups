import { Notice, setIcon } from "obsidian";
import { renderGroupsSearch, type GroupsSearchState } from "./search";
import { createHeaderAction } from "./headerAction";
import { addGroup, setCollapseMode, type CollapseMode } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";

export function renderGroupsHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[], search: GroupsSearchState): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  const introduction = header.createDiv({ cls: "plugin-groups-admin-introduction" });
  renderGroupsHeading(introduction);
  renderPluginSettingsButton(context, introduction);
  const controls = header.createDiv({ cls: "plugin-groups-admin-group-controls" });
  const stats = controls.createDiv({ cls: "plugin-groups-admin-stats-controls" });
  renderGroupsSummary(stats, context.data.groups.length, plugins);
  renderCollapseCycle(context, stats);
  const actions = controls.createDiv({ cls: "plugin-groups-admin-header-actions" });
  renderAddGroupControls(context, actions, header);
  renderGroupsSearch(search, header, container, context);
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

function renderAddGroupControls(context: ViewContext, actions: HTMLElement, header: HTMLElement): void {
  const addButton = createHeaderAction(actions, "plus", "Add group", "plugin-groups-admin-add-button", "Add group");
  const form = header.createEl("form", { cls: "plugin-groups-admin-add" });
  form.hidden = true;
  const input = form.createEl("input", { attr: { type: "text", placeholder: "New group name", "aria-label": "New group name" } });
  form.createEl("button", { cls: "mod-cta", text: "Create group", attr: { type: "submit" } });
  const cancel = form.createEl("button", { text: "Cancel", attr: { type: "button" } });
  addButton.addEventListener("click", () => showAddGroupForm(form, addButton, input));
  cancel.addEventListener("click", () => hideAddGroupForm(form, addButton, input));
  form.addEventListener("keydown", event => closeAddGroupForm(event, form, addButton, input));
  form.addEventListener("submit", event => addGroupFromForm(event, context, input));
}

function showAddGroupForm(form: HTMLFormElement, addButton: HTMLButtonElement, input: HTMLInputElement): void {
  addButton.hidden = true;
  form.hidden = false;
  input.focus();
}

function closeAddGroupForm(event: KeyboardEvent, form: HTMLFormElement, addButton: HTMLButtonElement, input: HTMLInputElement): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  hideAddGroupForm(form, addButton, input);
}

function renderPluginSettingsButton(context: ViewContext, header: HTMLElement): void {
  const button = createHeaderAction(header, "settings", "PlugiGroups settings", "plugin-groups-admin-settings-button", "Open PlugiGroups settings");
  button.addEventListener("click", () => {
    if (context.openPluginSettings(context.selfId) === "unavailable") new Notice("Could not open Obsidian settings.");
  });
}

function hideAddGroupForm(form: HTMLFormElement, addButton: HTMLButtonElement, input: HTMLInputElement): void {
  input.value = "";
  form.hidden = true;
  addButton.hidden = false;
  addButton.focus();
}

function renderGroupsHeading(header: HTMLElement): void {
  const heading = header.createDiv({ cls: "plugin-groups-admin-heading" });
  heading.createEl("p", { cls: "plugin-groups-admin-description", text: "A place for every plugin. Drag to organize, click to configure." });
}

function renderGroupsSummary(container: HTMLElement, groupCount: number, plugins: InstalledPlugin[]): void {
  const summary = container.createDiv({ cls: "plugin-groups-admin-summary" });
  summary.createSpan({ text: `${groupCount} ${groupCount === 1 ? "group" : "groups"}` });
  summary.createSpan({ text: `${plugins.length} installed` });
  summary.createSpan({ text: `${plugins.filter(plugin => plugin.enabled).length} enabled` });
}

function addGroupFromForm(event: SubmitEvent, context: ViewContext, input: HTMLInputElement): void {
  event.preventDefault();
  if (!addGroup(context.data, input.value)) {
    new Notice("Enter a unique group name.");
    input.focus();
    return;
  }
  saveGroupChangesAndRefreshViews(context);
}
