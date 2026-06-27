import { COMPOSER_SCOPES, MODEL_SCOPES } from "../config.js";

const PICKER_LABELS = {
	commands: "Slash commands",
	fileRefs: "File references",
};

const CONTEXT_DIAL_IDS = {
	wrap: "context-dial-wrap",
	trigger: "context-dial-trigger",
	label: "context-dial-label",
	popover: "context-popover",
	summary: "context-popover-summary",
	breakdown: "context-breakdown",
	actions: "context-actions",
	compactBtn: "context-compact-btn",
	newSessionBtn: "context-new-session-btn",
};

function createInlinePicker(scope, type) {
	const template = document.getElementById("inline-picker-template");
	if (!template) return null;

	const picker = template.content.firstElementChild.cloneNode(true);
	const list = picker.querySelector(".inline-commands-list");

	if (type === "commands") {
		picker.id = scope.inlineCommandsId;
		list.id = scope.inlineCommandsListId;
		picker.setAttribute("aria-label", PICKER_LABELS.commands);
	} else {
		picker.id = scope.inlineFileRefsId;
		list.id = scope.inlineFileRefsListId;
		picker.setAttribute("aria-label", PICKER_LABELS.fileRefs);
	}

	return picker;
}

function createModelDropdown(modelScopeKey) {
	const modelScope = MODEL_SCOPES[modelScopeKey];
	const template = document.getElementById("model-dropdown-template");
	if (!modelScope || !template) return null;

	const dropdown = template.content.firstElementChild.cloneNode(true);
	dropdown.id = modelScope.dropdownId;

	const trigger = dropdown.querySelector(".dropdown-trigger");
	trigger.id = modelScope.triggerId;

	const label = trigger.querySelector("span");
	label.id = modelScope.labelId;
	label.textContent = "Model";

	const menu = dropdown.querySelector(".dropdown-menu");
	menu.id = modelScope.menuId;

	const search = menu.querySelector("input[type='search']");
	search.id = modelScope.searchId;

	const list = menu.querySelector(".model-menu-list");
	list.id = modelScope.listId;

	return dropdown;
}

function createContextDial() {
	const template = document.getElementById("context-dial-template");
	if (!template) return null;

	const wrap = template.content.firstElementChild.cloneNode(true);
	wrap.id = CONTEXT_DIAL_IDS.wrap;

	const trigger = wrap.querySelector(".context-dial");
	trigger.id = CONTEXT_DIAL_IDS.trigger;

	const label = wrap.querySelector(".context-dial-label");
	label.id = CONTEXT_DIAL_IDS.label;

	const popover = wrap.querySelector(".context-popover");
	popover.id = CONTEXT_DIAL_IDS.popover;

	const summary = wrap.querySelector(".context-popover-summary");
	summary.id = CONTEXT_DIAL_IDS.summary;

	const breakdown = wrap.querySelector(".context-breakdown");
	breakdown.id = CONTEXT_DIAL_IDS.breakdown;

	const actions = wrap.querySelector(".context-actions");
	actions.id = CONTEXT_DIAL_IDS.actions;

	const buttons = actions.querySelectorAll(".context-action-btn");
	buttons[0].id = CONTEXT_DIAL_IDS.compactBtn;
	buttons[0].textContent = "Compact now";
	buttons[1].id = CONTEXT_DIAL_IDS.newSessionBtn;
	buttons[1].textContent = "Start fresh session";

	return wrap;
}

function createPrimaryAction(scope) {
	const btn = document.createElement("button");
	if (scope.primaryAction === "send") {
		btn.type = "submit";
		btn.className = "send-btn";
		btn.id = "send";
		btn.dataset.composerIcon = "send";
		btn.disabled = true;
		btn.setAttribute("aria-label", "Send");
	} else {
		btn.type = "button";
		btn.id = "cancel";
		btn.className = "icon-btn composer-icon btn-stop hidden";
		btn.dataset.composerIcon = "stop";
		btn.disabled = true;
		btn.setAttribute("aria-label", "Stop");
	}
	return btn;
}

function mountComposerForm(mountEl, scopeKey) {
	const scope = COMPOSER_SCOPES[scopeKey];
	const template = document.getElementById("composer-form-template");
	if (!mountEl || !template || !scope) return;

	const form = template.content.firstElementChild.cloneNode(true);
	form.id = scope.formId;
	form.classList.add(scope.modifierClass);

	const textarea = form.querySelector("textarea");
	textarea.id = scope.inputId;
	textarea.placeholder = scope.placeholder;

	const previews = form.querySelector(".attachment-previews");
	previews.id = scope.attachmentsPreviewId;

	const composerLeft = form.querySelector(".composer-left");
	if (scope.showContextDial) {
		const contextDial = createContextDial();
		if (contextDial) composerLeft.appendChild(contextDial);
	}
	const modelDropdown = createModelDropdown(scope.modelScope);
	if (modelDropdown) composerLeft.appendChild(modelDropdown);

	const attachBtn = form.querySelector('[data-composer-icon="attach"]');
	attachBtn.id = scope.attachBtnId;

	const fileRefBtn = form.querySelector('[data-composer-icon="fileRef"]');
	fileRefBtn.id = scope.fileRefBtnId;

	const composerRight = form.querySelector(".composer-right");
	composerRight.appendChild(createPrimaryAction(scope));

	mountEl.appendChild(form);
}

export function mountAllComposers() {
	mountComposerForm(document.getElementById("dashboard-composer-mount"), "dashboard");
	mountComposerForm(document.getElementById("chat-composer-mount"), "chat");
}

function mountInlinePickers(mountEl, scope) {
	if (!mountEl) return;
	const commands = createInlinePicker(scope, "commands");
	const fileRefs = createInlinePicker(scope, "fileRefs");
	if (commands) mountEl.appendChild(commands);
	if (fileRefs) mountEl.appendChild(fileRefs);
}

export function mountAllInlinePickers() {
	mountInlinePickers(document.getElementById("dashboard-inline-pickers"), COMPOSER_SCOPES.dashboard);
	mountInlinePickers(document.getElementById("chat-inline-pickers"), COMPOSER_SCOPES.chat);
}
