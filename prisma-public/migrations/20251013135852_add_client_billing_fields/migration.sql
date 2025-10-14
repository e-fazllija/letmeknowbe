/*
  Warnings:

  - The `status` column on the `Client` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `plan` on the `Subscription` table. All the data in the column will be lost.
  - The `status` column on the `Subscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[billingTaxId]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `billingAddressLine1` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingCity` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingCountry` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingEmail` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingProvince` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingTaxId` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingZip` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingCycle` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractTerm` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MENSILE', 'ANNUALE');

-- CreateEnum
CREATE TYPE "ContractTerm" AS ENUM ('ONE_YEAR', 'THREE_YEARS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- DropIndex
DROP INDEX "public"."Client_companyName_key";

-- DropIndex
DROP INDEX "public"."Client_contactEmail_key";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "billingAddressLine1" TEXT NOT NULL,
ADD COLUMN     "billingCity" TEXT NOT NULL,
ADD COLUMN     "billingCountry" TEXT NOT NULL,
ADD COLUMN     "billingEmail" TEXT NOT NULL,
ADD COLUMN     "billingPec" TEXT,
ADD COLUMN     "billingProvince" TEXT NOT NULL,
ADD COLUMN     "billingSdiCode" TEXT,
ADD COLUMN     "billingTaxId" TEXT NOT NULL,
ADD COLUMN     "billingZip" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "plan",
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "contractTerm" "ContractTerm" NOT NULL,
ADD COLUMN     "nextBillingAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- DropEnum
DROP TYPE "public"."SubscriptionPlan";

-- CreateIndex
CREATE UNIQUE INDEX "Client_billingTaxId_key" ON "Client"("billingTaxId");

-- CreateIndex
CREATE INDEX "Client_companyName_idx" ON "Client"("companyName");
