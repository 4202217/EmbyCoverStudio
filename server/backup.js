export function buildBackupData(store) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: store.settings,
    targets: store.listTargets(),
    tasks: store.data.tasks
  };
}
