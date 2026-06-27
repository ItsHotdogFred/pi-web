import { parseSessionJsonl } from "../src/wire/acpEvents.js";

const jsonl = [
	'{"type":"message","id":"msg-assistant-1","message":{"role":"assistant","content":[{"type":"toolCall","id":"call-todo-1","name":"todo","arguments":{"action":"create","subject":"Ship todos"}}]}}',
	'{"type":"message","id":"msg-tool-1","message":{"role":"toolResult","toolCallId":"call-todo-1","toolName":"todo","content":[{"type":"text","text":"Created #1: Ship todos (pending)"}],"details":{"action":"create","params":{"action":"create","subject":"Ship todos"},"tasks":[{"id":1,"subject":"Ship todos","status":"pending"}],"nextId":2}}}',
].join("\n");

const events = parseSessionJsonl(jsonl);
console.log(events);
