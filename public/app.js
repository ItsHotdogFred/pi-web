/* pi-web — browser dashboard for Pi */

import { initDropdowns } from "./js/ui/dropdowns.js";
import { initSplash } from "./js/ui/splash.js";
import { initContextDialPopover } from "./js/context/dial.js";
import { initPermissionModal } from "./js/permissions/modal.js";
import { initNotificationPrompt } from "./js/notifications/prompt.js";
import { initProjectNote } from "./js/project/note.js";
import { fetchGitInfo } from "./js/project/git.js";
import { connect } from "./js/wire/websocket.js";
import { showView } from "./js/ui/views.js";
import { bindEvents } from "./js/events/bind.js";
import { mountAllInlinePickers, mountAllComposers } from "./js/composer/mount.js";
import { applySharedComposerIcons } from "./js/composer/icons.js";
import { mountAllModals } from "./js/ui/mountModals.js";
import { refreshDomRefs, $ } from "./js/dom/elements.js";
import { app } from "./js/state/store.js";

initSplash();
mountAllInlinePickers();
mountAllComposers();
mountAllModals();
applySharedComposerIcons();
refreshDomRefs();
app.ui.attachTarget = $("input");
initContextDialPopover();
initDropdowns();
initPermissionModal();
initNotificationPrompt();
initProjectNote();
bindEvents();
fetchGitInfo();
connect();
showView("dashboard", { animate: false });
