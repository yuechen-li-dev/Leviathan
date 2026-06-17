export type BookableSlot = { providerId: string; serviceId: string; resourceId: string; startsAtUtc: string; endsAtUtc: string; timeZoneId: string; displayLabel: string };
export type HoldResponse = { holdId: string; claimToken: string; expiresAt: string; status: string };
export type Booking = { id: { value: string }; status: string; customer: { name: string; email: string } };
export type SchedulingDispatch = { type: "scheduling.slot-selected"; slot: BookableSlot } | { type: "scheduling.hold-created"; hold: HoldResponse };
