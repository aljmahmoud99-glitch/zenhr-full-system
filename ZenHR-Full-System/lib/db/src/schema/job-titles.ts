import { pgTable, serial, timestamp, integer, boolean, varchar, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const jobTitlesTable = pgTable("job_titles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  titleAr: varchar("title_ar", { length: 200 }).notNull(),
  titleEn: varchar("title_en", { length: 200 }).notNull(),
  jobGrade: varchar("job_grade", { length: 10 }),
  minSalary: decimal("min_salary", { precision: 12, scale: 3 }),
  maxSalary: decimal("max_salary", { precision: 12, scale: 3 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertJobTitleSchema = createInsertSchema(jobTitlesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobTitle = z.infer<typeof insertJobTitleSchema>;
export type JobTitle = typeof jobTitlesTable.$inferSelect;
