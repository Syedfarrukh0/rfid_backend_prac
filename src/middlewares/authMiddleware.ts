import { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "../utils/jwt";
import { SendResponse } from "../utils/sendResponse";

interface JwtPayload {
  userId: number;
  role: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return SendResponse(
        reply,
        401,
        false,
        "Access Denied: No token provided"
      );
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    const decoded = verifyToken(token) as JwtPayload;
    // Attach user info to request object for later handlers
    (request as any).user = decoded;
  } catch (err) {
    return SendResponse(reply, 401, false, "Invalid Token");
  }
}

export function authorizeRoles(allowedRoles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user as JwtPayload | undefined;

    if (!user || !allowedRoles.includes(user.role)) {
      return SendResponse(
        reply,
        403,
        false,
        "Access Forbidden: insufficient permissions"
      );
    }
  };
}
