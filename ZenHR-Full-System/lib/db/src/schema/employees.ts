import { pgTable, text, serial, timestamp, integer, boolean, varchar, decimal, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { departmentsTable } from "./departments";
import { jobTitlesTable } from "./job-titles";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeCode: varchar("employee_code", { length: 30 }).notNull().unique(),

  // Personal info
  firstNameAr: varchar("first_name_ar", { length: 100 }).notNull(),
  middleNameAr: varchar("middle_name_ar", { length: 100 }),
  lastNameAr: varchar("last_name_ar", { length: 100 }).notNull(),
  firstNameEn: varchar("first_name_en", { length: 100 }).notNull(),
  middleNameEn: varchar("middle_name_en", { length: 100 }),
  lastNameEn: varchar("last_name_en", { length: 100 }).notNull(),

  gender: varchar("gender", { length: 10 }).notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  nationalId: varchar("national_id", { length: 20 }).unique(),
  nationality: varchar("nationality", { length: 100 }).default("أردني"),
  religion: varchar("religion", { length: 20 }),
  maritalStatus: varchar("marital_status", { length: 20 }),
  numberOfDependents: integer("number_of_dependents").default(0).notNull(),

  // Contact
  personalEmail: varchar("personal_email", { length: 150 }),
  workEmail: varchar("work_email", { length: 150 }).unique(),
  personalPhone: varchar("personal_phone", { length: 20 }),
  workPhone: varchar("work_phone", { length: 20 }),
  emergencyContactName: varchar("emergency_contact_name", { length: 200 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }),
  emergencyContactRelation: varchar("emergency_contact_relation", { length: 100 }),

  // Address
  addressAr: text("address_ar"),
  city: varchar("city", { length: 100 }),

  // Employment
  departmentId: integer("department_id").references(() => departmentsTable.id),
  orgNodeId: integer("org_node_id"), // Phase 1: nullable FK to org_nodes, alongside departmentId
  jobTitleId: integer("job_title_id").references(() => jobTitlesTable.id),
  jobDescriptionId: integer("job_description_id"), // Phase 2: nullable FK to job_descriptions; UI assignment is out of scope for this phase
  directManagerId: integer("direct_manager_id"),
  employmentType: varchar("employment_type", { length: 20 }).default("fulltime").notNull(),
  hireDate: date("hire_date").notNull(),
  probationEndDate: date("probation_end_date"),
  contractType: varchar("contract_type", { length: 20 }).default("permanent").notNull(),
  contractEndDate: date("contract_end_date"),
  employmentStatus: varchar("employment_status", { length: 20 }).default("active").notNull(),
  terminationDate: date("termination_date"),
  terminationReason: text("termination_reason"),

  // Salary
  basicSalary: decimal("basic_salary", { precision: 12, scale: 3 }).notNull(),
  housingAllowance: decimal("housing_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  transportAllowance: decimal("transport_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  mobileAllowance: decimal("mobile_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  mealAllowance: decimal("meal_allowance", { precision: 12, scale: 3 }).default("0").notNull(),
  otherAllowances: decimal("other_allowances", { precision: 12, scale: 3 }).default("0").notNull(),

  // SSC
  sscNumber: varchar("ssc_number", { length: 20 }),
  sscEnrollmentDate: date("ssc_enrollment_date"),
  isSSCExempt: boolean("is_ssc_exempt").default(false).notNull(),

  // Tax
  incomeTaxNumber: varchar("income_tax_number", { length: 30 }),
  taxExemptionAmount: decimal("tax_exemption_amount", { precision: 12, scale: 3 }).default("0"),

  // Bank
  bankName: varchar("bank_name", { length: 200 }),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  iban: varchar("iban", { length: 34 }),

  // Documents
  passportNumber: varchar("passport_number", { length: 30 }),
  passportExpiry: date("passport_expiry"),
  workPermitNumber: varchar("work_permit_number", { length: 30 }),
  workPermitExpiry: date("work_permit_expiry"),
  residencyNumber: varchar("residency_number", { length: 30 }),
  residencyExpiry: date("residency_expiry"),

  profilePhoto: varchar("profile_photo", { length: 500 }),
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
