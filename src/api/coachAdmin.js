import { apiGet, apiPost } from "./client.js";

const AUTH_URL = "/api/v1/guestbook_admin_auth.php";
const APPS_URL = "/api/v1/coach_admin_apps.php";
const APP_DECIDE_URL = "/api/v1/coach_admin_decide.php";
const COMPLAINTS_URL = "/api/v1/coach_admin_complaints.php";
const COMPLAINT_DECIDE_URL = "/api/v1/coach_admin_complaint_decide.php";
const RESTORE_URL = "/api/v1/coach_admin_restore.php";

export function getCoachAdminSession(options) {
  return apiGet(AUTH_URL, options);
}

export function loginCoachAdmin(email, password) {
  return apiPost(AUTH_URL, { action: "login", email, password });
}

export function logoutCoachAdmin() {
  return apiPost(AUTH_URL, { action: "logout" });
}

export function getCoachApplications(status, options) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet(`${APPS_URL}${query}`, options);
}

export function decideCoachApplication(playerId, decision) {
  return apiPost(APP_DECIDE_URL, { player_id: playerId, decision });
}

export function getCoachComplaints(options) {
  return apiGet(COMPLAINTS_URL, options);
}

export function decideCoachComplaint({ complaintId, action, publicText, severity, revoke }) {
  const payload = { complaint_id: complaintId, action };
  if (publicText !== undefined) payload.public_text = publicText;
  if (severity !== undefined) payload.severity = severity;
  if (revoke !== undefined) payload.revoke = revoke;
  return apiPost(COMPLAINT_DECIDE_URL, payload);
}

export function restoreCoachQualification({ coachId, reason }) {
  return apiPost(RESTORE_URL, { coach_id: coachId, reason });
}
