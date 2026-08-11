const workflowGlob = new Bun.Glob("*.yml");
const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const immutableAction = /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}(?:\s+#\s+.+)?$/;
const failures: string[] = [];

for await (const fileName of workflowGlob.scan({ cwd: workflowDirectory.pathname, onlyFiles: true })) {
  const source = await Bun.file(new URL(fileName, workflowDirectory)).text();
  for (const [index, line] of source.split("\n").entries()) {
    const action = line.match(/^\s*uses:\s*(\S+(?:\s+#\s+.+)?)\s*$/)?.[1];
    if (!action || action.startsWith("./")) continue;
    if (!immutableAction.test(action)) failures.push(`${fileName}:${index + 1}: ${action}`);
  }
}

if (failures.length > 0) {
  console.error("Workflow actions must use immutable 40-character commit SHAs:\n" + failures.join("\n"));
  process.exit(1);
}

console.log("All third-party workflow actions are pinned to immutable commits.");
