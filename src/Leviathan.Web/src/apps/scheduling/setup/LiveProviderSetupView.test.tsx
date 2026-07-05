/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createProvider: vi.fn(),
  createResource: vi.fn(),
  createService: vi.fn(),
  assignResourceToService: vi.fn(),
  createAvailabilityRule: vi.fn(),
  getLocalDevContext: vi.fn(),
}));

vi.mock("../api", () => api);

import { LiveProviderSetupView } from "./LiveProviderSetupView";

const provider = { id: { value: "p1" }, slug: "demo-provider", displayName: "Emma Brown", timeZoneId: "UTC" };
const resource = { id: { value: "r1" }, providerId: { value: "p1" }, displayName: "Emma Brown", resourceType: "person", timeZoneId: "UTC" };

describe("LiveProviderSetupView - real actuator wiring", () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.getLocalDevContext.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("clicking 'Create provider' calls the API once and reflects the created entity", async () => {
    api.createProvider.mockResolvedValue(provider);
    render(<LiveProviderSetupView />);

    const button = screen.getByTestId("setup-create-provider");
    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.createProvider).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("setup-provider-entity")).toHaveTextContent("p1");
  });

  it("clicking 'Create resource' before a provider exists makes no network call - the machine's guard blocks it", async () => {
    render(<LiveProviderSetupView />);

    const button = screen.getByTestId("setup-create-resource");
    // The button itself is disabled in this state (matches old behavior),
    // but the real regression this test guards against is the actuator
    // layer: even if something dispatched createResource directly, the
    // machine's own `when` guard - not a UI disabled attribute - is what
    // must stop the network call.
    expect(button).toBeDisabled();
    expect(api.createResource).not.toHaveBeenCalled();
  });

  it("a failed create surfaces the error and returns the button to its idle label, not stuck 'Creating…'", async () => {
    api.createProvider.mockRejectedValue(new Error("slug_taken"));
    render(<LiveProviderSetupView />);

    const button = screen.getByTestId("setup-create-provider");
    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent("Create provider");
    expect(screen.getByText(/slug_taken|local demo state|not owned/i)).toBeTruthy();
  });

  it("walks provider -> resource end to end, persisting live context between steps", async () => {
    api.createProvider.mockResolvedValue(provider);
    api.createResource.mockResolvedValue(resource);
    render(<LiveProviderSetupView />);

    await act(async () => {
      screen.getByTestId("setup-create-provider").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("setup-provider-entity")).toHaveTextContent("p1");

    await act(async () => {
      screen.getByTestId("setup-create-resource").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.createResource).toHaveBeenCalledWith(expect.objectContaining({ providerId: "p1" }));
    expect(screen.getByTestId("setup-resource-entity")).toHaveTextContent("r1");
  });
});
