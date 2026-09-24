import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const helper = await import(pathToFileURL(path.resolve("frontend/src/lib/network.ts")));

test("loopback never receives the private-LAN address-space override", () => {
  assert.equal(helper.targetAddressSpaceFor("http://127.0.0.1:8788/api/auth/login"), undefined);
  assert.equal(helper.targetAddressSpaceFor("http://localhost:8788/api/auth/login"), undefined);
  assert.equal(helper.targetAddressSpaceFor("http://[::1]:8788/api/auth/login"), undefined);
});

test("private LAN targets retain the local address-space override", () => {
  assert.equal(helper.targetAddressSpaceFor("http://192.168.1.20:8788/api/health"), "local");
  assert.equal(helper.targetAddressSpaceFor("https://central-os-lake.vercel.app/api/health"), undefined);
});
