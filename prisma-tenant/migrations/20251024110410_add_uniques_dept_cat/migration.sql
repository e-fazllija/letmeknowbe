/*
  Warnings:

  - A unique constraint covering the columns `[clientId,departmentId,name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clientId,name]` on the table `Department` will be added. If there are existing duplicate values, this will fail.
  - Made the column `eventDate` on table `WhistleReport` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."WhistleReport" DROP CONSTRAINT "WhistleReport_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WhistleReport" DROP CONSTRAINT "WhistleReport_departmentId_fkey";

-- AlterTable
ALTER TABLE "WhistleReport" ALTER COLUMN "eventDate" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Category_clientId_departmentId_name_key" ON "Category"("clientId", "departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_clientId_name_key" ON "Department"("clientId", "name");
