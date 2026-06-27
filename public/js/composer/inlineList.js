import { animateEnter } from "../utils/animation.js";

export function createInlinePicker({
	containerEl,
	listEl,
	shouldShow,
	getFilter,
	fetchItems,
	renderItems,
	onSelect,
	onOpen,
	onBeforeUpdate,
	onHide,
}) {
	let lastFilter = null;

	function hide() {
		if (!containerEl.classList.contains("is-open")) return;
		containerEl.classList.remove("is-open");
		containerEl.setAttribute("aria-hidden", "true");
		listEl.classList.remove("anim-fade-down");
		lastFilter = null;
		onHide?.();
	}

	function close() {
		hide();
	}

	function update(input) {
		if (onBeforeUpdate?.(input) === false) return;

		const show = shouldShow(input);
		const wasHidden = !containerEl.classList.contains("is-open");

		if (!show) {
			hide();
			return;
		}

		containerEl.classList.add("is-open");
		containerEl.setAttribute("aria-hidden", "false");

		onOpen?.(input);

		if (wasHidden) animateEnter(listEl, "anim-fade-down");

		const filter = getFilter(input);
		if (!wasHidden && filter === lastFilter) return;
		lastFilter = filter;

		const result = fetchItems(filter, input);

		const render = (items) => {
			if (!containerEl.classList.contains("is-open")) return;
			renderItems(listEl, items, (item) => onSelect(item, input));
		};

		if (result instanceof Promise) {
			void result.then(render);
		} else {
			render(result);
		}
	}

	function open(input) {
		input?.focus();
		update(input);
	}

	function invalidate() {
		lastFilter = null;
	}

	return { update, open, close, invalidate };
}
