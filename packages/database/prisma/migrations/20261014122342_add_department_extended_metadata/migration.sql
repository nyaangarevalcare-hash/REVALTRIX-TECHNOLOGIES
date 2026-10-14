/*
  Warnings:

  - You are about to drop the column `category` on the `branches` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `branches` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `branches` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."branches" DROP COLUMN "category",
DROP COLUMN "description",
DROP COLUMN "type";
