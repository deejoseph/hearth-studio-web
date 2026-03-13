import { request } from "./client";

export function uploadImage(formData) {
  return request("/upload_image.php", {
    method: "POST",
    headers: {},
    body: formData
  });
}
