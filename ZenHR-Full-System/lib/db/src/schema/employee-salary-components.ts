import { pgTable, serial, integer, date, decimal, timestamp } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { companiesTable } from "./companies";
import { employeeActionsTable } from "./employee-actions";

export const employeeSalaryComponentsTable = pgTable("employee_salary_components", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  basicSalary: decimal("basic_salary", { precision: 12, scale: 3 }).notNull().default("0"),
  housingAllowance: decimal("housing_allowance", { precision: 12, scale: 3 }).notNull().default("0"),
  transportAllowance: decimal("transport_allowance", { precision: 12, scale: 3 }).notNull().default("0"),
  mobileAllowance: decimal("mobile_allowance", { precision: 12, scale: 3 }).notNull().default("0"),
  mealAllowance: decimal("meal_allowance", { precision: 12, scale: 3 }).notNull().default("0"),
  otherAllowances: decimal("other_allowances", { precision: 12, scale: 3 }).notNull().default("0"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  sourceActionId: integer("source_action_id")
    .references(() => employeeActionsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeeSalaryComponent = typeof employeeSalaryComponentsTable.$inferSelect;
