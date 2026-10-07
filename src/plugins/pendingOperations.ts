/**
 * Runs `operation` with `pluginIds` marked as pending, so views can show them as busy.
 * Returns false without running anything if any of those plugins already has an
 * operation in flight. Pending flags are always cleared, even if `operation` throws.
 */
export async function runPluginOperationWithPendingState(
  pendingPluginIds: Set<string>,
  pluginIds: string[],
  refreshViews: () => void,
  operation: () => Promise<void>,
): Promise<boolean> {
  if (pluginIds.some(id => pendingPluginIds.has(id))) return false;
  for (const id of pluginIds) pendingPluginIds.add(id);
  try {
    refreshViews();
    await operation();
  } finally {
    for (const id of pluginIds) pendingPluginIds.delete(id);
    refreshViews();
  }
  return true;
}
