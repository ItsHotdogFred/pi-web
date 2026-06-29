export const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

export const MAX_PROMPT_BYTES = 10 * 1024 * 1024;

export const RECENT_PROJECTS_KEY = "pi-web-recent-projects";
export const ACTIVITY_ART_KEY = "pi-web-activity-art-style";
export const THEME_PREF_KEY = "pi-web-theme";
export const EDITOR_PREF_KEY = "pi-web-preferred-editor";
export const NOTIFICATIONS_PREF_KEY = "pi-web-notifications";

export const EDITOR_OPTIONS = [
	{ id: "vscode", label: "VS Code" },
	{ id: "cursor", label: "Cursor" },
	{ id: "zed", label: "Zed" },
];

export const CONTEXT_DIAL_CIRCUMFERENCE = 43.982;

export const LANG_TAGS = {
	js: "JS",
	ts: "TS",
	tsx: "TS",
	jsx: "JS",
	py: "PY",
	css: "CSS",
	html: "HTML",
	json: "JSON",
	md: "MD",
};

export const MODEL_SCOPES = {
	dashboard: {
		searchId: "model-search",
		listId: "model-menu-list",
		menuId: "model-menu",
		dropdownId: "model-dropdown",
		labelId: "model-label",
		triggerId: "model-trigger",
	},
	chat: {
		searchId: "chat-model-search",
		listId: "chat-model-menu-list",
		menuId: "chat-model-menu",
		dropdownId: "chat-model-dropdown",
		labelId: "chat-model-label",
		triggerId: "chat-model-trigger",
	},
};

export const COMPOSER_SCOPES = {
	dashboard: {
		formId: "composer",
		inputId: "input",
		attachBtnId: "attach-btn",
		fileRefBtnId: "file-ref-btn",
		inlineCommandsId: "inline-commands",
		inlineCommandsListId: "inline-commands-list",
		inlineFileRefsId: "inline-file-refs",
		inlineFileRefsListId: "inline-file-refs-list",
		isChat: false,
		attachmentsPreviewId: "attachment-previews",
		placeholder: "Ask Pi to explore, fix, or build",
		modifierClass: "composer-box--dashboard",
		modelScope: "dashboard",
		primaryAction: "send",
		showContextDial: false,
	},
	chat: {
		formId: "chat-composer",
		inputId: "chat-input",
		attachBtnId: "chat-attach-btn",
		fileRefBtnId: "chat-file-ref-btn",
		inlineCommandsId: "chat-inline-commands",
		inlineCommandsListId: "chat-inline-commands-list",
		inlineFileRefsId: "chat-inline-file-refs",
		inlineFileRefsListId: "chat-inline-file-refs-list",
		isChat: true,
		attachmentsPreviewId: "chat-attachment-previews",
		placeholder: "Add a follow up",
		modifierClass: "composer-box--chat",
		modelScope: "chat",
		primaryAction: "stop",
		showContextDial: true,
	},
};

export const CONTRIB_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
