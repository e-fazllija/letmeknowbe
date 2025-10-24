-- CreateTable
CREATE TABLE "CasePolicy" (
    "clientId" TEXT NOT NULL,
    "restrictVisibility" BOOLEAN NOT NULL DEFAULT false,
    "allowMentions" BOOLEAN NOT NULL DEFAULT true,
    "redactPii" BOOLEAN NOT NULL DEFAULT false,
    "allowAttachments" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasePolicy_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "clientId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "BillingPaymentMethod" (
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "masked" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPaymentMethod_pkey" PRIMARY KEY ("clientId")
);

-- CreateIndex
CREATE INDEX "Template_clientId_idx" ON "Template"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_clientId_name_key" ON "Template"("clientId", "name");

-- CreateIndex
CREATE INDEX "TemplateQuestion_templateId_idx" ON "TemplateQuestion"("templateId");

-- AddForeignKey
ALTER TABLE "TemplateQuestion" ADD CONSTRAINT "TemplateQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
