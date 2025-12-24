import { FastifyInstance } from "fastify";
import {
  assignDevice,
  getAllDevices,
  getDeviceStatus,
  getWifiScan,
  heartbeat,
  registerDevices,
  sendConnectCommand,
  wifiScan,
  // wifiScan,
} from "../controllers/deviceController";
import { authenticate, authorizeRoles } from "../middlewares/authMiddleware";

export default async function deviceRoutes(app: FastifyInstance) {
  app.post(
    "/register-devices",
    { preHandler: [authenticate, authorizeRoles(["SUPERADMIN", "ADMIN"])] },
    registerDevices
  );
  app.post("/wifi-scan", wifiScan);
  app.get("/:deviceId/wifi-scan", { preHandler: [authenticate] }, getWifiScan);
  app.get(
    "/get-devices",
    { preHandler: [authenticate, authorizeRoles(["SUPERADMIN", "ADMIN"])] },
    getAllDevices
  );
  app.post("/heartbeat", heartbeat);
  app.get("/:deviceId/status", { preHandler: [authenticate] }, getDeviceStatus);
  app.post(
    "/:deviceId/connect-wifi",
    { preHandler: [authenticate] },
    sendConnectCommand
  );
  app.post("/assign-device", { preHandler: [authenticate] }, assignDevice);
}
