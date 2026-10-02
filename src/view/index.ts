import { ItemView, Scope, type WorkspaceLeaf } from "obsidian";
import { orderedSectionIdsIncludingUngrouped } from "../groups";
import type { ViewContext } from "./context";
import { renderGroupsHeader } from "./header";
import { renderGroup } from "./groupSection";
import { renderUngrouped } from "./ungroupedSection";
import { allowSectionReorderDrop, dropReorderedSection } from "./sectionDrag";
import { applyGroupsSearch, restoreSearchFocus, captureSearchFocus, focusGroupsSearch, type GroupsSearchState } from "./search";

export const VIEW_TYPE = "plugin-groups-admin-view";

export class GroupsView extends ItemView {
  private readonly search: GroupsSearchState = { query: "", ungroupedQuery: "", groupQueries: new Map() };
  constructor(leaf: WorkspaceLeaf, private readonly context: ViewContext) {
    super(leaf);
    this.scope = new Scope(this.app.scope);
    this.scope.register(["Ctrl"], "f", () => focusGroupsSearch(this.contentEl));
    this.scope.register(["Meta"], "f", () => focusGroupsSearch(this.contentEl));
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
    const focus = captureSearchFocus(this.contentEl);
    renderGroupsView(this.context, this.contentEl, this.search);
    restoreSearchFocus(this.contentEl, focus);
  }

  setSearchFilter(query: string, scope: string | null): void {
    setGroupsViewSearchFilter(this.search, query, scope);
    this.refreshGroupsView();
  }
}

function setGroupsViewSearchFilter(search: GroupsSearchState, query: string, scope: string | null): void {
  if (scope === null) search.query = query;
  else if (scope === "ungrouped") search.ungroupedQuery = query;
  else if (query) search.groupQueries.set(scope, query);
  else search.groupQueries.delete(scope);
}

function renderGroupsView(context: ViewContext, container: HTMLElement, search: GroupsSearchState): void {
  container.empty();
  container.addClass("plugin-groups-admin");
  const plugins = context.getInstalledPlugins();
  renderGroupsHeader(context, container, plugins, search);
  for (const id of orderedSectionIdsIncludingUngrouped(context.data)) {
    if (id === null) renderUngrouped(context, container, plugins, search);
    else renderGroup(context, container, context.data.groups.find(group => group.id === id)!, plugins);
  }
  applyGroupsSearch(search, container, context);
}
