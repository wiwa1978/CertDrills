import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const sourceRoots = ["apps/api/src", "apps/web/src", "apps/admin/src", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs"]);
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const violations: string[] = [];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
      return sourceFiles(path);
    }
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

function report(file: string, specifier: string, reason: string) {
  violations.push(`${relative(root, file)} imports ${specifier}: ${reason}`);
}

for (const sourceRoot of sourceRoots) {
  const absoluteRoot = join(root, sourceRoot);
  for (const file of await sourceFiles(absoluteRoot)) {
    const repositoryPath = relative(root, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]!;

      if (repositoryPath.startsWith("packages/") && (specifier.startsWith("apps/") || specifier.includes("/apps/"))) {
        report(file, specifier, "shared packages cannot depend on application code");
      }

      if (repositoryPath.startsWith("apps/api/src/product/")
        && (specifier.startsWith("../../modules/") || specifier.startsWith("../../routes/") || specifier.startsWith("../../middleware/"))) {
        report(file, specifier, "product modules must use public platform packages and module contracts");
      }

      if (/^apps\/api\/src\/(modules|routes|middleware)\//.test(repositoryPath)
        && (specifier.includes("/product/") || specifier.includes("composition/product"))) {
        report(file, specifier, "platform runtime code cannot depend on product implementations");
      }

      if (/^apps\/api\/src\/routes\//.test(repositoryPath)
        && /import\s*\{[^}]*\bbootstrap\b[^}]*\}/.test(match[0])) {
        report(file, specifier, "routes must receive services through their factory arguments");
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n" + violations.map((violation) => `- ${violation}`).join("\n"));
  process.exit(1);
}

console.log("Architecture boundaries valid");
