# System Map - Hearth Studio

## 1. Frontend Structure (React)
- 主站前端源码位于 `src/`，使用 React + Vite。
- 页面目录：`src/pages/`，当前包含 `Home`, `Customize`, `OrderDetail`, `Login`, `Register`, `VerifyEmail`, `auth`, `collection`。
- 组件目录：`src/components/`（无子目录，组件以文件形式存在）。
- 路由与布局：`src/routes/`, `src/layout/`。
- 状态与上下文：`src/context/`。

## 2. API Layer (`src/api`)
统一 API 层文件：
- `client.js`：统一 fetch wrapper（唯一入口）。
- `authService.js`
- `orderService.js`
- `productService.js`
- `uploadService.js`
- `errors.js`

约束：所有 API 调用必须通过 `client.js`，响应包含 `meta` 字段需保留。

## 3. Backend PHP Endpoints
该仓库内未发现 PHP 源码或后端路由定义文件。后端 PHP 端点应部署在服务端，前端通过 API 层调用。

## 4. Database Interaction Points
仓库内未发现 MySQL/PDO/mysqli 相关实现。数据库交互应在后端 PHP 服务中完成。

## 5. High-Level Data Flow
Frontend (React UI) → `src/api` (client.js) → PHP Backend (REST API) → MySQL
