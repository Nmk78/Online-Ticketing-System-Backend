import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
} from "typeorm";
import { Ticket } from "./Ticket";

@Entity("concerts")
export class Concert {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 255 })
  venue!: string;

  @Column({ type: "datetime" })
  date!: Date;

  @Column({ type: "int", default: 0 })
  totalStock!: number;

  @Column({ type: "int", default: 0 })
  availableStock!: number;

  @VersionColumn()
  version!: number;

  @OneToMany(() => Ticket, (ticket) => ticket.concert)
  tickets!: Ticket[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
