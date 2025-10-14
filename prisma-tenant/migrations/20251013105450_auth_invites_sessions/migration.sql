/*
  Warnings:

  - The `status` column on the `Client` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `tenantId` on the `ReportMessage` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `ReportStatusHistory` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `method` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `Subscription` table. All the data in the column will be lost.
  - The `status` column on the `Subscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `authorId` on the `WhistleReport` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `WhistleReport` table. All the data in the column will be lost.
  - You are about to alter the column `secretHash` on the `WhistleReport` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(128)`.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `clientId` to the `ReportMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientId` to the `ReportStatusHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `billingCycle` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contractTerm` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientId` to the `WhistleReport` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MENSILE', 'ANNUALE');

-- CreateEnum
CREATE TYPE "ContractTerm" AS ENUM ('ONE_YEAR', 'THREE_YEARS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('INVITE', 'RESET', 'VERIFY');

-- DropForeignKey
ALTER TABLE "public"."ReportMessage" DROP CONSTRAINT "ReportMessage_authorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ReportStatusHistory" DROP CONSTRAINT "ReportStatusHistory_agentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WhistleReport" DROP CONSTRAINT "WhistleReport_authorId_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "status",
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ReportMessage" DROP COLUMN "tenantId",
ADD COLUMN     "clientId" TEXT NOT NULL,
ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "ReportStatusHistory" DROP COLUMN "tenantId",
ADD COLUMN     "clientId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "amount",
DROP COLUMN "currency",
DROP COLUMN "method",
DROP COLUMN "plan",
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL,
ADD COLUMN     "contractTerm" "ContractTerm" NOT NULL,
ADD COLUMN     "nextBillingAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "WhistleReport" DROP COLUMN "authorId",
DROP COLUMN "tenantId",
ADD COLUMN     "clientId" TEXT NOT NULL,
ADD COLUMN     "finalClosedAt" TIMESTAMP(3),
ADD COLUMN     "inProgressAt" TIMESTAMP(3),
ADD COLUMN     "internalUserId" TEXT,
ADD COLUMN     "openAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "secretHash" SET DATA TYPE VARCHAR(128);

-- DropTable
DROP TABLE "public"."User";

-- DropEnum
DROP TYPE "public"."SubscriptionPlan";

-- CreateTable
CREATE TABLE "InternalUser" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "canViewAllCases" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicUser" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "selector" TEXT NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "ua" TEXT,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "hash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "rotatedFromId" TEXT,
    "ip" TEXT,
    "ua" TEXT,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalUser_clientId_idx" ON "InternalUser"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalUser_clientId_email_key" ON "InternalUser"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PublicUser_token_key" ON "PublicUser"("token");

-- CreateIndex
CREATE INDEX "PublicUser_clientId_idx" ON "PublicUser"("clientId");

-- CreateIndex
CREATE INDEX "PublicUser_token_idx" ON "PublicUser"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_selector_key" ON "UserToken"("selector");

-- CreateIndex
CREATE INDEX "UserToken_clientId_userId_type_expiresAt_idx" ON "UserToken"("clientId", "userId", "type", "expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_clientId_idx" ON "RefreshSession"("userId", "clientId");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Client_companyName_idx" ON "Client"("companyName");

-- CreateIndex
CREATE INDEX "ReportMessage_reportId_idx" ON "ReportMessage"("reportId");

-- CreateIndex
CREATE INDEX "ReportMessage_clientId_idx" ON "ReportMessage"("clientId");

-- CreateIndex
CREATE INDEX "ReportStatusHistory_reportId_idx" ON "ReportStatusHistory"("reportId");

-- CreateIndex
CREATE INDEX "ReportStatusHistory_clientId_idx" ON "ReportStatusHistory"("clientId");

-- CreateIndex
CREATE INDEX "ReportStatusHistory_status_idx" ON "ReportStatusHistory"("status");

-- CreateIndex
CREATE INDEX "Subscription_clientId_idx" ON "Subscription"("clientId");

-- CreateIndex
CREATE INDEX "WhistleReport_clientId_idx" ON "WhistleReport"("clientId");

-- CreateIndex
CREATE INDEX "WhistleReport_status_idx" ON "WhistleReport"("status");

-- AddForeignKey
ALTER TABLE "PublicUser" ADD CONSTRAINT "PublicUser_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhistleReport" ADD CONSTRAINT "WhistleReport_internalUserId_fkey" FOREIGN KEY ("internalUserId") REFERENCES "InternalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "InternalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "InternalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "RefreshSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
