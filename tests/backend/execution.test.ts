import { describe, expect, it } from "vitest";
import { endsWithSudoPrompt, usesSudo } from "../../src/backend/execution.js";

describe("sudo detection", () => {
  it("finds sudo as a command, not inside a word", () => {
    expect(usesSudo("sudo apt-get update")).toBe(true);
    expect(usesSudo("cd /srv && sudo systemctl restart app")).toBe(true);
    expect(usesSudo("echo hi | sudo tee /etc/motd")).toBe(true);
    expect(usesSudo("pseudocode --run")).toBe(false);
    expect(usesSudo("cat sudoers.txt")).toBe(false);
  });

  it("spots sudo's prompt at the end of the output", () => {
    expect(endsWithSudoPrompt("[sudo] password for root: ")).toBe(true);
    expect(endsWithSudoPrompt("starting\nPassword:")).toBe(true);
    expect(endsWithSudoPrompt("[sudo] password for root: \nok\n")).toBe(false);
    expect(endsWithSudoPrompt("Enter the database Password: x")).toBe(false);
  });
});
