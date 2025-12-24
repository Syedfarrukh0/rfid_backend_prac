import { FastifyInstance } from "fastify";
import { authenticate, authorizeRoles } from "../middlewares/authMiddleware";
import {
  getTodayAttendance,
  getUserAttendance,
  getUserSchedule,
  recordAttendance,
  registerCard,
  setUserSchedule,
} from "../controllers/attendanceController";

export default async function attendanceRoutes(app: FastifyInstance) {
  app.post("/record", recordAttendance);
  app.post("/register-card", { preHandler: [authenticate] }, registerCard);
  app.get("/user/:userId", { preHandler: [authenticate] }, getUserAttendance);
  app.get("/today", { preHandler: [authenticate] }, getTodayAttendance);
  app.post("/schedule", { preHandler: [authenticate] }, setUserSchedule);
  app.get("/schedule/:userId", { preHandler: [authenticate] }, getUserSchedule);
}
