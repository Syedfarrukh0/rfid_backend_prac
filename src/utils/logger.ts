// utils/logger.ts
import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

export function logDeviceActivity(
  deviceId: string,
  action: string,
  details?: any
) {
  logger.info({
    type: "device_activity",
    deviceId,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
}
