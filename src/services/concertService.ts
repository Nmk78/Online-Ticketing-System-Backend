import { AppDataSource } from "../data-source";
import { Concert } from "../entities/Concert";

export const getConcerts = async () => {
  const concertRepository = AppDataSource.getRepository(Concert);

  /**
   * Fetch every concert with its current availableStock.
   * The availableStock column is kept in sync by the reservation and
   * purchase flows (decremented on reserve, incremented on cleanup/expiry).
   */
  return concertRepository.find({
    order: { date: "ASC" },
  });
};
