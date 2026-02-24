// API 服务器地址
const API_BASE = "/api/hearthstudio/v1";

// 图片服务器地址（⚠ 注意带 www）
export const IMAGE_BASE = "https://www.ichessgeek.com/";

/**
 * 获取某个 product 的工艺选项
 */
export async function getProductCraftOptions(productId) {
  try {
    const response = await fetch(
      `${API_BASE}/product_craft_options/?product_id=${productId}`
    );

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error("Error fetching product craft options:", error);
    return {
      success: false,
      data: [],
      error: error.message
    };
  }
}