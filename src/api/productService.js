const API_BASE = "/api/hearthstudio/v1";

export const IMAGE_BASE = "https://www.ichessgeek.com/";

export async function getProductCraftOptions(params = {}) {
  try {
    const query = new URLSearchParams(params).toString();

    const response = await fetch(
      `${API_BASE}/product_craft_options/?${query}`
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