import "reflect-metadata";
import { DataSource } from "typeorm";
import { Concert } from "./entities/Concert";
import { Ticket } from "./entities/Ticket";
import { Reservation } from "./entities/Reservation";

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  // synchronize: false is mandatory — schema is managed via migrations only
  synchronize: false,
  logging: ["query", "error", "migration"],
  entities: [Concert, Ticket, Reservation],
  migrations: ["src/migrations/*.ts"],
  subscribers: [],
});
