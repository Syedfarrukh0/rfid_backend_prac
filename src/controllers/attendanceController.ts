import { FastifyReply, FastifyRequest } from "fastify";
import { SendResponse } from "../utils/sendResponse";
import prisma from "../utils/prisma";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Karachi");

// future use:
// const userTimezone = card.user.timezone || "Asia/Karachi";
// const now = dayjs().tz(userTimezone);

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

// export async function recordAttendance(
//   req: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     const deviceId = await authenticateDevice(req);
//     const { cardUuid } = req.body as {
//       cardUuid: string;
//       deviceUuid: string;
//       timestamp?: string;
//     };

//     const card = await prisma.card.findUnique({
//       where: { uuid: cardUuid },
//       include: { user: true },
//     });

//     if (!card || !card.isActive) {
//       return SendResponse(reply, 403, false, "Card not registered or inactive");
//     }

//     const userId = card.userId;
//     const now = dayjs();
//     const currentTime = now.format("HH:mm:ss");
//     const todayStart = now.startOf("day").toDate();
//     const todayEnd = now.endOf("day").toDate();

//     // Day of week: dayjs (0=Sun) → DB (1=Mon, 7=Sun)
//     const dayjsDay = now.day();
//     const databaseDayOfWeek = dayjsDay === 0 ? 7 : dayjsDay;

//     // Today's records
//     const todayRecords = await prisma.attendanceRecord.findMany({
//       where: {
//         userId,
//         timestamp: {
//           gte: todayStart,
//           lt: todayEnd,
//         },
//       },
//       orderBy: { timestamp: "desc" },
//     });

//     // Get schedule
//     const schedule = await prisma.attendanceSchedule.findUnique({
//       where: {
//         userId_dayOfWeek: {
//           userId,
//           dayOfWeek: databaseDayOfWeek,
//         },
//       },
//     });

//     if (!schedule) {
//       return SendResponse(reply, 400, false, "No schedule defined for today");
//     }

//     const compareTimes = (time1: string, time2: string): number => {
//       return time1.localeCompare(time2);
//     };

//     const { checkInFrom, checkInTo, checkOutFrom, checkOutTo } = schedule;

//     // Determine record type
//     let recordType: "IN" | "OUT" = "IN";
//     let status = "PRESENT";

//     if (todayRecords.length > 0) {
//       const lastRecord = todayRecords[0];
//       recordType = lastRecord.recordType === "IN" ? "OUT" : "IN";
//     }

//     // ============= CHECK-IN LOGIC =============
//     if (recordType === "IN") {
//       // 1. Too early: more than 1 hour before checkInFrom → DENIED
//       const oneHourBeforeCheckIn = dayjs()
//         .hour(parseInt(checkInFrom.split(":")[0]))
//         .minute(parseInt(checkInFrom.split(":")[1]))
//         .second(parseInt(checkInFrom.split(":")[2]))
//         .subtract(1, "hour")
//         .format("HH:mm:ss");

//       if (compareTimes(currentTime, oneHourBeforeCheckIn) < 0) {
//         return SendResponse(
//           reply,
//           400,
//           false,
//           "Too early for check-in. Allowed only 1 hour before scheduled time."
//         );
//       }

//       // 2. Status determination (ab yeh accept hoga har haal mein, sirf status change hoga)
//       if (compareTimes(currentTime, checkInFrom) < 0) {
//         status = "EARLY";
//       } else if (compareTimes(currentTime, checkInTo) <= 0) {
//         status = "PRESENT";
//       } else {
//         status = "LATE"; // checkInTo ke baad bhi accept, lekin LATE
//       }

//       // Prevent duplicate IN within 5 minutes
//       if (todayRecords.length > 0 && todayRecords[0].recordType === "IN") {
//         const lastInTime = dayjs(todayRecords[0].timestamp);
//         if (now.diff(lastInTime, "minute") < 5) {
//           return SendResponse(
//             reply,
//             400,
//             false,
//             "Already checked IN recently. Please wait."
//           );
//         }
//       }
//     }

//     // ============= CHECK-OUT LOGIC (unchanged - bilkul sahi tha) =============
//     else if (recordType === "OUT") {
//       // Must have checked IN today
//       const hasCheckInToday = todayRecords.some((r) => r.recordType === "IN");
//       if (!hasCheckInToday) {
//         return SendResponse(
//           reply,
//           400,
//           false,
//           "Cannot check out without checking in first."
//         );
//       }

//       // Too early for checkout
//       if (compareTimes(currentTime, checkOutFrom) < 0) {
//         return SendResponse(
//           reply,
//           400,
//           false,
//           "Too early for check-out. Wait until scheduled check-out time."
//         );
//       }

//       // Max 11 hours after checkOutFrom
//       const maxCheckoutTime = dayjs()
//         .hour(parseInt(checkOutFrom.split(":")[0]))
//         .minute(parseInt(checkOutFrom.split(":")[1]))
//         .second(parseInt(checkOutFrom.split(":")[2]))
//         .add(11, "hour")
//         .format("HH:mm:ss");

//       if (compareTimes(currentTime, maxCheckoutTime) > 0) {
//         return SendResponse(
//           reply,
//           400,
//           false,
//           "Check-out window closed (max 11 hours after scheduled time)."
//         );
//       }

//       // Status for checkout
//       if (compareTimes(currentTime, checkOutTo) <= 0) {
//         status = "PRESENT"; // Fixed/on-time departure
//       } else {
//         status = "LATE"; // Extra time → LATE (jaise tumne kaha)
//       }

//       // Multiple OUT allowed → latest record final hoga
//     }

//     // Create record
//     const attendanceRecord = await prisma.attendanceRecord.create({
//       data: {
//         userId,
//         cardUuid,
//         deviceUuid: deviceId,
//         recordType,
//         status,
//         timestamp: now.toDate(),
//       },
//     });

//     return SendResponse(
//       reply,
//       200,
//       true,
//       `Checked ${recordType} successfully (${status})`,
//       {
//         recordType,
//         status,
//         timestamp: attendanceRecord.timestamp,
//         user: {
//           id: card.user.id,
//           name: card.user.name,
//           email: card.user.email,
//         },
//       }
//     );
//   } catch (err) {
//     console.error("Attendance error:", err);
//     return SendResponse(reply, 500, false, "Internal server error");
//   }
// }
export async function recordAttendance(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const deviceId = await authenticateDevice(req);
    const { cardUuid } = req.body as {
      cardUuid: string;
      deviceUuid: string;
    };

    const card = await prisma.card.findUnique({
      where: { uuid: cardUuid },
      include: { user: true },
    });

    if (!card || !card.isActive) {
      return SendResponse(reply, 403, false, "Card not registered or inactive");
    }

    const userId = card.userId;
    const now = dayjs().tz("Asia/Karachi"); // Fixed for now
    // const now = dayjs(); // Fixed for now
    const currentTime = now.format("HH:mm:ss");

    const todayStart = now.startOf("day").toDate();
    const todayEnd = now.endOf("day").toDate();

    const dayjsDay = now.day();
    const databaseDayOfWeek = dayjsDay === 0 ? 7 : dayjsDay;

    // Today's records only
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        timestamp: { gte: todayStart, lt: todayEnd },
      },
      orderBy: { timestamp: "asc" }, // chronological
    });

    const schedule = await prisma.attendanceSchedule.findUnique({
      where: {
        userId_dayOfWeek: { userId, dayOfWeek: databaseDayOfWeek },
      },
    });

    if (!schedule) {
      return SendResponse(reply, 400, false, "No schedule defined for today");
    }

    const compareTimes = (t1: string, t2: string) => t1.localeCompare(t2);

    const { checkInFrom, checkInTo, checkOutFrom } = schedule;

    // === DECIDE RECORD TYPE STRICTLY BASED ON TODAY'S RECORDS ===
    const hasInToday = todayRecords.some((r) => r.recordType === "IN");
    const hasOutToday = todayRecords.some((r) => r.recordType === "OUT");

    let recordType: "IN" | "OUT";
    let status = "PRESENT";

    if (hasInToday && hasOutToday) {
      // Already full day complete → only allow latest OUT update
      recordType = "OUT";
    } else if (hasInToday) {
      // IN done, no OUT → must be OUT
      recordType = "OUT";
    } else {
      // No IN today → must be IN
      recordType = "IN";
    }

    // ============= CHECK-IN LOGIC =============
    if (recordType === "IN") {
      // Too early: more than 1 hour before checkInFrom
      const oneHourBefore = dayjs()
        .hour(parseInt(checkInFrom.split(":")[0]))
        .minute(parseInt(checkInFrom.split(":")[1]))
        .second(0)
        .subtract(1, "hour")
        .format("HH:mm:ss");

      if (compareTimes(currentTime, oneHourBefore) < 0) {
        return SendResponse(
          reply,
          400,
          false,
          "Too early for check-in (more than 1 hour before)."
        );
      }

      // Status
      if (compareTimes(currentTime, checkInFrom) < 0) status = "EARLY";
      else if (compareTimes(currentTime, checkInTo) <= 0) status = "PRESENT";
      else status = "LATE";

      // Prevent duplicate IN within 5 min
      const lastIn = todayRecords.findLast((r) => r.recordType === "IN");
      if (lastIn && now.diff(dayjs(lastIn.timestamp), "minute") < 5) {
        return SendResponse(reply, 400, false, "Already checked IN recently.");
      }
    }

    // ============= CHECK-OUT LOGIC =============
    else if (recordType === "OUT") {
      if (!hasInToday) {
        return SendResponse(
          reply,
          400,
          false,
          "Cannot check out without checking in today."
        );
      }

      if (compareTimes(currentTime, checkOutFrom) < 0) {
        return SendResponse(reply, 400, false, "Too early for check-out.");
      }

      const maxTime = dayjs()
        .hour(parseInt(checkOutFrom.split(":")[0]))
        .minute(parseInt(checkOutFrom.split(":")[1]))
        .second(0)
        .add(11, "hour")
        .format("HH:mm:ss");

      if (compareTimes(currentTime, maxTime) > 0) {
        return SendResponse(
          reply,
          400,
          false,
          "Check-out window closed (11 hours exceeded)."
        );
      }

      // Status
      const checkOutTo = schedule.checkOutTo;
      if (compareTimes(currentTime, checkOutTo) <= 0) {
        status = "PRESENT";
      } else {
        status = "LATE"; // extra time
      }
    }

    // Create record
    const record = await prisma.attendanceRecord.create({
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
      `Checked ${recordType} successfully (${status})`,
      {
        recordType,
        status,
        timestamp: record.timestamp,
        user: {
          id: card.user.id,
          name: card.user.name,
          email: card.user.email,
        },
      }
    );
  } catch (err) {
    console.error("Attendance error:", err);
    return SendResponse(reply, 500, false, "Internal server error");
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

// export async function setUserSchedule(
//   req: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     const user = (req as any).user;
//     const { schedules } = req.body as {
//       schedules: Array<{
//         dayOfWeek: number;
//         checkInFrom: string;
//         checkInTo: string;
//         checkOutFrom: string;
//         checkOutTo: string;
//       }>;
//     };

//     // Validate time formats
//     for (const schedule of schedules) {
//       if (
//         !isValidTime(schedule.checkInFrom) ||
//         !isValidTime(schedule.checkInTo) ||
//         !isValidTime(schedule.checkOutFrom) ||
//         !isValidTime(schedule.checkOutTo)
//       ) {
//         return SendResponse(
//           reply,
//           400,
//           false,
//           "Invalid time format. Use HH:MM:SS"
//         );
//       }
//     }

//     // For COMPANY users, they can only set their own schedule
//     const targetUserId =
//       user.role === "COMPANY"
//         ? user.userId
//         : (req.body as any).userId || user.userId;

//     // Delete existing schedules
//     await prisma.attendanceSchedule.deleteMany({
//       where: { userId: targetUserId },
//     });

//     // Create new schedules
//     const createdSchedules = [];
//     for (const schedule of schedules) {
//       const newSchedule = await prisma.attendanceSchedule.create({
//         data: {
//           userId: targetUserId,
//           dayOfWeek: schedule.dayOfWeek,
//           checkInFrom: schedule.checkInFrom,
//           checkInTo: schedule.checkInTo,
//           checkOutFrom: schedule.checkOutFrom,
//           checkOutTo: schedule.checkOutTo,
//         },
//       });
//       createdSchedules.push(newSchedule);
//     }

//     return SendResponse(reply, 200, true, "Schedule updated successfully", {
//       schedules: createdSchedules,
//     });
//   } catch (error) {
//     console.error("Set schedule error:", error);
//     return SendResponse(reply, 500, false, "Internal server error");
//   }
// }
export async function setUserSchedule(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (req as any).user;
    const { schedules } = req.body as {
      schedules: Array<{
        dayOfWeek: number;
        checkInFrom: string; // Now expected as "HH:MM:SS AM/PM"
        checkInTo: string; // Now expected as "HH:MM:SS AM/PM"
        checkOutFrom: string; // Now expected as "HH:MM:SS AM/PM"
        checkOutTo: string; // Now expected as "HH:MM:SS AM/PM"
      }>;
    };

    // Function to validate 12-hour time format with AM/PM
    function isValid12HourTime(timeStr: string): boolean {
      const regex = /^((1[0-2]|0?[1-9]):([0-5][0-9]):([0-5][0-9]) (AM|PM))$/i;
      return regex.test(timeStr);
    }

    // Function to convert 12-hour time with AM/PM to 24-hour "HH:MM:SS"
    function convertTo24Hour(timeStr: string): string {
      const [time, modifier] = timeStr.split(" ");
      let [hours, minutes, seconds] = time
        .split(":")
        .map((str) => parseInt(str, 10));

      if (hours === 12) {
        hours = 0;
      }
      if (modifier.toUpperCase() === "PM") {
        hours += 12;
      }

      const formattedHours = hours.toString().padStart(2, "0");
      const formattedMinutes = minutes.toString().padStart(2, "0");
      const formattedSeconds = seconds.toString().padStart(2, "0");

      return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
    }

    // Validate time formats (now in 12-hour with AM/PM)
    for (const schedule of schedules) {
      if (
        !isValid12HourTime(schedule.checkInFrom) ||
        !isValid12HourTime(schedule.checkInTo) ||
        !isValid12HourTime(schedule.checkOutFrom) ||
        !isValid12HourTime(schedule.checkOutTo)
      ) {
        return SendResponse(
          reply,
          400,
          false,
          "Invalid time format. Use HH:MM:SS AM/PM (e.g., 09:00:00 AM)"
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

    // Create new schedules (convert times to 24-hour format for storage)
    const createdSchedules = [];
    for (const schedule of schedules) {
      const newSchedule = await prisma.attendanceSchedule.create({
        data: {
          userId: targetUserId,
          dayOfWeek: schedule.dayOfWeek,
          checkInFrom: convertTo24Hour(schedule.checkInFrom),
          checkInTo: convertTo24Hour(schedule.checkInTo),
          checkOutFrom: convertTo24Hour(schedule.checkOutFrom),
          checkOutTo: convertTo24Hour(schedule.checkOutTo),
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
