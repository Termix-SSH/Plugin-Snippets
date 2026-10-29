import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { EventEmitter } from "node:events";
import {
  createMockCtx,
  createTestDb,
  type TestDb,
} from "@termix-ssh/plugin-sdk/testing";
import { manifest, pluginDir } from "./helpers";

let db: TestDb | null = null;

afterEach(async () => {
  db?.close();
  db = null;
});

function fakeSshClient(output: string, exitCode: number | null = 0) {
  const client = new EventEmitter() as EventEmitter & {
    commands: string[];
    exec: (
      command: string,
      cb: (err: Error | null, stream: unknown) => void,
    ) => void;
  };
  client.commands = [];
  client.exec = (command, cb) => {
    client.commands.push(command);
    const stream = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
    };
    stream.stderr = new EventEmitter();
    cb(null, stream);
    setImmediate(() => {
      stream.emit("data", Buffer.from(output));
      stream.emit("close", exitCode);
    });
  };
  return client;
}

async function startExecuteServer(
  sshClient: unknown,
  connectError?: unknown,
  extra: { host?: Record<string, unknown>; fillSudoPassword?: boolean } = {},
) {
  db = await createTestDb(pluginDir);
  db.sqlite
    .prepare("INSERT INTO users (id, username) VALUES ('user-1', 'user-1')")
    .run();

  let router: import("express").Router | null = null;
  const mock = createMockCtx({
    pluginId: manifest.id,
    manifest,
    capabilities: manifest.capabilities,
    db: db.database,
    router: () => (router = express.Router()),
    sshClient,
    sshHosts: [
      { id: 42, ip: "10.0.0.5", port: 22, username: "root", ...extra.host },
    ],
    permissions: ["snippets.view", "snippets.create"],
  });

  if (extra.fillSudoPassword) {
    mock.settings.set("user:user-1:fillSudoPassword", true);
  }

  if (connectError !== undefined) {
    mock.ctx.ssh.connect = async () => {
      throw connectError;
    };
  }

  const { activate } = await import("../../src/backend/index.js");
  await activate(mock.ctx);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    mock.setActor(req.header("x-test-user") ?? undefined);
    next();
  });
  app.use((req, res, next) => router!(req, res, next));

  const http = await import("node:http");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as import("node:net").AddressInfo;

  return {
    async request(method: string, path: string, body?: unknown) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          "x-test-user": "user-1",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("POST /execute", () => {
  it("runs the resolved command over the ssh client and reports success", async () => {
    const client = fakeSshClient("deployed ok", 0);
    const server = await startExecuteServer(client);
    try {
      const created = await server.request("POST", "/", {
        name: "Deploy",
        content: "echo $HOST",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ success: true, output: "deployed ok" });
    } finally {
      await server.close();
    }
  });

  it("reports failure from a nonzero exit code", async () => {
    const client = fakeSshClient("", 1);
    const server = await startExecuteServer(client);
    try {
      const created = await server.request("POST", "/", {
        name: "Fails",
        content: "exit 1",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
      expect(result.status).toBe(200);
      expect(result.body.success).toBe(false);
    } finally {
      await server.close();
    }
  });

  it("fills string input values and leaves other values unresolved", async () => {
    const client = fakeSshClient("", 0);
    const server = await startExecuteServer(client);
    try {
      const created = await server.request("POST", "/", {
        name: "Inputs",
        content: "echo $INPUT_1 $INPUT_2",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
        inputValues: { INPUT_1: "one", INPUT_2: { nested: true } },
      });
      expect(result.status).toBe(200);
      expect(client.commands).toEqual(["echo one $INPUT_2"]);
    } finally {
      await server.close();
    }
  });

  function sshError(message: string, fields: Record<string, unknown>) {
    return Object.assign(new Error(message), fields);
  }

  async function executeWithConnectError(error: unknown) {
    const server = await startExecuteServer(fakeSshClient(""), error);
    try {
      const created = await server.request("POST", "/", {
        name: "Uptime",
        content: "uptime",
      });
      return await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
    } finally {
      await server.close();
    }
  }

  it.each([
    [
      "authentication failure",
      sshError("All configured authentication methods failed", {
        level: "client-authentication",
      }),
      422,
      "SSH_AUTH_FAILED",
      "Authentication failed for root@10.0.0.5",
    ],
    [
      "missing credentials",
      sshError("Password authentication requested but no password provided", {
        name: "SshConnectError",
        code: "missing-secret",
      }),
      422,
      "SSH_AUTH_FAILED",
      "Cannot authenticate to root@10.0.0.5: its stored credentials are missing or unusable",
    ],
    [
      "connection refused",
      sshError("connect ECONNREFUSED 10.0.0.5:22", {
        code: "ECONNREFUSED",
        level: "client-socket",
      }),
      502,
      "SSH_HOST_UNREACHABLE",
      "Cannot reach root@10.0.0.5: connection refused",
    ],
    [
      "host unreachable",
      sshError("connect EHOSTUNREACH 10.0.0.5:22", {
        code: "EHOSTUNREACH",
        level: "client-socket",
      }),
      502,
      "SSH_HOST_UNREACHABLE",
      "Cannot reach root@10.0.0.5: host unreachable",
    ],
    [
      "socket timeout",
      sshError("connect ETIMEDOUT 10.0.0.5:22", {
        code: "ETIMEDOUT",
        level: "client-socket",
      }),
      504,
      "SSH_TIMEOUT",
      "Timed out connecting to root@10.0.0.5",
    ],
    [
      "connect pipeline timeout",
      new Error("SSH connection timeout"),
      504,
      "SSH_TIMEOUT",
      "Timed out connecting to root@10.0.0.5",
    ],
    [
      "host key rejected",
      sshError("Host denied (verification failed)", { level: "handshake" }),
      409,
      "SSH_HOST_KEY_REJECTED",
      "Host key for root@10.0.0.5 was rejected. If it changed, open a Terminal connection to the host to verify and accept the new key.",
    ],
    [
      "unknown host",
      sshError("Host not found or access denied", {
        name: "SshHostNotFoundError",
      }),
      404,
      "HOST_NOT_FOUND",
      "Host not found",
    ],
  ])("reports %s", async (_label, error, status, code, message) => {
    const result = await executeWithConnectError(error);
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ error: message, code });
  });

  it("never echoes the underlying error text", async () => {
    const result = await executeWithConnectError(
      sshError("All configured authentication methods failed: hunter2", {
        level: "client-authentication",
      }),
    );
    expect(JSON.stringify(result.body)).not.toContain("hunter2");
  });

  it("answers 504 with the output so far when the command runs too long", async () => {
    const client = new EventEmitter() as EventEmitter & {
      exec: (
        command: string,
        cb: (err: Error | null, stream: unknown) => void,
      ) => void;
    };
    let closed = false;
    client.exec = (_command, cb) => {
      const stream = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        close: () => void;
      };
      stream.stderr = new EventEmitter();
      stream.close = () => {
        closed = true;
      };
      cb(null, stream);
      setImmediate(() => stream.emit("data", Buffer.from("halfway")));
    };
    process.env.SNIPPET_EXECUTION_TIMEOUT_SECONDS = "0.05";
    const server = await startExecuteServer(client);
    try {
      const created = await server.request("POST", "/", {
        name: "Slow",
        content: "sleep 60",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
      expect(result.status).toBe(504);
      expect(result.body).toMatchObject({
        code: "COMMAND_TIMEOUT",
        error: "Command timed out after 0.05s",
        output: "halfway",
      });
      expect(closed).toBe(true);
    } finally {
      delete process.env.SNIPPET_EXECUTION_TIMEOUT_SECONDS;
      await server.close();
    }
  });

  it("keeps 500 for errors that are not connection failures", async () => {
    const result = await executeWithConnectError(new Error("database is gone"));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Failed to execute snippet" });
  });
});

describe("sudo password fill", () => {
  function sudoClient() {
    const client = new EventEmitter() as EventEmitter & {
      calls: Array<{ command: string; options?: { pty?: boolean } }>;
      written: string[];
      exec: (
        command: string,
        options: unknown,
        cb?: (err: Error | null, stream: unknown) => void,
      ) => void;
    };
    client.calls = [];
    client.written = [];
    client.exec = (command, options, cb) => {
      const callback = (cb ?? options) as (
        err: Error | null,
        stream: unknown,
      ) => void;
      client.calls.push({
        command,
        options: cb ? (options as { pty?: boolean }) : undefined,
      });
      const stream = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        write: (data: string) => void;
      };
      stream.stderr = new EventEmitter();
      stream.write = (data) => {
        client.written.push(data);
        setImmediate(() => {
          stream.emit("data", Buffer.from("\nupdated\n"));
          stream.emit("close", 0);
        });
      };
      callback(null, stream);
      setImmediate(() => {
        // Without a pty sudo cannot prompt at all.
        if (!cb) {
          stream.stderr.emit(
            "data",
            Buffer.from("sudo: a terminal is required to read the password"),
          );
          stream.emit("close", 1);
          return;
        }
        stream.emit("data", Buffer.from("[sudo] password for root: "));
      });
    };
    return client;
  }

  async function runSudo(extra: Parameters<typeof startExecuteServer>[2]) {
    const client = sudoClient();
    const server = await startExecuteServer(client, undefined, extra);
    try {
      const created = await server.request("POST", "/", {
        name: "Update",
        content: "sudo apt-get update",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
      return { client, result };
    } finally {
      await server.close();
    }
  }

  it("answers sudo's prompt on a pty when the user turned it on", async () => {
    const { client, result } = await runSudo({
      fillSudoPassword: true,
      host: { sudoPassword: "s3cret" },
    });
    expect(client.calls[0]?.options).toEqual({ pty: true });
    expect(client.written).toEqual(["s3cret\n"]);
    expect(result).toMatchObject({ status: 200, body: { success: true } });
  });

  it("leaves sudo alone when the setting is off", async () => {
    const { client, result } = await runSudo({
      host: { sudoPassword: "s3cret" },
    });
    expect(client.calls[0]?.options).toBeUndefined();
    expect(client.written).toEqual([]);
    expect(result.body).toMatchObject({ success: false });
  });
});

describe("POST /execute with secrets", () => {
  it("fills {{NAME}} on the server and masks the value in output", async () => {
    const client = fakeSshClient("key is s3cr3t-value", 0);
    const server = await startExecuteServer(client);
    try {
      const secret = await server.request("POST", "/secrets", {
        name: "API_KEY",
        value: "s3cr3t-value",
      });
      expect(secret.status).toBe(201);
      const created = await server.request("POST", "/", {
        name: "Use key",
        content: "echo {{API_KEY}}",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
      expect(result.status).toBe(200);
      expect(client.commands).toEqual(["echo s3cr3t-value"]);
      expect(result.body.output).toBe("key is ••••");
    } finally {
      await server.close();
    }
  });

  it("refuses to run when a secret is not saved", async () => {
    const client = fakeSshClient("", 0);
    const server = await startExecuteServer(client);
    try {
      const created = await server.request("POST", "/", {
        name: "Use key",
        content: "echo {{MISSING}}",
      });
      const result = await server.request("POST", "/execute", {
        snippetId: created.body.id,
        hostId: 42,
      });
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({
        code: "MISSING_SECRETS",
        missing: ["MISSING"],
      });
      expect(client.commands).toEqual([]);
    } finally {
      await server.close();
    }
  });
});
