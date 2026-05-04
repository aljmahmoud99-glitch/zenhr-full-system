import { pgTable, serial, integer, varchar, date, text, boolean, timestamp, decimal } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

export const resignationsTable = pgTable("resignations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  resignationDate: date("resignation_date").notNull(),
  lastWorkingDay: date("last_working_day"),
  noticePeriodDays: integer("notice_period_days").notNull().default(30),
  noticeTimerStart: date("notice_timer_start"),
  noticeTimerEnd: date("notice_timer_end"),
  reason: text("reason"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  currentApprovalStep: integer("current_approval_step").default(1),
  leavingReason: text("leaving_reason"),
  companyFeedback: text("company_feedback"),
  interviewDate: date("interview_date"),
  remainingSalary: decimal("remaining_salary", { precision: 12, scale: 3 }).default("0"),
  leavePayout: decimal("leave_payout", { precision: 12, scale: 3 }).default("0"),
  eosbAmount: decimal("eosb_amount", { precision: 12, scale: 3 }).default("0"),
  noticeCompensation: decimal("notice_compensation", { precision: 12, scale: 3 }).default("0"),
  otherDeductions: decimal("other_deductions", { precision: 12, scale: 3 }).default("0"),
  settlementNotes: text("settlement_notes"),
  clearanceItemsJson: text("clearance_items_json").default("[]"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resignationApprovalsTable = pgTable("resignation_approvals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  resignationId: integer("resignation_id").notNull().references(() => resignationsTable.id),
  approvalStep: integer("approval_step").notNull(),
  stepLabel: varchar("step_label", { length: 200 }),
  approverRole: varchar("approver_role", { length: 50 }),
  approverUserId: integer("approver_user_id").references(() => usersTable.id),
  decision: varchar("decision", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
