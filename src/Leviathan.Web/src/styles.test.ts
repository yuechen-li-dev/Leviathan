import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("M27C style baseline", () => {
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf-8");

  it("configures the Inter font baseline", () => {
    expect(styles).toContain('@import "@fontsource/inter";');
    expect(styles).toContain("font-family: Inter, ui-sans-serif, system-ui, sans-serif;");
  });

  it("defines shadcn light and dark theme variables", () => {
    expect(styles).toContain("@custom-variant dark");
    expect(styles).toContain("--background:");
    expect(styles).toContain("--foreground:");
    expect(styles).toContain(".dark {");
  });
});
