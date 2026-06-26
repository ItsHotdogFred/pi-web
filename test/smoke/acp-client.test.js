import test from "node:test";
import assert from "node:assert/strict";

import { permissionOptionLabel } from "../../src/acp/client.js";

test("permissionOptionLabel maps known permission kinds", () => {
	assert.equal(permissionOptionLabel({ kind: "allow_once" }), "Allow once");
	assert.equal(permissionOptionLabel({ kind: "allow_always" }), "Always allow");
	assert.equal(permissionOptionLabel({ kind: "allow" }), "Allow");
	assert.equal(permissionOptionLabel({ kind: "reject_once" }), "Deny");
	assert.equal(permissionOptionLabel({ kind: "reject_always" }), "Always deny");
	assert.equal(permissionOptionLabel({ kind: "reject" }), "Deny");
});

test("permissionOptionLabel prefers kind label over name", () => {
	assert.equal(
		permissionOptionLabel({ kind: "allow_once", name: "Yes please" }),
		"Allow once",
	);
});

test("permissionOptionLabel falls back to name, kind, then default", () => {
	assert.equal(permissionOptionLabel({ name: "Custom option" }), "Custom option");
	assert.equal(permissionOptionLabel({ kind: "custom_kind" }), "custom_kind");
	assert.equal(permissionOptionLabel({}), "Choose");
	assert.equal(permissionOptionLabel(null), "Choose");
});
