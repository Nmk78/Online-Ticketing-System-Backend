import { z } from "zod";

const dateField = z.coerce.string();

export const ticketDTOSchema = z.object({
  id: z.number(),
  concertId: z.number(),
  category: z.string(),
  price: z.coerce.number(),
  status: z.string(),
  createdAt: dateField,
  updatedAt: dateField,
});

export const reservationDTOSchema = z.object({
  id: z.number(),
  userId: z.string(),
  ticketId: z.number(),
  concertId: z.number(),
  status: z.string(),
  expiresAt: dateField,
  createdAt: dateField,
  updatedAt: dateField,
});

export const concertDTOSchema = z.object({
  id: z.number(),
  name: z.string(),
  venue: z.string(),
  date: dateField,
  totalStock: z.number(),
  availableStock: z.number(),
  createdAt: dateField,
  updatedAt: dateField,
});

export function serializeTicket(data: unknown) {
  const raw = data as Record<string, unknown>;
  const { version, internal_note, ...safe } = raw;
  return ticketDTOSchema.parse(safe);
}

export function serializeReservation(data: unknown) {
  const raw = data as Record<string, unknown>;
  const { internal_note, ...safe } = raw;
  return reservationDTOSchema.parse(safe);
}

export function serializeConcert(data: unknown) {
  const raw = data as Record<string, unknown>;
  const { internal_note, ...safe } = raw;
  return concertDTOSchema.parse(safe);
}

export function serializeList<T>(
  items: unknown[],
  serializer: (item: unknown) => T
): T[] {
  return items.map(serializer);
}
