import { pgTable, serial, integer, varchar, text, date, timestamp } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const EMPLOYEE_ACTION_TYPES = [
  "hire",
  "probation_start",
  "probation_complete",
  "probation_fail",
  "transfer",
  "promotion",
  "demotion",
  "salary_change",
  "suspension",
  "suspension_lift",
  "termination",
  "resignation",
  "leave_of_absence",
  "return_from_leave",
  "warning_issued",
  "document_expired",
  "contract_renewal",
] as const;

export type EmployeeActionType = typeof EMPLOYEE_ACTION_TYPES[number];

export const employeeActionsTable = pgTable("employee_actions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "restrict" }),

  actionType: varchar("action_type", { length: 50 }).notNull(),
  effectiveDate: date("effective_date").notNull(),

  createdByUserId: integer("created_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),

  previousValueJson: text("previous_value_json"),
  newValueJson: text("new_value_json"),

  notes: text("notes"),
  status: varchar("status", { length: 30 }).notNull().default("applied"),
  approvalStepsJson: text("approval_steps_json"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeeAction = typeof employeeActionsTable.$inferSelect;
