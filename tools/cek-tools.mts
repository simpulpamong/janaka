import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as { scripts?: Record<string, string> }

const toolFiles: string[] = []
function collect(directory: string): void {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) collect(path)
    else if (path.endsWith(".mts")) toolFiles.push(relative(root, path))
  }
}
collect(join(root, "tools"))

const referenced = new Set<string>()
const missing: string[] = []
for (const command of Object.values(packageJson.scripts ?? {})) {
  for (const match of command.matchAll(/tools\/[\w./-]+\.mts/g)) {
    const path = match[0]
    referenced.add(path)
    if (!existsSync(join(root, path))) missing.push(path)
  }
}

const unregistered = toolFiles.filter((path) => !referenced.has(path))
if (missing.length || unregistered.length) {
  for (const path of missing) console.error(`Script npm menunjuk file yang tidak ada: ${path}`)
  for (const path of unregistered) console.error(`Tool tidak terdaftar di npm scripts: ${path}`)
  process.exit(1)
}

console.log(`${toolFiles.length} tool script terdaftar; semua path npm scripts valid.`)