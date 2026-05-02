import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!";
const ACCESS_TOKEN_EXPIRY = "60m";
const REFRESH_TOKEN_EXPIRY = "7d";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "zenjo_salt").digest("hex");
}

export function signAccessToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function signRefreshToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AuthUser {
  userId: number;
  username: string;
  role: string;
  companyId: number;
  employeeId: number | null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
    return;
  }
  (req as Request & { user: AuthUser }).user = {
    userId: payload["userId"] as number,
    username: payload["username"] as string,
    role: payload["role"] as string,
    companyId: payload["companyId"] as number,
    employeeId: (payload["employeeId"] as number | null) ?? null,
  };
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      (req as Request & { user: AuthUser }).user = {
        userId: payload["userId"] as number,
        username: payload["username"] as string,
        role: payload["role"] as string,
        companyId: payload["companyId"] as number,
        employeeId: (payload["employeeId"] as number | null) ?? null,
      };
    }
  }
  next();
}
