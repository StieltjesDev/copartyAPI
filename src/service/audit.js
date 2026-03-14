import { AuditLog } from "../models/AuditLog.js";

export async function writeAuditLog({
  actorUserId = null,
  requestId = null,
  action,
  entityType,
  entityId,
  before = null,
  after = null,
  metadata = {},
}) {
  const entry = await AuditLog.create({
    actorUserId,
    requestId,
    action,
    entityType,
    entityId: String(entityId),
    before,
    after,
    metadata,
  });

  console.info(JSON.stringify({
    timestamp: entry.createdAt?.toISOString?.() ?? new Date().toISOString(),
    actorUserId,
    requestId,
    action,
    entityType,
    entityId: String(entityId),
    metadata,
  }));

  return entry;
}
