# Plugin Groups Admin

An Obsidian plugin for organizing installed plugins into user-defined groups.

Open **Plugin groups** from the ribbon icon or command palette. The dedicated tab lists installed community plugins, their enabled state, and your groups. Add, rename, or delete groups; collapse or expand their plugin lists; drag a section by its header grip to reorder it, including **Ungrouped**; drag plugins between groups, or use **+ Add plugin** in a group header to choose from a searchable list of installed plugins. Click the X on a grouped plugin to remove it from that group. In this plugin's settings, turn on **Allow plugins in multiple groups** to add a plugin to several groups. Dragging to another group adds a membership, and dragging to **Ungrouped** removes the membership in the dragged row's group. Turning the setting off keeps each plugin in its first group. Click a plugin to open its settings page; plugins without one open in **Community plugins**. Search by plugin name or ID in **Ungrouped** to filter its list. Use a plugin's switch to enable or disable it, or a group switch to enable or disable all installed plugins in that group. The group switch stays on while any plugin in the group is enabled; switching it off disables the remaining enabled plugins. Plugin Groups Admin stays enabled when its own group is switched off. Deleting a group leaves plugins in their other groups, if any; otherwise they become **Ungrouped**. Assignments and section order are saved in the plugin's `data.json` and survive a plugin being uninstalled and later reinstalled.

## Build and install

The plugin source, manifest, and build files are in this repository. The local Obsidian testing vault is at `../test_vault/`, beside the repository and outside Git.

1. Run `npm install` from the repository root once.
2. Run `npm run deploy:test` to build and copy `main.js`, `manifest.json`, and `styles.css` into `../test_vault/.obsidian/plugins/plugin-groups-admin/`.
3. Open `../test_vault/` in Obsidian and enable **Plugin Groups Admin** under **Community plugins**. Reload the plugin after subsequent deployments.

For development, run `npm run deploy:test` after changes. Run `npm run typecheck` and `npm test` from the repository root to verify the code.

## Compatibility note

Obsidian's public API does not expose the installed community plugin list, enable/disable methods, settings navigation, or events for plugin enable, disable, install, and uninstall. This plugin accesses Obsidian's internal plugin manager and settings navigation in small modules. While loaded, it compares the installed plugin state every 1.5 seconds and refreshes open group tabs when that state changes. A future Obsidian update to those internal structures may require an update to this plugin.
