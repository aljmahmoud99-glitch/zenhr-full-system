import { pgTable, text, serial, timestamp, integer, boolean, varchar, decimal, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { employeesTable } from "./employees";

export const assetCategoriesTable = pgTable("asset_categories", {
  id: serial("id").primaryKey(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  categoryId: integer("category_id").notNull().references(() => assetCategoriesTable.id),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  serialNumber: varchar("serial_number", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  model: varchar("model", { length: 100 }),
  brand: varchar("brand", { length: 100 }),
  supplier: varchar("supplier", { length: 200 }),
  purchaseDate: date("purchase_date"),
  purchaseValue: decimal("purchase_value", { precision: 12, scale: 3 }),
  currentStatus: varchar("current_status", { length: 20 }).default("available").notNull(),
  currentCondition: varchar("current_condition", { length: 20 }).default("good"),
  assignedToEmployeeId: integer("assigned_to_employee_id").references(() => employeesTable.id),
  assignedDate: date("assigned_date"),
  returnedDate: date("returned_date"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export const insertAssetCategorySchema = createInsertSchema(assetCategoriesTable).omit({ id: true, createdAt: true });
export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAssetCategory = z.infer<typeof insertAssetCategorySchema>;
export type AssetCategory = typeof assetCategoriesTable.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
