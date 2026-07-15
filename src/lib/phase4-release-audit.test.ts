import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const buildWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/build-standalone.yml"), "utf8");
const validationWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/validate-phase4-artifact.yml"), "utf8");
const rollback = readFileSync(resolve(process.cwd(), "prisma/migrations/20260715100000_erp_phase4_procurement_delivery/rollback.sql"), "utf8");

describe("phase 4 release audit guards", () => {
  it("compares migration manifests without a fixed migration count", () => {
    expect(buildWorkflow).toContain("source-migrations.sha256");
    expect(buildWorkflow).toContain("extracted-migrations.sha256");
    expect(buildWorkflow).not.toMatch(/MIGRATION_COUNT[^\n]*(?:-ne|-eq)\s+\d+/);
    expect(validationWorkflow).not.toMatch(/migration_dirs\[@\][^\n]*(?:-ne|-eq)\s+\d+/);
  });

  it("keeps environment files and the external upload root outside the package", () => {
    expect(buildWorkflow).toContain('test ! -e "$VERIFY_APP/.env"');
    expect(buildWorkflow).toContain('test ! -d "$VERIFY_APP/src/app/uploads"');
    expect(buildWorkflow).toContain('UPLOAD_DIR="$PERSISTENT_UPLOADS"');
  });

  it("keeps rollback explicit and forbids database-wide destructive statements", () => {
    expect(rollback).not.toMatch(/\b(?:DROP\s+DATABASE|TRUNCATE|DELETE\s+FROM|migrate\s+reset)\b/i);
    expect(rollback).toContain("DROP TABLE `erp_purchase_demands`");
    expect(rollback).toContain("DROP COLUMN `deliveryDateSnapshot`");
  });
});
