import { pgTable, serial, integer, varchar, text, date, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const employeeActionsTable = pgTable("employee_actions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),

  actionType: varchar("action_type", { length: 50 }).notNull(),
  effectiveDate: date("effective_date").notNull(),

  performedByUserId: integer("performed_by_user_id").references(() => usersTable.id),
  performedByName: varchar("performed_by_name", { length: 200 }),

  notes: text("notes"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export type EmployeeAction = typeof employeeActionsTable.$inferSelect;
