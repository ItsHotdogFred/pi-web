import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	extractTodoDetails,
	isTaskDetails,
	selectOverlayLayout,
	selectVisibleOverlayTasks,
} from "../../public/js/chat/todoState.js";

describe("isTaskDetails", () => {
	it("accepts rpiv-todo snapshots", () => {
		assert.equal(
			isTaskDetails({
				tasks: [{ id: 1, subject: "Ship feature", status: "pending" }],
				nextId: 2,
			}),
			true,
		);
		assert.equal(isTaskDetails({ tasks: [], nextId: "2" }), false);
	});
});

describe("extractTodoDetails", () => {
	it("reads details from a persisted toolResult envelope", () => {
		const snapshot = extractTodoDetails({
			toolName: "todo",
			content: [{ type: "text", text: "Created #1: Ship feature (pending)" }],
			details: {
				action: "create",
				params: { action: "create", subject: "Ship feature" },
				tasks: [{ id: 1, subject: "Ship feature", status: "pending" }],
				nextId: 2,
			},
		});
		assert.deepEqual(snapshot, {
			tasks: [{ id: 1, subject: "Ship feature", status: "pending" }],
			nextId: 2,
		});
	});
});

describe("selectVisibleOverlayTasks", () => {
	it("drops deleted tasks and hidden completed items", () => {
		const tasks = [
			{ id: 1, subject: "Done", status: "completed" },
			{ id: 2, subject: "Next", status: "pending" },
			{ id: 3, subject: "Gone", status: "deleted" },
		];
		const hidden = new Set([1]);
		assert.deepEqual(selectVisibleOverlayTasks(tasks, hidden), [tasks[1]]);
	});
});

describe("selectOverlayLayout", () => {
	it("truncates pending tasks after completed overflow", () => {
		const tasks = [
			{ id: 1, subject: "a", status: "completed" },
			{ id: 2, subject: "b", status: "completed" },
			{ id: 3, subject: "c", status: "pending" },
			{ id: 4, subject: "d", status: "pending" },
		];
		const layout = selectOverlayLayout(tasks, 2);
		assert.equal(layout.visible.length, 1);
		assert.equal(layout.hiddenCompleted, 2);
		assert.equal(layout.truncatedTail, 1);
	});
});
