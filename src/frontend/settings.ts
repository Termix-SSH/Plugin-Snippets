import { usePluginId, useTabs } from "@termix-ssh/plugin-sdk/frontend";

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

/** Opens this plugin's page in Settings. */
export function useOpenSettingsPage() {
  const tabs = useTabs();
  const pluginId = usePluginId();
  return () =>
    tabs.openSingletonTab("settings", {
      data: { section: `plugin:${pluginId}` },
    });
}
