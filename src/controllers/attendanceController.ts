import { FastifyReply, FastifyRequest } from "fastify";
import { SendResponse } from "../utils/sendResponse";
import prisma from "../utils/prisma";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// Helper function to validate time format
function isValidTime(timeStr: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
  return timeRegex.test(timeStr);
}

// Helper function to compare times
function compareTimes(time1: string, time2: string): number {
  const [h1, m1, s1] = time1.split(":").map(Number);
  const [h2, m2, s2] = time2.split(":").map(Number);

  const totalSeconds1 = h1 * 3600 + m1 * 60 + s1;
  const totalSeconds2 = h2 * 3600 + m2 * 60 + s2;

  return totalSeconds1 - totalSeconds2;
}

// Authenticate device
async function authenticateDevice(req: FastifyRequest): Promise<string> {
  const id = req.headers["x-device-id"] as string;
  const secret = req.headers["x-device-secret"] as string;
  if (!id || !secret) throw new Error("Unauthorized");

  const device = await prisma.device.findUnique({ where: { uuid: id } });
  if (!device || device.secret !== secret) throw new Error("Unauthorized");

  return id;
}

export async function recordAttendance(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const deviceId = await authenticateDevice(req);
    const { cardUuid, deviceUuid } = req.body as {
      cardUuid: string;
      deviceUuid: string;
      timestamp?: string;
    };

    // Find card and user
    const card = await prisma.card.findUnique({
      where: { uuid: cardUuid },
      include: { user: true },
    });

    if (!card || !card.isActive) {
      return SendResponse(reply, 403, false, "Card not registered or inactive");
    }

    const userId = card.userId;
    const now = dayjs();
    const today = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm:ss");
    const dayOfWeek = now.day(); // 0 = Sunday, 1 = Monday, etc.

    // Check if already checked in today
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        createdAt: {
          gte: dayjs().startOf("day").toDate(),
          lt: dayjs().endOf("day").toDate(),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Determine record type (IN or OUT)
    let recordType = "IN";
    let status = "PENDING";

    if (todayRecords.length > 0) {
      const lastRecord = todayRecords[0];
      recordType = lastRecord.recordType === "IN" ? "OUT" : "IN";

      // Prevent duplicate IN or OUT
      if (lastRecord.recordType === recordType) {
        return SendResponse(
          reply,
          400,
          false,
          `Already checked ${recordType.toLowerCase()} today`
        );
      }
    }

    // Get user's schedule for today
    const schedule = await prisma.attendanceSchedule.findUnique({
      where: {
        userId_dayOfWeek: {
          userId,
          dayOfWeek,
        },
      },
    });

    if (schedule) {
      if (recordType === "IN") {
        const checkInFrom = schedule.checkInFrom; // "09:00:00"
        const checkInTo = schedule.checkInTo; // "10:00:00"

        if (compareTimes(currentTime, checkInFrom) < 0) {
          status = "EARLY";
        } else if (compareTimes(currentTime, checkInTo) > 0) {
          status = "LATE";
        } else {
          status = "PRESENT";
        }
      } else if (recordType === "OUT") {
        const checkOutFrom = schedule.checkOutFrom; // "17:00:00"
        const checkOutTo = schedule.checkOutTo; // "18:00:00"

        if (compareTimes(currentTime, checkOutFrom) < 0) {
          status = "EARLY";
        } else if (compareTimes(currentTime, checkOutTo) > 0) {
          status = "LATE";
        } else {
          status = "PRESENT";
        }
      }
    }

    // Create attendance record
    const attendanceRecord = await prisma.attendanceRecord.create({
      data: {
        userId,
        cardUuid,
        deviceUuid: deviceId,
        recordType,
        status,
        timestamp: now.toDate(),
      },
    });

    return SendResponse(
      reply,
      200,
      true,
      `Checked ${recordType} successfully`,
      {
        recordType,
        status,
        timestamp: attendanceRecord.timestamp,
        user: {
          id: card.user.id,
          name: card.user.name,
          email: card.user.email,
        },
      }
    );
  } catch (err) {
    console.error("Attendance error:", err);
    return SendResponse(reply, 401, false, "Unauthorized or error occurred");
  }
}

export async function registerCard(req: FastifyRequest, reply: FastifyReply) {
  try {
    const user = (req as any).user;
    const { cardUuid } = req.body as { cardUuid: string };

    // Check if card already exists
    const existingCard = await prisma.card.findUnique({
      where: { uuid: cardUuid },
    });

    if (existingCard) {
      return SendResponse(reply, 400, false, "Card already registered");
    }

    // Register new card
    const card = await prisma.card.create({
      data: {
        uuid: cardUuid,
        userId: user.userId,
        isActive: true,
      },
      include: { user: true },
    });

    return SendResponse(reply, 201, true, "Card registered successfully", {
      card: {
        uuid: card.uuid,
        userId: card.userId,
        userEmail: card.user.email,
        createdAt: card.createdAt,
      },
    });
  } catch (error) {
    console.error("Card registration error:", error);
    return SendResponse(reply, 500, false, "Internal server error");
  }
}

export async function getUserAttendance(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { userId } = req.params as { userId: string };
    const user = (req as any).user;

    // Check authorization
    if (user.role === "COMPANY" && user.userId !== parseInt(userId)) {
      return SendResponse(reply, 403, false, "Not authorized");
    }

    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };

    const whereClause: any = {
      userId: parseInt(userId),
    };

    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: dayjs(startDate).startOf("day").toDate(),
        lte: dayjs(endDate).endOf("day").toDate(),
      };
    }

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return SendResponse(reply, 200, true, "Attendance records", { records });
  } catch (error) {
    console.error("Get attendance error:", error);
    return SendResponse(reply, 500, false, "Internal server error");
  }
}

export async function getTodayAttendance(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (req as any).user;

    const records = await prisma.attendanceRecord.findMany({
      where: {
        createdAt: {
          gte: dayjs().startOf("day").toDate(),
          lt: dayjs().endOf("day").toDate(),
        },
        ...(user.role === "COMPANY" ? { userId: user.userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return SendResponse(reply, 200, true, "Today's attendance", { records });
  } catch (error) {
    console.error("Get today attendance error:", error);
    return SendResponse(reply, 500, false, "Internal server error");
  }
}

export async function setUserSchedule(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (req as any).user;
    const { schedules } = req.body as {
      schedules: Array<{
        dayOfWeek: number;
        checkInFrom: string;
        checkInTo: string;
        checkOutFrom: string;
        checkOutTo: string;
      }>;
    };

    // Validate time formats
    for (const schedule of schedules) {
      if (
        !isValidTime(schedule.checkInFrom) ||
        !isValidTime(schedule.checkInTo) ||
        !isValidTime(schedule.checkOutFrom) ||
        !isValidTime(schedule.checkOutTo)
      ) {
        return SendResponse(
          reply,
          400,
          false,
          "Invalid time format. Use HH:MM:SS"
        );
      }
    }

    // For COMPANY users, they can only set their own schedule
    const targetUserId =
      user.role === "COMPANY"
        ? user.userId
        : (req.body as any).userId || user.userId;

    // Delete existing schedules
    await prisma.attendanceSchedule.deleteMany({
      where: { userId: targetUserId },
    });

    // Create new schedules
    const createdSchedules = [];
    for (const schedule of schedules) {
      const newSchedule = await prisma.attendanceSchedule.create({
        data: {
          userId: targetUserId,
          dayOfWeek: schedule.dayOfWeek,
          checkInFrom: schedule.checkInFrom,
          checkInTo: schedule.checkInTo,
          checkOutFrom: schedule.checkOutFrom,
          checkOutTo: schedule.checkOutTo,
        },
      });
      createdSchedules.push(newSchedule);
    }

    return SendResponse(reply, 200, true, "Schedule updated successfully", {
      schedules: createdSchedules,
    });
  } catch (error) {
    console.error("Set schedule error:", error);
    return SendResponse(reply, 500, false, "Internal server error");
  }
}

export async function getUserSchedule(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { userId } = req.params as { userId: string };
    const user = (req as any).user;

    // Check authorization
    if (user.role === "COMPANY" && user.userId !== parseInt(userId)) {
      return SendResponse(reply, 403, false, "Not authorized");
    }

    const schedules = await prisma.attendanceSchedule.findMany({
      where: { userId: parseInt(userId) },
      orderBy: { dayOfWeek: "asc" },
    });

    return SendResponse(reply, 200, true, "User schedule", { schedules });
  } catch (error) {
    console.error("Get schedule error:", error);
    return SendResponse(reply, 500, false, "Internal server error");
  }
}
