import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Play, RefreshCw } from "lucide-react";
import {
  usePluginApi,
  useSettings,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
} from "@termix-ssh/plugin-sdk/ui";
import type { SnippetHostContext } from "../shared/variables.js";
import { readSnippetSettings } from "./settings";
import { createSnippetsApi } from "./snippets-api";
import { errorMessage, type Snippet } from "./types";
import { useSnippetRunner } from "./use-snippet-runner";

/** Starting state of the panel, from the user's settings. */
export function useSnippetsCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 320,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** Snippets beside a terminal. A click runs one in that terminal. */
export function SnippetsCompanion({ tab, host, isVisible }: CompanionProps) {
  const { t } = useTranslation();
  const api = usePluginApi();
  const client = useMemo(() => createSnippetsApi(api), [api]);
  const settings = useSettings("user");
  const display = readSnippetSettings(settings.values);
  const { runSnippet, dialog } = useSnippetRunner(display.confirmExecution);
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setSnippets(await client.list());
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("loadFailed")));
    }
  }, [client, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const context: SnippetHostContext | null = host
    ? {
        name: host.name,
        ip: host.ip,
        username: host.username,
        port: host.port,
      }
    : null;

  const needle = search.trim().toLowerCase();
  const visible = (snippets ?? [])
    .filter(
      (snippet) =>
        !needle ||
        snippet.name.toLowerCase().includes(needle) ||
        snippet.content.toLowerCase().includes(needle) ||
        (snippet.folder ?? "").toLowerCase().includes(needle),
    )
    .sort(
      (a, b) =>
        (a.folder ?? "").localeCompare(b.folder ?? "") ||
        a.order - b.order ||
        a.name.localeCompare(b.name),
    );

  const run = (snippet: Snippet) =>
    runSnippet(snippet, [{ sessionId: String(tab.id), host: context }]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 p-1.5">
      <div className="flex items-center gap-1">
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("searchPlaceholder")}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          title={t("companion.refresh")}
          className="text-accent-brand"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {failed ? (
        <p className="p-2 text-xs text-destructive">{failed}</p>
      ) : !snippets ? (
        <p className="p-2 text-xs text-muted-foreground">{t("loading")}</p>
      ) : visible.length === 0 ? (
        <p className="p-2 text-xs text-muted-foreground">
          {snippets.length === 0 ? t("emptyTitle") : t("noSearchResults")}
        </p>
      ) : (
        <PanelList>
          {visible.map((snippet, index) => (
            <ListRow
              key={snippet.id}
              stripe={index}
              title={snippet.name}
              meta={
                display.showCommands ? (
                  <span className="font-mono text-[11px]">
                    {snippet.content.split("\n")[0]}
                  </span>
                ) : (
                  (snippet.folder ?? undefined)
                )
              }
              onClick={() => run(snippet)}
              actions={
                <ListRowAction
                  label={t(snippet.isNote ? "pasteToTerminal" : "run")}
                  tone="brand"
                  onClick={() => run(snippet)}
                >
                  {snippet.isNote ? <ClipboardPaste /> : <Play />}
                </ListRowAction>
              }
            />
          ))}
        </PanelList>
      )}
      {dialog}
    </div>
  );
}
