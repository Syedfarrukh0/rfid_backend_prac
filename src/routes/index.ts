import { FastifyInstance } from "fastify";
import deviceRoutes from "./deviceRoutes";
import authRoutes from "./authRoutes";
import attendanceRoutes from "./attendanceRoutes";

export default function registerRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    reply.send({ message: "RFID server is running!" });
  });
  app.register(authRoutes, { prefix: "/api/v1/auth" });
  app.register(deviceRoutes, { prefix: "/api/v1/device" });
  app.register(attendanceRoutes, { prefix: "/api/v1/attendance" });
}

// app.get("/protected", { preHandler: authMiddleware }, (req, reply) => {
//   reply.send({ message: `Welcome, user ${req.user?.userId}!` });
// });
