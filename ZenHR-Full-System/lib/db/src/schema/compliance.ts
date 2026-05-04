import { pgTable, serial, integer, varchar, date, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";

export const complianceRecordsTable = pgTable("compliance_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  category: varchar("category", { length: 50 }).notNull(),
  referenceNumber: varchar("reference_number", { length: 200 }),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  issuedBy: varchar("issued_by", { length: 200 }),
  notes: text("notes"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
