import { pgTable, text, serial, timestamp, integer, boolean, varchar, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { companiesTable } from "./companies";

export const documentTypesTable = pgTable("document_types", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }),
  requiresExpiry: boolean("requires_expiry").default(false).notNull(),
  alertDaysBefore: integer("alert_days_before").default(30).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  documentTypeId: integer("document_type_id").notNull().references(() => documentTypesTable.id),
  documentNumber: varchar("document_number", { length: 100 }),
  issuedAt: date("issued_at"),
  expiresAt: date("expires_at"),
  issuedBy: varchar("issued_by", { length: 200 }),
  fileUrl: varchar("file_url", { length: 500 }),
  fileName: varchar("file_name", { length: 500 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertDocumentTypeSchema = createInsertSchema(documentTypesTable).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentType = z.infer<typeof insertDocumentTypeSchema>;
export type DocumentType = typeof documentTypesTable.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
