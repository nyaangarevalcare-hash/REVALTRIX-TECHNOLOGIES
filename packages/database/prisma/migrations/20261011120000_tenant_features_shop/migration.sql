CREATE TYPE "TenantFeature" AS ENUM (
  'APPOINTMENTS',
  'QUEUE',
  'ENCOUNTERS',
  'REFERRALS',
  'LABORATORY',
  'RADIOLOGY',
  'PHARMACY',
  'PROCEDURES',
  'THEATRE',
  'TELEHEALTH',
  'HOME_VISITS',
  'AMBULANCE',
  'SHOP',
  'INVENTORY',
  'POS',
  'INSURANCE',
  'CORPORATE',
  'CLAIMS',
  'DISPATCH',
  'ROUTE_PLANNING',
  'MATERNITY',
  'REHABILITATION',
  'OPTICAL',
  'DENTAL',
  'NETWORK',
  'EXTERNAL_INTEGRATIONS'
);

CREATE TYPE "ProductVisibility" AS ENUM (
  'ONLINE',
  'IN_STORE_ONLY',
  'HIDDEN',
  'DISCONTINUED'
);

CREATE TYPE "ShopOrderStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE "ShopPaymentStatus" AS ENUM (
  'UNPAID',
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED'
);

CREATE TABLE "tenant_feature_settings" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "feature" "TenantFeature" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenant_feature_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shop_settings" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "storeName" VARCHAR(200) NOT NULL,
  "acceptingOrders" BOOLEAN NOT NULL DEFAULT false,
  "openingHours" JSONB,
  "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
  "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "minimumOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "serviceAreas" JSONB,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'KES',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(140) NOT NULL,
  "description" VARCHAR(500),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "categoryId" UUID,
  "name" VARCHAR(200) NOT NULL,
  "sku" VARCHAR(100) NOT NULL,
  "description" VARCHAR(2000),
  "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "brand" VARCHAR(120),
  "price" DECIMAL(12,2) NOT NULL,
  "compareAtPrice" DECIMAL(12,2),
  "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
  "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  "reservedStock" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 0,
  "unit" VARCHAR(40) NOT NULL DEFAULT 'unit',
  "barcode" VARCHAR(100),
  "expiryDate" DATE,
  "batchNumber" VARCHAR(100),
  "visibility" "ProductVisibility" NOT NULL DEFAULT 'HIDDEN',
  "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shop_orders" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "orderNumber" VARCHAR(100) NOT NULL,
  "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING',
  "paymentStatus" "ShopPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "currency" VARCHAR(3) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxTotal" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "deliveryMethod" VARCHAR(30) NOT NULL,
  "deliveryAddress" JSONB,
  "customerName" VARCHAR(200) NOT NULL,
  "customerPhone" VARCHAR(50) NOT NULL,
  "customerEmail" VARCHAR(320),
  "prescriptionKey" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shop_order_items" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "productName" VARCHAR(200) NOT NULL,
  "sku" VARCHAR(100) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "taxRate" DECIMAL(6,3) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_feature_settings_tenantId_feature_key" ON "tenant_feature_settings"("tenantId", "feature");
CREATE INDEX "tenant_feature_settings_tenantId_enabled_idx" ON "tenant_feature_settings"("tenantId", "enabled");
CREATE UNIQUE INDEX "shop_settings_tenantId_key" ON "shop_settings"("tenantId");
CREATE UNIQUE INDEX "product_categories_tenantId_slug_key" ON "product_categories"("tenantId", "slug");
CREATE INDEX "product_categories_tenantId_isActive_idx" ON "product_categories"("tenantId", "isActive");
CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");
CREATE UNIQUE INDEX "products_tenantId_barcode_key" ON "products"("tenantId", "barcode");
CREATE INDEX "products_tenantId_visibility_idx" ON "products"("tenantId", "visibility");
CREATE INDEX "products_tenantId_categoryId_idx" ON "products"("tenantId", "categoryId");
CREATE UNIQUE INDEX "shop_orders_tenantId_orderNumber_key" ON "shop_orders"("tenantId", "orderNumber");
CREATE INDEX "shop_orders_tenantId_status_createdAt_idx" ON "shop_orders"("tenantId", "status", "createdAt");
CREATE INDEX "shop_order_items_orderId_idx" ON "shop_order_items"("orderId");
CREATE INDEX "shop_order_items_productId_idx" ON "shop_order_items"("productId");

ALTER TABLE "tenant_feature_settings" ADD CONSTRAINT "tenant_feature_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
