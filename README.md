# ValueSpark

ValueSpark 是一个私人 AI 思考工作台。它帮助用户捕捉灵感，在可见的思考线程里继续推进，并生成结构化洞见。

## 当前版本

这是第一版桌面端 Web MVP。

已包含：

- Landing 页面
- Spark 灵感库
- Thread 思考工作区
- Mock AI 回复生成器
- 浏览器本地保存
- 洞见生成
- 复制总结
- 导出 Markdown
- 设置占位页
- 首次使用引导

## 本地打开

直接用浏览器打开 `index.html`。

也可以运行本地预览：

```bash
npm run dev
```

然后打开：

```text
http://localhost:4173
```

## 数据保存

数据保存在当前浏览器的 localStorage 里。刷新后数据还在。换电脑或换浏览器配置后，会看到另一份独立数据。

后续可以升级账号、真实 AI 和云端同步。

## 部署到 Vercel

当前版本是静态网站，可以直接部署到 Vercel。

推荐路径：

1. 创建 GitHub 仓库。
2. 把这个文件夹推送到 GitHub。
3. 在 Vercel 里从这个仓库创建新项目。
4. 构建命令填写 `npm run build`。
5. 输出目录填写 `dist`。
6. 部署。

Vercel 会先提供一个公开的 `vercel.app` 链接，正式域名可以后续再绑定。
