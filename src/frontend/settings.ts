export interface SnippetDisplaySettings {
  foldersCollapsed: boolean;
  showCommands: boolean;
  alwaysShowActions: boolean;
  confirmExecution: boolean;
  fillSudoPassword: boolean;
}

export function readSnippetSettings(
  values: Record<string, unknown>,
): SnippetDisplaySettings {
  return {
    foldersCollapsed: values.foldersCollapsed !== false,
    showCommands: values.showCommands !== false,
    alwaysShowActions: values.alwaysShowActions !== false,
    confirmExecution: values.confirmExecution === true,
    fillSudoPassword: values.fillSudoPassword === true,
  };
}
