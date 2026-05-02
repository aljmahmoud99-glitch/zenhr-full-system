import { pgTable, serial, timestamp, integer, boolean, varchar, decimal, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { orgNodesTable } from "./org-nodes";

export const jobDescriptionsTable = pgTable("job_descriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  orgNodeId: integer("org_node_id").references(() => orgNodesTable.id),
  titleAr: varchar("title_ar", { length: 200 }).notNull(),
  titleEn: varchar("title_en", { length: 200 }).notNull(),
  grade: varchar("grade", { length: 10 }),
  minSalary: decimal("min_salary", { precision: 12, scale: 3 }),
  maxSalary: decimal("max_salary", { precision: 12, scale: 3 }),
  responsibilities: text("responsibilities"),
  requirements: text("requirements"),
  skills: text("skills"),
  qualifications: text("qualifications"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJobDescriptionSchema = createInsertSchema(jobDescriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJobDescription = z.infer<typeof insertJobDescriptionSchema>;
export type JobDescription = typeof jobDescriptionsTable.$inferSelect;
