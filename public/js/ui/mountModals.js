const MODAL_CONFIGS = [
	{
		id: "permission-modal",
		backdropId: "permission-backdrop",
		dialogId: "permission-dialog",
		dialogClass: "permission-dialog",
		ariaLabelledBy: "permission-title",
		buildContent(dialog) {
			dialog.innerHTML = `
				<h2 class="permission-title" id="permission-title">Allow tool?</h2>
				<pre class="permission-details hidden" id="permission-details"></pre>
				<div class="permission-actions" id="permission-actions"></div>
			`;
		},
	},
	{
		id: "notification-prompt-modal",
		backdropId: "notification-prompt-backdrop",
		dialogClass: "permission-dialog",
		ariaLabelledBy: "notification-prompt-title",
		buildContent(dialog) {
			dialog.innerHTML = `
				<h2 class="permission-title" id="notification-prompt-title">Task notifications</h2>
				<p class="notification-prompt-text">
					Get a browser notification when Pi finishes a task? Useful when you switch tabs while it works.
				</p>
				<div class="permission-actions">
					<button type="button" class="permission-btn" id="notification-prompt-dismiss">Not now</button>
					<button type="button" class="permission-btn permission-btn--allow" id="notification-prompt-enable">
						Enable notifications
					</button>
				</div>
			`;
		},
	},
	{
		id: "project-note-modal",
		backdropId: "project-note-backdrop",
		dialogId: "project-note-dialog",
		dialogClass: "project-note-dialog",
		ariaLabelledBy: "project-note-title",
		buildContent(dialog) {
			dialog.innerHTML = `
				<div class="project-note-header">
					<h2 class="permission-title" id="project-note-title">Project note</h2>
					<span class="project-note-status" id="project-note-status"></span>
				</div>
				<p class="project-note-path" id="project-note-path"></p>
				<textarea
					class="project-note-input"
					id="project-note-input"
					placeholder="Scratchpad for this project — todos, context, links…"
					spellcheck="true"
				></textarea>
				<div class="permission-actions project-note-actions">
					<span class="project-note-hint">Ctrl/Cmd+Shift+N</span>
					<button type="button" class="permission-btn" id="project-note-close">Close</button>
				</div>
			`;
		},
	},
];

export function mountAllModals() {
	const mount = document.getElementById("modals-mount");
	const template = document.getElementById("modal-shell-template");
	if (!mount || !template) return;

	for (const config of MODAL_CONFIGS) {
		const shell = template.content.firstElementChild.cloneNode(true);
		shell.id = config.id;

		const backdrop = shell.querySelector(".permission-backdrop");
		backdrop.id = config.backdropId;

		const dialog = shell.querySelector(".permission-dialog");
		if (config.dialogId) dialog.id = config.dialogId;
		dialog.className = config.dialogClass;
		dialog.setAttribute("role", "dialog");
		dialog.setAttribute("aria-modal", "true");
		if (config.ariaLabelledBy) {
			dialog.setAttribute("aria-labelledby", config.ariaLabelledBy);
		}

		config.buildContent(dialog);
		mount.appendChild(shell);
	}
}
