import { SearchComponent, setIcon } from "obsidian";
import type { ViewContext } from "./context";
import { applyGroupsSearch, type GroupsSearchState } from "./search";

export function renderUngroupedSearch(state: GroupsSearchState, section: HTMLElement, container: HTMLElement, context: ViewContext): void {
  const heading = section.querySelector<HTMLElement>(".plugin-groups-admin-section-header")!;
  const button = heading.createEl("button", { cls: "plugin-groups-admin-ungrouped-search-button", attr: { type: "button", "aria-label": "Search ungrouped plugins", title: "Search ungrouped plugins" } });
  setIcon(button, "search");
  const body = section.querySelector<HTMLElement>(".plugin-groups-admin-section-body")!;
  const field = body.createDiv({ cls: "plugin-groups-admin-ungrouped-search" });
  body.prepend(field);
  const search = new SearchComponent(field).setPlaceholder("Search ungrouped plugins").setValue(state.ungroupedQuery);
  search.inputEl.setAttribute("aria-label", "Search ungrouped plugins");
  section.querySelector(".plugin-groups-admin-section-body")!.createDiv({ cls: "plugin-groups-admin-empty plugin-groups-admin-ungrouped-empty", text: "No matching ungrouped plugins.", attr: { role: "status" } });
  button.addEventListener("click", () => focusUngroupedSearch(section, container));
  registerUngroupedSearchEvents(state, search, container, context);
}

function registerUngroupedSearchEvents(state: GroupsSearchState, search: SearchComponent, container: HTMLElement, context: ViewContext): void {
  search.onChange(value => { state.ungroupedQuery = value; applyGroupsSearch(state, container, context); });
  search.inputEl.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.ungroupedQuery = "";
    search.setValue("");
    applyGroupsSearch(state, container, context);
  }, { capture: true });
}

function focusUngroupedSearch(section: HTMLElement, container: HTMLElement): void {
  const collapse = section.querySelector<HTMLButtonElement>(".plugin-groups-admin-collapse")!;
  if (collapse.getAttribute("aria-expanded") === "false") collapse.click();
  const input = container.querySelector<HTMLInputElement>(".plugin-groups-admin-ungrouped-search input")!;
  input.focus();
  input.select();
}
