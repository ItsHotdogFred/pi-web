export const $ = (id) => document.getElementById(id);

export const todayListEl = $("today-list");
export const activityFeedEl = $("activity-feed");
export const contribGraphCountEl = $("contrib-graph-count");
export const contribGraphWeeksEl = $("contrib-graph-weeks");
export const contribGraphMonthsEl = $("contrib-graph-months");
export const contribGraphLearnEl = $("contrib-graph-learn");
export const contribGraphNoteEl = $("contrib-graph-note");
export const dashboardViewEl = $("dashboard-view");
export const chatViewEl = $("chat-view");
export const chatAreaEl = $("chat-area");
export const messagesEl = $("messages");
export const statusEl = $("status");
export const chatStatusEl = $("chat-status");
export const projectNameEl = $("project-name");
export const branchNameEl = $("branch-name");
export const chatTitleEl = $("chat-title");

export let composerEl;
export let inputEl;
export let sendEl;
export let chatComposerEl;
export let chatInputEl;
export let cancelEl;
export let attachBtnEl;
export let fileRefBtnEl;
export let modelLabelEl;
export let contextDialWrapEl;
export let contextDialTriggerEl;
export let contextPopoverEl;
export let contextBreakdownEl;
export let contextPopoverSummaryEl;
export let contextActionsEl;
export let contextCompactBtnEl;
export let contextNewSessionBtnEl;

export function refreshDomRefs() {
	composerEl = $("composer");
	inputEl = $("input");
	sendEl = $("send");
	chatComposerEl = $("chat-composer");
	chatInputEl = $("chat-input");
	cancelEl = $("cancel");
	attachBtnEl = $("attach-btn");
	fileRefBtnEl = $("file-ref-btn");
	modelLabelEl = $("model-label");
	contextDialWrapEl = $("context-dial-wrap");
	contextDialTriggerEl = $("context-dial-trigger");
	contextPopoverEl = $("context-popover");
	contextBreakdownEl = $("context-breakdown");
	contextPopoverSummaryEl = $("context-popover-summary");
	contextActionsEl = $("context-actions");
	contextCompactBtnEl = $("context-compact-btn");
	contextNewSessionBtnEl = $("context-new-session-btn");

	permissionModalEl = $("permission-modal");
	permissionDialogEl = $("permission-dialog");
	permissionTitleEl = $("permission-title");
	permissionDetailsEl = $("permission-details");
	permissionActionsEl = $("permission-actions");

	notificationPromptModalEl = $("notification-prompt-modal");
	notificationPromptEnableEl = $("notification-prompt-enable");
	notificationPromptDismissEl = $("notification-prompt-dismiss");

	projectNoteModalEl = $("project-note-modal");
	projectNoteBackdropEl = $("project-note-backdrop");
	projectNoteDialogEl = $("project-note-dialog");
	projectNoteTitleEl = $("project-note-title");
	projectNotePathEl = $("project-note-path");
	projectNoteStatusEl = $("project-note-status");
	projectNoteInputEl = $("project-note-input");
	projectNoteCloseEl = $("project-note-close");
}

export const fileContextEl = $("file-context");
export const sidebarEl = $("sidebar");
export const searchBtnEl = $("search-btn");
export const sidebarSearchEl = $("sidebar-search");
export const searchInputEl = $("search-input");
export const commandsHintEl = $("commands-hint");
export const fileInputEl = $("file-input");

export let permissionModalEl;
export let permissionDialogEl;
export let permissionTitleEl;
export let permissionDetailsEl;
export let permissionActionsEl;

export let notificationPromptModalEl;
export let notificationPromptEnableEl;
export let notificationPromptDismissEl;

export let projectNoteModalEl;
export let projectNoteBackdropEl;
export let projectNoteDialogEl;
export let projectNoteTitleEl;
export let projectNotePathEl;
export let projectNoteStatusEl;
export let projectNoteInputEl;
export let projectNoteCloseEl;
