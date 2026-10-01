import { Notice } from "obsidian";
import { renderGroupsSearch, type GroupsSearchState } from "./search";
import { createHeaderAction } from "./headerAction";
import { addGroup } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";

export function renderGroupsHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[], search: GroupsSearchState): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  const introduction = header.createDiv({ cls: "plugin-groups-admin-introduction" });
  renderGroupsHeading(introduction);
  renderPluginSettingsButton(context, introduction);
  const controls = header.createDiv({ cls: "plugin-groups-admin-group-controls" });
  renderGroupsSummary(controls, context.data.groups.length, plugins);
  const actions = controls.createDiv({ cls: "plugin-groups-admin-header-actions" });
  renderAddGroupControls(context, actions, header);
  renderGroupsSearch(search, header, container, context);
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
