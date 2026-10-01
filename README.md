PlugiGroups allows you to order plugins into groups and manage them.

![PlugiGroups window showing six groups, global search, collapse control, and plugin switches](./images/plugin-groups-2026-10.png)

## Using the tab

Open **PlugiGroups** from the ribbon or command palette. Select the **Add group** (+) icon to create a group. Drag plugins from **Ungrouped** into a group, use their **Move to** button to choose a group, or use **+ Add plugin** in a group to choose one from a searchable list. You can rename, reorder, collapse, and delete groups.

To hide the ribbon button, turn off **Show ribbon button** in the plugin settings. The command palette entry remains available.

Use **Open PlugiGroups in** in the plugin settings to choose **Tab** (the default) or **New window**. This applies to the ribbon, command palette, and settings button. Opening PlugiGroups focuses an existing view in the chosen location when available.

The new window is dedicated to PlugiGroups, with a window title and no tab bar or view navigation. Other tabs opened in that window move to the main Obsidian window.

The button immediately beside the group/plugin stats cycles through **saved group states** (list with collapse chevrons) → **all collapsed** (inward chevrons) → **all expanded** (outward chevrons) → saved states. Its icon shows the current mode, with text appearing on hover or keyboard focus; its tooltip describes the next action. Global modes preserve individual group states. Clicking a group's chevron changes only that group and saves its new state without switching the general mode. Selecting another general mode reapplies it to every group; the individual mode retains those manual changes. The selected mode and individual states persist across reloads and synchronize across tabs. The button is disabled during a global search, which reveals matching plugins.

**Ungrouped** lists plugins that are not in a group. Use the search bar below the header controls to search by plugin name or ID across all groups and Ungrouped. Results update as you type, including plugins in collapsed groups. Clear the field or press **Escape** to show everything again. Ungrouped also has its own permanent search bar. Its search icon focuses the field. This filters only Ungrouped, together with any global search. Press **Escape** in that field to clear its filter. Deleting a group does not uninstall its plugins; they return to **Ungrouped** unless they belong to another group.

To delete groups without a confirmation dialog, turn off **Confirm before deleting groups** in the plugin settings. Confirmation is enabled by default.

## Plugin controls

- Use a plugin's switch to enable or disable it. A group's switch controls all installed plugins in that group.
- Click a plugin to open its settings. Plugins without a settings page open in **Community plugins**.
- Use a plugin's **⋯** menu for details and other available actions, such as hotkeys or uninstall.

PlugiGroups stays enabled if you switch off a group that contains it.

## Allow multiple groups

By default, a plugin can belong to one group. The **Allow plugins in multiple groups** setting lets it appear in several groups. Group assignments are saved.

**Mobile support:** PlugiGroups does not work on mobile yet.
