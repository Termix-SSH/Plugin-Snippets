import { and, asc, eq, inArray } from "drizzle-orm";
import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { isSecretName } from "../shared/variables.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SnippetSecretSummary {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export class MissingSecretsError extends Error {
  constructor(readonly names: string[]) {
    super(`Missing secrets: ${names.join(", ")}`);
  }
}

/**
 * A user's named secrets for {{NAME}} in snippets. Values are sealed with the
 * installation key and only unsealed for a run.
 */
export function createSecretStore(ctx: PluginContext, table: Table) {
  const client = () => ctx.db.client<Drizzle>();

  async function findByName(userId: string, name: string) {
    const drizzle = await client();
    const rows = await drizzle
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.name, name)))
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    async list(userId: string): Promise<SnippetSecretSummary[]> {
      const drizzle = await client();
      return drizzle
        .select({
          id: table.id,
          name: table.name,
          description: table.description,
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
        })
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(asc(table.name));
    },

    findByName,

    async create(
      userId: string,
      input: { name: string; value: string; description?: string | null },
    ): Promise<SnippetSecretSummary | null> {
      if (await findByName(userId, input.name)) return null;
      const drizzle = await client();
      await drizzle.insert(table).values({
        userId,
        name: input.name,
        value: await ctx.secrets.seal(input.value),
        description: input.description?.trim() || null,
      });
      await ctx.db.persist();
      const row = await findByName(userId, input.name);
      return row ? summary(row) : null;
    },

    /** Changes the name, description or value. Null when it does not exist. */
    async update(
      userId: string,
      id: number,
      changes: { name?: string; value?: string; description?: string | null },
    ): Promise<SnippetSecretSummary | "conflict" | null> {
      const drizzle = await client();
      const where = and(eq(table.id, id), eq(table.userId, userId));
      const [existing] = await drizzle.select().from(table).where(where);
      if (!existing) return null;
      if (changes.name && changes.name !== existing.name) {
        if (await findByName(userId, changes.name)) return "conflict";
      }
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (changes.name) patch.name = changes.name;
      if (changes.description !== undefined) {
        patch.description = changes.description?.trim() || null;
      }
      if (changes.value !== undefined) {
        patch.value = await ctx.secrets.seal(changes.value);
      }
      await drizzle.update(table).set(patch).where(where);
      await ctx.db.persist();
      const [row] = await drizzle.select().from(table).where(where);
      return row ? summary(row) : null;
    },

    async remove(userId: string, id: number): Promise<boolean> {
      const drizzle = await client();
      const where = and(eq(table.id, id), eq(table.userId, userId));
      const [existing] = await drizzle.select().from(table).where(where);
      if (!existing) return false;
      await drizzle.delete(table).where(where);
      await ctx.db.persist();
      return true;
    },

    async removeAll(userId: string): Promise<void> {
      const drizzle = await client();
      await drizzle.delete(table).where(eq(table.userId, userId));
      await ctx.db.persist();
    },

    /**
     * The values for these names, unsealed. Throws MissingSecretsError when
     * one is not saved or cannot be decrypted.
     */
    async resolve(
      userId: string,
      names: string[],
    ): Promise<Record<string, string>> {
      const wanted = Array.from(new Set(names.filter(isSecretName)));
      if (wanted.length === 0) return {};
      const drizzle = await client();
      const rows: Array<{ name: string; value: string }> = await drizzle
        .select({ name: table.name, value: table.value })
        .from(table)
        .where(and(eq(table.userId, userId), inArray(table.name, wanted)));
      const values: Record<string, string> = {};
      for (const row of rows) {
        const value = await ctx.secrets.unseal(row.value);
        if (value !== null) values[row.name] = value;
      }
      const missing = wanted.filter((name) => !Object.hasOwn(values, name));
      if (missing.length > 0) throw new MissingSecretsError(missing);
      return values;
    },
  };
}

export type SecretStore = ReturnType<typeof createSecretStore>;

function summary(row: SnippetSecretSummary): SnippetSecretSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function actor(ctx: PluginContext): string {
  return ctx.currentActor() as string;
}

function paramId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined ? NaN : parseInt(value, 10);
}

const MAX_VALUE_LENGTH = 64 * 1024;

function validValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VALUE_LENGTH
  );
}

/** The /secrets routes. Mounted before the /:id snippet routes. */
export function registerSecretRoutes(
  router: Router,
  store: SecretStore,
  ctx: PluginContext,
): void {
  /**
   * @openapi
   * /plugin-api/snippets/secrets:
   *   get:
   *     summary: List the current user's snippet secrets, without values
   *     tags:
   *       - Snippets
   *     responses:
   *       200:
   *         description: Secret names and descriptions.
   */
  router.get(
    "/secrets",
    ctx.rbac.require("view") as never,
    async (_req: Request, res: Response) => {
      res.json(await store.list(actor(ctx)));
    },
  );

  /**
   * @openapi
   * /plugin-api/snippets/secrets:
   *   post:
   *     summary: Save a secret for {{NAME}} in snippets
   *     tags:
   *       - Snippets
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, value]
   *             properties:
   *               name:
   *                 type: string
   *               value:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       201:
   *         description: Secret saved. The value is never returned.
   *       400:
   *         description: Invalid name or value.
   *       409:
   *         description: A secret with this name already exists.
   */
  router.post(
    "/secrets",
    ctx.rbac.require("create") as never,
    async (req: Request, res: Response) => {
      const { name, value, description } = req.body ?? {};
      if (typeof name !== "string" || !isSecretName(name)) {
        return res.status(400).json({ error: "Invalid secret name" });
      }
      if (!validValue(value)) {
        return res.status(400).json({ error: "Invalid secret value" });
      }
      const created = await store.create(actor(ctx), {
        name,
        value,
        description: typeof description === "string" ? description : null,
      });
      if (!created) {
        return res
          .status(409)
          .json({ error: "A secret with this name already exists" });
      }
      res.status(201).json(created);
    },
  );

  /**
   * @openapi
   * /plugin-api/snippets/secrets/{id}:
   *   put:
   *     summary: Rename a secret or replace its value or description
   *     tags:
   *       - Snippets
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               value:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       200:
   *         description: Secret updated.
   *       400:
   *         description: Invalid name or value.
   *       404:
   *         description: Secret not found.
   *       409:
   *         description: A secret with this name already exists.
   */
  router.put(
    "/secrets/:id",
    ctx.rbac.require("edit") as never,
    async (req: Request, res: Response) => {
      const id = paramId(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid secret id" });
      }
      const { name, value, description } = req.body ?? {};
      if (
        name !== undefined &&
        (typeof name !== "string" || !isSecretName(name))
      ) {
        return res.status(400).json({ error: "Invalid secret name" });
      }
      if (value !== undefined && !validValue(value)) {
        return res.status(400).json({ error: "Invalid secret value" });
      }
      const result = await store.update(actor(ctx), id, {
        name,
        value,
        description:
          description === undefined
            ? undefined
            : typeof description === "string"
              ? description
              : null,
      });
      if (result === "conflict") {
        return res
          .status(409)
          .json({ error: "A secret with this name already exists" });
      }
      if (!result) return res.status(404).json({ error: "Secret not found" });
      res.json(result);
    },
  );

  /**
   * @openapi
   * /plugin-api/snippets/secrets/{id}:
   *   delete:
   *     summary: Delete a secret
   *     tags:
   *       - Snippets
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Secret deleted.
   *       404:
   *         description: Secret not found.
   */
  router.delete(
    "/secrets/:id",
    ctx.rbac.require("delete") as never,
    async (req: Request, res: Response) => {
      const id = paramId(req.params.id);
      if (!Number.isInteger(id) || !(await store.remove(actor(ctx), id))) {
        return res.status(404).json({ error: "Secret not found" });
      }
      res.json({ success: true });
    },
  );

  /**
   * @openapi
   * /plugin-api/snippets/secrets/resolve:
   *   post:
   *     summary: Get secret values to type a snippet into a terminal
   *     description: >
   *       Returns the current user's own values for the names given. Every
   *       call is audited.
   *     tags:
   *       - Snippets
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [names]
   *             properties:
   *               names:
   *                 type: array
   *                 items:
   *                   type: string
   *               snippetId:
   *                 type: integer
   *     responses:
   *       200:
   *         description: The values by name.
   *       400:
   *         description: No names given.
   *       404:
   *         description: One or more secrets are not saved (code MISSING_SECRETS, names in missing).
   */
  router.post("/secrets/resolve", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const { names, snippetId } = req.body ?? {};
    if (!Array.isArray(names) || names.length === 0 || names.length > 50) {
      return res.status(400).json({ error: "names is required" });
    }
    const wanted = names.filter((n): n is string => typeof n === "string");
    try {
      const values = await store.resolve(userId, wanted);
      await recordSecretUse(ctx, req, wanted, snippetId, true);
      res.json({ values });
    } catch (err) {
      if (err instanceof MissingSecretsError) {
        await recordSecretUse(ctx, req, wanted, snippetId, false);
        return res.status(404).json({
          error: err.message,
          code: "MISSING_SECRETS",
          missing: err.names,
        });
      }
      throw err;
    }
  });
}

export async function recordSecretUse(
  ctx: PluginContext,
  request: unknown,
  names: string[],
  snippetId: unknown,
  success: boolean,
): Promise<void> {
  await ctx.audit
    ?.record({
      action: "snippets_secret_use",
      resourceType: "snippet",
      resourceId:
        snippetId === undefined || snippetId === null
          ? undefined
          : String(snippetId),
      details: JSON.stringify({ names }),
      success,
      request,
    })
    .catch(() => undefined);
}
