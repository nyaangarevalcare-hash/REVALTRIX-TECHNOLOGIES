ALTER TABLE "suppliers"
    ADD COLUMN "legalName" VARCHAR(300),
    ADD COLUMN "registrationNumber" VARCHAR(150),
    ADD COLUMN "taxId" VARCHAR(100),
    ADD COLUMN "address" VARCHAR(500),
    ADD COLUMN "city" VARCHAR(100),
    ADD COLUMN "county" VARCHAR(100),
    ADD COLUMN "country" VARCHAR(100),
    ADD COLUMN "postalCode" VARCHAR(30),
    ADD COLUMN "website" VARCHAR(500),
    ADD COLUMN "notes" VARCHAR(2000),
    ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "defaultCurrency" VARCHAR(3) NOT NULL DEFAULT 'KES',
    ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "suppliers_tenantId_status_name_idx"
    ON "suppliers"("tenantId", "status", "name");

CREATE TABLE "supplier_contacts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(320),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "method" "PurchasePaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reference" VARCHAR(200),
    "notes" VARCHAR(1000),
    "paidAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_product_prices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "minimumOrderQty" INTEGER NOT NULL DEFAULT 1,
    "leadTimeDays" INTEGER,
    "effectiveAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_product_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_returns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseReturnId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "returnNumber" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "creditAmount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "returnedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_contacts_tenantId_supplierId_isPrimary_idx"
    ON "supplier_contacts"("tenantId", "supplierId", "isPrimary");
CREATE INDEX "supplier_payments_tenantId_supplierId_currency_paidAt_idx"
    ON "supplier_payments"("tenantId", "supplierId", "currency", "paidAt");
CREATE INDEX "supplier_product_prices_lookup_idx"
    ON "supplier_product_prices"("tenantId", "supplierId", "productId", "currency", "effectiveAt");
CREATE INDEX "supplier_returns_tenantId_supplierId_returnedAt_idx"
    ON "supplier_returns"("tenantId", "supplierId", "returnedAt");

CREATE UNIQUE INDEX "supplier_returns_purchaseReturnId_key"
    ON "supplier_returns"("purchaseReturnId");
CREATE UNIQUE INDEX "supplier_returns_tenantId_returnNumber_key"
    ON "supplier_returns"("tenantId", "returnNumber");

ALTER TABLE "supplier_contacts"
    ADD CONSTRAINT "supplier_contacts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_contacts_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
    ADD CONSTRAINT "supplier_payments_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payments_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_payments_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_product_prices"
    ADD CONSTRAINT "supplier_product_prices_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_product_prices_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_product_prices_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_returns"
    ADD CONSTRAINT "supplier_returns_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_returns_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_returns_purchaseReturnId_fkey"
    FOREIGN KEY ("purchaseReturnId") REFERENCES "purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_returns_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
