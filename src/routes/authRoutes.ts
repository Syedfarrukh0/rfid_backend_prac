import { FastifyInstance } from "fastify";
import { login, signup } from "../controllers/authController";

export default async function authRoutes(app: FastifyInstance) {
  app.post("/signup", signup);
  app.post("/login", login);
}
