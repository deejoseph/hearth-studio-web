import { request } from "./client";

export function getProductCraftOptions(params) {
  const query = new URLSearchParams(params).toString();
  return request(`/product_craft_options/?${query}`);
}

export function getProductDesignData(productId) {
  return request(
    `/product_craft_options/get_product_design_data.php?product_id=${productId}`
  );
}

export function createOrder(payload) {
  return request("/create_order.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getOrderBoard() {
  return request("/get_order_board.php");
}

export function getOrderBoardWithViewer(viewerUserId) {
  const query = viewerUserId
    ? `?viewer_user_id=${encodeURIComponent(viewerUserId)}`
    : "";
  return request(`/get_order_board.php${query}`);
}

export function getOrderDetail(id, viewerUserId) {
  const query = viewerUserId
    ? `&viewer_user_id=${encodeURIComponent(viewerUserId)}`
    : "";
  return request(`/get_order_detail.php?id=${id}${query}`);
}

export function createRound(payload) {
  return request("/create_round.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createShareLink(payload) {
  return request("/create_share_link.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
