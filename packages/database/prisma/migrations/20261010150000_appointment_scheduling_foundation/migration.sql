-- CreateEnum
CREATE TYPE "public"."AppointmentStatus" AS ENUM ('REQUESTED', 'PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."AppointmentBookingSource" AS ENUM ('PATIENT_PORTAL', 'STAFF', 'PHONE', 'WALK_IN', 'INTEGRATION');

-- AlterTable
ALTER TABLE "public"."encounters" ADD COLUMN     "appointmentId" UUID;

-- CreateTable
CREATE TABLE "public"."appointments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientTenantRecordId" UUID NOT NULL,
    "providerId" UUID,
    "branchId" UUID,
    "departmentId" UUID,
    "serviceId" UUID,
    "appointmentNumber" VARCHAR(100) NOT NULL,
    "status" "public"."AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "bookingSource" "public"."AppointmentBookingSource" NOT NULL DEFAULT 'PATIENT_PORTAL',
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(1000),
    "patientNotes" VARCHAR(2000),
    "staffNotes" VARCHAR(2000),
    "cancellationReason" VARCHAR(1000),
    "cancelledAt" TIMESTAMPTZ(6),
    "checkedInAt" TIMESTAMPTZ(6),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."appointment_status_history" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "fromStatus" "public"."AppointmentStatus",
    "toStatus" "public"."AppointmentStatus" NOT NULL,
    "reason" VARCHAR(1000),
    "changedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."provider_availability" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "branchId" UUID,
    "departmentId" UUID,
    "serviceId" UUID,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "slotDurationMin" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."availability_blocks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID,
    "branchId" UUID,
    "departmentId" UUID,
    "serviceId" UUID,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "reason" VARCHAR(1000),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_tenantId_status_startAt_idx" ON "public"."appointments"("tenantId", "status", "startAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_providerId_startAt_endAt_idx" ON "public"."appointments"("tenantId", "providerId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_patientTenantRecordId_startAt_idx" ON "public"."appointments"("tenantId", "patientTenantRecordId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_branchId_startAt_idx" ON "public"."appointments"("tenantId", "branchId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_departmentId_startAt_idx" ON "public"."appointments"("tenantId", "departmentId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_serviceId_startAt_idx" ON "public"."appointments"("tenantId", "serviceId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_tenantId_appointmentNumber_key" ON "public"."appointments"("tenantId", "appointmentNumber");

-- CreateIndex
CREATE INDEX "appointment_status_history_tenantId_appointmentId_createdAt_idx" ON "public"."appointment_status_history"("tenantId", "appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "appointment_status_history_changedByUserId_createdAt_idx" ON "public"."appointment_status_history"("changedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "provider_availability_tenantId_providerId_isActive_dayOfWee_idx" ON "public"."provider_availability"("tenantId", "providerId", "isActive", "dayOfWeek");

-- CreateIndex
CREATE INDEX "provider_availability_tenantId_branchId_isActive_idx" ON "public"."provider_availability"("tenantId", "branchId", "isActive");

-- CreateIndex
CREATE INDEX "provider_availability_tenantId_departmentId_isActive_idx" ON "public"."provider_availability"("tenantId", "departmentId", "isActive");

-- CreateIndex
CREATE INDEX "provider_availability_tenantId_serviceId_isActive_idx" ON "public"."provider_availability"("tenantId", "serviceId", "isActive");

-- CreateIndex
CREATE INDEX "availability_blocks_tenantId_startAt_endAt_idx" ON "public"."availability_blocks"("tenantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "availability_blocks_tenantId_providerId_startAt_endAt_idx" ON "public"."availability_blocks"("tenantId", "providerId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "availability_blocks_tenantId_branchId_startAt_endAt_idx" ON "public"."availability_blocks"("tenantId", "branchId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "availability_blocks_tenantId_departmentId_startAt_endAt_idx" ON "public"."availability_blocks"("tenantId", "departmentId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_appointmentId_key" ON "public"."encounters"("appointmentId");

-- AddForeignKey
ALTER TABLE "public"."encounters" ADD CONSTRAINT "encounters_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patientTenantRecordId_fkey" FOREIGN KEY ("patientTenantRecordId") REFERENCES "public"."patient_tenant_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointment_status_history" ADD CONSTRAINT "appointment_status_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointment_status_history" ADD CONSTRAINT "appointment_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_availability" ADD CONSTRAINT "provider_availability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_availability" ADD CONSTRAINT "provider_availability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_availability" ADD CONSTRAINT "provider_availability_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_availability" ADD CONSTRAINT "provider_availability_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_availability" ADD CONSTRAINT "provider_availability_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_availability" ADD CONSTRAINT "provider_availability_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."availability_blocks" ADD CONSTRAINT "availability_blocks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

