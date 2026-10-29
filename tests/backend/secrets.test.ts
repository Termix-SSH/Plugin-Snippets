import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.close();
});

describe("secret routes", () => {
  it("stores values sealed and never returns them", async () => {
    const created = await server.request("POST", "/secrets", {
      body: { name: "TOKEN", value: "abc123", description: "CI token" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "TOKEN",
      description: "CI token",
    });
    expect(created.body).not.toHaveProperty("value");

    const row = server.db.sqlite
      .prepare("SELECT value FROM p_snippets_secrets WHERE name = 'TOKEN'")
      .get() as { value: string };
    expect(row.value).not.toBe("abc123");
    expect(row.value.startsWith("sealed:")).toBe(true);

    const list = await server.request("GET", "/secrets");
    expect(list.body).toEqual([
      expect.not.objectContaining({ value: expect.anything() }),
    ]);
  });

  it("rejects bad names and duplicate names", async () => {
    for (const name of ["1ABC", "has space", "a-b", ""]) {
      const res = await server.request("POST", "/secrets", {
        body: { name, value: "x" },
      });
      expect(res.status).toBe(400);
    }
    await server.request("POST", "/secrets", {
      body: { name: "A", value: "x" },
    });
    const dup = await server.request("POST", "/secrets", {
      body: { name: "A", value: "y" },
    });
    expect(dup.status).toBe(409);
  });

  it("resolves only the caller's own values and audits each use", async () => {
    await server.request("POST", "/secrets", {
      body: { name: "KEY", value: "mine" },
    });
    await server.request("POST", "/secrets", {
      user: "user-2",
      body: { name: "KEY", value: "theirs" },
    });

    const own = await server.request("POST", "/secrets/resolve", {
      body: { names: ["KEY"] },
    });
    expect(own.body).toEqual({ values: { KEY: "mine" } });

    const other = await server.request("POST", "/secrets/resolve", {
      user: "user-2",
      body: { names: ["KEY"] },
    });
    expect(other.body).toEqual({ values: { KEY: "theirs" } });

    const missing = await server.request("POST", "/secrets/resolve", {
      body: { names: ["KEY", "NOPE"] },
    });
    expect(missing.status).toBe(404);
    expect(missing.body.missing).toEqual(["NOPE"]);

    const uses = server.mock.audits.filter(
      (a) => a.action === "snippets_secret_use",
    );
    expect(uses.map((a) => a.success)).toEqual([true, true, false]);
    expect(uses.map((a) => a.details).join()).not.toContain("mine");
  });

  it("updates the value only when one is sent, and deletes", async () => {
    const created = await server.request("POST", "/secrets", {
      body: { name: "KEY", value: "one" },
    });
    await server.request("PUT", `/secrets/${created.body.id}`, {
      body: { name: "RENAMED" },
    });
    let resolved = await server.request("POST", "/secrets/resolve", {
      body: { names: ["RENAMED"] },
    });
    expect(resolved.body.values).toEqual({ RENAMED: "one" });

    await server.request("PUT", `/secrets/${created.body.id}`, {
      body: { value: "two" },
    });
    resolved = await server.request("POST", "/secrets/resolve", {
      body: { names: ["RENAMED"] },
    });
    expect(resolved.body.values).toEqual({ RENAMED: "two" });

    const otherUser = await server.request(
      "DELETE",
      `/secrets/${created.body.id}`,
      { user: "user-2" },
    );
    expect(otherUser.status).toBe(404);
    const deleted = await server.request(
      "DELETE",
      `/secrets/${created.body.id}`,
    );
    expect(deleted.status).toBe(200);
  });
});
