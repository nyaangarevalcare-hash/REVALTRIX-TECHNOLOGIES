INSERT INTO "permissions"
  ("id", "tenantId", "resource", "action", "effect", "scope", "description", "status", "createdAt", "updatedAt")
VALUES
  ('a6101015-3000-4000-8000-000000000001', NULL, 'appointments', 'read',   'ALLOW', 'TENANT', 'View appointments within an authorized tenant scope', 'ACTIVE', NOW(), NOW()),
  ('a6101015-3000-4000-8000-000000000002', NULL, 'appointments', 'create', 'ALLOW', 'TENANT', 'Create appointments within an authorized tenant scope', 'ACTIVE', NOW(), NOW()),
  ('a6101015-3000-4000-8000-000000000003', NULL, 'appointments', 'update', 'ALLOW', 'TENANT', 'Manage appointment lifecycle within an authorized tenant scope', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("tenantId", "resource", "action", "effect") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."scope" = 'TENANT'
  AND r."status" = 'ACTIVE'
  AND r."code" = 'TENANT_ADMIN'
  AND p."tenantId" IS NULL
  AND p."resource" = 'appointments'
  AND p."action" IN ('read', 'create', 'update')
  AND p."effect" = 'ALLOW'
  AND p."scope" = 'TENANT'
  AND p."status" = 'ACTIVE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
