export function createModal({ el, backdropEl, onClose, restoreFocus = true }) {
	let open = false;
	let previousFocus = null;

	function setVisible(visible) {
		if (!el) return;
		el.classList.toggle("hidden", !visible);
		el.setAttribute("aria-hidden", String(!visible));
	}

	function restorePreviousFocus() {
		if (!restoreFocus || !previousFocus) return;
		if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
			previousFocus.focus();
		} else if (typeof previousFocus.focus === "function") {
			previousFocus.focus();
		}
		previousFocus = null;
	}

	function close() {
		if (!open) return;
		open = false;
		setVisible(false);
		document.removeEventListener("keydown", onEscape);
		restorePreviousFocus();
	}

	function dismiss() {
		if (!open) return;
		onClose?.();
		close();
	}

	function onEscape(event) {
		if (event.key !== "Escape") return;
		event.preventDefault();
		dismiss();
	}

	function openModal() {
		if (!el || open) return;
		if (restoreFocus) {
			previousFocus = document.activeElement;
		}
		open = true;
		setVisible(true);
		document.addEventListener("keydown", onEscape);
	}

	if (backdropEl) {
		backdropEl.addEventListener("click", dismiss);
	}

	return {
		open: openModal,
		close,
		isOpen: () => open,
	};
}
