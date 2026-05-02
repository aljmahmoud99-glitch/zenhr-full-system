import { pgTable, text, serial, timestamp, integer, boolean, varchar, decimal, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const overtimeRequestsTable = pgTable("overtime_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  date: date("date").notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  managerApprovedById: integer("manager_approved_by_id"),
  managerApprovedAt: timestamp("manager_approved_at", { withTimezone: true }),
  hrApprovedById: integer("hr_approved_by_id"),
  hrApprovedAt: timestamp("hr_approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  linkedPayslipId: integer("linked_payslip_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertOvertimeRequestSchema = createInsertSchema(overtimeRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOvertimeRequest = z.infer<typeof insertOvertimeRequestSchema>;
export type OvertimeRequest = typeof overtimeRequestsTable.$inferSelect;
