import type { MachinaSlotProps } from "machinalayout/react";
import type { Booking, BookableSlot } from "./types";
import { slotSelected } from "./dispatch";

type SlotProps = MachinaSlotProps<unknown, { dispatch?: (event: unknown) => void }>;
export function SchedulingHomeView() {
  return <section className="panel"><h2>Scheduling</h2><p>Create providers, resources, services, availability rules, holds, and confirmed bookings through the M8 local API.</p><p><a href="/apps/scheduling/setup">Provider setup</a> · <a href="/apps/scheduling/bookings">Bookings</a></p></section>;
}
export function SlotPickerView(props: SlotProps & { slots?: BookableSlot[]; errorMessage?: string }) {
  const slots = props.slots ?? [];
  const providerTimeZone = slots[0]?.providerTimeZoneId;
  const displayTimeZone = slots[0]?.displayTimeZoneId;
  return <section className="panel"><h2>Pick a slot</h2>{props.errorMessage ? <p role="alert">{props.errorMessage}</p> : null}{providerTimeZone ? <p>Provider timezone: {providerTimeZone}</p> : null}{displayTimeZone ? <p>Shown in: {displayTimeZone}</p> : null}{slots.map((slot) => <button key={`${slot.resourceId}-${slot.startsAtUtc}`} onClick={() => props.nodeData?.dispatch?.(slotSelected(slot))}>{slot.displayLabel}<span className="sr-only"> Provider timezone {slot.providerTimeZoneId}; display timezone {slot.displayTimeZoneId}</span></button>)}</section>;
}
export function ConfirmationView({ booking }: { booking: Booking }) { return <section className="panel"><h2>Booking confirmed</h2><p>{booking.customer.name} — {booking.status}</p></section>; }
