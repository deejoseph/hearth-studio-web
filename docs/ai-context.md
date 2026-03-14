# AI Agent Context - Hearth Studio
# Hearth Studio – AI Context Guide

This document provides essential context for AI coding agents
working on the Hearth Studio repository.

Agents should read this file before making code changes.

## 1. Project Overview
Hearth Studio 是一个定制陶瓷订单管理系统，用于生产个性化产品（如定制宠物浮雕杯）。系统由两部分组成：面向客户的下单网站，以及内部的管理后台。

## 2. Architecture Overview
前端使用 React + Vite（JSX、React Router、CSS）构建客户与后台界面。后端为 PHP + MySQL 的 REST API。部署模型为主站点 `https://www.ichessgeek.com` 与管理系统路径 `/hearth_admin`，共享同一套后端服务。

## 3. Key Directories
- `src/`: 前端应用源码（页面、组件、路由、状态）。
- `src/api/`: 统一 API 层，包含 `client.js` 与各业务模块文件（`orders.js`, `products.js`, `users.js`, `upload.js`）。
- `components/`: 可复用 UI 组件。
- `pages/`: 页面级视图与路由入口。
- `docs/`: 项目文档（计划包含 `architecture.md`, `api.md`, `devlog.md`, `system-diagram.md`）。

## 4. API Layer Rules
- 严禁直接使用原生 `fetch` 或任意自定义请求实现。
- 所有 API 调用必须通过 `src/api/client.js` 的 fetch wrapper。
- API 响应包含 `meta` 字段，调用方必须正确解析并保留该信息。

## 5. Coding Conventions
- 保持生产系统稳定，避免引入破坏性变更。
- 只做增量改动，优先小范围修复与优化。
- 遵循现有代码风格与组织方式。
- 不引入新框架或全量替换技术栈，除非已有明确决策。
- 修改前先定位调用点与依赖关系，避免影响跨模块行为。

## 6. Security Guidelines
- 不要在代码或日志中暴露密钥、令牌或敏感数据。
- 对所有用户输入保持校验与清洗。
- 文件上传需校验类型、大小与权限。
- 严格遵循既有认证与权限流程。

## 7. Safe Refactoring Policy
- 优先小改动，避免大规模重构。
- 避免重命名广泛使用的模块或接口。
- 如需架构调整，必须先说明影响范围并征求确认。

## 8. AI Agent Workflow
- 先阅读相关文件与调用路径，再动手修改。
- 修改前使用搜索定位受影响的文件。
- 先提出计划或变更说明，再实施最小化修改。
- 变更后保持行为一致，优先修复回归风险。

## 9. Known Constraints
- 仓库体量大（约 400MB / 28,000 文件 / 3,400 目录）。
- 系统已在生产环境运行。
- 必须保持向后兼容。

## 10. Future Architecture Direction
- 渐进式 TypeScript 迁移（不影响现有功能）。
- 强化 API 类型与响应结构约束（包含 `meta`）。
- 完善文档体系与系统图。
- 推进更安全可控的 AI 辅助开发流程。
