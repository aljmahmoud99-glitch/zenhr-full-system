import { pgTable, serial, integer, numeric, text, date, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const salaryAdvancesTable = pgTable("salary_advances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  requestedAmount: numeric("requested_amount", { precision: 12, scale: 3 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 12, scale: 3 }),
  reason: text("reason").notNull(),
  requestDate: date("request_date").notNull().default("now()"),
  repaymentMethod: varchar("repayment_method", { length: 20 }).notNull().default("monthly"),
  repaymentPlan: text("repayment_plan"),
  remainingBalance: numeric("remaining_balance", { precision: 12, scale: 3 }).notNull().default("0"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  requestNotes: text("request_notes"),
  decisionNotes: text("decision_notes"),
  rejectionReason: text("rejection_reason"),
  approvedById: integer("approved_by_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedById: integer("rejected_by_id").references(() => usersTable.id),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalaryAdvance = typeof salaryAdvancesTable.$inferSelect;
