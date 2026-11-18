import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@termix-ssh/plugin-sdk/frontend", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ExecutionResultsDialog } from "../../src/frontend/ExecutionResultsDialog";

afterEach(cleanup);

describe("ExecutionResultsDialog", () => {
  it("shows stdout and stderr of a run that wrote to both", () => {
    render(
      <ExecutionResultsDialog
        snippetName="mixed"
        results={[
          {
            hostId: 1,
            hostLabel: "web-01",
            success: true,
            output: "to stdout\n",
            error: "to stderr\n",
          },
        ]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("to stdout")).toBeTruthy();
    expect(screen.getByText("to stderr")).toBeTruthy();
  });
});
