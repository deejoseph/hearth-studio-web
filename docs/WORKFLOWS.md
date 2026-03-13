# 业务流程

## 订单生命周期

### 1. 客户创建订单
客户在分类页选择工艺后进入桥接页，填写定制信息并提交。
调用：
- `GET /product_craft_options/get_product_design_data.php`
- `POST /create_order.php`

### 2. 上传图片
客户在订单详情页面上传参考图或阶段图片。
调用：
- `POST /upload_image.php`

### 3. 订单处理
订单阶段与沟通记录由时间线体现，前端通过订单详情接口刷新。
调用：
- `GET /get_order_detail.php`
- `POST /create_round.php`

### 4. 发货/完成
“发货”阶段作为时间线阶段之一，由后端更新并返回给前端展示。
调用：
- `GET /get_order_detail.php`

## 流程图
```mermaid
flowchart LR
  A["客户创建订单"] --> B["订单创建 API"]
  B --> C["订单详情/时间线"]
  C --> D["上传图片"]
  D --> E["订单处理阶段更新"]
  E --> F["发货/完成"]
```
