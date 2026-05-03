import { pgTable, serial, integer, varchar, decimal, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const salaryComponentDefinitionsTable = pgTable("salary_component_definitions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),

  componentKey: varchar("component_key", { length: 50 }).notNull(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),

  componentType: varchar("component_type", { length: 20 }).notNull().default("fixed"),
  percentage: decimal("percentage", { precision: 8, scale: 4 }),
  baseRef: varchar("base_ref", { length: 50 }),
  formulaExpr: text("formula_expr"),

  isBasic: boolean("is_basic").notNull().default(false),
  isInsurable: boolean("is_insurable").notNull().default(true),
  isTaxable: boolean("is_taxable").notNull().default(true),
  isDeduction: boolean("is_deduction").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalaryComponentDefinition = typeof salaryComponentDefinitionsTable.$inferSelect;
export type InsertSalaryComponentDefinition = typeof salaryComponentDefinitionsTable.$inferInsert;
