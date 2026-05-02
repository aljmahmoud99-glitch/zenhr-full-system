import { pgTable, text, serial, timestamp, integer, boolean, varchar, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  code: varchar("code", { length: 20 }),
  commercialRegNo: varchar("commercial_reg_no", { length: 50 }),
  taxNumber: varchar("tax_number", { length: 50 }),
  sscNumber: varchar("ssc_number", { length: 50 }),
  laborMinistryNo: varchar("labor_ministry_no", { length: 50 }),
  addressAr: text("address_ar"),
  country: varchar("country", { length: 50 }).default("Jordan"),
  city: varchar("city", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 150 }),
  website: varchar("website", { length: 200 }),
  logo: varchar("logo", { length: 500 }),
  industryType: varchar("industry_type", { length: 50 }).default("other"),
  currency: varchar("currency", { length: 10 }).default("JOD"),
  // Subscription
  planName: varchar("plan_name", { length: 50 }).default("trial"),
  subscriptionStart: date("subscription_start"),
  subscriptionEnd: date("subscription_end"),
  maxUsers: integer("max_users").default(10),
  maxEmployees: integer("max_employees").default(50),
  isTrial: boolean("is_trial").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
