import { SearchComponent } from "obsidian";
import type { ViewContext } from "./context";
import { isSectionCollapsed } from "../groups";

export interface GroupsSearchState {
  query: string;
  ungroupedQuery: string;
  readonly groupQueries: Map<string, string>;
}

interface SearchFocus {
  selector: string;
  start: number | null;
  end: number | null;
}

export function renderGroupsSearch(state: GroupsSearchState, header: HTMLElement, container: HTMLElement, context: ViewContext): void {
  const field = header.createDiv({ cls: "plugin-groups-admin-search" });
  const search = new SearchComponent(field).setPlaceholder("Search all plugins").setValue(state.query);
  search.inputEl.setAttribute("aria-label", "Search all plugins");
  search.onChange(value => { state.query = value; applyGroupsSearch(state, container, context); });
  search.inputEl.addEventListener("keydown", event => clearGroupsSearch(event, state, search, container, context), { capture: true });
}

function clearGroupsSearch(event: KeyboardEvent, state: GroupsSearchState, search: SearchComponent, container: HTMLElement, context: ViewContext): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.query = "";
  search.setValue("");
  applyGroupsSearch(state, container, context);
}

export function applyGroupsSearch(state: GroupsSearchState, container: HTMLElement, context: ViewContext): void {
  const query = state.query.trim().toLocaleLowerCase();
  container.querySelector<HTMLButtonElement>(".plugin-groups-admin-collapse-cycle")!.disabled = query !== "";
  const sections = Array.from(container.querySelectorAll<HTMLElement>(".plugin-groups-admin-section"));
  for (const section of sections) filterPluginSection(section, query, state, context);
  renderSearchEmptyState(container, query !== "" && sections.every(section => section.hidden));
}

function filterPluginSection(section: HTMLElement, query: string, state: GroupsSearchState, context: ViewContext): void {
  const localQuery = sectionSearchQuery(state, section.dataset.groupId ?? "");
  const rows = Array.from(section.querySelectorAll<HTMLElement>(".plugin-groups-admin-plugin"));
  for (const row of rows) row.hidden = ![query, localQuery].every(value => (row.dataset.pluginSearch ?? "").includes(value));
  const count = rows.filter(row => !row.hidden).length;
  section.hidden = query !== "" && count === 0;
  section.querySelector(".plugin-groups-admin-count")!.textContent = String(count);
  const localEmpty = section.querySelector<HTMLElement>(".plugin-groups-admin-ungrouped-empty");
  if (localEmpty) localEmpty.hidden = !localQuery || count > 0;
  updateSearchSectionCollapse(section, query, context);
}

function sectionSearchQuery(state: GroupsSearchState, groupId: string): string {
  return (groupId === "" ? state.ungroupedQuery : state.groupQueries.get(groupId) ?? "").trim().toLocaleLowerCase();
}

function updateSearchSectionCollapse(section: HTMLElement, query: string, context: ViewContext): void {
  const searching = query !== "";
  const collapsed = !searching && isSectionCollapsed(context.data, section.dataset.groupId || null);
  section.querySelector<HTMLElement>(".plugin-groups-admin-section-body")!.hidden = collapsed;
  section.classList.toggle("is-collapsed", collapsed);
  const button = section.querySelector<HTMLButtonElement>(".plugin-groups-admin-collapse")!;
  button.disabled = searching;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${button.textContent}`);
}

function renderSearchEmptyState(container: HTMLElement, visible: boolean): void {
  const empty = container.querySelector<HTMLElement>(".plugin-groups-admin-search-empty")
    ?? container.createDiv({ cls: "plugin-groups-admin-empty plugin-groups-admin-search-empty", text: "No matching plugins.", attr: { role: "status" } });
  empty.hidden = !visible;
}

export function captureSearchFocus(container: HTMLElement): SearchFocus | null {
  const selectors = [".plugin-groups-admin-search input", ".plugin-groups-admin-ungrouped-search input"];
  for (const selector of selectors) {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (input && container.ownerDocument.activeElement === input) return { selector, start: input.selectionStart, end: input.selectionEnd };
  }
  return null;
}

export function restoreSearchFocus(container: HTMLElement, focus: SearchFocus | null): void {
  if (!focus) return;
  const input = container.querySelector<HTMLInputElement>(focus.selector)!;
  input.focus({ preventScroll: true });
  input.setSelectionRange(focus.start, focus.end);
}

export function focusGroupsSearch(container: HTMLElement): false {
  const input = container.querySelector<HTMLInputElement>(".plugin-groups-admin-search input");
  input?.focus();
  input?.select();
  return false;
}
