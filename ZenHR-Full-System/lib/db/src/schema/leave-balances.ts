import { pgTable, serial, timestamp, integer, boolean, varchar, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { leavePoliciesTable } from "./leave-policies";

export const leaveBalancesTable = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  leavePolicyId: integer("leave_policy_id").notNull().references(() => leavePoliciesTable.id),
  year: integer("year").notNull(),
  entitledDays: decimal("entitled_days", { precision: 5, scale: 2 }).default("0").notNull(),
  usedDays: decimal("used_days", { precision: 5, scale: 2 }).default("0").notNull(),
  pendingDays: decimal("pending_days", { precision: 5, scale: 2 }).default("0").notNull(),
  carriedForwardDays: decimal("carried_forward_days", { precision: 5, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeaveBalanceSchema = createInsertSchema(leaveBalancesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;
export type LeaveBalance = typeof leaveBalancesTable.$inferSelect;
