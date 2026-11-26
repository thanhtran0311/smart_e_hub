import { readFile } from "node:fs/promises";
import { seedFiles, OperationalStore } from "../../src/infrastructure/store.js";

export async function readSeed() {
  const records = await Promise.all(
    Object.entries(seedFiles).map(async ([key, name]) => {
      const file = new URL("../../data/" + name + ".json", import.meta.url);
      return [key, JSON.parse(await readFile(file, "utf8"))];
    }),
  );
  return Object.fromEntries(records);
}

export async function demoStore(options) {
  return new OperationalStore(await readSeed(), options);
}
