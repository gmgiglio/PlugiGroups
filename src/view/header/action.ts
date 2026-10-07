import { setIcon } from "obsidian";

export function createHeaderAction(container: HTMLElement, icon: string, text: string, className: string, accessibleLabel: string): HTMLButtonElement {
  const button = container.createEl("button", { cls: `plugin-groups-admin-header-action ${className}`, attr: { type: "button", "aria-label": accessibleLabel } });
  const symbol = button.createSpan({ cls: "plugin-groups-admin-action-icon", attr: { "aria-hidden": "true" } });
  setIcon(symbol, icon);
  button.createSpan({ cls: "plugin-groups-admin-action-label", text, attr: { "aria-hidden": "true" } });
  return button;
}
