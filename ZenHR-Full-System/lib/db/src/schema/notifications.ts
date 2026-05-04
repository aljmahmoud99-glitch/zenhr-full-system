import { pgTable, text, serial, timestamp, integer, boolean, varchar } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id),
  recipientUserId: integer("recipient_user_id").notNull().references(() => usersTable.id),
  actorUserId: integer("actor_user_id").references(() => usersTable.id),
  entityType: varchar("entity_type", { length: 60 }),
  entityId: integer("entity_id"),
  notificationType: varchar("notification_type", { length: 80 }).notNull(),
  titleAr: varchar("title_ar", { length: 250 }).notNull(),
  titleEn: varchar("title_en", { length: 250 }).notNull(),
  messageAr: text("message_ar").notNull(),
  messageEn: text("message_en").notNull(),
  priority: varchar("priority", { length: 10 }).default("normal").notNull(),
  status: varchar("status", { length: 10 }).default("unread").notNull(),
  actionUrl: varchar("action_url", { length: 400 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
  isDeleted: boolean("is_deleted").default(false).notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
