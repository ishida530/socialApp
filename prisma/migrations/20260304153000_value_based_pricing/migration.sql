-- Alter PlanTier enum values for value-based pricing
ALTER TYPE "PlanTier" RENAME TO "PlanTier_old";

CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'PRO', 'BUSINESS');

ALTER TABLE "Subscription"
ALTER COLUMN "plan" TYPE "PlanTier"
USING (
  CASE
    WHEN "plan"::text = 'PREMIUM' THEN 'BUSINESS'::"PlanTier"
    ELSE "plan"::text::"PlanTier"
  END
);

DROP TYPE "PlanTier_old";
