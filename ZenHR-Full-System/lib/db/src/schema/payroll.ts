import { pgTable, text, serial, timestamp, integer, boolean, varchar, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";

export const payrollRunsTable = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  runMonth: integer("run_month").notNull(),
  runYear: integer("run_year").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  totalGross: decimal("total_gross", { precision: 14, scale: 3 }).default("0").notNull(),
  totalNet: decimal("total_net", { precision: 14, scale: 3 }).default("0").notNull(),
  totalDeductions: decimal("total_deductions", { precision: 14, scale: 3 }).default("0").notNull(),
  totalOvertimeEarnings: decimal("total_overtime_earnings", { precision: 14, scale: 3 }).default("0").notNull(),
  totalSscEmployee: decimal("total_ssc_employee", { precision: 14, scale: 3 }).default("0").notNull(),
  totalSscEmployer: decimal("total_ssc_employer", { precision: 14, scale: 3 }).default("0").notNull(),
  totalIncomeTax: decimal("total_income_tax", { precision: 14, scale: 3 }).default("0").notNull(),
  employeeCount: integer("employee_count").default(0).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedById: integer("approved_by_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedById: integer("published_by_id"),
  createdById: integer("created_by_id"),
  payrollPolicyId: integer("payroll_policy_id"),
  payrollPolicySnapshot: jsonb("payroll_policy_snapshot"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const payslipsTable = pgTable("payslips", {
  id: serial("id").primaryKey(),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRunsTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  runMonth: integer("run_month").notNull(),
  runYear: integer("run_year").notNull(),
  basicSalary: decimal("basic_salary", { precision: 12, scale: 3 }).notNull(),
  housingAllowance: decimal("housing_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  transportAllowance: decimal("transport_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  mobileAllowance: decimal("mobile_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  mealAllowance: decimal("meal_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  otherAllowances: decimal("other_allowances", { precision: 12, scale: 3 }).default("0").notNull(),
  overtimeEarnings: decimal("overtime_earnings", { precision: 12, scale: 3 }).default("0").notNull(),
  grossSalary: decimal("gross_salary", { precision: 12, scale: 3 }).notNull(),
  sscDeduction: decimal("ssc_deduction", { precision: 12, scale: 3 }).default("0").notNull(),
  sscEmployerContribution: decimal("ssc_employer_contribution", { precision: 12, scale: 3 }).default("0").notNull(),
  incomeTaxDeduction: decimal("income_tax_deduction", { precision: 12, scale: 3 }).default("0").notNull(),
  loanDeductions: decimal("loan_deductions", { precision: 12, scale: 3 }).default("0").notNull(),
  otherDeductions: decimal("other_deductions", { precision: 12, scale: 3 }).default("0").notNull(),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 3 }).default("0").notNull(),
  netSalary: decimal("net_salary", { precision: 12, scale: 3 }).notNull(),
  bankName: varchar("bank_name", { length: 200 }),
  iban: varchar("iban", { length: 34 }),
  advanceDeduction: decimal("advance_deduction", { precision: 12, scale: 3 }).default("0").notNull(),
  componentsSnapshot: text("components_snapshot"),
  payrollPolicySnapshot: jsonb("payroll_policy_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPayrollRunSchema = createInsertSchema(payrollRunsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPayslipSchema = createInsertSchema(payslipsTable).omit({ id: true, createdAt: true });
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRunsTable.$inferSelect;
export type InsertPayslip = z.infer<typeof insertPayslipSchema>;
export type Payslip = typeof payslipsTable.$inferSelect;
