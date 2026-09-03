-- AlterEnum
-- New value must be committed before any DML in a later migration can use it,
-- so this migration only adds the enum value and nothing else.
ALTER TYPE "PublishStatus" ADD VALUE 'DRAFT';
