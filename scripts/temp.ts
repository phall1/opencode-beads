import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function scratch(prefix: string): Promise<string> {
  const parent =
    process.platform === "darwin" ? "/private/tmp/opencode" : tmpdir();
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, prefix));
}
