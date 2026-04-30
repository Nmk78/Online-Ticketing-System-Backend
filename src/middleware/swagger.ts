import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Concert Ticketing API",
      version: "2.0.0",
      description: "Hardened ticket reservation system with concurrency controls, rate limiting, and observability",
    },
    components: {
      schemas: {
        ReservationDTO: {
          type: "object",
          properties: {
            id: { type: "integer" },
            userId: { type: "string" },
            ticketId: { type: "integer" },
            concertId: { type: "integer" },
            status: { type: "string", enum: ["PENDING", "COMPLETED", "CANCELLED"] },
            expiresAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ConcertDTO: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            venue: { type: "string" },
            date: { type: "string", format: "date-time" },
            totalStock: { type: "integer" },
            availableStock: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ErrorDTO: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" },
            ref: { type: "string", description: "Correlation ID for tracing" },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, "..", "routes", "hardenedReservations.ts")],
});

export default swaggerSpec;
