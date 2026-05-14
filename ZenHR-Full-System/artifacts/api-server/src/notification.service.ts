/**
 * Centralized Notification Service
 * All notifications go through here. Delivery is always to concrete user IDs.
 * Role-based delivery resolves to user IDs before inserting.
 */
import { db } from "@workspace/db";
import { notificationsTable, usersTable, employeesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface NotifPayload {
  companyId?: number;
  actorUserId?: number;
  entityType?: string;
  entityId?: number;
  notificationType: string;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  priority?: "low" | "normal" | "high" | "urgent";
  actionUrl?: string;
}

/**
 * Insert one notification row per user ID.
 * Never throws — always silent-fail so it never breaks the main flow.
 */
export async function notifyUsers(userIds: number[], payload: NotifPayload): Promise<void> {
  if (!userIds.length) return;
  try {
    const deduped = [...new Set(userIds)];
    const rows = [];
    for (const recipientUserId of deduped) {
      const existing = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.recipientUserId, recipientUserId),
          eq(notificationsTable.notificationType, payload.notificationType),
          eq(notificationsTable.status, "unread"),
          eq(notificationsTable.isDeleted, false),
          payload.companyId == null ? sql`${notificationsTable.companyId} IS NULL` : eq(notificationsTable.companyId, payload.companyId),
          payload.entityType == null ? sql`${notificationsTable.entityType} IS NULL` : eq(notificationsTable.entityType, payload.entityType),
          payload.entityId == null ? sql`${notificationsTable.entityId} IS NULL` : eq(notificationsTable.entityId, payload.entityId),
        ))
        .limit(1);
      if (existing.length) continue;
      rows.push({
        companyId: payload.companyId ?? null,
        recipientUserId,
        actorUserId: payload.actorUserId ?? null,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        notificationType: payload.notificationType,
        titleAr: payload.titleAr,
        titleEn: payload.titleEn,
        messageAr: payload.messageAr,
        messageEn: payload.messageEn,
        priority: payload.priority ?? "normal",
        actionUrl: payload.actionUrl ?? null,
      });
    }
    if (rows.length) await db.insert(notificationsTable).values(rows);
  } catch (e) {
    console.error("[NotificationService.notifyUsers]", e);
  }
}

/**
 * Resolve all active users with the given role in the company, then notify each.
 */
export async function notifyRole(
  companyId: number,
  roleName: string,
  payload: NotifPayload
): Promise<void> {
  try {
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, companyId),
          eq(usersTable.role, roleName),
          eq(usersTable.isActive, true),
          eq(usersTable.isDeleted, false)
        )
      );
    await notifyUsers(
      users.map(u => u.id),
      { ...payload, companyId }
    );
  } catch (e) {
    console.error("[NotificationService.notifyRole]", e);
  }
}

/**
 * Find the direct manager's user account and notify them.
 */
export async function notifyDirectManager(
  employeeId: number,
  payload: NotifPayload
): Promise<void> {
  try {
    const [emp] = await db
      .select({ directManagerId: employeesTable.directManagerId, companyId: employeesTable.companyId })
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId));
    if (!emp?.directManagerId) return;

    const [managerUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.employeeId, emp.directManagerId),
          eq(usersTable.isActive, true),
          eq(usersTable.isDeleted, false)
        )
      );
    if (!managerUser) return;
    await notifyUsers([managerUser.id], { ...payload, companyId: emp.companyId });
  } catch (e) {
    console.error("[NotificationService.notifyDirectManager]", e);
  }
}

/**
 * Find the user account linked to an employee and notify them.
 */
export async function notifyEmployee(
  employeeId: number,
  companyId: number,
  payload: NotifPayload
): Promise<void> {
  try {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.employeeId, employeeId),
          eq(usersTable.companyId, companyId),
          eq(usersTable.isActive, true),
          eq(usersTable.isDeleted, false)
        )
      );
    if (!user) return;
    await notifyUsers([user.id], { ...payload, companyId });
  } catch (e) {
    console.error("[NotificationService.notifyEmployee]", e);
  }
}

/**
 * Format a date range as "DD/MM/YYYY – DD/MM/YYYY".
 */
export function fmtDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}
