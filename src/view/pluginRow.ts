import { Menu, Notice, setIcon } from "obsidian";
import { addPluginToGroup, removePluginFromGroup } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { runPluginOperationWithPendingState } from "../pendingPluginOperations";
import { showPluginMenu } from "../pluginMenu";
import { saveGroupChangesAndRefreshViews, type ViewContext } from "./context";
import { startPluginDrag } from "./pluginDrop";

export function renderPluginRow(context: ViewContext, list: HTMLElement, plugin: InstalledPlugin, groupId: string | null): void {
  const row = list.createDiv({ cls: `plugin-groups-admin-plugin${plugin.enabled ? "" : " is-disabled"}${groupId === null ? "" : " is-grouped"}` });
  setIcon(row.createSpan({ cls: "plugin-groups-admin-grip", attr: { "aria-hidden": "true" } }), "grip-vertical");
  row.dataset.pluginId = plugin.id;
  row.dataset.pluginSearch = `${plugin.name}\n${plugin.id}`.toLocaleLowerCase();
  row.draggable = true;
  row.addEventListener("dragstart", event => startPluginDrag(event, plugin.id, groupId));
  row.addEventListener("click", event => openPluginSettingsFromRow(event, row, context, plugin));
  const details = row.createDiv({ cls: "plugin-groups-admin-plugin-details" });
  const title = details.createDiv({ cls: "plugin-groups-admin-plugin-title" });
  const name = title.createEl("button", { cls: "plugin-groups-admin-plugin-name", text: plugin.name, attr: { type: "button" } });
  name.addEventListener("click", () => openPluginSettingsWithFeedback(context, plugin));
  if (plugin.kind === "core") title.createSpan({ cls: "plugin-groups-admin-core-badge", text: "Core" });
  renderPluginDescription(details, plugin);
  renderPluginMenuButton(context, row, plugin);
  renderPluginEnabledToggle(context, row, plugin);
  if (groupId === null) renderMovePluginButton(context, row, plugin);
  else renderRemovePluginButton(context, row, plugin, groupId);
}

function renderMovePluginButton(context: ViewContext, row: HTMLElement, plugin: InstalledPlugin): void {
  const button = row.createEl("button", { cls: "plugin-groups-admin-move-plugin", attr: { type: "button", "aria-label": `Move ${plugin.name} to a group`, title: `Move ${plugin.name} to a group` } });
  setIcon(button, "arrow-right");
  button.disabled = context.data.groups.length === 0;
  button.addEventListener("click", event => {
    const menu = new Menu();
    for (const group of context.data.groups) {
      menu.addItem(item => item.setTitle(group.name).onClick(() => {
        if (addPluginToGroup(context.data, plugin.id, group.id)) saveGroupChangesAndRefreshViews(context);
      }));
    }
    menu.showAtMouseEvent(event);
  });
}

function renderPluginMenuButton(context: ViewContext, row: HTMLElement, plugin: InstalledPlugin): void {
  const button = row.createEl("button", { cls: "plugin-groups-admin-plugin-menu", text: "⋯", attr: { type: "button", "aria-label": `More options for ${plugin.name}`, title: `More options for ${plugin.name}` } });
  button.addEventListener("click", event => showPluginMenu(context.app, plugin, event));
}

function renderPluginDescription(details: HTMLElement, plugin: InstalledPlugin): void {
  const metadata = [plugin.version && `v${plugin.version}`, plugin.author && `by ${plugin.author}`]
    .filter(Boolean).join(" · ");
  if (!plugin.description && !metadata) return;
  const description = details.createDiv({ cls: "plugin-groups-admin-plugin-description" });
  if (plugin.description) description.appendText(plugin.description);
  if (!metadata) return;
  description.createEl("em", { text: `${plugin.description ? " · " : ""}${metadata}` });
}

function renderRemovePluginButton(context: ViewContext, row: HTMLElement, plugin: InstalledPlugin, groupId: string): void {
  const button = row.createEl("button", { cls: "plugin-groups-admin-remove-plugin", attr: { type: "button", "aria-label": `Remove ${plugin.name} from this group`, title: `Remove ${plugin.name} from this group` } });
  setIcon(button, "x");
  button.addEventListener("click", () => {
    if (removePluginFromGroup(context.data, plugin.id, groupId)) saveGroupChangesAndRefreshViews(context);
  });
}

function openPluginSettingsFromRow(event: MouseEvent, row: HTMLElement, context: ViewContext, plugin: InstalledPlugin): void {
  const elementType = row.ownerDocument.defaultView?.Element;
  if (elementType && event.target instanceof elementType && event.target.closest("button, input, label")) return;
  openPluginSettingsWithFeedback(context, plugin);
}

function openPluginSettingsWithFeedback(context: ViewContext, plugin: InstalledPlugin): void {
  const destination = context.openPluginSettings(plugin.id);
  if (destination === "community") new Notice(`${plugin.name} has no settings page. Showing Community plugins.`);
  if (destination === "core") new Notice(`${plugin.name} has no settings page. Showing Core plugins.`);
  if (destination === "unavailable") new Notice("Could not open Obsidian settings.");
}

function renderPluginEnabledToggle(context: ViewContext, row: HTMLElement, plugin: InstalledPlugin): void {
  const label = row.createEl("label", { cls: "plugin-groups-admin-toggle" });
  const toggle = label.createEl("input", { attr: { type: "checkbox", "aria-label": plugin.name } });
  toggle.checked = plugin.enabled;
  toggle.disabled = plugin.id === context.selfId || context.pendingPluginIds.has(plugin.id);
  label.classList.toggle("is-disabled", toggle.disabled);
  if (plugin.id === context.selfId) label.setAttribute("title", "This plugin cannot disable itself from its own tab.");
  label.createSpan({ cls: "plugin-groups-admin-switch", attr: { "aria-hidden": "true" } });
  toggle.addEventListener("change", () => { void changePluginEnabled(context, plugin, toggle); });
}

async function changePluginEnabled(context: ViewContext, plugin: InstalledPlugin, toggle: HTMLInputElement): Promise<void> {
  try {
    const enabled = toggle.checked;
    const started = await runPluginOperationWithPendingState(
      context.pendingPluginIds,
      [plugin.id],
      context.refreshOpenGroupsViews,
      () => context.setPluginEnabled(plugin.id, enabled),
    );
    if (!started) context.refreshOpenGroupsViews();
  } catch (error) {
    console.error(`Failed to change ${plugin.name}`, error);
    new Notice(`Could not change ${plugin.name}.`);
  }
}
