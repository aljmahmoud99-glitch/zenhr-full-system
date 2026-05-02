import { pgTable, serial, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employeesTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  email: varchar("email", { length: 150 }).notNull().unique(),
  role: varchar("role", { length: 30 }).notNull().default("employee"),
  roleId: integer("role_id"), // Phase 1: nullable FK to roles table, role string kept for backward compat
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").default(false),
  refreshToken: varchar("refresh_token", { length: 500 }),
  refreshTokenExpiry: timestamp("refresh_token_expiry", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
