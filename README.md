# 邮箱管家桌面端

基于 Tauri v2、React、TypeScript 和 Rust 的本地认证邮件管理工具。首版定位为“认证管家”：批量导入邮箱账号，在本机监听认证邮件，提取验证码和认证链接，并提供通知、复制、打开、规则管理和历史检索。

## 技术栈

- Tauri v2 + Rust commands
- React + Vite + TypeScript
- Tailwind CSS + Radix UI + Lucide icons
- SQLite 元数据存储
- Stronghold 插件 + 本地加密保险库抽象

## 功能范围

- 账号导入：兼容 `email----password----client_id----refresh_token`，支持 CSV/TXT/剪贴板内容。
- 原项目接口兼容：保留 `email/password/group_name/status/account_type/imap_server/imap_port/smtp_server/smtp_port/client_id/refresh_token/has_aws_code/remark` 等账号元数据语义；导入默认跳过重复邮箱。
- 规则编辑：支持关键词、排除词、验证码正则、链接正则、优先级、启停和样例测试。
- 结果处理：验证码和认证链接原文进保险库，列表只显示脱敏预览。
- 监听模型：UI 和命令接口按 IMAP IDLE 优先、轮询回退设计；当前后端提供刷新流程和事件骨架。

## 本地运行

浏览器开发服务只用于查看界面结构，不再提供模拟邮箱数据。账号、规则、结果和保险库操作需要在 Tauri 桌面运行时内执行。

```bash
npm install
npm run dev
```

前端构建：

```bash
npm run build
```

桌面端需要先安装 Rust、Cargo、rustup 和 Windows MSVC Build Tools：

```bash
npm run tauri -- info
npm run tauri -- dev
```

当前刷新命令不会生成示例验证码或示例链接；真实邮件协议客户端接入前，刷新只更新账号和 worker 状态。

## 测试

```bash
npm test
```

当前测试覆盖导入解析、验证码/链接提取、规则匹配和优先级选择。

## 许可和来源

本项目按新技术栈重构，不迁移原 PyQt UI 代码。需求和能力参考了 [Mengv0320/Email-Manager](https://github.com/Mengv0320/Email-Manager)，该仓库使用 MIT License；如后续复用其具体代码片段，应保留对应版权和许可声明。
