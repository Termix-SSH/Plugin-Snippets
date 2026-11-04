import type { Client } from "ssh2";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { execCommand } from "@termix-ssh/plugin-sdk/host-commands";
import {
  extractSecretNames,
  resolveSnippetContent,
} from "../shared/variables.js";
import { maskSecrets } from "./execution.js";

const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT = 16_000;

interface Deps {
  /** The snippet when the user owns it or it was shared with them. */
  findAccessible: (
    userId: string,
    id: number,
  ) => Promise<{
    id: number;
    name: string;
    content: string;
    isNote: boolean;
  } | null>;
  listOwned: (
    userId: string,
  ) => Promise<{ id: number; name: string; isNote: boolean }[]>;
  resolveSecrets: (
    userId: string,
    names: string[],
  ) => Promise<Record<string, string>>;
}

function actor(ctx: PluginContext): string {
  const userId = ctx.currentActor();
  if (!userId) throw new Error("This needs a user");
  return userId;
}

/** Everything Snippets offers to the rest of Termix. */
export function registerOperations(ctx: PluginContext, deps: Deps): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("snippets.list", {
    run: async () => {
      const owned = (await deps.listOwned(actor(ctx))).filter(
        (snippet) => !snippet.isNote,
      );
      return {
        summary: `${owned.length} snippets`,
        data: {
          rows: owned.map((snippet) => ({
            id: snippet.id,
            name: snippet.name,
          })),
          options: owned.map((snippet) => ({
            value: String(snippet.id),
            label: snippet.name,
          })),
        },
      };
    },
  });

  ctx.operations.register("snippets.run", {
    describe: async (input) => {
      const snippet = await deps.findAccessible(
        actor(ctx),
        Number(input.snippet),
      );
      return snippet
        ? `Would run the snippet ${snippet.name}`
        : "That snippet is not available";
    },
    run: async (input, context) => {
      if (context.hostId === undefined) throw new Error("This needs a host");
      const userId = actor(ctx);
      const snippet = await deps.findAccessible(userId, Number(input.snippet));
      if (!snippet) throw new Error("Snippet not found");
      if (snippet.isNote) throw new Error("Notes cannot be run on a host");

      const secrets = await deps.resolveSecrets(
        userId,
        extractSecretNames(snippet.content),
      );
      if (Object.keys(secrets).length > 0) {
        void ctx.audit.record({
          action: "snippets.secrets_used",
          resourceType: "snippet",
          resourceId: String(snippet.id),
          resourceName: snippet.name,
          success: true,
        });
      }
      const host = await ctx.hosts.get(context.hostId);
      const command = resolveSnippetContent(
        snippet.content,
        host
          ? {
              ip: host.ip,
              username: host.username,
              port: host.port,
              name: host.name ?? undefined,
            }
          : null,
        {},
        secrets,
      );
      const { stdout, stderr, code } = await ctx.ssh.withConnection(
        context.hostId,
        { pool: "snippets", purpose: "plugin" },
        (client) => execCommand(client as Client, command, TIMEOUT_MS),
      );
      // Saved secrets never reach run history.
      const output = maskSecrets(
        [stdout, stderr].filter(Boolean).join("\n"),
        secrets,
      ).slice(0, MAX_OUTPUT);
      if (code !== 0)
        throw new Error(`Exited with code ${code}: ${output.slice(0, 500)}`);
      return {
        summary: `Ran ${snippet.name}`,
        changed: true,
        data: { output },
      };
    },
  });
}
