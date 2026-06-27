import { parseRawObject } from "../utils/format.js";

/** @typedef {{ id: number, subject: string, description?: string, activeForm?: string, status: string, blockedBy?: number[], owner?: string }} TodoTask */

/**
 * @param {unknown} value
 * @returns {value is { tasks: TodoTask[], nextId: number }}
 */
export function isTaskDetails(value) {
	if (!value || typeof value !== "object") return false;
	const record = /** @type {Record<string, unknown>} */ (value);
	return Array.isArray(record.tasks) && typeof record.nextId === "number";
}

/**
 * Extract rpiv-todo snapshot from a tool wire payload or persisted toolResult.
 * @param {unknown} rawOutput
 * @returns {{ tasks: TodoTask[], nextId: number } | null}
 */
export function extractTodoDetails(rawOutput) {
	const obj = parseRawObject(rawOutput);
	if (!obj || typeof obj !== "object") return null;
	const record = /** @type {Record<string, unknown>} */ (obj);
	if (isTaskDetails(record.details)) {
		return {
			tasks: record.details.tasks.map((task) => ({ ...task })),
			nextId: record.details.nextId,
		};
	}
	if (isTaskDetails(record)) {
		return {
			tasks: record.tasks.map((task) => ({ ...task })),
			nextId: record.nextId,
		};
	}
	return null;
}

/**
 * @param {readonly TodoTask[]} tasks
 * @param {ReadonlySet<number>} hiddenCompletedIds
 */
export function selectVisibleOverlayTasks(tasks, hiddenCompletedIds) {
	return tasks.filter(
		(task) => task.status !== "deleted" && !(task.status === "completed" && hiddenCompletedIds.has(task.id)),
	);
}

/**
 * @param {readonly TodoTask[]} tasks
 */
export function selectTodoCounts(tasks) {
	const visible = tasks.filter((task) => task.status !== "deleted");
	return {
		total: visible.length,
		completed: visible.filter((task) => task.status === "completed").length,
	};
}

/**
 * @param {readonly TodoTask[]} tasks
 */
export function selectHasActive(tasks) {
	return tasks.some((task) => task.status === "pending" || task.status === "in_progress");
}

/**
 * @param {readonly TodoTask[]} tasks
 * @param {number} budget
 */
export function selectOverlayLayout(tasks, budget) {
	if (tasks.length <= budget) {
		return { visible: [...tasks], hiddenCompleted: 0, truncatedTail: 0 };
	}

	const innerBudget = budget - 1;
	const nonCompleted = tasks.filter((task) => task.status !== "completed");
	const totalCompleted = tasks.length - nonCompleted.length;

	if (nonCompleted.length <= innerBudget) {
		const kept = new Set(nonCompleted);
		for (const task of tasks) {
			if (kept.size >= innerBudget) break;
			if (task.status === "completed") kept.add(task);
		}
		const visible = tasks.filter((task) => kept.has(task));
		const shownCompleted = visible.filter((task) => task.status === "completed").length;
		return { visible, hiddenCompleted: totalCompleted - shownCompleted, truncatedTail: 0 };
	}

	const visible = nonCompleted.slice(0, innerBudget);
	return { visible, hiddenCompleted: totalCompleted, truncatedTail: nonCompleted.length - innerBudget };
}

export function todoStatusIcon(status) {
	switch (status) {
		case "completed":
			return "✓";
		case "in_progress":
			return "◌";
		default:
			return "○";
	}
}
