import { pgTable, serial, integer, date, decimal, text, timestamp } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";
import { salaryComponentsTable } from "./salary-components";

export const employeeSalaryComponentsTable = pgTable("employee_salary_components", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "restrict" }),
  salaryComponentId: integer("salary_component_id")
    .notNull()
    .references(() => salaryComponentsTable.id, { onDelete: "restrict" }),
  overrideValue: decimal("override_value", { precision: 12, scale: 3 }),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeeSalaryComponent = typeof employeeSalaryComponentsTable.$inferSelect;
export type InsertEmployeeSalaryComponent = typeof employeeSalaryComponentsTable.$inferInsert;
