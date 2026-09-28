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
