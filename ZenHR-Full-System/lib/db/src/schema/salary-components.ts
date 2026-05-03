import { pgTable, serial, integer, varchar, decimal, boolean, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const salaryComponentsTable = pgTable("salary_components", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),

  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),

  componentType: varchar("component_type", { length: 20 }).notNull().default("earning"),
  calculationType: varchar("calculation_type", { length: 20 }).notNull().default("fixed"),

  defaultValue: decimal("default_value", { precision: 12, scale: 3 }).notNull().default("0"),
  formulaExpression: varchar("formula_expression", { length: 500 }),
  percentageBase: varchar("percentage_base", { length: 50 }),

  isTaxable: boolean("is_taxable").notNull().default(true),
  isSscApplicable: boolean("is_ssc_applicable").notNull().default(false),
  isRecurring: boolean("is_recurring").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("salary_components_code_company_uniq").on(t.code, t.companyId),
]);

export type SalaryComponent = typeof salaryComponentsTable.$inferSelect;
export type InsertSalaryComponent = typeof salaryComponentsTable.$inferInsert;
