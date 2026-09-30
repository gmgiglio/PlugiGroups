import { Notice } from "obsidian";
import { addGroup } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";

export function renderGroupsHeader(context: ViewContext, container: HTMLElement, plugins: InstalledPlugin[]): void {
  const header = container.createDiv({ cls: "plugin-groups-admin-header" });
  renderGroupsHeading(header);
  renderPluginSettingsButton(context, header);
  const controls = header.createDiv({ cls: "plugin-groups-admin-group-controls" });
  renderGroupsSummary(controls, context.data.groups.length, plugins);
  const addButton = controls.createEl("button", { cls: "mod-cta plugin-groups-admin-add-button", text: "+ Add group", attr: { type: "button" } });
  const form = controls.createEl("form", { cls: "plugin-groups-admin-add" });
  form.hidden = true;
  const input = form.createEl("input", { attr: { type: "text", placeholder: "New group name", "aria-label": "New group name" } });
  form.createEl("button", { cls: "mod-cta", text: "Create group", attr: { type: "submit" } });
  const cancel = form.createEl("button", { text: "Cancel", attr: { type: "button" } });
  addButton.addEventListener("click", () => {
    addButton.hidden = true;
    form.hidden = false;
    input.focus();
  });
  cancel.addEventListener("click", () => hideAddGroupForm(form, addButton, input));
  form.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    hideAddGroupForm(form, addButton, input);
  });
  form.addEventListener("submit", event => addGroupFromForm(event, context, input));
}

function renderPluginSettingsButton(context: ViewContext, header: HTMLElement): void {
  const button = header.createEl("button", { text: "Settings", attr: { type: "button", "aria-label": "Open PlugiGroups settings" } });
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
