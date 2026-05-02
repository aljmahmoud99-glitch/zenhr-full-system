import { pgTable, serial, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nationalitiesTable = pgTable("nationalities", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  countryCode: varchar("country_code", { length: 5 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  governorate: varchar("governorate", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const banksTable = pgTable("banks", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  swiftCode: varchar("swift_code", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leaveTypesTable = pgTable("leave_types", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  color: varchar("color", { length: 30 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  employeeName: varchar("employee_name", { length: 300 }),
  companyId: integer("company_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNationalitySchema = createInsertSchema(nationalitiesTable).omit({ id: true, createdAt: true });
export const insertCitySchema = createInsertSchema(citiesTable).omit({ id: true, createdAt: true });
export const insertBankSchema = createInsertSchema(banksTable).omit({ id: true, createdAt: true });
export const insertLeaveTypeSchema = createInsertSchema(leaveTypesTable).omit({ id: true, createdAt: true });

export type Nationality = typeof nationalitiesTable.$inferSelect;
export type City = typeof citiesTable.$inferSelect;
export type Bank = typeof banksTable.$inferSelect;
export type LeaveType = typeof leaveTypesTable.$inferSelect;
export type ActivityLog = typeof activityLogsTable.$inferSelect;
