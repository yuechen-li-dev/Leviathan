import { describe, expect, it } from "vitest";
import { joinApiUrl, resolveApiBaseUrl, setApiBaseUrlOverride } from "./apiConfig";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("API base URL config", () => {
  it("defaults to relative /api when no override exists", () => {
    const resolved = resolveApiBaseUrl(undefined, { search: "" }, storage());
    expect(resolved).toBe("/api");
    expect(joinApiUrl("/apps", resolved)).toBe("/api/apps");
  });

  it("uses the Vite environment base URL when provided", () => {
    const resolved = resolveApiBaseUrl("http://10.0.2.2:5188", { search: "" }, storage());
    expect(resolved).toBe("http://10.0.2.2:5188");
    expect(joinApiUrl("/ariadne/sessions", resolved)).toBe("http://10.0.2.2:5188/ariadne/sessions");
  });

  it("persists query-string overrides for debug APK or device runs", () => {
    const persisted = storage();
    const resolved = resolveApiBaseUrl(undefined, { search: "?apiBaseUrl=http://192.168.1.50:5188" }, persisted);
    expect(resolved).toBe("http://192.168.1.50:5188");
    expect(persisted.getItem("leviathan.apiBaseUrl")).toBe("http://192.168.1.50:5188");
  });

  it("can clear a stored override and fall back to /api", () => {
    const persisted = storage({ "leviathan.apiBaseUrl": "http://192.168.1.50:5188" });
    const resolved = resolveApiBaseUrl(undefined, { search: "?apiBaseUrl=0" }, persisted);
    expect(resolved).toBe("/api");
    expect(persisted.getItem("leviathan.apiBaseUrl")).toBeNull();
  });

  it("supports programmatic override management", () => {
    const persisted = storage();
    setApiBaseUrlOverride(persisted, "http://10.0.2.2:5188/");
    expect(persisted.getItem("leviathan.apiBaseUrl")).toBe("http://10.0.2.2:5188");
    setApiBaseUrlOverride(persisted);
    expect(persisted.getItem("leviathan.apiBaseUrl")).toBeNull();
  });
});
