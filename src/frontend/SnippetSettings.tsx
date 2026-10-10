import {
  useTranslation,
  type SettingsState,
} from "@termix-ssh/plugin-sdk/frontend";
import { Rows3, SlidersHorizontal, SquareStack } from "lucide-react";
import {
  FakeSwitch,
  InlineView,
  SectionCard,
  SettingRow,
} from "@termix-ssh/plugin-sdk/ui";
import { readSnippetSettings, type SnippetDisplaySettings } from "./settings";

export function SnippetSettings({
  settings,
  onBack,
}: {
  settings: SettingsState;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const current = readSnippetSettings(settings.values);

  const save = (patch: Partial<SnippetDisplaySettings>) =>
    void settings.save({ ...settings.values, ...patch });

  return (
    <InlineView
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<SlidersHorizontal className="size-4" />}
      title={t("settingsTitle")}
    >
      <SectionCard
        title={t("settingsDisplayTitle")}
        icon={<Rows3 className="size-3.5" />}
      >
        <SettingRow
          label={t("settings.foldersCollapsed.label")}
          description={t("settings.foldersCollapsed.description")}
        >
          <FakeSwitch
            checked={current.foldersCollapsed}
            onChange={(v) => save({ foldersCollapsed: v })}
          />
        </SettingRow>
        <SettingRow
          label={t("settings.showCommands.label")}
          description={t("settings.showCommands.description")}
        >
          <FakeSwitch
            checked={current.showCommands}
            onChange={(v) => save({ showCommands: v })}
          />
        </SettingRow>
        <SettingRow
          label={t("settings.alwaysShowActions.label")}
          description={t("settings.alwaysShowActions.description")}
        >
          <FakeSwitch
            checked={current.alwaysShowActions}
            onChange={(v) => save({ alwaysShowActions: v })}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={t("settingsBehaviorTitle")}
        icon={<SquareStack className="size-3.5" />}
      >
        <SettingRow
          label={t("settings.confirmExecution.label")}
          description={t("settings.confirmExecution.description")}
        >
          <FakeSwitch
            checked={current.confirmExecution}
            onChange={(v) => save({ confirmExecution: v })}
          />
        </SettingRow>
      </SectionCard>
    </InlineView>
  );
}
