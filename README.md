# 飞书字段捷径 - 位置过滤（Cloudflare Workers 版）

> 自定义字段捷径插件：用户输入当前位置后，后端按距离过滤「坐标点」表，返回排序后的下拉选项。

## 项目结构

```
lark-field-extension/
├── src/
│   ├── index.js          # Workers 入口
│   ├── lark.js           # 飞书 OpenAPI 封装（token + 读多维表格）
│   └── geo.js            # Haversine 距离计算
├── wrangler.toml         # Workers 配置
├── package.json
├── .env.example
└── README.md
```

## 完整流程

```
┌─────────────┐  1.用户填表(经纬度)  ┌────────────┐
│ 飞书 Form   │ ──────────────────→ │ 字段捷径   │
│ (用户打开)  │                     │ (飞书侧)   │
└─────────────┘                     └─────┬──────┘
                                          │ 2.POST 回调
                                          ▼
                                   ┌─────────────┐
                                   │ CF Workers  │
                                   │ index.js    │
                                   └─────┬───────┘
                                         │ 3.读「坐标点」表
                                         ▼
                                   ┌─────────────┐
                                   │ 飞书多维表格│
                                   │ API         │
                                   └─────┬───────┘
                                         │ 4.返回记录
                                         ▼
                                   ┌─────────────┐
                                   │ 距离计算    │
                                   │ +过滤+排序  │
                                   └─────┬───────┘
                                         │ 5.返回选项
                                         ▼
                                   ┌─────────────┐
                                   │ 飞书 Form   │
                                   │ 下拉展示    │
                                   └─────────────┘
```

## 步骤 1：部署到 Cloudflare Workers

### 1.1 准备账号

1. 注册 / 登录 https://dash.cloudflare.com/
2. 左侧栏 → Workers & Pages → 创建（首次会让你设置子域，例如 `your-name.workers.dev`）
3. 记下子域名

### 1.2 推送代码到 GitHub

```bash
cd lark-field-extension
git init
git add .
git commit -m "init"
# 在 GitHub 新建空 repo，关联并 push
git remote add origin https://github.com/你的用户名/lark-field-extension.git
git branch -M main
git push -u origin main
```

### 1.3 部署

**方式 A：通过 Dashboard 部署（推荐新手）**

1. Cloudflare Dashboard → Workers & Pages → Create
2. 选「Pages」标签 → 「Connect to Git」→ 选 GitHub repo
3. Build settings 保持默认（不需要构建命令，纯 ESM）
4. 点「Save and Deploy」
5. 部署完成会拿到 URL，例如：`https://lark-field-extension.pages.dev`
6. **端点路径**：`https://lark-field-extension.pages.dev/`（POST）

**方式 B：通过 wrangler CLI 部署**

```bash
# 安装 wrangler
npm install

# 登录
npx wrangler login

# 部署
npx wrangler deploy
```

部署完输出：
```
Published lark-field-extension (X.XX sec)
  https://lark-field-extension.你的子域.workers.dev
```

### 1.4 配置 Secrets（敏感环境变量）

Workers 部署完，在 Dashboard 里：
- Workers & Pages → 选你的项目 → Settings → Variables → 「Add variable」
- Type 选「Secret」（加密存储）
- 添加两个：
  - `APP_ID` = `cli_xxxxxxxxxxxx`
  - `APP_SECRET` = 飞书应用 app_secret

非敏感变量已经写在 `wrangler.toml` 的 `[vars]` 里，不用再设。

## 步骤 2：创建飞书应用

### 2.1 创建企业自建应用

1. 登录 https://open.feishu.cn/
2. 开发者后台 → 「创建企业自建应用」
3. 名称：`位置过滤字段捷径`（可改）
4. 描述：略

### 2.2 开启权限

应用详情页 → 权限管理 → 搜索并开启：
- `bitable:app:readonly`（多维表格只读）

### 2.3 申请字段扩展能力

⚠️ 这一步**可能需要审核**（通常 1-3 个工作日）。

应用详情 → 应用能力 → 找到「多维表格」分类下的「字段扩展」→ 点击申请。

填申请理由（参考）：
> 我们是 XX 公司的位置服务团队，希望在多维表格中实现「输入当前位置后，按距离动态过滤可选坐标点」的能力，提升一线人员外勤选址效率。

### 2.4 配置字段捷径

审核通过后，应用能力 - 字段扩展中「创建字段捷径」：

| 配置项 | 值 |
|---|---|
| 名称 | `位置过滤` |
| 字段类型 | `单选` |
| 回调 URL | `https://lark-field-extension.pages.dev/`（即部署 URL） |
| 输入字段（至少 1 个） | `当前位置经度`（数字）、`当前位置纬度`（数字） |
| 输出 | 飞书会自动从响应里取 `data.options` |

### 2.5 创建版本 + 审核

1. 应用 → 版本管理与发布 → 创建版本
2. 填版本号和说明
3. 提交审核（管理员审批，约几分钟到几小时）

### 2.6 拿到 app_id / app_secret

应用 → 凭证与基础信息 → App ID / App Secret → 复制

回到步骤 1.4，把这两个值配到 Workers Secrets。

## 步骤 3：在多维表格里启用字段捷径

1. 打开 [坐标数据表](https://scnm5rwx3g4r.feishu.cn/base/BInTbEqBgamc6Ts6vj9cu5qdnIg)
2. 切到「**提交记录**」表
3. 添加新字段：
   - 字段名：「附近坐标点」
   - 字段类型：「单选」
   - 在「字段捷径」区域选刚才创建的「位置过滤」
   - 字段捷径输入映射：把表单字段「当前位置经度」「当前位置纬度」映射到捷径输入
4. 保存字段

## 步骤 4：测试

1. 在多维表格里手动添加一条「提交记录」（或用我之前建的「位置提交表单」）
2. 填入「当前位置经度 = 106.49」「当前位置纬度 = 29.62」
3. 点「附近坐标点」字段的输入框，应该看到下拉里出现 5km 内的坐标（如「重庆园博园（0.62 km）」等）
4. 选一个，提交

## 本地调试

```bash
# 安装依赖（wrangler）
npm install

# 起本地 dev server
npx wrangler dev

# 另起终端测试
curl -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{"lat":29.62,"lng":106.49,"radius":5}'
```

预期返回（示例）：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "options": [
      { "label": "重庆园博园（0.62 km）", "value": "rec_xxx" },
      { "label": "重庆中央公园（2.43 km）", "value": "rec_xxx" }
    ],
    "items": [...],
    "total": 5,
    "radius_km": 5
  }
}
```

## 字段捷径协议

### 请求（飞书 → 后端）

飞书在用户每次操作字段时 POST 到回调 URL：

```json
{
  "challenge": "ajls384kdjx...",
  "type": "field_extension",
  "action": "query_options",
  "record": {
    "record_id": "rec...",
    "fields": {
      "当前位置经度": 106.49,
      "当前位置纬度": 29.62
    }
  }
}
```

### 响应（后端 → 飞书）

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "options": [
      { "label": "重庆园博园（0.62 km）", "value": "rec_xxx" }
    ]
  }
}
```

## 常见问题

### Q: 部署后飞书回调 404？
A: Workers 默认入口是根路径 `/`，回调 URL 必须配成 `https://xxx/` 结尾，不要加 `/api/options` 之类的子路径。

### Q: 字段捷径审核没通过？
A: 截图本 README 给飞书客服解释需求。也可以改用「飞书云函数」做后端，但云函数也需要审核。

### Q: Workers 免费额度够用吗？
A: 免费版每天 10 万次请求，对这个场景绰绰有余。

### Q: 改了代码怎么更新？
A: 推到 GitHub，Cloudflare Pages 自动重新部署；或用 `npx wrangler deploy` 手动部署。

### Q: 改 5km 默认值？
A: 改 `wrangler.toml` 里 `DEFAULT_RADIUS_KM = "5"`，重新部署。
