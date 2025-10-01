-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('MENSILE', 'SEMESTRALE', 'ANNUALE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARTA', 'BONIFICO');

-- CreateEnum
CREATE TYPE "EmployeeRange" AS ENUM ('DA_0_A_50', 'DA_51_A_100', 'DA_101_A_150', 'DA_151_A_200', 'DA_201_A_250', 'OLTRE_250');

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

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyName_key" ON "Client"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "Client_contactEmail_key" ON "Client"("contactEmail");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
