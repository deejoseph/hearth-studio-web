import { request } from "./client";

export function login(payload) {
  return request("/login.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function register(payload) {
  return request("/register.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function verifyEmail(payload) {
  return request("/verify-email.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function resendCode(payload) {
  return request("/resend-code.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function sendResetCode(payload) {
  return request("/send-reset-code.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function resetPassword(payload) {
  return request("/reset_password.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
