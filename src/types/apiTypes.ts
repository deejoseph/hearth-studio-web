// API response types inferred from current frontend usage.
// Fields marked with `// inferred` are based on how the UI reads them.

export type ApiSuccess = {
  success: true;
};

export type ApiFailure = {
  success: false;
  message?: string; // inferred
};

export type ApiResponse<T> = (ApiSuccess & T) | ApiFailure;

// Auth
export type AuthUser = {
  id?: number | string; // inferred
  name?: string; // inferred
  email?: string; // inferred
  [key: string]: unknown; // inferred
};

export type LoginResponse = ApiResponse<{
  user: AuthUser; // inferred
  message?: string; // inferred
}>;

export type RegisterResponse = ApiResponse<{
  email?: string; // inferred
  message?: string; // inferred
}>;

export type VerifyEmailResponse = ApiResponse<{
  user?: AuthUser; // inferred
  message?: string; // inferred
}>;

export type ResendCodeResponse = ApiResponse<{
  message?: string; // inferred
}>;

export type SendResetCodeResponse = ApiResponse<{
  message?: string; // inferred
}>;

export type ResetPasswordResponse = ApiResponse<{
  message?: string; // inferred
}>;

// Product / Craft
export type ProductCraftOption = {
  id: number | string; // inferred
  product_id: number | string; // inferred
  product_name: string; // inferred
  craft_type_id: number | string; // inferred
  craft_name: string; // inferred
  description?: string; // inferred
  price: number | string; // inferred
  image_url: string; // inferred
  [key: string]: unknown; // inferred
};

export type ProductCraftOptionsResponse = ApiResponse<{
  data: ProductCraftOption[]; // inferred
}>;

export type ProductPattern = {
  id: number | string; // inferred
  name: string; // inferred
  thumbnail_url: string; // inferred
  [key: string]: unknown; // inferred
};

export type ProductDesignDataResponse = ApiResponse<{
  patterns: ProductPattern[]; // inferred
}>;

// Order Board
export type OrderBoardSeason = {
  id: number | string; // inferred
  name: string; // inferred
  start_date?: string; // inferred
  end_date?: string; // inferred
  production_cycle?: string; // inferred
  total_slots: number; // inferred
  used_slots: number; // inferred
  statuses?: OrderBoardStatus[]; // inferred
  [key: string]: unknown; // inferred
};

export type OrderBoardStatus = {
  status_id: number | string; // inferred
  status_label?: string; // inferred
  status_description?: string; // inferred
  orders?: OrderBoardOrder[]; // inferred
  [key: string]: unknown; // inferred
};

export type OrderBoardOrder = {
  id: number | string; // inferred
  product_image?: string; // inferred
  is_public?: number | boolean; // inferred
  customer_name?: string | null; // inferred
  [key: string]: unknown; // inferred
};

export type OrderBoardResponse = ApiResponse<{
  seasons: OrderBoardSeason[]; // inferred
}>;

// Order Detail
export type OrderInfo = {
  id: number | string; // inferred
  order_number?: string | number; // inferred
  created_at?: string; // inferred
  total_price?: number | string; // inferred
  cover_image_url?: string; // inferred
  pattern_image?: string; // inferred
  customer_reference_image?: string; // inferred
  [key: string]: unknown; // inferred
};

export type OrderStageImage = {
  customer_image?: string; // inferred
  studio_image?: string; // inferred
  [key: string]: unknown; // inferred
};

export type OrderStageMessage = {
  id?: number | string; // inferred
  customer_message?: string; // inferred
  studio_reply?: string; // inferred
  [key: string]: unknown; // inferred
};

export type OrderTimelineStage = {
  status_id: number | string; // inferred
  label?: string; // inferred
  is_current?: number | boolean; // inferred
  images?: OrderStageImage[]; // inferred
  messages?: OrderStageMessage[]; // inferred
  [key: string]: unknown; // inferred
};

export type OrderDetailResponse = ApiResponse<{
  order_info: OrderInfo; // inferred
  timeline: OrderTimelineStage[]; // inferred
}>;

export type CreateOrderResponse = ApiResponse<{
  orderId?: number | string; // inferred
  message?: string; // inferred
}>;

export type CreateRoundResponse = ApiResponse<{
  message?: string; // inferred
}>;

export type UploadImageResponse = ApiResponse<{
  message?: string; // inferred
}>;
