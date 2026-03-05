-- CreateEnum
CREATE TYPE "LookupPreference" AS ENUM ('PREFER_TENANT', 'PREFER_GLOBAL', 'SHOW_ALL');

-- AlterTable
ALTER TABLE "CasePolicy" ADD COLUMN     "publicLookupPreference" "LookupPreference" NOT NULL DEFAULT 'PREFER_TENANT',
ADD COLUMN     "publicShowGlobalLookups" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicShowTenantLookups" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "clientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "clientId" DROP NOT NULL;
