import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(process.cwd(), "../../");

function readRepositoryFile(path: string) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("CertDrills production deployment defaults", () => {
  it.each([
    ".github/workflows/deploy-production-infra.yml",
    ".github/workflows/deploy-production.yml",
  ])("%s uses CertDrills Azure defaults", (path) => {
    const source = readRepositoryFile(path);

    expect(source).toContain("RG-CertDrills");
    expect(source).toContain("APP_NAME: ${{ vars.APP_NAME || 'certdrills' }}");
    expect(source).toContain("NEXT_PUBLIC_APP_NAME: ${{ vars.NEXT_PUBLIC_APP_NAME || 'CertDrills' }}");
    expect(source).toContain("NEXT_PUBLIC_ADMIN_APP_NAME: ${{ vars.NEXT_PUBLIC_ADMIN_APP_NAME || 'CertDrills Admin' }}");
    expect(source).toContain("POSTGRES_DATABASE_NAME: ${{ vars.POSTGRES_DATABASE_NAME || 'certdrills' }}");
    expect(source).not.toContain("RG-Boilerplate-SingleTenant-Hono");
    expect(source).not.toContain("singletenant-hono");
    expect(source).not.toContain("boilerplate-singletenant-hono");
    expect(source).not.toContain("SingleTenant Hono");
  });

  it("uses CertDrills example Bicep parameters", () => {
    const parameters = JSON.parse(readRepositoryFile("infra/main.parameters.example.json")) as {
      parameters: Record<string, { value: unknown }>;
    };

    expect(parameters.parameters.resourceGroupName?.value).toBe("RG-CertDrills");
    expect(parameters.parameters.appName?.value).toBe("certdrills");
    expect(parameters.parameters.postgresDatabaseName?.value).toBe("certdrills");
  });

  it("uses CertDrills CI defaults", () => {
    const source = readRepositoryFile(".github/workflows/test.yml");

    expect(source).toContain("POSTGRES_DB: certdrills_test");
    expect(source).toContain('pg_isready -U postgres -d certdrills_test');
    expect(source).toMatch(/DATABASE_URL: .*certdrills_test/);
    expect(source).toMatch(/TEST_DATABASE_URL: .*certdrills_test/);
    expect(source).toContain("NEXT_PUBLIC_APP_NAME: CertDrills Test");
    expect(source).not.toContain("boilerplate_singletenant_hono_test");
    expect(source).not.toContain("SingleTenant Hono Test");
  });
});
