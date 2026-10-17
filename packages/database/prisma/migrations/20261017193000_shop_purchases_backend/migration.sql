ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RETURN';

CREATE TYPE "PurchaseStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'PARTIALLY_RETURNED',
    'RETURNED',
    'CANCELLED'
);

CREATE TYPE "PurchasePaymentMethod" AS ENUM (
    'CASH',
    'BANK_TRANSFER',
    'MPESA',
    'CARD',
    'CHEQUE',
    'OTHER'
);

CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "supplierId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "purchaseNumber" VARCHAR(100) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'KES',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(2000),
    "expectedAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "receivedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancellationReason" VARCHAR(500),
    "invoiceStorageKey" VARCHAR(1000),
    "invoiceFileName" VARCHAR(255),
    "invoiceMimeType" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "receivedByUserId" UUID NOT NULL,
    "receiptNumber" VARCHAR(100) NOT NULL,
    "notes" VARCHAR(1000),
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_receipt_items" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "purchaseItemId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "method" "PurchasePaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(200),
    "paidAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "returnNumber" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "purchaseItemId" UUID NOT NULL,
    "receiptItemId" UUID,
    "batchId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_movements"
    ADD COLUMN "purchaseReceiptItemId" UUID,
    ADD COLUMN "purchaseReturnItemId" UUID;

ALTER TABLE "purchases"
    ADD COLUMN "approvedByUserId" UUID,
    ADD COLUMN "approvedAt" TIMESTAMPTZ(6),
    ADD COLUMN "transportCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "purchase_items"
    ADD COLUMN "rejectedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "purchase_receipts"
    ADD COLUMN "invoiceReference" VARCHAR(200);

ALTER TABLE "purchase_receipt_items"
    ALTER COLUMN "batchId" DROP NOT NULL,
    ALTER COLUMN "quantity" SET DEFAULT 0,
    ADD COLUMN "quantityRejected" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "sellingPrice" DECIMAL(12,2),
    ADD COLUMN "shelfLocation" VARCHAR(100);

CREATE UNIQUE INDEX "purchases_tenantId_purchaseNumber_key"
    ON "purchases"("tenantId", "purchaseNumber");
CREATE INDEX "purchases_tenantId_branchId_status_createdAt_idx"
    ON "purchases"("tenantId", "branchId", "status", "createdAt");
CREATE INDEX "purchases_tenantId_supplierId_createdAt_idx"
    ON "purchases"("tenantId", "supplierId", "createdAt");
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");
CREATE INDEX "purchase_items_productId_idx" ON "purchase_items"("productId");
CREATE UNIQUE INDEX "purchase_receipts_tenantId_receiptNumber_key"
    ON "purchase_receipts"("tenantId", "receiptNumber");
CREATE INDEX "purchase_receipts_tenantId_purchaseId_receivedAt_idx"
    ON "purchase_receipts"("tenantId", "purchaseId", "receivedAt");
CREATE INDEX "purchase_receipt_items_purchaseItemId_idx"
    ON "purchase_receipt_items"("purchaseItemId");
CREATE INDEX "purchase_receipt_items_batchId_idx" ON "purchase_receipt_items"("batchId");
CREATE INDEX "purchase_payments_tenantId_purchaseId_paidAt_idx"
    ON "purchase_payments"("tenantId", "purchaseId", "paidAt");
CREATE UNIQUE INDEX "purchase_returns_tenantId_returnNumber_key"
    ON "purchase_returns"("tenantId", "returnNumber");
CREATE INDEX "purchase_returns_tenantId_purchaseId_createdAt_idx"
    ON "purchase_returns"("tenantId", "purchaseId", "createdAt");
CREATE INDEX "purchase_return_items_purchaseItemId_idx"
    ON "purchase_return_items"("purchaseItemId");
CREATE INDEX "purchase_return_items_receiptItemId_idx"
    ON "purchase_return_items"("receiptItemId");
CREATE INDEX "purchase_return_items_batchId_idx" ON "purchase_return_items"("batchId");
CREATE INDEX "stock_movements_purchaseReceiptItemId_idx"
    ON "stock_movements"("purchaseReceiptItemId");
CREATE INDEX "stock_movements_purchaseReturnItemId_idx"
    ON "stock_movements"("purchaseReturnItemId");

ALTER TABLE "purchases"
    ADD CONSTRAINT "purchases_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "purchases_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchases_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchases_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchases_approvedByUserId_fkey"
        FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_items"
    ADD CONSTRAINT "purchase_items_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_items_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_receipts"
    ADD CONSTRAINT "purchase_receipts_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_receipts_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_receipts_receivedByUserId_fkey"
        FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_receipt_items"
    ADD CONSTRAINT "purchase_receipt_items_receiptId_fkey"
        FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_receipt_items_purchaseItemId_fkey"
        FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_receipt_items_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_payments"
    ADD CONSTRAINT "purchase_payments_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_payments_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_payments_recordedByUserId_fkey"
        FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_returns"
    ADD CONSTRAINT "purchase_returns_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_returns_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_returns_recordedByUserId_fkey"
        FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_return_items"
    ADD CONSTRAINT "purchase_return_items_returnId_fkey"
        FOREIGN KEY ("returnId") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_return_items_purchaseItemId_fkey"
        FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_return_items_receiptItemId_fkey"
        FOREIGN KEY ("receiptItemId") REFERENCES "purchase_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_return_items_batchId_fkey"
        FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_purchaseReceiptItemId_fkey"
        FOREIGN KEY ("purchaseReceiptItemId") REFERENCES "purchase_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "stock_movements_purchaseReturnItemId_fkey"
        FOREIGN KEY ("purchaseReturnItemId") REFERENCES "purchase_return_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
