import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), "../../.github/workflows", name), "utf8");
}

describe("production deployment custom domains", () => {
  it.each(["deploy-production.yml", "deploy-production-infra.yml"])(
    "%s supports custom public URLs for builds",
    (workflowName) => {
      const workflow = readWorkflow(workflowName);

      expect(workflow).toContain("PUBLIC_WEB_URL:");
      expect(workflow).toContain("PUBLIC_API_URL:");
      expect(workflow).toContain("PUBLIC_ADMIN_URL:");
      expect(workflow).toContain("public_web_url=");
      expect(workflow).toContain("public_api_url=");
      expect(workflow).toContain("public_admin_url=");
      expect(workflow).toContain("NEXT_PUBLIC_APP_URL=\"${{ steps.");
      expect(workflow).toContain("NEXT_PUBLIC_API_URL=\"${{ steps.");
    },
  );

  it("passes custom public URLs and cookie settings to the API runtime", () => {
    const workflow = readWorkflow("deploy-production-infra.yml");

    expect(workflow).toContain("APP_URL=${{ steps.infra.outputs.public_web_url }}");
    expect(workflow).toContain("API_URL=${{ steps.infra.outputs.public_api_url }}");
    expect(workflow).toContain("ADMIN_APP_URL=${{ steps.infra.outputs.public_admin_url }}");
    expect(workflow).toContain("COOKIE_DOMAIN:");
    expect(workflow).toContain("BETTER_AUTH_ALLOWED_ORIGINS:");
    expect(workflow).toContain("COOKIE_DOMAIN=${COOKIE_DOMAIN}");
    expect(workflow).toContain("BETTER_AUTH_ALLOWED_ORIGINS=${BETTER_AUTH_ALLOWED_ORIGINS}");
  });
});
