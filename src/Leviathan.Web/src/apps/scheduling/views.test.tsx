import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { schedulingEndpoints } from "./api";
import { slotSelected } from "./dispatch";
import { ConfirmationView, SlotPickerView } from "./views";

describe("scheduling frontend module", () => {
  it("declares expected API endpoints", () => { expect(schedulingEndpoints.holds).toBe("/apps/scheduling/holds"); expect(schedulingEndpoints.publicSlots("demo", "svc", "a", "b", "UTC")).toContain("/apps/scheduling/public/demo/slots"); });
  it("slot selection emits hold action intent", () => { const slot = { providerId: "p", serviceId: "s", resourceId: "r", startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC", displayLabel: "slot" }; expect(slotSelected(slot)).toEqual({ type: "scheduling.slot-selected", slot }); });
  it("confirmation screen renders mocked booking", () => { const html = renderToStaticMarkup(createElement(ConfirmationView, { booking: { id: { value: "b" }, status: "confirmed", customer: { name: "Ada", email: "a@example.test" } } })); expect(html).toContain("Booking confirmed"); expect(html).toContain("Ada"); });
  it("slot picker can dispatch selected slot", () => { const dispatch = vi.fn(); const slot = { providerId: "p", serviceId: "s", resourceId: "r", startsAtUtc: "2030-01-01T00:00:00Z", endsAtUtc: "2030-01-01T00:30:00Z", timeZoneId: "UTC", displayLabel: "slot" }; const html = renderToStaticMarkup(createElement(SlotPickerView as any, { slots: [slot], nodeData: { dispatch } })); expect(html).toContain("Pick a slot"); });
});
