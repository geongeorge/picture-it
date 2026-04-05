#!/usr/bin/env bun
import { downloadFonts } from "../src/fonts.ts";

async function main() {
  const result = await downloadFonts({
    onProgress: (message) => console.log(message),
  });
  console.log(`\nFonts ready in ${result.dir}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
