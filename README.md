# 🍁 PDF 工作台（网页版）

一个**完全在浏览器里运行**的 PDF / 图片处理工具。不需要服务器、不需要安装、文件不会上传到任何地方；可添加到手机主屏幕当 App 用，支持离线。

## 打开方式

- 在线：https://li6808.github.io/pdf-workbench/ （GitHub Pages，仓库 `Li6808/pdf-workbench`）
- 本地：直接双击 `index.html`，或用任意静态服务器打开本目录
- 手机：浏览器打开后「添加到主屏幕」，即可全屏使用

## 功能

| 模块 | 内容 |
|---|---|
| 快捷处理 | 一键删封面、按页码批量删页、一叠 PDF 批量去封面、裁剪白边、2/4 合 1 打印 |
| 页面管理 | 勾选删除 / 保留 / 旋转 / 复制、拖拽排序、追加合并、插入空白页 |
| 格式转换 | Word(.docx)、TXT、Markdown、HTML 网页、CSV |
| 编辑批注 | 中文水印、自动页码、按坐标插入文字 |
| 图片压缩 | 证件照改像素尺寸、按目标 KB 自动压缩、JPG/PNG/WebP、前后对比 |
| 拆分导出 | 整本转图片 ZIP、按固定页数或页码段拆分、选中页另存 |

顶栏 ↶ / ↷ 支持撤销重做（`⌘Z` / `⌘⇧Z`），「保存」下载当前 PDF。所有说明都收在悬停提示里，点右上角 `?` 看完整帮助。

## 技术

纯静态，零构建：`pdf.js`（渲染 / 文字层）+ `pdf-lib`（页面结构 / 绘制）+ `JSZip`（打包 / 生成 docx）。依赖已放在 `vendor/`，无需 CDN、无需联网。界面响应式，桌面为图标侧栏，手机为底部导航；PWA 由 `sw.js` 提供离线缓存。

> 与 Python 服务端版本相比，浏览器版不含 `pdf2docx` 版式还原、Excel 表格提取、PPTX 导出和框选替换文字；这些能力依赖服务端库。文字提取依赖 PDF 的文字层，扫描件需先 OCR。

## 文件

```
index.html  style.css  app.js  features.js  image.js
vendor/     pdf.js / pdf-lib / JSZip
manifest.webmanifest  sw.js  icon-*.png
```
