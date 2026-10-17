CREATE TYPE "ProductPrescriptionClass" AS ENUM ('OTC', 'PRESCRIPTION_ONLY', 'CONTROLLED');
CREATE TYPE "ProductVatStatus" AS ENUM ('VATABLE', 'ZERO_RATED', 'EXEMPT');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contactName" VARCHAR(200),
    "phone" VARCHAR(50),
    "email" VARCHAR(320),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "products"
    ADD COLUMN "branchId" UUID,
    ADD COLUMN "supplierId" UUID,
    ADD COLUMN "brandName" VARCHAR(120),
    ADD COLUMN "ppbRegistrationNumber" VARCHAR(100),
    ADD COLUMN "sellingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "wholesalePrice" DECIMAL(12,2),
    ADD COLUMN "vatStatus" "ProductVatStatus" NOT NULL DEFAULT 'VATABLE',
    ADD COLUMN "minimumStockLevel" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "reorderQuantity" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "storageInstructions" VARCHAR(1000),
    ADD COLUMN "requiresColdChain" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "imageUrl" VARCHAR(1000),
    ADD COLUMN "imageStorageKey" VARCHAR(1000),
    ADD COLUMN "imageMimeType" VARCHAR(100),
    ADD COLUMN "notes" VARCHAR(2000),
    ADD COLUMN "prescriptionClass" "ProductPrescriptionClass" NOT NULL DEFAULT 'OTC',
    ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "products"
SET "brandName" = "brand",
    "sellingPrice" = "price",
    "ppbRegistrationNumber" = "ppbRegistrationNo",
    "minimumStockLevel" = "reorderLevel",
    "prescriptionClass" = CASE WHEN "prescriptionRequired" THEN 'PRESCRIPTION_ONLY'::"ProductPrescriptionClass" ELSE 'OTC'::"ProductPrescriptionClass" END,
    "status" = CASE
        WHEN "visibility" = 'DISCONTINUED' THEN 'DISCONTINUED'::"ProductStatus"
        WHEN "visibility" = 'HIDDEN' THEN 'INACTIVE'::"ProductStatus"
        ELSE 'ACTIVE'::"ProductStatus"
    END;

CREATE UNIQUE INDEX "suppliers_tenantId_name_key" ON "suppliers"("tenantId", "name");
CREATE INDEX "suppliers_tenantId_isActive_idx" ON "suppliers"("tenantId", "isActive");
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");
CREATE INDEX "products_branchId_idx" ON "products"("branchId");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE INDEX "products_genericName_idx" ON "products"("genericName");
CREATE INDEX "products_brandName_idx" ON "products"("brandName");
CREATE INDEX "products_barcode_idx" ON "products"("barcode");
CREATE INDEX "products_sku_idx" ON "products"("sku");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX "products_supplierId_idx" ON "products"("supplierId");
CREATE INDEX "products_status_idx" ON "products"("status");

ALTER TABLE "suppliers"
    ADD CONSTRAINT "suppliers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products"
    ADD CONSTRAINT "products_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "products_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
