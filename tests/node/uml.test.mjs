import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("Submit 3 có đủ 184 phương thức được khai báo đúng tên và đúng lớp UML", async () => {
  const document = await readFile(new URL("../../docs/submission-3/class-and-method-descriptions.md", import.meta.url), "utf8");
  const expected = new Map();
  let owner;
  for (const line of document.split(/\r?\n/)) {
    const heading = line.match(/^### `([\w]+)`/);
    if (heading) {
      owner = heading[1];
      expected.set(owner, []);
    }
    const method = line.match(/^\| `[+-][^`]*?\b(\w+)\(/);
    if (method) expected.get(owner).push(method[1]);
  }
  assert.equal(expected.size, 44);
  assert.equal([...expected.values()].flat().length, 184);

  const classes = new Map();
  for (const folder of ["application", "domain", "infrastructure"]) {
    const directory = new URL(`../../src/${folder}/`, import.meta.url);
    for (const filename of await readdir(directory)) {
      if (!filename.endsWith(".js")) continue;
      const exports = await import(new URL(filename, directory));
      for (const value of Object.values(exports)) {
        if (typeof value !== "function" || !/^class\s/.test(Function.prototype.toString.call(value))) continue;
        if (classes.has(value.name)) assert.equal(classes.get(value.name), value);
        classes.set(value.name, value);
      }
    }
  }

  const missing = [];
  for (const [name, methods] of expected) {
    const cls = classes.get(name);
    if (!cls) {
      missing.push(name);
      continue;
    }
    for (const method of methods) {
      const ownMethod = Object.getOwnPropertyDescriptor(cls.prototype, method)?.value
        ?? Object.getOwnPropertyDescriptor(cls, method)?.value;
      if (typeof ownMethod !== "function") missing.push(`${name}.${method}`);
    }
  }
  assert.deepEqual(missing, []);
});
