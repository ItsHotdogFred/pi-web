import { app } from "../state/store.js";
import { $, inputEl, chatInputEl } from "../dom/elements.js";
import { setBusy } from "../ui/status.js";
import { escapeHtml } from "../utils/format.js";

export function getAttachmentsFor(target) {
	return target === chatInputEl ? app.chatAttachments : app.dashboardAttachments;
}

export function getPreviewContainerFor(target) {
	return target === chatInputEl ? $("chat-attachment-previews") : $("attachment-previews");
}

export function renderAttachmentPreviews(target = app.attachTarget) {
	const attachments = getAttachmentsFor(target);
	const container = getPreviewContainerFor(target);
	if (!container) return;

	container.replaceChildren();
	if (attachments.length === 0) {
		container.classList.add("hidden");
		setBusy(app.busy);
		return;
	}

	container.classList.remove("hidden");
	for (const attachment of attachments) {
		const chip = document.createElement("div");
		chip.className = "attachment-chip";
		chip.innerHTML = `
			<img src="${attachment.previewUrl}" alt="${escapeHtml(attachment.name)}" />
			<button type="button" class="attachment-remove" aria-label="Remove image">×</button>`;
		chip.querySelector(".attachment-remove").addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const list = getAttachmentsFor(target);
			const index = list.indexOf(attachment);
			if (index >= 0) list.splice(index, 1);
			renderAttachmentPreviews(target);
		});
		container.appendChild(chip);
	}
	setBusy(app.busy);
}

export function handleImagePaste(event, target) {
	const items = event.clipboardData?.items;
	if (!items) return false;

	for (const item of items) {
		if (!item.type.startsWith("image/")) continue;
		const file = item.getAsFile();
		if (!file) continue;
		event.preventDefault();
		addImageAttachment(file, target);
		return true;
	}

	return false;
}

export function addImageAttachment(file, target = app.attachTarget) {
	if (!file || !file.type.startsWith("image/")) return;

	const reader = new FileReader();
	reader.onload = () => {
		const previewUrl = reader.result;
		const base64 = String(previewUrl).split(",")[1] ?? "";
		const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
		const name = file.name?.trim() || `pasted-${Date.now()}.${ext}`;
		getAttachmentsFor(target).push({
			name,
			mimeType: file.type || "image/png",
			data: base64,
			previewUrl,
		});
		renderAttachmentPreviews(target);
	};
	reader.readAsDataURL(file);
}

export function clearAttachments(target = app.attachTarget) {
	getAttachmentsFor(target).length = 0;
	renderAttachmentPreviews(target);
}
