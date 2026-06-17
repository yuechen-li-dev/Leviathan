import type { BookableSlot, SchedulingDispatch } from "./types";
export const slotSelected = (slot: BookableSlot): SchedulingDispatch => ({ type: "scheduling.slot-selected", slot });
