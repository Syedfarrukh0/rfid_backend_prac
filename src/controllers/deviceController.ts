import { FastifyReply, FastifyRequest } from "fastify";
import { SendResponse } from "../utils/sendResponse";
import prisma from "../utils/prisma";
import { v4 as uuidv4 } from "../utils/uuid";
import crypto from "crypto";

const wifiScans = new Map<string, any[]>();
const commands = new Map<string, { type: string; payload: any }>();

async function authenticateDevice(req: FastifyRequest): Promise<string> {
  const id = req.headers["x-device-id"] as string;
  const secret = req.headers["x-device-secret"] as string;
  if (!id || !secret) throw new Error("Unauthorized");

  const device = await prisma.device.findUnique({ where: { uuid: id } });
  if (!device || device.secret !== secret) throw new Error("Unauthorized");

  return id;
}

export async function registerDevices(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { devices } = req.body as { devices: { name?: string }[] }; // Array of devices to register

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return SendResponse(reply, 400, false, "Provide at least one device");
    }

    const createdDevices = [];
    for (const dev of devices) {
      const uuid = uuidv4(); // Or use custom like "ESP-" + random
      const secret = crypto.randomBytes(16).toString("hex"); // 32-char secret

      const newDevice = await prisma.device.create({
        data: {
          uuid,
          secret,
          status: "PENDING_PROVISION",
          name: dev.name || `Device-${uuid.slice(0, 8)}`,
        },
      });

      createdDevices.push({
        uuid: newDevice.uuid,
        secret: newDevice.secret,
        name: newDevice.name,
        status: newDevice.status,
      });
    }

    return SendResponse(reply, 201, true, "Devices registered successfully", {
      devices: createdDevices,
    });
  } catch (error) {
    console.log(error);
  }
}

export async function assignDevice(req: FastifyRequest, reply: FastifyReply) {
  const { uuid, userId } = req.body as { uuid: string; userId?: number };

  if (!uuid) {
    return SendResponse(reply, 400, false, "Device UUID is required");
  }

  const currentUser = (req as any).user; // From JWT
  const targetUserId = userId || currentUser.userId; // If no userId, self-assign

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });
  if (!targetUser) {
    return SendResponse(reply, 404, false, "User not found");
  }

  // Permission check
  if (currentUser.role === "COMPANY") {
    // Company sirf khud ko assign kar sake
    if (targetUserId !== currentUser.userId) {
      return SendResponse(
        reply,
        403,
        false,
        "Companies can only assign to themselves"
      );
    }
  } else if (
    currentUser.role !== "SUPERADMIN" &&
    currentUser.role !== "ADMIN"
  ) {
    return SendResponse(reply, 403, false, "Insufficient permissions");
  }

  // Check device
  const device = await prisma.device.findUnique({ where: { uuid } });
  if (!device) {
    return SendResponse(reply, 404, false, "Device not found");
  }
  if (device.ownerId) {
    return SendResponse(
      reply,
      400,
      false,
      "Device already assigned to another user"
    );
  }

  // Assign
  await prisma.device.update({
    where: { uuid },
    data: {
      ownerId: targetUserId,
      status: "PENDING_PROVISION",
    },
  });

  return SendResponse(reply, 200, true, "Device assigned successfully", {
    uuid,
    assignedTo: targetUser.email,
  });
}

export async function getAllDevices(req: FastifyRequest, reply: FastifyReply) {
  try {
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        uuid: true,
        secret: true,
        status: true,
        name: true,
        ownerId: true,
        createdAt: true,
        owner: { select: { email: true } }, // Optional: Show bound company
      },
    });

    return SendResponse(reply, 200, true, "All devices", { devices });
  } catch (error) {
    console.log(error);
  }
}

export async function wifiScan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const deviceId = await authenticateDevice(req);
    const scanData = req.body as any[]; // Array of networks
    wifiScans.set(deviceId, scanData);
    return SendResponse(reply, 200, true, "WiFi scan received");
  } catch (err) {
    return SendResponse(reply, 401, false, "Unauthorized");
  }
}

export async function getWifiScan(req: FastifyRequest, reply: FastifyReply) {
  const { deviceId } = req.params as { deviceId: string };
  const user = (req as any).user; // From JWT
  const device = await prisma.device.findUnique({ where: { uuid: deviceId } });
  if (!device || device.ownerId !== user.userId) {
    return SendResponse(reply, 403, false, "Not authorized for this device");
  }
  const scan = wifiScans.get(deviceId) || []; // Or fetch from DB
  return SendResponse(reply, 200, true, "WiFi scan", scan);
}

export async function heartbeat(req: FastifyRequest, reply: FastifyReply) {
  try {
    const deviceId = await authenticateDevice(req);
    const { status } = req.body as { status: string };
    await prisma.device.update({
      where: { uuid: deviceId },
      data: { status, lastHeartbeat: new Date() },
    });
    console.log(`Heartbeat from ${deviceId}`);

    const command = commands.get(deviceId);
    if (command) commands.delete(deviceId);

    return SendResponse(reply, 200, true, "OK", {
      command: command?.type || null,
      payload: command?.payload || null,
    });
  } catch (err) {
    return SendResponse(reply, 401, false, "Unauthorized");
  }
}

export async function sendConnectCommand(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const { deviceId } = req.params as { deviceId: string };
  const user = (req as any).user;
  const device = await prisma.device.findUnique({ where: { uuid: deviceId } });
  if (!device || device.ownerId !== user.userId) {
    return SendResponse(reply, 403, false, "Not authorized");
  }
  const { ssid, password } = req.body as { ssid: string; password: string };
  commands.set(deviceId, {
    type: "CONNECT_WIFI",
    payload: {
      ssid,
      password,
      serverUrl: "http://brayden-nonprovident-sizeably.ngrok-free.dev",
    },
  });
  return SendResponse(reply, 200, true, "Command queued");
}

export async function getDeviceStatus(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const { deviceId } = req.params as { deviceId: string };
  const user = (req as any).user;
  const device = await prisma.device.findUnique({ where: { uuid: deviceId } });
  if (!device || device.ownerId !== user.userId) {
    return SendResponse(reply, 403, false, "Not authorized");
  }

  if (!device.lastHeartbeat) {
    return SendResponse(reply, 200, true, "Device status", {
      status: "disconnected",
    });
  }

  const threshold = 60 * 1000; // 60 seconds
  const now = new Date().getTime();
  const lastHb = new Date(device.lastHeartbeat).getTime();

  const status = now - lastHb > threshold ? "disconnected" : "connected";

  await prisma.device.update({
    where: { uuid: deviceId },
    data: { status, lastHeartbeat: new Date() },
  });

  return SendResponse(reply, 200, true, "Device status", { status });
}

// export async function rfidAttendance(req: FastifyRequest, reply: FastifyReply) {
//   try {
//     await authenticateDevice(req);

//     const { uid } = req.body as { uid: string };

//     const card = await prisma.rFIDCard.findUnique({ where: { uid } });
//     if (!card) {
//       return SendResponse(reply, 200, true, "Denied", { allowed: false });
//     }

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const existing = await prisma.attendance.findUnique({
//       where: {
//         userId_date: {
//           userId: card.userId,
//           date: today,
//         },
//       },
//     });

//     if (existing) {
//       return SendResponse(reply, 200, true, "Already marked", {
//         allowed: false,
//       });
//     }

//     const now = new Date();
//     const lateTime = new Date();
//     lateTime.setHours(9, 15, 0); // example

//     const status = now > lateTime ? "LATE" : "PRESENT";

//     await prisma.attendance.create({
//       data: {
//         userId: card.userId,
//         date: today,
//         inTime: now,
//         status,
//       },
//     });

//     return SendResponse(reply, 200, true, "Attendance marked", {
//       allowed: true,
//     });
//   } catch (err) {
//     return SendResponse(reply, 200, true, "Denied", { allowed: false });
//   }
// }

// const wifiScans = new Map<string, any[]>();
// const commands = new Map<string, any>();

// const VALID_DEVICES: any = {
//   MyDevice123: "123456789", // Add your actual deviceID:secret pairs here
// };

// function auth(req: any) {
//   const id = req.headers["x-device-id"];
//   const secret = req.headers["x-device-secret"];

//   if (!id || !secret) {
//     throw new Error("Unauthorized");
//   }

//   if (VALID_DEVICES[id] !== secret) {
//     throw new Error("Unauthorized");
//   }

//   return id;
// }

// // function auth(req: any) {
// //   const id = req.headers["x-device-id"];
// //   const secret = req.headers["x-device-secret"];

// //   if (!id || !secret) throw new Error("Unauthorized");
// //   return id;
// // }

// // ================= WIFI SCAN =================
// export async function wifiScan(req: any, reply: any) {
//   try {
//     const deviceId = auth(req);
//     wifiScans.set(deviceId, req.body);
//     reply.send({ ok: true });
//   } catch {
//     reply.status(401).send({ error: "Unauthorized" });
//   }
// }

// // ================= GET WIFI =================
// export async function getWifiScan(req: any, reply: any) {
//   const scan = wifiScans.get(req.params.deviceId);
//   reply.send(scan || []);
// }

// // ================= HEARTBEAT =================
// export async function heartbeat(req: any, reply: any) {
//   try {
//     const deviceId = req.headers["x-device-id"] || "unknown"; // Still log if present
//     const secret = req.headers["x-device-secret"] || "none";

//     console.log("Heartbeat received! Device:", deviceId, "Secret:", secret);
//     console.log("Request Body:", req.body);

//     // Check if there's a pending command for this device
//     // const command = commands.get(deviceId) || null;
//     // if (command) commands.delete(deviceId);

//     // Respond with any command or null
//     reply.send({
//       // command: command?.type || null,
//       // payload: command?.payload || null,
//       status: "ok",
//     });

//     console.log(`Heartbeat from device: ${deviceId}`);
//   } catch (err) {
//     reply.status(401).send({ error: "Unauthorized" });
//   }

//   // try {
//   //   const deviceId = auth(req);

//   //   const command = commands.get(deviceId) || null;
//   //   if (command) commands.delete(deviceId);

//   //   reply.send({
//   //     command: command?.type || null,
//   //     payload: command?.payload || null,
//   //   });
//   // } catch {
//   //   reply.status(401).send({ error: "Unauthorized" });
//   // }
// }

// // ================= SEND WIFI COMMAND =================
// export async function sendConnectCommand(req: any, reply: any) {
//   const { ssid, password } = req.body;

//   commands.set(req.params.deviceId, {
//     type: "CONNECT_WIFI",
//     payload: { ssid, password },
//   });

//   reply.send({ sent: true });
// }

// import { FastifyRequest, FastifyReply } from "fastify";
// import { SendResponse } from "../utils/sendResponse";
// import { HOST, PORT, serverAddress } from "..";

// let lastWifiScan: any[] = [];
// let lastWifiStatus: {
//   status: string;
//   ip: string;
//   mode: string;
//   timestamp: string;
// } | null = null;

// export async function reciveWifiScanData(
//   request: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     const wifiData = request.body;
//     const timestamp = new Date().toLocaleTimeString();

//     if (!Array.isArray(wifiData)) {
//       return SendResponse(reply, 400, false, "Invalid data format");
//     }

//     function getSignalStrength(rssi: any) {
//       if (rssi > -55) return "Excellent";
//       if (rssi > -65) return "Very Good";
//       if (rssi > -75) return "Good";
//       if (rssi > -85) return "Fair";
//       return "Poor";
//     }

//     function getEncryptionType(type: any) {
//       const encTypes = {
//         0: "OPEN (No Security)",
//         1: "WEP",
//         2: "WPA/PSK",
//         3: "WPA2/PSK",
//         4: "WPA/WPA2/PSK",
//         5: "WPA2 Enterprise",
//         6: "WPA3",
//         7: "WPA3 Enterprise",
//       } as any;
//       return encTypes[type] || `Unknown (${type})`;
//     }

//     // Sort by RSSI
//     wifiData.sort((a, b) => b.rssi - a.rssi);

//     const wifiScanResult = wifiData.map((wifi, index) => {
//       const signalStrength = getSignalStrength(wifi.rssi);
//       const encType = getEncryptionType(wifi.encryption);

//       return {
//         id: index + 1,
//         ssid: wifi.ssid,
//         signal: `${wifi.rssi} dBm (${signalStrength})`,
//         channel: wifi.channel,
//         security: encType,
//       };
//     });

//     lastWifiScan = wifiScanResult;

//     return SendResponse(reply, 200, true, "WiFi scan data received", {
//       status: "ok",
//       received: wifiData.length,
//       timestamp: timestamp,
//     });
//   } catch (error) {
//     console.error("Error processing WiFi scan data:", error);
//     return SendResponse(reply, 500, false, "Server error");
//   }
// }

// export async function getLastWifiScan(
//   request: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     if (!lastWifiScan) {
//       return SendResponse(
//         reply,
//         404,
//         false,
//         "No WiFi scan data available yet",
//         null
//       );
//     }

//     return SendResponse(reply, 200, true, "Latest WiFi scan", lastWifiScan);
//   } catch (error) {
//     console.log(error);
//     return SendResponse(
//       reply,
//       500,
//       false,
//       "Failed to fetch latest WiFi scan",
//       null
//     );
//   }
// }

// export async function connectWifi(
//   request: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     const { ssid, password } = request.body as any;

//     if (!ssid || !password) {
//       return reply.status(400).send({
//         success: false,
//         message: "SSID and password are required",
//       });
//     }

//     // ESP8266 AP default IP
//     const ESP_URL = "http://192.168.4.1:80/connect-wifi";

//     const controller = new AbortController();
//     setTimeout(() => controller.abort(), 4000);

//     const espResponse = await fetch(ESP_URL, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         ssid,
//         password,
//         serverUrl: `http://${HOST}:${PORT}`,
//       }),
//       signal: controller.signal,
//     });

//     if (!espResponse.ok) {
//       throw new Error("ESP returned error");
//     }

//     const espData = await espResponse.text();

//     return reply.send({
//       success: true,
//       message: "WiFi credentials sent to device",
//       deviceResponse: espData,
//     });
//   } catch (error: any) {
//     console.error("ESP connection error:", error);
//     let message = "Failed to communicate with device";
//     if (error.name === "AbortError") {
//       message = "Device not responding (timeout)";
//     }
//     SendResponse(reply, 503, false, message);
//   }
// }

// export async function wifiStatus(request: FastifyRequest, reply: FastifyReply) {
//   try {
//     console.log("\n" + "=".repeat(50));
//     console.log("📡 WiFi Status Request Received");
//     console.log("=".repeat(50));

//     // ✅ Method aur URL print karein
//     console.log(`Method: ${request.method}`);
//     console.log(`URL: ${request.url}`);

//     // ✅ Headers check karein
//     console.log("Headers:", {
//       "content-type": request.headers["content-type"],
//       "content-length": request.headers["content-length"],
//     });

//     // ✅ Body ko different ways se access karein
//     const rawBody = request.body;
//     console.log("Type of body:", typeof rawBody);
//     console.log("Raw Body:", rawBody);

//     // ✅ Agar body undefined hai toh
//     if (!rawBody) {
//       console.log("⚠️ Body is undefined! Checking raw request...");

//       // Raw request read karne ka try karein
//       const rawRequest = request.raw;
//       console.log("Raw request exists:", !!rawRequest);

//       return SendResponse(reply, 400, false, "Request body is required");
//     }

//     // ✅ String se JSON mein convert karein (agar string hai)
//     let parsedBody: any;

//     if (typeof rawBody === "string") {
//       try {
//         console.log("📝 Parsing string body to JSON...");
//         parsedBody = JSON.parse(rawBody);
//       } catch (parseError) {
//         console.log("❌ JSON parse error:", parseError);
//         return SendResponse(reply, 400, false, "Invalid JSON format");
//       }
//     } else if (typeof rawBody === "object") {
//       parsedBody = rawBody;
//     } else {
//       console.log("❌ Unknown body type:", typeof rawBody);
//       return SendResponse(reply, 400, false, "Invalid body type");
//     }

//     console.log("✅ Parsed Body:", parsedBody);

//     // ✅ Data extract karein
//     const { status, ip, mode } = parsedBody;

//     console.log("Extracted Data:", { status, ip, mode });

//     if (!status || !mode) {
//       console.log("❌ Missing required fields");
//       return SendResponse(reply, 400, false, "Status and mode are required");
//     }

//     // ✅ Save to temporary variable (like scan data)
//     lastWifiStatus = {
//       status,
//       ip,
//       mode,
//       timestamp: new Date().toISOString(),
//     };

//     console.log(
//       `✅ WiFi Status Saved & Updated: ${status} | IP: ${ip} | Mode: ${mode}`
//     );

//     return SendResponse(
//       reply,
//       200,
//       true,
//       "WiFi status received and saved successfully",
//       lastWifiStatus
//     );
//   } catch (error) {
//     console.error("🔥 Server Error:", error);
//     return SendResponse(reply, 500, false, "Internal server error");
//   }
// }

// export async function getLastWifiStatus(
//   request: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     if (!lastWifiStatus) {
//       return SendResponse(
//         reply,
//         404,
//         false,
//         "No WiFi status data available yet"
//       );
//     }

//     console.log("\n" + "=".repeat(50));
//     console.log("📡 Fetching Last WiFi Status");
//     console.log("=".repeat(50));
//     console.log("Last Status:", lastWifiStatus);

//     return SendResponse(
//       reply,
//       200,
//       true,
//       "Last WiFi status retrieved",
//       lastWifiStatus
//     );
//   } catch (error) {
//     console.error("🔥 Server Error:", error);
//     return SendResponse(reply, 500, false, "Internal server error");
//   }
// }

// export async function resyncServer(
//   request: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     const { deviceIp } = request.body as any;

//     // await fetch(`http://${deviceIp}/resync-server`, {
//     // await fetch(`http://192.168.1.5:80/resync-server`, {
//     await fetch(`http://192.168.1.100:80/resync-server`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         serverUrl: `http://${HOST}:${PORT}`,
//       }),
//     });

//     reply.send({ status: "sent" });
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function getServerIp(
//   request: FastifyRequest,
//   reply: FastifyReply
// ) {
//   try {
//     const ip =
//       request.socket.localAddress === "::1"
//         ? "127.0.0.1"
//         : request.socket.localAddress;

//     return { ip, port: PORT };
//   } catch (error) {
//     console.log(error);
//   }
// }
