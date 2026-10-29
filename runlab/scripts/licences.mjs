// Après la compilation : rassemble dans ../rl/LICENCES.txt la licence de chaque paquet embarqué (dépendances de production),
// comme le demandent leurs licences (MIT, BSD, ISC, OFL…). Ordre alphabétique : le fichier ne change que si les paquets changent.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const dirs = execSync("npm ls --omit=dev --all --parseable", { encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && l !== root);
const seen = new Set();
const parts = [];
for (const dir of [...new Set(dirs)].sort((a, b) => relative(root, a).localeCompare(relative(root, b)))) {
  const pkgFile = join(dir, "package.json");
  if (!existsSync(pkgFile)) continue;
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  if (pkg.name?.startsWith("@types/") || seen.has(pkg.name)) continue;
  seen.add(pkg.name);
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  const text = file ? readFileSync(join(dir, file), "utf8").trim() : `Licence : ${pkg.license ?? "non précisée"}`;
  parts.push(`== ${pkg.name} ${pkg.version} (${pkg.license ?? "?"}) ==\n\n${text}\n`);
}
writeFileSync(
  join(root, "../rl/LICENCES.txt"),
  `Menhir · Parcours : licences des bibliothèques embarquées\n\n${parts.join("\n")}`,
);
console.log(`LICENCES.txt : ${parts.length} paquets`);
