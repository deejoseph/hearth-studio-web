# 数据库推断

以下为基于 API 调用与前端字段推断的可能数据库结构，仅用于文档参考。

## users
字段：
- `id` (PK)
- `name`
- `email`
- `password_hash`
- `email_verified_at`
- `created_at`

## products
字段：
- `id` (PK)
- `name`
- `category`
- `description`
- `base_image_url`
- `created_at`

## craft_types
字段：
- `id` (PK)
- `name`
- `description`

## product_craft_options
字段：
- `id` (PK)
- `product_id` (FK → products.id)
- `craft_type_id` (FK → craft_types.id)
- `price`
- `image_url`

## product_patterns
字段：
- `id` (PK)
- `product_id` (FK → products.id)
- `name`
- `thumbnail_url`
- `pattern_url`

## orders
字段：
- `id` (PK)
- `order_number`
- `user_id` (FK → users.id)
- `product_id` (FK → products.id)
- `craft_type_id` (FK → craft_types.id)
- `status`
- `is_public`
- `expected_date`
- `custom_notes`
- `base_inscription`
- `total_price`
- `created_at`

## order_statuses
字段：
- `id` (PK)
- `label`
- `description`
- `sequence`

## order_timeline
字段：
- `id` (PK)
- `order_id` (FK → orders.id)
- `status_id` (FK → order_statuses.id)
- `is_current`
- `created_at`

## order_messages
字段：
- `id` (PK)
- `order_id` (FK → orders.id)
- `status_id` (FK → order_statuses.id)
- `customer_message`
- `studio_reply`
- `created_at`

## order_images
字段：
- `id` (PK)
- `order_id` (FK → orders.id)
- `status_id` (FK → order_statuses.id)
- `customer_image_url`
- `studio_image_url`
- `created_at`

## relationships
- `users` 1..n `orders`
- `orders` 1..n `order_timeline`
- `orders` 1..n `order_messages`
- `orders` 1..n `order_images`
- `products` 1..n `product_craft_options`
- `products` 1..n `product_patterns`
