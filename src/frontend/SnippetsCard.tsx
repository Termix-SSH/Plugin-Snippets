import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  useHosts,
  usePluginApi,
  useSettings,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, ListRowAction, PanelList } from "@termix-ssh/plugin-sdk/ui";
import { readSnippetSettings } from "./settings";
import { createSnippetsApi } from "./snippets-api";
import { errorMessage, parseHostFilter, type Snippet } from "./types";
import { useSnippetRunner, type TargetHost } from "./use-snippet-runner";

/**
 * Dashboard card: snippets that run straight on their target hosts get a
 * run button, the rest can be copied.
 */
export function SnippetsCard({ isVisible, shell }: DashboardCardProps) {
  const { t } = useTranslation();
  const api = usePluginApi();
  const client = useMemo(() => createSnippetsApi(api), [api]);
  const settings = useSettings("user");
  const display = readSnippetSettings(settings.values);
  const { runOnHosts, dialog } = useSnippetRunner(display.confirmExecution);
  const { hosts } = useHosts();
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [failed, setFailed] = useState("");

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

  const hostsById = useMemo(
    () => new Map(hosts.map((host) => [Number(host.id), host])),
    [hosts],
  );

  const targetsOf = (snippet: Snippet): TargetHost[] =>
    snippet.isNote
      ? []
      : parseHostFilter(snippet.hostFilter).flatMap((id) => {
          const host = hostsById.get(id);
          return host
            ? [
                {
                  id,
                  name: host.name,
                  ip: host.ip,
                  username: host.username,
                  port: host.port,
                },
              ]
            : [];
        });

  const copy = (snippet: Snippet) => {
    void navigator.clipboard
      .writeText(snippet.content)
      .then(() => toast.success(t("copySuccess")))
      .catch(() => toast.error(t("copyFailed")));
  };

  const sorted = [...(snippets ?? [])].sort(
    (a, b) =>
      targetsOf(b).length - targetsOf(a).length || a.name.localeCompare(b.name),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {failed ? (
        <p className="p-3 text-xs text-destructive">{failed}</p>
      ) : !snippets ? (
        <p className="p-3 text-xs text-muted-foreground">{t("loading")}</p>
      ) : (
        <PanelList
          empty={
            <button
              type="button"
              onClick={() => shell.openRailView("snippets")}
              className="p-3 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              {t("emptyTitle")}
            </button>
          }
        >
          {sorted.map((snippet, index) => {
            const targets = targetsOf(snippet);
            return (
              <ListRow
                key={snippet.id}
                stripe={index}
                tone={targets.length > 0 ? "brand" : "none"}
                title={snippet.name}
                meta={
                  targets.length > 0
                    ? t("card.runsOn", {
                        hosts: targets.map((host) => host.name).join(", "),
                      })
                    : (snippet.folder ?? undefined)
                }
                actions={
                  <>
                    {targets.length > 0 && (
                      <ListRowAction
                        label={t("runOnTargets")}
                        tone="brand"
                        onClick={() => runOnHosts(snippet, targets)}
                      >
                        <Zap />
                      </ListRowAction>
                    )}
                    <ListRowAction
                      label={t("copyToClipboard")}
                      onClick={() => copy(snippet)}
                    >
                      <Copy />
                    </ListRowAction>
                  </>
                }
              />
            );
          })}
        </PanelList>
      )}
      {dialog}
    </div>
  );
}
