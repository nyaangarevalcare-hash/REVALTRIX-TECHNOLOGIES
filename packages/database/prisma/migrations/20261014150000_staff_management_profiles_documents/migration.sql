CREATE TYPE "public"."StaffProfessionalCategory" AS ENUM (
  'DOCTOR', 'DENTIST', 'NURSE', 'MIDWIFE', 'PHARMACIST', 'LAB_SCIENTIST',
  'RADIOGRAPHER', 'PHYSIOTHERAPIST', 'NUTRITIONIST', 'PSYCHOLOGIST',
  'OPTOMETRIST', 'TECHNICIAN', 'ADMIN', 'RECEPTIONIST', 'OTHER'
);

CREATE TYPE "public"."StaffVerificationStatus" AS ENUM (
  'EMAIL_PENDING', 'EMAIL_VERIFIED', 'PROFILE_INCOMPLETE', 'DOCUMENTS_PENDING',
  'DOCUMENTS_UNDER_REVIEW', 'VERIFIED', 'REJECTED'
);

CREATE TYPE "public"."StaffDocumentType" AS ENUM (
  'PROFILE_PHOTO', 'NATIONAL_ID', 'PASSPORT', 'CV', 'OFFER_LETTER',
  'EMPLOYMENT_CONTRACT', 'PROFESSIONAL_LICENSE', 'DEGREE_CERTIFICATE',
  'INTERNSHIP_CERTIFICATE', 'GOOD_STANDING_CERTIFICATE',
  'INSURANCE_INDEMNITY', 'OTHER'
);

CREATE TYPE "public"."StaffDocumentStatus" AS ENUM (
  'UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED'
);

CREATE TYPE "public"."StaffInvitationStatus" AS ENUM (
  'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'
);

CREATE TYPE "public"."StaffTimeOffStatus" AS ENUM (
  'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'
);

ALTER TYPE "public"."StaffStatus" ADD VALUE IF NOT EXISTS 'INVITED';

ALTER TABLE "public"."staff_profiles"
  ADD COLUMN "middleName" VARCHAR(100),
  ADD COLUMN "whatsappNumber" VARCHAR(50),
  ADD COLUMN "gender" VARCHAR(40),
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "nationalIdEncrypted" VARCHAR(300),
  ADD COLUMN "nationality" VARCHAR(100),
  ADD COLUMN "physicalAddress" VARCHAR(1000),
  ADD COLUMN "profilePhotoKey" VARCHAR(1000),
  ADD COLUMN "professionalCategory" "public"."StaffProfessionalCategory",
  ADD COLUMN "subSpecialty" VARCHAR(200),
  ADD COLUMN "licensingBody" VARCHAR(200),
  ADD COLUMN "licenseExpiresAt" DATE,
  ADD COLUMN "yearsExperience" INTEGER,
  ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "consultationFee" DECIMAL(10,2),
  ADD COLUMN "telehealthEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "acceptsOnlineBookings" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "acceptsNewPatients" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "professionalBio" VARCHAR(4000),
  ADD COLUMN "professionalLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "invitationStatus" "public"."StaffInvitationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "invitationExpiresAt" TIMESTAMPTZ(6),
  ADD COLUMN "verificationStatus" "public"."StaffVerificationStatus" NOT NULL DEFAULT 'EMAIL_PENDING';

ALTER TABLE "public"."services"
  ADD COLUMN "price" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."staff_department_assignments"
  ADD COLUMN "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "startsAt" DATE,
  ADD COLUMN "endsAt" DATE;

ALTER TABLE "public"."staff_shifts"
  ADD COLUMN "breakStartTime" VARCHAR(5),
  ADD COLUMN "breakEndTime" VARCHAR(5);

CREATE TABLE "public"."staff_documents" (
  "id" UUID NOT NULL,
  "staffProfileId" UUID NOT NULL,
  "type" "public"."StaffDocumentType" NOT NULL,
  "status" "public"."StaffDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "fileName" VARCHAR(255) NOT NULL,
  "storageKey" VARCHAR(1000) NOT NULL,
  "contentType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" UUID NOT NULL,
  "reviewedById" UUID,
  "reviewNotes" VARCHAR(2000),
  "expiresAt" DATE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_documents_storageKey_key" ON "public"."staff_documents"("storageKey");
CREATE INDEX "staff_documents_staffProfileId_type_idx" ON "public"."staff_documents"("staffProfileId", "type");
CREATE INDEX "staff_documents_staffProfileId_status_idx" ON "public"."staff_documents"("staffProfileId", "status");

ALTER TABLE "public"."staff_documents"
  ADD CONSTRAINT "staff_documents_staffProfileId_fkey"
  FOREIGN KEY ("staffProfileId") REFERENCES "public"."staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."staff_documents"
  ADD CONSTRAINT "staff_documents_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_documents_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."staff_time_off" (
  "id" UUID NOT NULL,
  "staffProfileId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "public"."StaffTimeOffStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" VARCHAR(1000),
  "reviewNotes" VARCHAR(1000),
  "reviewedById" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_time_off_staffProfileId_startsAt_endsAt_idx"
  ON "public"."staff_time_off"("staffProfileId", "startsAt", "endsAt");

ALTER TABLE "public"."staff_time_off"
  ADD CONSTRAINT "staff_time_off_staffProfileId_fkey"
  FOREIGN KEY ("staffProfileId") REFERENCES "public"."staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."staff_service_assignments" (
  "id" UUID NOT NULL,
  "staffProfileId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "assignedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_service_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_service_assignments_staffProfileId_serviceId_key"
  ON "public"."staff_service_assignments"("staffProfileId", "serviceId");
CREATE INDEX "staff_service_assignments_serviceId_idx"
  ON "public"."staff_service_assignments"("serviceId");

ALTER TABLE "public"."staff_service_assignments"
  ADD CONSTRAINT "staff_service_assignments_staffProfileId_fkey"
  FOREIGN KEY ("staffProfileId") REFERENCES "public"."staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_service_assignments_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "public"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_service_assignments_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "public"."permissions" (
  "id", "tenantId", "resource", "action", "effect", "scope", "description", "status", "createdAt", "updatedAt"
)
VALUES
  ('a6101415-0000-4000-8000-000000000001', NULL, 'staff', 'read', 'ALLOW', 'TENANT', 'View staff profiles and analytics', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000002', NULL, 'staff', 'create', 'ALLOW', 'TENANT', 'Create staff profiles', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000003', NULL, 'staff', 'invite', 'ALLOW', 'TENANT', 'Invite and manage staff account invitations', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000004', NULL, 'staff', 'update', 'ALLOW', 'TENANT', 'Update staff profiles', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000005', NULL, 'staff', 'suspend', 'ALLOW', 'TENANT', 'Suspend or reactivate staff access', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000006', NULL, 'staff', 'offboard', 'ALLOW', 'TENANT', 'Offboard staff and revoke access', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000007', NULL, 'staff', 'assign_department', 'ALLOW', 'TENANT', 'Assign staff to departments and manage access levels', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000008', NULL, 'staff', 'view_documents', 'ALLOW', 'TENANT', 'View and download private staff documents', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000009', NULL, 'staff', 'verify_documents', 'ALLOW', 'TENANT', 'Verify or reject staff documents', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000010', NULL, 'staff', 'view_access_history', 'ALLOW', 'TENANT', 'View staff access and audit history', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000011', NULL, 'staff', 'manage_shifts', 'ALLOW', 'TENANT', 'Manage staff shifts and time off', 'ACTIVE', NOW(), NOW()),
  ('a6101415-0000-4000-8000-000000000012', NULL, 'staff', 'export', 'ALLOW', 'TENANT', 'Export filtered staff data', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "effect" = EXCLUDED."effect",
  "scope" = EXCLUDED."scope",
  "description" = EXCLUDED."description",
  "status" = EXCLUDED."status",
  "updatedAt" = NOW();

INSERT INTO "public"."role_permissions" ("roleId", "permissionId", "assignedAt")
SELECT role."id", permission."id", NOW()
FROM "public"."roles" AS role
CROSS JOIN "public"."permissions" AS permission
WHERE role."code" = 'TENANT_ADMIN'
  AND role."scope" = 'TENANT'
  AND role."status" = 'ACTIVE'
  AND permission."tenantId" IS NULL
  AND permission."resource" = 'staff'
  AND permission."scope" = 'TENANT'
  AND permission."effect" = 'ALLOW'
  AND permission."status" = 'ACTIVE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;