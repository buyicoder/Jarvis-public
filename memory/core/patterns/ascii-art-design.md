---
name: ascii-art-design
type: pattern
date: 2026-06-21
tags: [README, ASCII, 设计, FIGlet, 品味]
status: verified
source: modfactory README 美化
---

# README ASCII 艺术字设计模式

## 场景
为 GitHub 项目 README 设计命令行风格的立体字 logo。

## 错误路径
1. 手写 ASCII art —— 字体不一致，字符错位
2. 用同一个字体连写 MOD 和 FACTORY —— visual clutter
3. 在纯文本 art 右边加注释小字 —— 破坏结构

## 正确路径
1. **用 FIGlet**：`npx figlet -f "<font>" "TEXT"` 自动生成
2. **短词瘦体 + 长词宽体**：MOD 用细体（经典单线），FACTORY 用粗体（ANSIShadow 风格），形成视觉对比
3. **上下拆分 + 空行分隔**：MOD 在上，空一行，FACTORY 在下
4. **不加注释**：艺术字本身应该自解释，不需要旁边的小字
5. **落地页配合**：taste-skill 暗色科技风（VARIANCE 6, MOTION 4, DENSITY 3）

## 推荐 FIGlet 字体

| 字体 | 适用 | 效果 |
|------|------|------|
| ANSI Shadow | 长词（FACTORY） | 块状加粗，有阴影深度 |
| Standard | 短词（MOD） | 经典单线，可读性强 |
| 3D-ASCII | 标题 | 薄，适合小字 |
| Doom | 短词标语 | 方块风，游戏感 |

## 可复用性
任何需要 README logo 的项目直接套用。改 `npx figlet -f "<font>" "项目名"` 即可。
