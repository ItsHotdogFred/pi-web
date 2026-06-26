/* pi-web — browser dashboard for Pi */

import { initDropdowns } from "./js/ui/dropdowns.js";
import { initContextDialPopover } from "./js/context/dial.js";
import { initPermissionModal } from "./js/permissions/modal.js";
import { initNotificationPrompt } from "./js/notifications/prompt.js";
import { fetchGitInfo } from "./js/project/git.js";
import { connect } from "./js/wire/websocket.js";
import { showView } from "./js/ui/views.js";
import { bindEvents } from "./js/events/bind.js";

initDropdowns();
initContextDialPopover();
initPermissionModal();
initNotificationPrompt();
bindEvents();
fetchGitInfo();
connect();
showView("dashboard", { animate: false });
