/**
 * $HOST, $USER, $PORT, $NAME, $INPUT_n and {{SECRET}} in a command. The one copy: the
 * frontend, the backend and other plugins (fleets, through the
 * "snippets.variables" registry entry and action) all use this.
 */

export interface SnippetInput {
  key: string;
  label: string;
}

export interface SnippetHostContext {
  ip?: string;
  username?: string;
  port?: number | string;
  name?: string;
}

const INPUT_PATTERN =
  /\$\{INPUT_(\d+)(?::([^}$]+))?\}|\$INPUT_(\d+)(?![a-zA-Z0-9_])/g;

export function extractSnippetInputs(content: string): SnippetInput[] {
  const seen = new Map<string, SnippetInput>();
  let match: RegExpExecArray | null;
  INPUT_PATTERN.lastIndex = 0;
  while ((match = INPUT_PATTERN.exec(content)) !== null) {
    const digits = match[1] ?? match[3];
    const key = `INPUT_${digits}`;
    if (!seen.has(key)) {
      seen.set(key, { key, label: match[2]?.trim() || `Input ${digits}` });
    }
  }
  return Array.from(seen.values());
}

export function hasSnippetInputs(content: string): boolean {
  INPUT_PATTERN.lastIndex = 0;
  return INPUT_PATTERN.test(content);
}

const SECRET_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]{0,63})\}\}/g;

/** Names of the saved secrets a command uses, as {{NAME}}. */
export function extractSecretNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(SECRET_PATTERN)) names.add(match[1]);
  return Array.from(names);
}

export function hasSnippetSecrets(content: string): boolean {
  SECRET_PATTERN.lastIndex = 0;
  return SECRET_PATTERN.test(content);
}

/** A valid secret name, the part inside {{ }}. */
export function isSecretName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name);
}

// $HOSTNAME or $USERPROFILE are left alone, and values are never
// re-scanned, so a value holding "$INPUT_1" or "$&" stays literal.
const HOST_VAR_PATTERN =
  /\$\{(HOST|USER|PORT|NAME)\}|\$(HOST|USER|PORT|NAME)(?![a-zA-Z0-9_])/;
const RESOLVE_PATTERN = new RegExp(
  `${HOST_VAR_PATTERN.source}|${INPUT_PATTERN.source}|${SECRET_PATTERN.source}`,
  "g",
);

export function resolveSnippetContent(
  content: string,
  host: SnippetHostContext | null,
  inputValues: Record<string, string> = {},
  secrets: Record<string, string> = {},
): string {
  const vars: Record<string, string | undefined> = {
    HOST: host?.ip,
    USER: host?.username,
    PORT: host?.port !== undefined ? String(host.port) : undefined,
    NAME: host?.name,
  };
  return content.replace(
    RESOLVE_PATTERN,
    (
      fullMatch,
      braceVar: string | undefined,
      plainVar: string | undefined,
      braceDigits: string | undefined,
      _label,
      plainDigits: string | undefined,
      secretName: string | undefined,
    ) => {
      if (secretName) {
        return Object.hasOwn(secrets, secretName)
          ? secrets[secretName]
          : fullMatch;
      }
      const name = braceVar ?? plainVar;
      if (name) return vars[name] ?? fullMatch;
      const key = `INPUT_${braceDigits ?? plainDigits}`;
      return Object.hasOwn(inputValues, key) ? inputValues[key] : fullMatch;
    },
  );
}
