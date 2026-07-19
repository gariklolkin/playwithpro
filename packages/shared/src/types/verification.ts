import type {
  BookingStatus,
  MeetingSyncStatus,
  VerificationState,
} from "../enums/verification";

/** An open slot as offered to a coach. All instants are UTC ISO strings. */
export interface VerificationSlotResponse {
  id: string;
  startsAt: string;
  endsAt: string;
}

/** The coach's active booking. */
export interface VerificationBookingResponse {
  id: string;
  startsAt: string;
  endsAt: string;
  /** Null while the calendar provider sync is still pending. */
  meetUrl: string | null;
  /** False once inside the reschedule/cancel cutoff. */
  canReschedule: boolean;
  canCancel: boolean;
}

export interface BookSlotRequest {
  slotId: string;
}

/** Admin slot list item; carries the booking coach when taken. */
export interface AdminSlotItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "booked" | "removed";
  bookedBy: { id: string; displayName: string; email: string } | null;
}

/** Concrete UTC instants; expansion from a recurring pattern happens client-side. */
export interface CreateSlotsRequest {
  slots: Array<{ startsAt: string; endsAt: string }>;
}

export interface AdminBookingItem {
  bookingId: string;
  requestId: string;
  startsAt: string;
  endsAt: string;
  bookingStatus: BookingStatus;
  requestState: VerificationState;
  syncStatus: MeetingSyncStatus;
  meetUrl: string | null;
  noShowCount: number;
  credentials: string;
  coach: { id: string; email: string; displayName: string };
}
