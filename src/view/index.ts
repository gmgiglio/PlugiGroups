import { ItemView, type WorkspaceLeaf } from "obsidian";
import { orderedSectionIdsIncludingUngrouped } from "../groups";
import type { ViewContext } from "./context";
import { renderGroupsHeader } from "./header";
import { renderGroup } from "./groupSection";
import { renderUngrouped } from "./ungroupedSection";
import { allowSectionReorderDrop, dropReorderedSection } from "./sectionDrag";

export const VIEW_TYPE = "plugin-groups-admin-view";

export class GroupsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly context: ViewContext) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "PlugiGroups"; }
  getIcon(): string { return "layout-grid"; }

  async onOpen(): Promise<void> {
    this.registerDomEvent(this.contentEl, "dragover", event => allowSectionReorderDrop(event, this.contentEl));
    this.registerDomEvent(this.contentEl, "drop", event => dropReorderedSection(event, this.context, this.contentEl));
    this.refreshGroupsView();
  }

  refreshGroupsView(): void {
    renderGroupsView(this.context, this.contentEl);
  }
}

function renderGroupsView(context: ViewContext, container: HTMLElement): void {
  container.empty();
  container.addClass("plugin-groups-admin");
  const plugins = context.getInstalledPlugins();
  renderGroupsHeader(context, container, plugins);
  for (const id of orderedSectionIdsIncludingUngrouped(context.data)) {
    if (id === null) renderUngrouped(context, container, plugins);
    else renderGroup(context, container, context.data.groups.find(group => group.id === id)!, plugins);
  }
}
