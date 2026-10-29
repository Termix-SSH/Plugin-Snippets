import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import { extractSecretNames } from "../shared/variables.js";
import { createSnippetsApi } from "./snippets-api";

/** Thrown when a snippet names secrets the user has not saved. */
export class MissingSecretsError extends Error {
  constructor(readonly names: string[]) {
    super(names.join(", "));
  }
}

function missingNames(err: unknown): string[] | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data as
    { code?: string; missing?: unknown } | undefined;
  if (data?.code !== "MISSING_SECRETS" || !Array.isArray(data.missing)) {
    return null;
  }
  return data.missing.filter((n): n is string => typeof n === "string");
}

/**
 * The {{NAME}} values a snippet needs, fetched from the server right before
 * it is typed into a terminal. Empty when it uses none.
 */
export async function secretValuesFor(
  api: PluginApiClient,
  content: string,
  snippetId?: number,
): Promise<Record<string, string>> {
  const names = extractSecretNames(content);
  if (names.length === 0) return {};
  try {
    const { values } = await createSnippetsApi(api).resolveSecrets(
      names,
      snippetId,
    );
    return values;
  } catch (err) {
    const missing = missingNames(err);
    if (missing) throw new MissingSecretsError(missing);
    throw err;
  }
}
