# 上游功能与赴约适配层

有些房间来自公开项目的创意、协议或运行时。许可允许且已经完成边界验收的，会随整屋提供适配；非商业许可或我们自己没有做好的能力只保留前端和原作入口。

## 旅行与漫游

- 首选：直接阅读并安装 [yuyixuanfu/nowhere](https://github.com/yuyixuanfu/nowhere)，以原仓库文档、最新代码和许可证为准。
- 许可证：CC BY-NC 4.0。商业发布前必须自行确认许可范围。
- 赴约适配层：只把上游状态映射到赴约的房间、旅行日志和能力契约，适合愿意接受额外维护债务的人。
- 运行方式：可以连接使用者自建的兼容后端；若将来提供赴约托管服务，也只能作为可选服务，不改变上游署名与许可。

赴约适配层可能落后于上游。需要完整功能、最新修复或独立使用时，直接使用上游；只想让它出现在赴约同一套房间与日志里时，再安装适配层。

## Journey Cards 旅行手记

- 来源：[nonchaiovo/journey-cards](https://github.com/nonchaiovo/journey-cards)。
- 许可证：MIT。
- 赴约适配层：纯文字内置；一句话或长笔记直接进入 LocalData，不带上游演示内容，也不要求视觉模型。

## Engawa 阅读侧廊

- 来源：[tsuru0805/engawa-mcp](https://github.com/tsuru0805/engawa-mcp)。
- 许可证：MIT。
- 上游能力：网页、RSS、订阅书架、天象、诗词、艺术、天文与 arXiv。
- 赴约适配层：已固定上游提交并带入安装器、回环侧车、relay 读写白名单和前端。`.runtime` 不进入 Git；失败时不使用演示数据替代。

## 共读与共听

- 共读完整实现推荐 [readest/readest](https://github.com/readest/readest)，AGPL-3.0-or-later；赴约只保留自家的轻量前端。
- 共听完整实现推荐 [Yueby/music-together](https://github.com/Yueby/music-together)，AGPL-3.0；赴约只保留自家的轻量前端，不接管账号 Cookie。
- 选择原作是因为赴约自己的需求与实现都很轻，不是把已经完成的能力降级成空壳。

## 一起钓鱼

- 首选：[tutusagi/ai-fishing-game](https://github.com/tutusagi/ai-fishing-game)。
- 许可证：PolyForm Noncommercial 1.0.0。
- 边界：因为是非商业许可，赴约核心不预装或再发布其游戏代码。需要的使用者应直接阅读上游许可，再决定是否自行安装。

## 只作视觉参考的项目

- [LiamGvchi/gc-minimal-zine-poster](https://github.com/LiamGvchi/gc-minimal-zine-poster)，MIT：旅行日志纸页版式参考。如果没有复制运行时代码，它只进入来源清单，不冒充一个已安装能力包。

新增任何上游适配时，先改 `packages/core/src/capabilities.ts` 的 provenance，再写适配代码。没有明确来源、许可证或可用范围的项目不进入公开候选。
