# CLI reference

PlugiGroups registers twenty commands directly in Obsidian's CLI while the plugin is enabled. Enable Obsidian's CLI under **Settings → General**. See the [Obsidian CLI reference](https://help.obsidian.md/cli) for installation and vault selection.

```sh
obsidian vault="Your vault" plugiGroups:list format=json
obsidian vault="Your vault" plugiGroups:enable group="Writing"
obsidian vault="Your vault" help plugiGroups:structure
```

Every group, including Ungrouped, has an ID and a name. Group selectors accept an exact ID or a case-insensitive, unambiguous name. Use IDs in scripts to survive renames. Ungrouped has the stable ID `ungrouped`; it uses the same group parameters as every other group, cannot be renamed or deleted. `list` includes it in its actual display position, and `list`/`show` mark it with `permanent: true` in JSON. CLI mutations save before returning success and refresh every open PlugiGroups view.

| Command after `plugiGroups:` | Parameters | Behavior |
| --- | --- | --- |
| `list` | `format=text\|json` | Group IDs, names, memberships, counts, and collapse states, in group order |
| `show` | `group=<id-or-name>`, `format=text\|json` | One group's plugins, including saved IDs that are not installed |
| `create` | `name=<name>` | Create a uniquely named group; return its generated ID |
| `rename` | `group=<group> name=<name>` | Rename a custom group; Ungrouped has a fixed name |
| `delete` | `group=<group>` | Delete a group; leave plugins installed and retain their other memberships |
| `add` | `group=<group> plugin=<id>` | Add an installed plugin; adding to Ungrouped clears all other memberships |
| `remove` | `group=<group> plugin=<id>`, optional `to=<group>` | Remove one membership; specify a destination to move out of Ungrouped |
| `move` | `plugin=<id> to=<group>` | Replace all memberships with the destination; Ungrouped removes all memberships |
| `enable` | `group=<group>` | Enable installed plugins in this group |
| `disable` | `group=<group>` | Disable installed plugins in this group, keeping PlugiGroups enabled |
| `ungrouped` | `format=text\|json` | Compatibility shortcut for listing the permanent group's plugins |
| `reorder` | `group=<group> before=<group>` or `after=<group>` | Reorder any group; supply exactly one target |
| `collapse` | `group=<group>` or `all` | Collapse one section, or enter the global collapsed mode |
| `expand` | `group=<group>` or `all` | Expand one section, or enter the global expanded mode |
| `search` | `query=<text>`, optional `group=<group>`, `format=text\|json` | Search installed plugins by name or ID, without changing view filters |
| `filter` | `query=<text>`, optional `group=<group>` | Apply a search to one group or all groups in open views; `query=""` clears that filter |
| `settings` | Optional `key=<key>` | Read all preferences or one value as JSON |
| `setting:set` | `key=<key> value=<value>` | Change a preference |
| `structure` | `format=tree\|json` | Read the complete organization: groups, plugins, order, Ungrouped, and collapse state |
| `structure:set` | `json=<json>`, optional `dry-run` | Validate and replace the complete structure; dry-run returns a preview without saving |

Ungrouped remains the permanent catch-all for installed plugins without other memberships. `add group=Ungrouped` and `move to=Ungrouped` clear existing memberships. To move a plugin out, add it to another group, use `move`, or supply a destination with `remove`:

```sh
obsidian vault="Your vault" plugiGroups:show group=Ungrouped format=json
obsidian vault="Your vault" plugiGroups:add group=Ungrouped plugin=dataview
obsidian vault="Your vault" plugiGroups:remove group=Ungrouped plugin=dataview to="Writing"
obsidian vault="Your vault" plugiGroups:search group=Ungrouped query=data
```

The older `ungrouped` command, search `ungrouped` flag, and filter `scope=ungrouped` remain supported as shortcuts; new scripts can consistently use `group=<group>`.

Text is the default for lists, group details, and search. Tree is the default for `structure`. Boolean flags can be supplied as bare flags, such as `all` and `dry-run`, or as `all=true` and `dry-run=true`. Dashed boolean forms such as `--dry-run` are also accepted. Unknown parameters are rejected, including misspellings of `dry-run`.

Deletion and full structure replacement execute directly without confirmation dialogs. The deletion-confirmation preference applies to the UI. Group enable/disable operations skip missing plugins and plugins already in the requested state. If one plugin fails, the command reports the error; earlier successful plugin changes remain applied.

Built-in Obsidian commands continue to handle individual plugin enable/disable, installation, uninstallation, reload, info, and hotkey lookup. To open PlugiGroups, use its existing command:

```sh
obsidian vault="Your vault" command id=plugin-groups-admin:open-plugin-groups
```

## Preferences

`setting:set` accepts these keys and values:

| Key | Values |
| --- | --- |
| `allowMultipleGroups` | `true` or `false`; switching off keeps each plugin's first membership in group order |
| `showRibbonButton` | `true` or `false`; updates the ribbon immediately |
| `showDragHandlesOnHover` | `true` (default) shows handles on hover; `false` always shows them |
| `confirmGroupDeletion` | `true` or `false` |
| `openLocation` | `tab` or `window` |
| `collapseMode` | `individual`, `collapsed`, or `expanded`; changing mode clears manual exceptions |

```sh
obsidian vault="Your vault" plugiGroups:setting:set key=allowMultipleGroups value=true
obsidian vault="Your vault" plugiGroups:setting:set key=collapseMode value=individual
```

The second example restores the saved individual collapse states after collapsing or expanding all sections.

## Full structure replacement

JSON returned by `structure format=json` can be supplied directly to `structure:set`. Copy the JSON with Obsidian's global `--copy` flag, edit it, then pass it using `json=<json>`. Add `dry-run` to preview before applying:

```sh
obsidian vault="Your vault" plugiGroups:structure format=json --copy
```

The plugin accepts JSON directly and does not read configuration files from the filesystem:

```sh
obsidian vault="Your vault" plugiGroups:structure:set json='{"version":2,"groups":[{"id":"ungrouped","name":"Ungrouped","pluginIds":[]}],"collapsedGroupIds":[],"collapseMode":"individual","collapseModeExceptionIds":[]}' dry-run
```

The schema is versioned, and all of these fields are required:

```json
{
  "version": 2,
  "groups": [
    {
      "id": "writing-group",
      "name": "Writing",
      "pluginIds": ["dataview"]
    },
    {
      "id": "ungrouped",
      "name": "Ungrouped",
      "pluginIds": []
    }
  ],
  "collapsedGroupIds": ["writing-group", "ungrouped"],
  "collapseMode": "individual",
  "collapseModeExceptionIds": []
}
```

The `groups` array contains every group in display order, including the permanent group with ID `ungrouped`. Reorder it by moving that entry like any other group. Its name must remain `Ungrouped`, and it must remain present in every replacement document. Preserve IDs when editing existing groups. Removing another group from this document deletes it on application.

The permanent group's actual membership is recalculated from installed plugins and the other groups' assignments. Its exported `pluginIds` describe that membership; newly installed, unassigned plugins appear automatically. A plugin cannot be assigned both to the permanent group and another group. When moving a plugin in JSON, remove it from its former group's `pluginIds` and put it in its destination's array.

Collapse arrays contain ordinary group IDs, including `ungrouped`; there are no `null` IDs in version 2. `collapsedGroupIds` stores individual states. In a global mode, `collapseModeExceptionIds` identifies groups that use their individual state instead of the global state. The previous version 1 schema with a separate `ungrouped` object and `null` collapse IDs is still accepted for backward compatibility.

Replacement rejects malformed JSON, unknown or missing fields, duplicate IDs or names, duplicate plugin IDs within a group, invalid indices, and unknown collapse references. The permanent group must remain in the document and cannot share plugins with another group. Membership in several groups is rejected unless `allowMultipleGroups` is enabled first. Saved IDs for absent plugins are preserved. Replacement never installs/uninstalls plugins or changes their enabled states, and it preserves preferences such as ribbon visibility and multiple-group membership. Validation errors and dry-runs leave saved data unchanged.

Older Obsidian installers may print startup banners before command output. Remove those banners before parsing redirected JSON, or use `--copy` to copy the command result. The host CLI also controls process exit codes; this installation reports handler failures as `Error: ...` text even with exit code zero, so scripts should check the response rather than relying only on the exit code.

## Development checks

Run `npm run typecheck` and `npm test`. After `npm run deploy:test`, run `npm run test:cli` with Obsidian open to `testVault_plugiGroups`. The live test exercises all twenty native commands, two-view synchronization, structure round-trips, reload persistence, and save-failure rollback. It creates a disposable plugin fixture and restores the vault's original PlugiGroups data. On macOS, run this integration test from a terminal because its CLI subprocesses use a pseudo-terminal for consistent output capture.
