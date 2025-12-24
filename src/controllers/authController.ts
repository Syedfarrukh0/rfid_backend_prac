import { FastifyReply, FastifyRequest } from "fastify";
import { SendResponse } from "../utils/sendResponse";
import prisma from "../utils/prisma";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt";
import { authenticate } from "../middlewares/authMiddleware";

const SALT_ROUNDS = 10;

export async function signup(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { name, email, password, device_uuid, role } = req.body as {
      name: string;
      email: string;
      password: string;
      device_uuid?: string;
      role?: string;
    };

    if (!name || !email || !password) {
      return SendResponse(
        reply,
        400,
        false,
        "Name, email, and password are required"
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return SendResponse(reply, 409, false, "Email already registered");
    }

    let assignedRole = "COMPANY" as any;
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      assignedRole = "SUPERADMIN";
    } else if (role && ["SUPERADMIN", "ADMIN"].includes(role)) {
      let currentUser: any = null;
      try {
        await authenticate(req, reply);
        currentUser = (req as any).user;
      } catch {}
      if (currentUser?.role !== "SUPERADMIN") {
        return SendResponse(
          reply,
          403,
          false,
          "Only SUPERADMIN can create admins"
        );
      }
      assignedRole = role;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: assignedRole,
      },
    });

    // Optional: Bind device if provided
    if (device_uuid) {
      const device = await prisma.device.findUnique({
        where: { uuid: device_uuid },
      });
      if (!device) {
        return SendResponse(reply, 400, false, "Invalid device UUID");
      }
      if (device.ownerId) {
        return SendResponse(reply, 400, false, "Device already bound");
      }
      await prisma.device.update({
        where: { uuid: device_uuid },
        data: { ownerId: user.id, status: "PENDING_PROVISION" },
      });
    }

    const token = generateToken(user.id, user.role, user.email, user.name);

    return SendResponse(
      reply,
      201,
      true,
      `Signup successful as ${assignedRole}`,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      }
    );
  } catch (error) {
    console.log(error);
  }
}

export async function login(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return SendResponse(reply, 401, false, "Invalid credentials");
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return SendResponse(reply, 401, false, "Invalid credentials");
    }

    const token = generateToken(user.id, "company", email, user.name);
    return SendResponse(reply, 200, true, "Login successful", { token });
  } catch (error) {
    console.log(error);
  }
}
