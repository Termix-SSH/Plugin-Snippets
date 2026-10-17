export interface SshFailure {
  status: number;
  code: string;
  error: string;
}

const UNREACHABLE_REASONS: Record<string, string> = {
  ECONNREFUSED: "connection refused",
  ECONNRESET: "connection reset",
  EHOSTUNREACH: "host unreachable",
  ENETUNREACH: "network unreachable",
  ENOTFOUND: "hostname could not be resolved",
  EAI_AGAIN: "hostname could not be resolved",
};

/**
 * Maps a failure from ctx.ssh.connect (core's connect pipeline or ssh2) to a
 * response the client can show. Null means it is not a connection failure.
 * Messages are fixed text plus the target, so they never carry secrets.
 */
export function classifySshError(
  err: unknown,
  target: string,
): SshFailure | null {
  if (!(err instanceof Error)) return null;
  const { code, level } = err as Error & { code?: string; level?: string };

  if (err.name === "SshHostNotFoundError") {
    return { status: 404, code: "HOST_NOT_FOUND", error: "Host not found" };
  }
  if (
    level === "client-authentication" ||
    /All configured authentication methods failed/i.test(err.message)
  ) {
    return {
      status: 422,
      code: "SSH_AUTH_FAILED",
      error: `Authentication failed for ${target}`,
    };
  }
  if (err.name === "SshConnectError") {
    return {
      status: 422,
      code: "SSH_AUTH_FAILED",
      error: `Cannot authenticate to ${target}: its stored credentials are missing or unusable`,
    };
  }
  if (/Host denied \(verification failed\)/i.test(err.message)) {
    return {
      status: 409,
      code: "SSH_HOST_KEY_REJECTED",
      error: `Host key for ${target} was rejected. If it changed, open a Terminal connection to the host to verify and accept the new key.`,
    };
  }
  if (code && UNREACHABLE_REASONS[code]) {
    return {
      status: 502,
      code: "SSH_HOST_UNREACHABLE",
      error: `Cannot reach ${target}: ${UNREACHABLE_REASONS[code]}`,
    };
  }
  if (
    code === "ETIMEDOUT" ||
    level === "client-timeout" ||
    err.message === "SSH connection timeout"
  ) {
    return {
      status: 504,
      code: "SSH_TIMEOUT",
      error: `Timed out connecting to ${target}`,
    };
  }
  return null;
}

/** A command that connected but ran past the execution timeout. */
export class CommandTimeoutError extends Error {
  constructor(
    timeoutMs: number,
    readonly output: string,
    readonly errorOutput: string,
  ) {
    super(`Command timed out after ${timeoutMs / 1000}s`);
    this.name = "CommandTimeoutError";
  }
}
