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
  it.each([
    "[sudo: authenticate] Password: ",
    "starting\r\n[sudo: authenticate] Password:",
    "[sudo] Passwort für alice: ",
    "[sudo] Mot de passe de alice : ",
  ])("recognizes the sudo prompt %j", (prompt) => {
    expect(endsWithSudoPrompt(prompt)).toBe(true);
    expect(endsWithSudoPrompt(prompt + "\ncommand complete\n")).toBe(false);
  });

  it.each([
    "Database Password: ",
    "[sudo: authenticate] starting:",
    "[sudo] running command:",
  ])("does not treat ordinary output as a password prompt: %j", (output) => {
    expect(endsWithSudoPrompt(output)).toBe(false);
  });
});
