import { ConfirmationModal } from "obsidian";
import type { App } from "obsidian";

export function showDestructiveConfirmation(app: App, title: string, message: string, actionLabel: string, onConfirm: () => void | Promise<void>): void {
  const modal = new ConfirmationModal(app);
  modal.setTitle(title);
  modal.setContent(message);
  modal.addCancelButton("Cancel");
  modal.addButton(button => button.setButtonText(actionLabel).setDestructive().setCta().onClick(() => onConfirm()));
  modal.open();
}
