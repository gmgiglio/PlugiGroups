# Plugin Groups Admin

An Obsidian plugin for organizing installed plugins into user-defined groups.

Open **Plugin groups** from the ribbon icon or command palette. The dedicated tab lists installed community plugins, their enabled state, and your groups. Add, rename, or delete groups; drag plugins between groups or use each plugin's group selector. Use a plugin's switch to enable or disable it, or a group switch to enable or disable all installed plugins in that group. A mixed group switches on to enable its disabled plugins. Plugin Groups Admin stays enabled when its own group is switched off. Deleting a group moves its plugins to **Ungrouped**. Assignments are saved in the plugin's `data.json` and survive a plugin being uninstalled and later reinstalled.

## Build and install

The plugin source and build files are in `plugin/`. The local Obsidian testing vault is `test_vault/` and is ignored by Git.

1. Run `cd plugin` and `npm install` once.
2. Run `npm run deploy:test` to build and copy `main.js`, `manifest.json`, and `styles.css` into `test_vault/.obsidian/plugins/plugin-groups-admin/`.
3. Open `test_vault/` in Obsidian and enable **Plugin Groups Admin** under **Community plugins**. Reload the plugin after subsequent deployments.

For development, run `npm run deploy:test` after changes. Run `npm run typecheck` and `npm test` to verify the code.

## Compatibility note

Obsidian's public API does not expose the installed community plugin list, enable/disable methods, or events for plugin enable, disable, install, and uninstall. This plugin accesses Obsidian's internal plugin manager in one small module. While loaded, it compares the installed plugin state every 1.5 seconds and refreshes open group tabs when that state changes. A future Obsidian update to that internal structure may require an update to this plugin.
