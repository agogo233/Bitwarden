# 自托管浏览器扩展构建指南

本文档说明如何构建预配置自托管服务器 URL 的浏览器扩展。

## 功能说明

- 构建时注入自托管服务器 URL 作为唯一默认 region
- 构建产物去掉官方 US / EU / Gov 选项，避免 vault 流量切回 Bitwarden 云
- 关闭欢迎页、钓鱼名单同步、HIBP 明文出网，以及默认 map-the-web 规则源
- 用户仍可在扩展里改成其他自托管地址
- 支持 GitHub Actions 工作流和本地构建两种方式

---

## 方式一：GitHub Actions 工作流构建

### 触发方式

1. 访问 https://github.com/agogo233/Bitwarden/actions/workflows/build-browser-extension.yml
2. 点击 **Run workflow**
3. 填写参数：
   - **Version** (可选): 构建版本号，例如 `2026.5.1-selfhost`
   - **Self-hosted server base URL** (必填): 自托管服务器地址，例如 `https://vault.example.com`
4. 点击 **Run workflow** 开始构建

### 输出产物

构建完成后，可在 Artifacts 中下载：
- `bitwarden-chrome-extension-mv3-{version}` - Chrome 扩展
- `bitwarden-edge-extension-mv3-{version}` - Edge 扩展
- `bitwarden-firefox-extension-mv3-{version}` - Firefox 扩展
- `bitwarden-selfhost-all-browsers-mv3-{version}` - 所有浏览器打包

---

## 方式二：本地构建

### 环境要求

- Node.js (版本见 `.nvmrc`)
- npm

### 构建命令

```bash
# 设置自托管 URL 并构建 Chrome 扩展
SELF_HOST_URL=https://vault.example.com npm run dist:selfhost:chrome -w apps/browser

# 设置自托管 URL 并构建 Firefox 扩展 (MV3)
SELF_HOST_URL=https://vault.example.com npm run dist:selfhost:firefox:mv3 -w apps/browser

# 设置自托管 URL 并构建 Edge 扩展
SELF_HOST_URL=https://vault.example.com npm run dist:selfhost:edge -w apps/browser
```

### 可用命令

| 命令 | 说明 |
|------|------|
| `dist:selfhost:chrome` | 构建 Chrome (MV3) |
| `dist:selfhost:edge` | 构建 Edge (MV3) |
| `dist:selfhost:firefox` | 构建 Firefox (MV2) |
| `dist:selfhost:firefox:mv3` | 构建 Firefox (MV3) |
| `dist:selfhost:opera` | 构建 Opera (MV3) |
| `dist:selfhost:opera:mv3` | 构建 Opera (MV3) |

### 恢复原始文件

本地构建后，如需恢复源代码中的 `PRODUCTION_REGIONS` 配置：

```bash
npm run inject:restore -w apps/browser
```

**注意**: 此步骤不是必须的，仅用于保持 Git 工作区清洁。

---

## 用户安装后的行为

### 默认服务器地址

安装扩展后，首次使用时：
- 默认连接到构建时指定的自托管服务器
- 无需手动配置服务器地址

### 用户可修改性

用户可改成其他自托管地址：
1. 点击扩展图标
2. 进入 **设置 (Settings)**
3. 点击 **Self-Hosted Environment**
4. 修改 **Server URL**
5. 保存

region 列表里只保留 Self-hosted，没有 US / EU / Gov。

### 数据存储

服务器地址配置存储在：
- 浏览器本地存储 (`chrome.storage.local`)
- IndexedDB (用于大规模数据)

---

## 注入原理

### 修改内容

`inject-selfhost-config.js` 在构建时改这些文件，构建前会备份到 `apps/browser/scripts/.selfhost-orig/`：

1. `default-environment.service.ts`：`PRODUCTION_REGIONS` 只保留 SelfHosted，`DEFAULT_REGION = Region.SelfHosted`
2. `browser-initial-install.service.ts`：去掉打开 `bitwarden.com/browser-start/` 的 `createNewTab`
3. `phishing-data.service.ts`：后台更新改为 `of(currentMeta)`，不再拉 `assets.bitwarden.com` / GitHub
4. `audit.service.ts`：`fetchLeakedPasswordCount` 直接返回 0，不再请求 `api.pwnedpasswords.com`
5. `autofill/constants/index.ts`：`DEFAULT_FILL_ASSIST_RULES_URL` 改到 `${SELF_HOST_URL}/fill-assist-rules`
6. `manifest.json` / `manifest.v3.json`：`homepage_url` 改成 `SELF_HOST_URL`

### 配置结构

```typescript
{
  key: Region.SelfHosted,
  domain: "self-hosted",
  urls: {
    base: "https://vault.example.com",
    api: "https://vault.example.com/api",
    identity: "https://vault.example.com/identity",
    icons: "https://vault.example.com/icons",
    webVault: "https://vault.example.com",
    notifications: "https://vault.example.com/notifications",
    events: "https://vault.example.com/events",
    scim: "https://vault.example.com/scim",
    send: "https://vault.example.com",
  },
}
```

### 构建时注入

GitHub Actions 工作流会在构建前执行：
```bash
npm run inject:selfhost
```

该命令会：
1. 读取环境变量 `SELF_HOST_URL`
2. 修改 `default-environment.service.ts`
3. 继续执行正常构建流程

---

## 使用场景

| 场景 | 推荐方式 |
|------|----------|
| 企业内部部署 | GitHub Actions 工作流 |
| 为客户提供定制版本 | GitHub Actions 工作流 |
| 本地开发测试 | 本地构建 |
| 官方云版本 | 不指定 `selfHostUrl` |

---

## 故障排查

### 构建失败

1. 检查 `SELF_HOST_URL` 格式是否正确（不应包含尾随 `/`）
2. 确认 Node.js 版本符合要求
3. 运行 `npm ci` 重新安装依赖

### 扩展无法连接服务器

1. 检查服务器地址是否可访问
2. 检查 CORS 配置
3. 尝试在扩展设置中重新配置服务器地址

### 源代码被修改

运行恢复脚本：
```bash
npm run inject:restore -w apps/browser
```

或使用 Git 恢复：
```bash
git checkout libs/common/src/platform/services/default-environment.service.ts
```
