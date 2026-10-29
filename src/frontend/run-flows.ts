import { toast } from "sonner";
import { invokeAction, type TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import {
  hasSnippetInputs,
  resolveSnippetContent,
  type SnippetHostContext,
} from "../shared/variables.js";
import { askForInputs, shouldConfirmExecution } from "./prompt-store";
import { createSnippetsApi } from "./snippets-api";
import { MissingSecretsError, secretValuesFor } from "./secret-values";

export interface RunnableSnippet {
  id: number;
  name: string;
  content: string;
  isNote?: boolean;
}

/** Where a run sends its text: a session by id, or a raw writer. */
export interface RunTarget {
  sessionId?: string;
  send?: (data: string) => void;
}

/**
 * The snippet with its variables and secrets filled in, asking for $INPUT_n
 * values when it has any. Null when the user cancels or a secret is missing.
 */
async function resolveForRun(
  app: Pick<TermixApp, "api" | "t">,
  snippet: { id?: number; name: string; content: string },
  host: SnippetHostContext | null,
): Promise<string | null> {
  let values: Record<string, string> = {};
  if (hasSnippetInputs(snippet.content)) {
    const asked = await askForInputs(snippet, host);
    if (!asked) return null;
    values = asked;
  }
  const secrets = await loadSecrets(app, snippet);
  if (!secrets) return null;
  return resolveSnippetContent(snippet.content, host, values, secrets);
}

/** The snippet's {{NAME}} values, or null after telling the user why not. */
export async function loadSecrets(
  app: Pick<TermixApp, "api" | "t">,
  snippet: { id?: number; content: string },
): Promise<Record<string, string> | null> {
  try {
    return await secretValuesFor(app.api, snippet.content, snippet.id);
  } catch (err) {
    toast.error(
      err instanceof MissingSecretsError
        ? app.t("secrets.missing", { names: err.message })
        : app.t("secrets.loadFailed"),
    );
    return null;
  }
}

/** Runs `execute` now, or after the user confirms when they asked to. */
function confirmThenRun(
  app: Pick<TermixApp, "t" | "confirm">,
  name: string,
  execute: () => void,
): void {
  if (!shouldConfirmExecution()) {
    execute();
    return;
  }
  void app
    .confirm({
      title: app.t("confirmRunMessage", { name }),
      confirmLabel: app.t("confirmRunButton"),
      destructive: false,
    })
    .then((ok) => {
      if (ok) execute();
    });
}

/**
 * Types a snippet into a terminal session: resolves its variables, asks for
 * inputs and confirmation as the user's settings say, then sends it. A note
 * is pasted without running.
 */
export async function runInSession(
  app: Pick<TermixApp, "api" | "t" | "confirm">,
  snippet: RunnableSnippet,
  target: RunTarget,
  host: SnippetHostContext | null,
  options: { pressEnter?: boolean; announce?: boolean } = {},
): Promise<void> {
  const content = await resolveForRun(app, snippet, host);
  if (content === null) return;
  const run = !snippet.isNote && options.pressEnter !== false;
  const send = async () => {
    let sent = true;
    if (target.send) {
      target.send(content + (run ? "\r" : ""));
    } else if (target.sessionId) {
      sent =
        (await invokeAction(
          "terminal.sendToSession",
          target.sessionId,
          content,
          {
            run,
          },
        )) === true;
    } else {
      sent = false;
    }
    if (!options.announce) return;
    if (!sent) {
      toast.error(app.t("noTerminalTabsOpen"));
      return;
    }
    toast.success(
      app.t(snippet.isNote ? "pasteSuccess" : "runSuccess", {
        name: snippet.name,
        count: 1,
      }),
    );
  };
  if (snippet.isNote) void send();
  else confirmThenRun(app, snippet.name, () => void send());
}

/** One snippet by id, or null when it is gone or unreadable. */
export async function fetchSnippet(
  app: Pick<TermixApp, "api">,
  id: number,
): Promise<RunnableSnippet | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const snippet = await createSnippetsApi(app.api)
    .get(id)
    .catch(() => null);
  return snippet
    ? {
        id: snippet.id,
        name: snippet.name,
        content: snippet.content,
        isNote: snippet.isNote,
      }
    : null;
}
