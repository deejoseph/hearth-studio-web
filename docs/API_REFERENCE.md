# API 参考

以下端点基于前端调用与 `src/types/apiTypes.ts` 推断，具体字段可能由后端调整。

## 认证与账号

### POST /login.php
用途：用户登录  
请求参数：`email`, `password`  
响应：`success`, `user`, `message`  
类型：`LoginResponse`

### POST /register.php
用途：用户注册  
请求参数：`name`, `email`, `password`  
响应：`success`, `email`, `message`  
类型：`RegisterResponse`

### POST /verify-email.php
用途：邮箱验证码校验  
请求参数：`email`, `code`  
响应：`success`, `user`, `message`  
类型：`VerifyEmailResponse`

### POST /resend-code.php
用途：重发验证码  
请求参数：`email`  
响应：`success`, `message`  
类型：`ResendCodeResponse`

### POST /send-reset-code.php
用途：发送重置码  
请求参数：`email`  
响应：`success`, `message`  
类型：`SendResetCodeResponse`

### POST /reset_password.php
用途：重置密码  
请求参数：`email`, `code`, `new_password`  
响应：`success`, `message`  
类型：`ResetPasswordResponse`

## 产品与工艺

### GET /product_craft_options/?...
用途：获取产品/工艺列表  
请求参数：`category`（查询参数）  
响应：`success`, `data`  
类型：`ProductCraftOptionsResponse`

### GET /product_craft_options/get_product_design_data.php?product_id=...
用途：获取设计/图案数据  
请求参数：`product_id`  
响应：`success`, `patterns`  
类型：`ProductDesignDataResponse`

## 订单

### POST /create_order.php
用途：创建订单  
请求参数（推断）：  
`productId`, `status`, `expected_date`, `craft_type_id`, `pattern_id`,  
`custom_notes`, `pattern_type_id`, `base_inscription`, `image_url`, `is_public`  
响应：`success`, `orderId`, `message`  
类型：`CreateOrderResponse`

### GET /get_order_board.php
用途：获取订单看板  
请求参数：无  
响应：`success`, `seasons`  
类型：`OrderBoardResponse`

### GET /get_order_detail.php?id=...
用途：获取订单详情与时间线  
请求参数：`id`  
响应：`success`, `order_info`, `timeline`  
类型：`OrderDetailResponse`

### POST /create_round.php
用途：创建订单阶段消息/沟通回合  
请求参数：`order_id`, `status_id`, `message`  
响应：`success`, `message`  
类型：`CreateRoundResponse`

## 上传

### POST /upload_image.php
用途：上传订单图片  
请求参数：`image`（文件）, `order_id`, `status_id`（FormData）  
响应：`success`, `message`  
类型：`UploadImageResponse`

## 管理端

### POST https://ichessgeek.com/api/hearthstudio/v1/admin_login.php
用途：管理端登录  
请求参数：`username`, `password`  
响应：`success`, `redirect`, `message`（推断）

### GET https://ichessgeek.com/api/hearthstudio/v1/admin_order.php
用途：管理端页面入口（跳转）  
请求参数：无
