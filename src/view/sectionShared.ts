import { setIcon } from "obsidian";
import type { ViewContext } from "./context";

interface GroupSection {
  section: HTMLElement;
  body: HTMLElement;
}

export function createPluginSection(context: ViewContext, container: HTMLElement, name: string, count: number, groupId: string | null): GroupSection {
  const section = container.createEl("section", { cls: "plugin-groups-admin-section" });
  const heading = section.createDiv({ cls: "plugin-groups-admin-section-header" });
  const body = section.createDiv({ cls: "plugin-groups-admin-section-body" });
  body.id = `plugin-groups-admin-body-${crypto.randomUUID()}`;
  body.hidden = context.collapsedGroupIds.has(groupId);
  section.classList.toggle("is-collapsed", body.hidden);
  renderCollapseButton(context, section, heading, body, name, groupId);
  heading.createEl("span", { cls: "plugin-groups-admin-count", text: String(count) });
  return { section, body };
}

function renderCollapseButton(context: ViewContext, section: HTMLElement, heading: HTMLElement, body: HTMLElement, name: string, groupId: string | null): void {
  const title = heading.createEl("h2");
  const button = title.createEl("button", { cls: "plugin-groups-admin-collapse", attr: { type: "button", "aria-controls": body.id } });
  setIcon(button.createSpan({ cls: "plugin-groups-admin-chevron" }), "chevron-down");
  button.createSpan({ text: name });
  updateCollapseButtonState(button, name, body.hidden === true);
  button.addEventListener("click", () => toggleSectionCollapse(context, section, body, button, name, groupId));
}

function toggleSectionCollapse(context: ViewContext, section: HTMLElement, body: HTMLElement, button: HTMLButtonElement, name: string, groupId: string | null): void {
  body.hidden = !body.hidden;
  if (body.hidden) context.collapsedGroupIds.add(groupId);
  else context.collapsedGroupIds.delete(groupId);
  section.classList.toggle("is-collapsed", body.hidden);
  updateCollapseButtonState(button, name, body.hidden);
}

function updateCollapseButtonState(button: HTMLButtonElement, name: string, collapsed: boolean): void {
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${name}`);
}
