import { pgTable, serial, integer, varchar, text, boolean, timestamp, date, numeric, bigint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { documentsTable } from "./documents";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

const auditFields = {
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").notNull().default(false),
};

export const contractTypesTable = pgTable("contract_types", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  code: varchar("code", { length: 80 }).notNull(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  defaultDurationMonths: integer("default_duration_months"),
  defaultProbationDays: integer("default_probation_days").default(90),
  renewalNoticeDays: integer("renewal_notice_days").default(30),
  requiresAttachment: boolean("requires_attachment").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  ...auditFields,
});

export const employeeContractsTable = pgTable("employee_contracts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  contractTypeId: integer("contract_type_id").notNull().references(() => contractTypesTable.id),
  contractNumber: varchar("contract_number", { length: 120 }),
  titleAr: varchar("title_ar", { length: 250 }).notNull(),
  titleEn: varchar("title_en", { length: 250 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  probationEndDate: date("probation_end_date"),
  renewalNoticeDate: date("renewal_notice_date"),
  renewalStatus: varchar("renewal_status", { length: 40 }).notNull().default("not_required"),
  contractStatus: varchar("contract_status", { length: 40 }).notNull().default("active"),
  complianceStatus: varchar("compliance_status", { length: 40 }).notNull().default("pending_review"),
  autoRenewal: boolean("auto_renewal").notNull().default(false),
  salaryAmount: numeric("salary_amount", { precision: 12, scale: 3 }),
  currency: varchar("currency", { length: 10 }).notNull().default("JOD"),
  notesAr: text("notes_ar"),
  notesEn: text("notes_en"),
  ...auditFields,
});

export const contractRequiredDocumentsTable = pgTable("contract_required_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  contractTypeId: integer("contract_type_id").references(() => contractTypesTable.id),
  contractId: integer("contract_id").references(() => employeeContractsTable.id),
  documentCode: varchar("document_code", { length: 80 }).notNull(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  isMandatory: boolean("is_mandatory").notNull().default(true),
  expires: boolean("expires").notNull().default(false),
  warningDays: integer("warning_days").default(30),
  ...auditFields,
});

export const contractAttachmentsTable = pgTable("contract_attachments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  contractId: integer("contract_id").notNull().references(() => employeeContractsTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  documentId: integer("document_id").references(() => documentsTable.id),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 800 }),
  mimeType: varchar("mime_type", { length: 150 }),
  fileSize: bigint("file_size", { mode: "number" }),
  attachmentType: varchar("attachment_type", { length: 80 }).notNull().default("contract"),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  notesAr: text("notes_ar"),
  notesEn: text("notes_en"),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

export const contractAuditLogsTable = pgTable("contract_audit_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  contractId: integer("contract_id").references(() => employeeContractsTable.id),
  employeeId: integer("employee_id").references(() => employeesTable.id),
  action: varchar("action", { length: 80 }).notNull(),
  previousValues: jsonb("previous_values"),
  newValues: jsonb("new_values"),
  changedBy: integer("changed_by").references(() => usersTable.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

export const insertContractTypeSchema = createInsertSchema(contractTypesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmployeeContractSchema = createInsertSchema(employeeContractsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type ContractType = typeof contractTypesTable.$inferSelect;
export type InsertContractType = z.infer<typeof insertContractTypeSchema>;
export type EmployeeContract = typeof employeeContractsTable.$inferSelect;
export type InsertEmployeeContract = z.infer<typeof insertEmployeeContractSchema>;
