-- AlterTable
ALTER TABLE "public"."branches" ADD COLUMN     "category" VARCHAR(50) NOT NULL DEFAULT 'Medical',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "type" VARCHAR(50) NOT NULL DEFAULT 'Clinical';
