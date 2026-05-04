import { pgTable, serial, integer, varchar, date, text, boolean, timestamp, decimal } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

export const violationTypesTable = pgTable("violation_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  code: varchar("code", { length: 50 }).notNull(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }),
  availablePenaltiesJson: text("available_penalties_json"),
  isActive: boolean("is_active").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const disciplinaryCasesTable = pgTable("disciplinary_cases", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  violationTypeId: integer("violation_type_id").notNull().references(() => violationTypesTable.id),
  violationDate: date("violation_date").notNull(),
  violationDescription: text("violation_description"),
  penaltyType: varchar("penalty_type", { length: 50 }).notNull().default("warning_verbal"),
  penaltyDays: integer("penalty_days").default(0),
  salaryDeductionAmount: decimal("salary_deduction_amount", { precision: 12, scale: 3 }).default("0"),
  actionDeadline: date("action_deadline"),
  issuedDate: date("issued_date"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  employeeAcknowledgment: boolean("employee_acknowledgment").notNull().default(false),
  previousViolationsCount: integer("previous_violations_count").notNull().default(0),
  decisionDate: date("decision_date"),
  notes: text("notes"),
  reportedBy: varchar("reported_by", { length: 200 }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const disciplinaryInvestigationsTable = pgTable("disciplinary_investigations", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => disciplinaryCasesTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  hrNotes: text("hr_notes"),
  employeeStatement: text("employee_statement"),
  managerStatement: text("manager_statement"),
  investigationDate: date("investigation_date"),
  outcome: varchar("outcome", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
