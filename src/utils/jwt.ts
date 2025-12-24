import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

interface JwtPayload {
  userId: number;
  role: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export const generateToken = (
  userId: number,
  role?: string,
  email?: string,
  name?: string,
): string => {
  return jwt.sign({ userId, role, email, name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};
