import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type {
  CompanionProps,
  TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import { SnippetsCompanion } from "../../src/frontend/SnippetsCompanion";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const send = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => true));

vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@termix-ssh/plugin-sdk/frontend")>();
  return {
    ...actual,
    invokeAction: (id: string, ...args: unknown[]) =>
      id === "terminal.sendToSession"
        ? send(...args)
        : actual.invokeAction(id, ...args),
  };
});

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
});

const deploy = {
  id: 3,
  name: "Deploy",
  content: "deploy $HOST",
  description: null,
  folder: null,
  order: 0,
  hostFilter: null,
  isNote: false,
};

const host = {
  id: "7",
  name: "web",
  ip: "10.0.0.7",
  port: 22,
  username: "root",
  enableSsh: true,
};

// Renders the panel inside the plugin's scope through a test slot.
const withCompanion = {
  activate(app: TermixApp) {
    plugin.activate(app);
    app.registerSlotContribution("test.companion", {
      actionId: "test.companion",
      titleKey: "nav.snippets",
      kind: "component",
      component: (() => (
        <SnippetsCompanion
          {...({
            tab: { id: "tab-1", type: "terminal", label: "web", host },
            host,
            getHandle: () => null,
            side: "right",
            isVisible: true,
            close: () => {},
            setSide: () => {},
          } as unknown as CompanionProps)}
        />
      )) as never,
    });
  },
};

describe("snippets panel beside a terminal", () => {
  it("registers the panel toggle and dashboard card", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    expect(rendered.registered.actions()).toContain("snippets.togglePanel");
    expect(rendered.registered.slot("tab.menu")).toContain(
      "snippets.togglePanel",
    );
    expect(rendered.registered.dashboardCards()).toEqual(["snippets"]);
  });

  it("skips the panel on cores without companions", () => {
    const calls: string[] = [];
    const app = new Proxy(
      {},
      {
        get: (_target, key: string) => {
          if (key === "registerCompanion") return undefined;
          if (key === "hasPermission") return async () => true;
          if (key === "t") return (text: string) => text;
          return (id?: unknown) => {
            calls.push(`${key}:${typeof id === "string" ? id : ""}`);
            return () => {};
          };
        },
      },
    );
    plugin.activate(app as unknown as TermixApp);
    expect(calls).not.toContain("registerAction:snippets.togglePanel");
    expect(calls).toContain("registerDashboardCard:");
  });

  it("only offers the panel when the host did not turn it off", () => {
    expect(plugin.snippetsPanelEnabled(host)).toBe(true);
    expect(
      plugin.snippetsPanelEnabled({
        pluginSettings: { snippets: { showPanel: false } },
      }),
    ).toBe(false);
  });

  it("runs a snippet in its own terminal", async () => {
    const api = { get: vi.fn(async () => ({ data: [deploy] })) };
    rendered = await renderWithApp(withCompanion, {
      manifest,
      locales,
      api: api as never,
      permissions: ["snippets.view"],
    });
    rendered.renderSlot("test.companion");
    fireEvent.click(await screen.findByText("Deploy"));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith("tab-1", "deploy 10.0.0.7", {
        run: true,
      }),
    );
  });
});

describe("snippets dashboard card", () => {
  it("lists snippets", async () => {
    const api = { get: vi.fn(async () => ({ data: [deploy] })) };
    rendered = await renderWithApp(plugin, {
      manifest,
      locales,
      api: api as never,
      permissions: ["snippets.view"],
    });
    rendered.renderDashboardCard("snippets");
    expect(await screen.findByText("Deploy")).toBeTruthy();
  });
});
