import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Ticket } from "./Ticket";

export type ReservationStatus = "PENDING" | "COMPLETED" | "CANCELLED";

// Partial index on status = 'PENDING' is created in migration 1.
// This means the index only contains PENDING rows, which keeps it tiny
// and makes the cleanup cron job extremely fast — it never touches
// COMPLETED/CANCELLED rows at all.
@Entity("reservations")
export class Reservation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255 })
  userId!: string;

  @Column({ type: "int" })
  ticketId!: number;

  @OneToOne(() => Ticket, (ticket) => ticket.reservation)
  @JoinColumn({ name: "ticketId" })
  ticket!: Ticket;

  @Column({ type: "int" })
  concertId!: number;

  @Column({ type: "varchar", length: 20, default: "PENDING" })
  status!: ReservationStatus;

  @Column({ type: "datetime" })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
