export interface SnippetExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

export { resolveSnippetContent as resolveSnippetCommand } from "../shared/variables.js";
export function getSnippetExecutionTimeoutMs(
  value = process.env.SNIPPET_EXECUTION_TIMEOUT_SECONDS,
): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;

  return seconds * 1000;
}

export function createSnippetExecutionResult(
  exitCode: number | null,
  output: string,
  errorOutput: string,
): SnippetExecutionResult {
  const success = exitCode === 0 || (exitCode === null && !errorOutput);
  return {
    success,
    output,
    ...(errorOutput ? { error: errorOutput } : {}),
  };
}

/** Tries before giving up on a password sudo keeps refusing. */
export const MAX_SUDO_ANSWERS = 3;

/** True for a command that calls sudo, so only those get a pty. */
export function usesSudo(command: string): boolean {
  return /(^|[\s;&|(`])sudo(\s|$)/.test(command);
}

/** Whether output ends at sudo's password prompt ("Password:" on macOS). */
export function endsWithSudoPrompt(output: string): boolean {
  return /(?:\[sudo\] password for [^\n]*|(?:^|\n)Password):\s*$/.test(
    output.slice(-200),
  );
}

/** Output with every saved secret value it echoes replaced by dots. */
export function maskSecrets(
  text: string,
  secrets: Record<string, string>,
): string {
  let masked = text;
  const values = Object.values(secrets)
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const value of values) masked = masked.split(value).join("••••");
  return masked;
}
