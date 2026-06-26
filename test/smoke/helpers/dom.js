import { JSDOM } from "jsdom";

export function installDom() {
	const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.DOMParser = dom.window.DOMParser;
	globalThis.Node = dom.window.Node;
}
