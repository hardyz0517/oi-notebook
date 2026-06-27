# OI Notebook UI Primitives & Design Tokens Design

Date: 2026-06-18
Status: Draft

## 1. 背景

当前项目里同时存在多套 UI 语义和实现：

- `src/components/ui` 里的基础组件
- Settings v2 自己的 primitives
- NoteX 私有按钮、下拉、开关样式
- App / editor / tag-manager 里的内联按钮和自写 dropdown

这导致几个问题：

- 语义错位：目录项、列表项、菜单项被当成普通 Button 使用
- 视觉不统一：hover、selected、focus-visible、disabled 的来源分散
- motion 不一致：展开、收起、弹出、切换的过渡手感不同
- 迁移成本高：Settings v2 接入基础组件后，仍然容易复用错误语义

本次重构的目标不是重做主题，也不是翻新全局视觉风格，而是把设计系统基础层收口。

## 2. 目标

1. 让 `src/components/ui` 成为唯一设计系统入口。
2. 建立清晰的组件语义边界：
   - `Button` 只表示动作
   - `NavItem`、`ListItem`、`DropdownItem`、`ToolbarButton`、`SettingRow` 表示组合语义
3. 统一基础 token：
   - spacing
   - radius
   - border
   - hover / active / selected / focus-visible / disabled
   - motion / reduced motion
4. 让 Settings v2 成为完整试点。
5. 让 App / editor / tag-manager 只迁移低风险高频控件，不做一次性全量翻修。

## 3. 非目标

本次不做：

- 主题 resolver 重写
- 全软件视觉重绘
- 复杂页面布局重构
- 业务交互流程大改
- design system 独立成新包
- 全量迁移所有旧控件

## 4. 分层方案

`src/components/ui` 内部按三层组织：

### 4.1 `base/`

最底层交互原语，只负责单一交互语义。

建议包含：

- `Button`
- `IconButton`
- `Input`
- `Switch`
- `Slider`
- `Dialog`
- `Popover`
- `Tooltip`
- `DropdownMenu`
- `Select`

这层允许有 variants，但不承载页面语义。

### 4.2 `composed/`

组合层，只表达明确场景语义。

建议包含：

- `NavItem`
- `ListItem`
- `DropdownItem`
- `ToolbarButton`
- `SegmentedControl`
- `SettingRow`

这层可以组合 base 层，但不应再向业务层泄露底层拼装细节。

### 4.3 `tokens/`

设计 token 和 motion token 的唯一来源。

建议包含：

- spacing scale
- radius scale
- border scale
- state tokens
- motion tokens
- reduced motion fallback

## 5. Token 规范

### 5.1 spacing

统一控件内部和控件之间的间距来源，覆盖：

- 按钮 padding
- list item 内边距
- dropdown item padding
- setting row 间距
- panel / dialog 内边距

### 5.2 radius

统一圆角层级，至少区分：

- control radius
- item radius
- panel radius
- dialog radius

### 5.3 border

统一边框和分割线来源，避免每个组件各自定义灰边。

### 5.4 interactive state

状态语义统一从 token 读取：

- `hover`
- `active`
- `selected`
- `focus-visible`
- `disabled`

要求：

- `selected` 不再随意借 `accent`
- `hover` 不再由各页面自定义近似色
- `focus-visible` 必须可见且统一
- `disabled` 由语义 token 控制，不只是 opacity

### 5.5 motion

统一：

- duration
- easing
- enter / exit
- transform / opacity 组合
- reduced motion fallback

要求：

- dropdown、dialog、popover、switch、segmented control 的动效语言一致
- reduced motion 下保留状态变化，但降低位移和缩放

### 5.6 落地方式

Token 不单独再造一套解析器。

实现上应优先复用现有主题入口，用 CSS custom properties 或等价的全局变量层承载语义 token，再由组件消费这些 token。这样可以做到：

- 不重写主题 resolver
- 不改变现有主题开关的行为
- 让基础层和组合层共享同一套状态语义

## 6. 组件语义边界

### 6.1 Button

只用于明确动作：

- 保存
- 删除
- 确认
- 重试
- 展开

不用于：

- 导航项
- 列表项
- 菜单项
- 设置行

### 6.2 IconButton

只用于图标型动作按钮。

要求：

- 固定点击目标
- 必须带 `aria-label`
- 与普通 Button 分离尺寸和密度规则

### 6.3 NavItem

用于导航和当前位置切换：

- settings sidebar item
- folder / category item
- tab-like side navigation

要求：

- 支持 `selected`
- 支持 keyboard navigation
- 文字和图标布局不应居中成普通按钮样式

### 6.4 ListItem

用于列表型信息容器：

- 标题 + 描述 + 尾部操作
- 轻交互条目
- 信息密度较高的设置行基底

### 6.5 DropdownItem

用于菜单内条目：

- 普通选项
- checkbox item
- dangerous item

要求：

- 支持 highlighted / checked / disabled
- 支持 keyboard navigation
- 动画和命中区域统一

### 6.6 ToolbarButton

用于编辑器工具栏和高频密集工具组。

要求：

- 视觉更轻
- 密度更高
- selected 状态明确
- 不与普通 Button 共用同一套表层样式

### 6.7 SettingRow

用于设置页的一行标准布局：

- 左侧标题 / 描述
- 右侧控件
- 支持 stacked / split / nested 等布局变体

要求：

- 作为 Settings 页面标准结构单元
- 不再在页面内手写同款布局

## 7. Settings v2 试点

Settings v2 作为完整试点，验证这套体系是否够用。

试点范围：

- 侧边导航改为 `NavItem`
- 设置表单统一到 `SettingRow`
- 下拉 / 开关 / 分段 / 弹窗统一到 `src/components/ui`
- Settings v2 自己的 primitives 最终收掉
- 现有 `SettingsButton`、`SettingsDialog`、`SettingRow` 等私有包装逐步退场

试点重点检查：

- 语义是否正确
- selected / hover / active 是否统一
- dropdown 展开是否自然
- focus-visible 是否稳定
- reduced motion 是否正常

## 8. 迁移策略

### 8.1 第一批

先统一高频低风险控件：

- Button
- IconButton
- Switch
- DropdownMenu / DropdownItem
- Dialog
- SettingRow

### 8.2 第二批

再迁移组合语义：

- NavItem
- ListItem
- ToolbarButton
- SegmentedControl

### 8.3 业务侧

App / editor / tag-manager 只做局部迁移：

- 低风险按钮
- 开关
- dropdown
- setting row

不做一次性全量替换。

## 9. 测试重点

1. 键盘导航可用。
2. `focus-visible` 清晰可见。
3. `selected` / `hover` / `active` 状态一致。
4. `disabled` 行为一致。
5. reduced motion 下仍然自然。
6. dropdown / dialog / popover 的展开收起无布局抖动。
7. Settings v2 侧边栏、设置行、弹窗行为正确。

## 10. 风险与约束

- 不要把 `Button` 再扩成所有可点击元素的总入口。
- 不要在组件层偷偷引入新的私有样式体系。
- 不要在这次重构里顺手改主题 resolver。
- 不要让业务页面直接写一套新的 dropdown / switch / row。
- 不要为了统一而牺牲 keyboard / aria 语义。

## 11. 成功标准

如果本次设计落地成功，应满足：

- `src/components/ui` 是唯一基础入口
- Settings v2 不再依赖自己的私有 primitives
- Button / NavItem / ListItem / DropdownItem / SettingRow 的边界清楚
- token 和 motion 统一来源明确
- App / editor / tag-manager 不再继续扩散新的控件体系

