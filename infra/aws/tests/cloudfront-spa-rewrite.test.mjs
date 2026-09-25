import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../cloudfront/spa-rewrite.js", import.meta.url), "utf8") + "\n globalThis.__handler = handler;";
const context = {};
vm.runInNewContext(source, context);
const rewrite = uri => context.__handler({ request: { uri } }).uri;

test("rewrites extensionless SPA routes", () => assert.equal(rewrite("/historico"), "/index.html"));
test("keeps API paths untouched", () => {
  for (const uri of ["/api", "/api/", "/api/auth/login", "/api/auth/me"]) assert.equal(rewrite(uri), uri);
});
test("keeps hashed assets untouched", () => assert.equal(rewrite("/assets/index-abc.js"), "/assets/index-abc.js"));
test("keeps favicon untouched", () => assert.equal(rewrite("/favicon.ico"), "/favicon.ico"));
