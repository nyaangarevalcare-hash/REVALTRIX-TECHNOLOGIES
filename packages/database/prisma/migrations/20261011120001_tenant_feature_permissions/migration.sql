INSERT INTO "permissions" (
  "id",
  "tenantId",
  "resource",
  "action",
  "effect",
  "scope",
  "description",
  "status",
  "createdAt",
  "updatedAt"
)
VALUES (
  'a6101112-0000-4000-8000-000000000001',
  NULL,
  'tenant_features',
  'update',
  'ALLOW',
  'PLATFORM',
  'Enable or disable tenant modules supported by the tenant type',
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT ("tenantId", "resource", "action", "effect") DO NOTHING;

INSERT INTO "permissions" (
  "id",
  "tenantId",
  "resource",
  "action",
  "effect",
  "scope",
  "description",
  "status",
  "createdAt",
  "updatedAt"
)
VALUES
  ('a6101112-0000-4000-8000-000000000002', NULL, 'shop', 'read', 'ALLOW', 'TENANT', 'View tenant shop products and orders', 'ACTIVE', NOW(), NOW()),
  ('a6101112-0000-4000-8000-000000000003', NULL, 'shop', 'create', 'ALLOW', 'TENANT', 'Manage tenant shop categories, products, and orders', 'ACTIVE', NOW(), NOW()),
  ('a6101112-0000-4000-8000-000000000004', NULL, 'shop', 'update', 'ALLOW', 'TENANT', 'Update tenant shop settings, products, and orders', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("tenantId", "resource", "action", "effect") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "assignedAt")
SELECT r."id", p."id", NOW()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'PLATFORM_ADMIN'
  AND r."scope" = 'PLATFORM'
  AND r."status" = 'ACTIVE'
  AND p."resource" = 'tenant_features'
  AND p."action" = 'update'
  AND p."scope" = 'PLATFORM'
  AND p."tenantId" IS NULL
  AND p."effect" = 'ALLOW'
  AND p."status" = 'ACTIVE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId", "assignedAt")
SELECT r."id", p."id", NOW()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'TENANT_ADMIN'
  AND r."scope" = 'TENANT'
  AND r."status" = 'ACTIVE'
  AND p."resource" = 'shop'
  AND p."scope" = 'TENANT'
  AND p."tenantId" IS NULL
  AND p."effect" = 'ALLOW'
  AND p."status" = 'ACTIVE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
