-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('MENSILE', 'SEMESTRALE', 'ANNUALE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARTA', 'BONIFICO');

-- CreateEnum
CREATE TYPE "EmployeeRange" AS ENUM ('DA_0_A_50', 'DA_51_A_100', 'DA_101_A_150', 'DA_151_A_200', 'DA_201_A_250', 'OLTRE_250');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReportChannel" AS ENUM ('WEB', 'PHONE', 'EMAIL', 'OTHER');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "employeeRange" "EmployeeRange" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "plan" "SubscriptionPlan" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhistleReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3),
    "acknowledgeAt" TIMESTAMP(3),
    "channel" "ReportChannel" NOT NULL DEFAULT 'WEB',
    "closedAt" TIMESTAMP(3),
    "consentGivenAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "dueAt" TIMESTAMP(3),
    "locale" TEXT,
    "authorId" TEXT,

    CONSTRAINT "WhistleReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,

    CONSTRAINT "ReportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportStatusHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "note" TEXT,
    "author" TEXT,
    "agentId" TEXT,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ReportStatus" NOT NULL,

    CONSTRAINT "ReportStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WhistleReport_publicCode_key" ON "WhistleReport"("publicCode");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhistleReport" ADD CONSTRAINT "WhistleReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhistleReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
