import { z } from "zod";

export const reserveSchema = z
  .object({
    userId: z.string().min(1).max(255),
    concertId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(5).default(1),
  })
  .strict();

export const purchaseSchema = z
  .object({
    reservationId: z.number().int().positive(),
    userId: z.string().min(1).max(255),
  })
  .strict();

export const ticketsSchema = z
  .object({
    userId: z.string().min(1).max(255),
    quantity: z.number().int().min(1).max(5),
  })
  .strict();
