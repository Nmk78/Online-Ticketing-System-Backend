import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Concert } from "./Concert";
import { Reservation } from "./Reservation";

export type TicketCategory = "VIP" | "General";

// B-Tree index on concertId for fast lookups by concert (added in migration 1)
// The @Index decorator here is for documentation/reference; the actual index
// is created in the migration file to comply with synchronize: false.
@Entity("tickets")
@Index("IDX_ticket_concertId", ["concertId"])
export class Ticket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int" })
  concertId!: number;

  @ManyToOne(() => Concert, (concert) => concert.tickets)
  @JoinColumn({ name: "concertId" })
  concert!: Concert;

  @Column({ type: "varchar", length: 10, default: "General" })
  category!: TicketCategory; // Added via migration 2

  @Column({ type: "decimal", precision: 10, scale: 2 })
  price!: number;

  @Column({ type: "varchar", length: 10, default: "AVAILABLE" })
  status!: string; // AVAILABLE | RESERVED | SOLD

  @OneToOne(() => Reservation, (reservation) => reservation.ticket, {
    nullable: true,
  })
  reservation!: Reservation | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
