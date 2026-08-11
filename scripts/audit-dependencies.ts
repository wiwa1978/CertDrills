type AuditAdvisory = {
  url?: string;
};

type Allowance = {
  id: string;
  package: string;
  owner: string;
  reason: string;
  expiresAt: string;
};

const policyPath = new URL("../.github/dependency-advisories.json", import.meta.url);
const policy = await Bun.file(policyPath).json() as { advisories?: Allowance[] };
const allowances = policy.advisories ?? [];
const today = new Date().toISOString().slice(0, 10);

const malformed = allowances.filter((entry) => (
  !/^GHSA-[a-z0-9-]+$/i.test(entry.id)
  || !entry.package.trim()
  || !entry.owner.trim()
  || !entry.reason.trim()
  || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresAt)
));
if (malformed.length > 0) {
  console.error("Malformed dependency advisory allowances:", malformed.map((entry) => entry.id).join(", "));
  process.exit(1);
}

const duplicateIds = allowances
  .map((entry) => entry.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  console.error("Duplicate dependency advisory allowances:", [...new Set(duplicateIds)].join(", "));
  process.exit(1);
}

const expired = allowances.filter((entry) => entry.expiresAt < today);
if (expired.length > 0) {
  console.error("Expired dependency advisory allowances:", expired.map((entry) => `${entry.id} (${entry.expiresAt})`).join(", "));
  process.exit(1);
}

const audit = Bun.spawn(["bun", "audit", "--json"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(audit.stdout).text(),
  new Response(audit.stderr).text(),
  audit.exited,
]);

let report: Record<string, AuditAdvisory[]>;
try {
  report = JSON.parse(stdout) as Record<string, AuditAdvisory[]>;
} catch {
  console.error(stderr || stdout || `bun audit exited with ${exitCode}`);
  process.exit(1);
}

const findings = Object.entries(report).flatMap(([packageName, advisories]) => advisories.map((advisory) => {
  const id = advisory.url?.split("/").at(-1) ?? "unknown";
  return { id, package: packageName };
}));
const allowanceById = new Map(allowances.map((entry) => [entry.id, entry]));
const unapproved = findings.filter((finding) => {
  const allowance = allowanceById.get(finding.id);
  return !allowance || allowance.package !== finding.package;
});
const activeIds = new Set(findings.map((finding) => finding.id));
const stale = allowances.filter((entry) => !activeIds.has(entry.id));

if (unapproved.length > 0) {
  console.error("Unapproved dependency advisories:", unapproved.map((entry) => `${entry.id} (${entry.package})`).join(", "));
}
if (stale.length > 0) {
  console.error("Stale dependency advisory allowances must be removed:", stale.map((entry) => entry.id).join(", "));
}
if (unapproved.length > 0 || stale.length > 0 || (exitCode !== 0 && findings.length === 0)) {
  process.exit(1);
}

console.log(`Dependency audit accepted ${findings.length} documented advisories; next expiry ${allowances.map((entry) => entry.expiresAt).sort()[0] ?? "none"}.`);
