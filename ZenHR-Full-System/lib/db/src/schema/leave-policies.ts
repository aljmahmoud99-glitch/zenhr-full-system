import { pgTable, text, serial, timestamp, integer, boolean, varchar, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const leavePoliciesTable = pgTable("leave_policies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  leaveType: varchar("leave_type", { length: 30 }).notNull(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  daysPerYear: decimal("days_per_year", { precision: 5, scale: 2 }).notNull(),
  maxCarryForwardDays: decimal("max_carry_forward_days", { precision: 5, scale: 2 }).default("0").notNull(),
  minServiceMonths: integer("min_service_months").default(0).notNull(),
  requiresMedicalCertificate: boolean("requires_medical_certificate").default(false).notNull(),
  isPaid: boolean("is_paid").default(true).notNull(),
  canBeNegative: boolean("can_be_negative").default(false).notNull(),
  gender: varchar("gender", { length: 10 }).default("all").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertLeavePolicySchema = createInsertSchema(leavePoliciesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeavePolicy = z.infer<typeof insertLeavePolicySchema>;
export type LeavePolicy = typeof leavePoliciesTable.$inferSelect;
