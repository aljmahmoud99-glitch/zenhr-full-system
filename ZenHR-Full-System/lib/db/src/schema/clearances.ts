import { pgTable, serial, integer, varchar, text, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";
import { usersTable } from "./users";
import { resignationsTable } from "./resignations";

export const clearancesTable = pgTable("clearances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  resignationId: integer("resignation_id").references(() => resignationsTable.id),
  terminationReason: varchar("termination_reason", { length: 50 }).notNull().default("resignation"),
  clearanceStatus: varchar("clearance_status", { length: 20 }).notNull().default("pending"),
  hrNotes: text("hr_notes"),
  salary: decimal("salary", { precision: 12, scale: 3 }).notNull().default("0"),
  yearsOfService: decimal("years_of_service", { precision: 8, scale: 4 }).notNull().default("0"),
  gratuity: decimal("gratuity", { precision: 12, scale: 3 }).notNull().default("0"),
  leaveBalanceCompensation: decimal("leave_balance_compensation", { precision: 12, scale: 3 }).notNull().default("0"),
  pendingSalary: decimal("pending_salary", { precision: 12, scale: 3 }).notNull().default("0"),
  additions: decimal("additions", { precision: 12, scale: 3 }).notNull().default("0"),
  penalties: decimal("penalties", { precision: 12, scale: 3 }).notNull().default("0"),
  advances: decimal("advances", { precision: 12, scale: 3 }).notNull().default("0"),
  deductions: decimal("deductions", { precision: 12, scale: 3 }).notNull().default("0"),
  finalSettlementAmount: decimal("final_settlement_amount", { precision: 12, scale: 3 }).notNull().default("0"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id),
  completedByUserId: integer("completed_by_user_id").references(() => usersTable.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Clearance = typeof clearancesTable.$inferSelect;
