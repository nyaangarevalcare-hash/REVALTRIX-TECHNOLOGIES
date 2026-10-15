ALTER TABLE "public"."branches"
  ADD COLUMN "address" VARCHAR(1000),
  ADD COLUMN "town" VARCHAR(150),
  ADD COLUMN "county" VARCHAR(150),
  ADD COLUMN "postalCode" VARCHAR(30),
  ADD COLUMN "contactPhone" VARCHAR(50),
  ADD COLUMN "contactEmail" VARCHAR(254),
  ADD COLUMN "openingTime" VARCHAR(5),
  ADD COLUMN "closingTime" VARCHAR(5),
  ADD COLUMN "operatingDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
