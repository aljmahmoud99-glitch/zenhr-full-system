import { pgTable, serial, timestamp, integer, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { jobDescriptionsTable } from "./job-descriptions";

export const careerPathsTable = pgTable("career_paths", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  fromJobDescriptionId: integer("from_job_description_id")
    .notNull()
    .references(() => jobDescriptionsTable.id, { onDelete: "restrict" }),
  toJobDescriptionId: integer("to_job_description_id")
    .notNull()
    .references(() => jobDescriptionsTable.id, { onDelete: "restrict" }),
  minMonthsRequired: integer("min_months_required").default(12).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  uniqueFromTo: unique("career_paths_from_to_unique").on(table.fromJobDescriptionId, table.toJobDescriptionId),
}));

export const insertCareerPathSchema = createInsertSchema(careerPathsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCareerPath = z.infer<typeof insertCareerPathSchema>;
export type CareerPath = typeof careerPathsTable.$inferSelect;
