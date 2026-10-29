import { useCallback, useMemo, useState } from "react";
import { useConfirm } from "@termix-ssh/plugin-sdk/ui";
import {
  invokeAction,
  usePluginApi,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import {
  hasSnippetInputs,
  resolveSnippetContent,
  type SnippetHostContext,
} from "../shared/variables.js";
import { SnippetVariablesDialog } from "./SnippetVariablesDialog";
import { createSnippetsApi } from "./snippets-api";
import { MissingSecretsError, secretValuesFor } from "./secret-values";
import {
  ExecutionResultsDialog,
  type HostExecutionResult,
} from "./ExecutionResultsDialog";
import { errorMessage, type Snippet } from "./types";

export interface TargetHost {
  id: number;
  name?: string;
  ip?: string;
  username?: string;
  port?: number;
}

export interface RunTarget {
  sessionId: string;
  host: SnippetHostContext | null;
}

/**
 * Shared "run this snippet against these terminal sessions" flow: resolves
 * $HOST-style vars per target, prompts once for $INPUT_n placeholders when
 * present, and gates on the confirm-before-running setting. Sends through
 * the ssh-terminal plugin's terminal.sendToActive/sendToSession actions
 * rather than touching a terminal ref directly, since core's tab state is
 * not part of the plugin surface. runOnHosts instead runs a command over a
 * fresh SSH connection to each of the snippet's target hosts.
 */
export function useSnippetRunner(confirmExecution = false) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const api = usePluginApi();
  const client = useMemo(() => createSnippetsApi(api), [api]);
  const [execution, setExecution] = useState<{
    snippetName: string;
    results: HostExecutionResult[];
  } | null>(null);
  const [runningSnippet, setRunningSnippet] = useState<{
    snippet: Snippet;
    host: SnippetHostContext | null;
    onConfirm: (
      resolvedContent: string,
      inputValues: Record<string, string>,
    ) => void;
  } | null>(null);

  const handleConfirmRun = useCallback(
    (snippet: Snippet, execute: () => void) => {
      if (!confirmExecution) {
        execute();
        return;
      }
      void confirm({
        title: t("confirmRunMessage", { name: snippet.name }),
        confirmLabel: t("confirmRunButton"),
        destructive: false,
      }).then((ok) => {
        if (ok) execute();
      });
    },
    [confirmExecution, confirm, t],
  );

  // The snippet's {{NAME}} values, or null after a toast saying why not.
  const loadSecrets = useCallback(
    async (snippet: Snippet): Promise<Record<string, string> | null> => {
      try {
        return await secretValuesFor(api, snippet.content, snippet.id);
      } catch (err) {
        toast.error(
          err instanceof MissingSecretsError
            ? t("secrets.missing", { names: err.message })
            : t("secrets.loadFailed"),
        );
        return null;
      }
    },
    [api, t],
  );

  async function sendResolvedToTarget(
    target: RunTarget,
    snippet: Snippet,
    inputValues: Record<string, string>,
    secrets: Record<string, string>,
  ) {
    const content = resolveSnippetContent(
      snippet.content,
      target.host,
      inputValues,
      secrets,
    );
    const run = !snippet.isNote;
    return (
      (await invokeAction("terminal.sendToSession", target.sessionId, content, {
        run,
      })) === true
    );
  }

  const runSnippet = useCallback(
    (snippet: Snippet, targets: RunTarget[]) => {
      const runWithInputs = (inputValues: Record<string, string>) => {
        const doSend = async () => {
          const secrets = await loadSecrets(snippet);
          if (!secrets) return;
          Promise.all(
            targets.map((target) =>
              sendResolvedToTarget(target, snippet, inputValues, secrets),
            ),
          )
            .then((results) => {
              const sent = results.filter(Boolean).length;
              if (sent === 0) {
                toast.error(t("noTerminalTabsOpen"));
                return;
              }
              toast.success(
                t(snippet.isNote ? "pasteSuccess" : "runSuccess", {
                  name: snippet.name,
                  count: sent,
                }),
              );
            })
            .catch(() => toast.error(t("noTerminalTabsOpen")));
        };
        if (snippet.isNote) void doSend();
        else handleConfirmRun(snippet, () => void doSend());
      };

      if (hasSnippetInputs(snippet.content)) {
        setRunningSnippet({
          snippet,
          host: targets[0]?.host ?? null,
          onConfirm: (_resolvedContent, inputValues) => {
            setRunningSnippet(null);
            runWithInputs(inputValues);
          },
        });
      } else {
        runWithInputs({});
      }
    },
    [handleConfirmRun, loadSecrets, t],
  );

  // Sends to the given session when it is a live terminal, else the active one.
  const runOnActive = useCallback(
    (snippet: Snippet, host: SnippetHostContext | null, sessionId?: string) => {
      const runWithInputs = (inputValues: Record<string, string>) => {
        const doSend = async () => {
          const secrets = await loadSecrets(snippet);
          if (!secrets) return;
          const content = resolveSnippetContent(
            snippet.content,
            host,
            inputValues,
            secrets,
          );
          const opts = { run: !snippet.isNote };
          const sendToTarget = sessionId
            ? invokeAction("terminal.sendToSession", sessionId, content, opts)
            : Promise.resolve(false);
          void sendToTarget
            .then((sent) =>
              sent === true
                ? true
                : invokeAction("terminal.sendToActive", content, opts),
            )
            .catch(() => false)
            .then((sent) => {
              if (sent !== true) {
                toast.error(t("noTerminalTabsOpen"));
                return;
              }
              toast.success(
                t(snippet.isNote ? "pasteSuccess" : "runSuccess", {
                  name: snippet.name,
                  count: 1,
                }),
              );
            });
        };
        if (snippet.isNote) void doSend();
        else handleConfirmRun(snippet, () => void doSend());
      };

      if (hasSnippetInputs(snippet.content)) {
        setRunningSnippet({
          snippet,
          host,
          onConfirm: (_resolvedContent, inputValues) => {
            setRunningSnippet(null);
            runWithInputs(inputValues);
          },
        });
      } else {
        runWithInputs({});
      }
    },
    [handleConfirmRun, loadSecrets, t],
  );

  const runOnHosts = useCallback(
    (snippet: Snippet, hosts: TargetHost[]) => {
      if (hosts.length === 0) return;
      const execute = (inputValues: Record<string, string>) => {
        const label = (host: TargetHost) =>
          host.name || host.ip || String(host.id);
        setExecution({
          snippetName: snippet.name,
          results: hosts.map((host) => ({
            hostId: host.id,
            hostLabel: label(host),
            success: null,
            output: "",
          })),
        });
        const update = (result: HostExecutionResult) =>
          setExecution((prev) =>
            prev
              ? {
                  ...prev,
                  results: prev.results.map((r) =>
                    r.hostId === result.hostId ? result : r,
                  ),
                }
              : prev,
          );
        const inputs =
          Object.keys(inputValues).length > 0 ? inputValues : undefined;
        void Promise.all(
          hosts.map(async (host) => {
            try {
              const result = await client.execute(snippet.id, host.id, inputs);
              update({ hostId: host.id, hostLabel: label(host), ...result });
              return result.success;
            } catch (err) {
              update({
                hostId: host.id,
                hostLabel: label(host),
                success: false,
                output: "",
                error: errorMessage(err, t("executionFailed")),
              });
              return false;
            }
          }),
        ).then((outcomes) => {
          if (outcomes.every(Boolean)) {
            toast.success(
              t("directRunSuccess", {
                name: snippet.name,
                count: hosts.length,
              }),
            );
          } else {
            toast.error(t("directRunPartialFail", { name: snippet.name }));
          }
        });
      };

      const runWithInputs = (inputValues: Record<string, string>) =>
        handleConfirmRun(snippet, () => execute(inputValues));

      if (hasSnippetInputs(snippet.content)) {
        const first = hosts[0];
        setRunningSnippet({
          snippet,
          host: {
            ip: first.ip,
            username: first.username,
            port: first.port,
            name: first.name,
          },
          onConfirm: (_resolvedContent, inputValues) => {
            setRunningSnippet(null);
            runWithInputs(inputValues);
          },
        });
      } else {
        runWithInputs({});
      }
    },
    [client, handleConfirmRun, t],
  );

  const variablesDialog = runningSnippet ? (
    <SnippetVariablesDialog
      snippet={runningSnippet.snippet}
      host={runningSnippet.host}
      onCancel={() => setRunningSnippet(null)}
      onConfirm={runningSnippet.onConfirm}
    />
  ) : null;

  const dialog = (
    <>
      {variablesDialog}
      {execution && (
        <ExecutionResultsDialog
          snippetName={execution.snippetName}
          results={execution.results}
          onClose={() => setExecution(null)}
        />
      )}
    </>
  );

  return { runSnippet, runOnActive, runOnHosts, handleConfirmRun, dialog };
}
