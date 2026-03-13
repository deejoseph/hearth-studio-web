# 数据模型

以下模型基于 `src/types/apiTypes.ts` 与页面使用方式推断。

## User
代表登录用户信息。
- `id`（推断）
- `name`（推断）
- `email`（推断）

## ProductCraftOption
产品/工艺组合项。
- `id`
- `product_id`
- `product_name`
- `craft_type_id`
- `craft_name`
- `description`（可选）
- `price`
- `image_url`

## ProductPattern
订单可选图案。
- `id`
- `name`
- `thumbnail_url`

## Order
基础订单信息（OrderInfo）。
- `id`
- `order_number`
- `created_at`
- `total_price`
- `cover_image_url`
- `pattern_image`
- `customer_reference_image`

## OrderDetail
订单详情组合。
关系：
- `order_info` → Order
- `timeline` → OrderTimelineStage[]

## OrderTimelineStage
订单阶段节点。
- `status_id`
- `label`
- `is_current`
- `images` → OrderStageImage[]
- `messages` → OrderStageMessage[]

## OrderStageImage
阶段图片。
- `customer_image`
- `studio_image`

## OrderStageMessage
阶段消息。
- `customer_message`
- `studio_reply`

## OrderBoard
订单看板（按季/状态）。
- `seasons` → OrderBoardSeason[]

## OrderBoardSeason
季节/周期分组。
- `id`
- `name`
- `start_date`
- `end_date`
- `production_cycle`
- `total_slots`
- `used_slots`
- `statuses` → OrderBoardStatus[]

## OrderBoardStatus
状态分组。
- `status_id`
- `status_label`
- `status_description`
- `orders` → OrderBoardOrder[]

## OrderBoardOrder
看板上的订单卡片。
- `id`
- `product_image`
- `is_public`
- `customer_name`

## UploadResponse
上传响应（UploadImageResponse）。
- `success`
- `message`
