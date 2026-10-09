function fenced(language: string, lines: string[]): string {
  const fence = String.fromCharCode(96).repeat(3);
  return fence + language + "\n" + lines.join("\n") + "\n" + fence;
}

function mermaid(id: string, name: string, lines: string[]) {
  return { id, name: "插入 Mermaid 模板：" + name, body: fenced("mermaid", lines) };
}

function echarts(id: string, name: string, lines: string[]) {
  return { id, name: "插入 ECharts 模板：" + name, body: fenced("echarts", lines) };
}

export const SNIPPET_TEMPLATES = [
  {
    id: "kpi",
    name: "插入块模板：KPI 指标卡",
    body: [
      ":::kpi",
      "- **86%** _+12%_ ⟦转化率提升⟧",
      "- **3.2×** 单位获客效率",
      "- **+27.8** 净推荐值净增长",
      ":::"
    ].join("\n")
  },
  {
    id: "timeline",
    name: "插入块模板：时间线",
    body: [
      ":::timeline",
      "- **Q1 立项** ⟦用户调研 / 方案评审⟧",
      "- **Q2 研发** MVP / 小范围内测",
      "- **Q3 上线** 灰度发布 / 全量启用",
      "- **Q4 复盘** 指标评估 / 下一轮规划",
      ":::"
    ].join("\n")
  },
  mermaid("flowchart", "流程图", [
    "---",
    "config:",
    "  flowchart:",
    "    curve: basis",
    "---",
    "flowchart LR",
    "  subgraph request[需求入口]",
    "    A([⟦提交请求⟧]) --> B[校验资料]",
    "  end",
    "  subgraph processing[处理流程]",
    "    B --> C{条件满足?}",
    "    C -->|是| D[执行处理]",
    "    C -->|否| E[补充信息]",
    "    E --> B",
    "  end",
    "  D --> F([完成])"
  ]),
  mermaid("swimlane-flowchart", "泳道流程图", [
    "---",
    "config:",
    "  flowchart:",
    "    curve: basis",
    "---",
    "flowchart LR",
    "  subgraph customer[用户]",
    "    A([⟦提交申请⟧])",
    "    B[补充资料]",
    "    Z([收到结果])",
    "  end",
    "  subgraph service[业务服务]",
    "    C[校验申请]",
    "    D{符合条件?}",
    "    E[生成处理单]",
    "  end",
    "  subgraph system[后台系统]",
    "    F[读取业务数据]",
    "    G[更新处理状态]",
    "  end",
    "  A --> C --> F --> D",
    "  D -->|需补充| B --> C",
    "  D -->|通过| E --> G --> Z"
  ]),
  mermaid("sequence", "时序图", [
    "sequenceDiagram",
    "  autonumber",
    "  actor U as 用户",
    "  participant W as Web 页面",
    "  participant A as API 服务",
    "  participant D as 数据库",
    "  U->>W: ⟦提交业务请求⟧",
    "  W->>A: 发送请求与身份凭证",
    "  activate A",
    "  A->>D: 查询并校验数据",
    "  alt 校验通过",
    "    A->>D: 保存处理结果",
    "    A-->>W: 返回成功状态",
    "  else 校验失败",
    "    A-->>W: 返回错误原因",
    "  end",
    "  deactivate A",
    "  W-->>U: 展示处理结果"
  ]),
  mermaid("class", "类图", [
    "classDiagram",
    "  direction LR",
    "  class User {",
    "    +String id",
    "    +String name",
    "    +⟦submitRequest⟧()",
    "  }",
    "  class Request {",
    "    +String requestId",
    "    +String status",
    "    +validate()",
    "    +approve()",
    "  }",
    "  class RequestService {",
    "    +createRequest()",
    "    +reviewRequest()",
    "  }",
    '  User "1" --> "0..*" Request : submits',
    "  RequestService ..> Request : manages"
  ]),
  mermaid("state", "状态图", [
    "stateDiagram-v2",
    "  [*] --> 草稿",
    "  草稿 --> 待审核: ⟦提交⟧申请",
    "  待审核 --> 已通过: 审核通过",
    "  待审核 --> 已退回: 需要修改",
    "  已退回 --> 草稿: 修改后重提",
    "  已通过 --> 执行中: 开始处理",
    "  执行中 --> 已完成: 确认完成",
    "  草稿 --> 已取消: 撤销申请",
    "  已完成 --> [*]"
  ]),
  mermaid("er", "实体关系图", [
    "erDiagram",
    "  USER ||--o{ REQUEST : submits",
    "  REQUEST ||--|{ REQUEST_ITEM : contains",
    "  REQUEST ||--o{ REVIEW : receives",
    "  USER {",
    "    string user_id PK",
    "    string ⟦display_name⟧",
    "  }",
    "  REQUEST {",
    "    string request_id PK",
    "    string user_id FK",
    "    string status",
    "  }",
    "  REQUEST_ITEM {",
    "    string item_id PK",
    "    string request_id FK",
    "    string description",
    "  }",
    "  REVIEW {",
    "    string review_id PK",
    "    string request_id FK",
    "    string result",
    "  }"
  ]),
  mermaid("gantt", "甘特图", [
    "gantt",
    "  title ⟦项目交付计划⟧",
    "  dateFormat YYYY-MM-DD",
    "  axisFormat %m/%d",
    "  section 规划",
    "  需求调研       :done, research, 2026-01-05, 7d",
    "  方案评审       :active, design, after research, 5d",
    "  section 交付",
    "  开发与联调     :dev, after design, 14d",
    "  验收与发布     :release, after dev, 5d"
  ]),
  mermaid("pie", "饼图", [
    "pie showData",
    "  title ⟦资源投入占比⟧",
    '  "产品设计" : 25',
    '  "研发实施" : 40',
    '  "测试验证" : 20',
    '  "运营支持" : 15'
  ]),
  mermaid("quadrant", "象限图", [
    "quadrantChart",
    "  title ⟦优先级评估⟧",
    "  x-axis 低投入 --> 高投入",
    "  y-axis 低收益 --> 高收益",
    "  quadrant-1 重点推进",
    "  quadrant-2 快速验证",
    "  quadrant-3 暂缓观察",
    "  quadrant-4 谨慎投入",
    "  项目 A: [0.78, 0.82]",
    "  项目 B: [0.32, 0.68]",
    "  项目 C: [0.24, 0.28]",
    "  项目 D: [0.71, 0.38]"
  ]),
  mermaid("requirement", "需求图", [
    "requirementDiagram",
    "  functionalRequirement requestFlow {",
    '    id: "⟦REQ-001⟧"',
    '    text: "系统应支持申请提交与状态查询"',
    "    risk: Medium",
    "    verifymethod: Test",
    "  }",
    "  element portal {",
    '    type: "web application"',
    '    docref: "页面与接口说明"',
    "  }",
    "  portal - satisfies -> requestFlow"
  ]),
  mermaid("usecase", "用例图", [
    "usecase-beta",
    "direction LR",
    'actor Customer("用户")',
    'actor Reviewer("审核人员")',
    'systemBoundary platform["业务申请系统"]',
    '  Submit("⟦提交申请⟧")',
    '  Track("查询进度")',
    '  Review("审核申请")',
    '  Feedback("退回补充")',
    "end",
    "Customer --> Submit",
    "Customer --> Track",
    "Reviewer --> Review",
    "Reviewer --> Feedback",
    "Submit ..>:include Review"
  ]),
  mermaid("gitgraph", "Git 图", [
    "gitGraph",
    '  commit id: "init" tag: "v1.0"',
    "  branch feature",
    "  checkout feature",
    '  commit id: "add draft"',
    '  commit id: "add validation"',
    "  checkout main",
    '  commit id: "hotfix"',
    "  checkout feature",
    '  commit id: "⟦review changes⟧"',
    "  checkout main",
    '  merge feature tag: "v1.1"'
  ]),
  mermaid("c4-context", "C4 上下文图", [
    "C4Context",
    "  title ⟦业务申请平台上下文⟧",
    '  Person(user, "用户", "发起并跟踪业务申请")',
    '  Person(reviewer, "审核人员", "审核申请并反馈结果")',
    '  System(portal, "申请平台", "收集申请并展示处理进度")',
    '  System_Ext(identity, "身份服务", "提供统一身份认证")',
    '  System_Ext(records, "业务系统", "提供业务数据与处理能力")',
    '  Rel(user, portal, "提交与查询")',
    '  Rel(reviewer, portal, "审核与反馈")',
    '  Rel(portal, identity, "验证身份")',
    '  Rel(portal, records, "读取或更新业务数据")'
  ]),
  mermaid("mindmap", "思维导图", [
    "mindmap",
    "  root((⟦项目规划⟧))",
    "    目标",
    "      用户价值",
    "      业务指标",
    "    方案",
    "      产品设计",
    "      技术架构",
    "    交付",
    "      里程碑",
    "      风险管理",
    "    复盘",
    "      数据评估",
    "      下一步行动"
  ]),
  mermaid("timeline-diagram", "时间线图", [
    "timeline",
    "  title ⟦产品演进时间线⟧",
    "  section 规划",
    "    2026 Q1 : 用户调研 : 需求评审",
    "  section 建设",
    "    2026 Q2 : MVP 开发 : 小范围试用",
    "  section 推广",
    "    2026 Q3 : 正式发布 : 运营扩展"
  ]),
  echarts("echarts-bar", "柱状图", [
    "{",
    "  \"title\": { \"text\": \"⟦季度营收对比⟧\" },",
    "  \"tooltip\": { \"trigger\": \"axis\" },",
    "  \"legend\": { \"data\": [\"实际\", \"目标\"] },",
    "  \"xAxis\": { \"type\": \"category\", \"data\": [\"Q1\", \"Q2\", \"Q3\", \"Q4\"] },",
    "  \"yAxis\": { \"type\": \"value\", \"name\": \"万元\" },",
    "  \"series\": [",
    "    { \"name\": \"实际\", \"type\": \"bar\", \"data\": [120, 156, 188, 215] },",
    "    { \"name\": \"目标\", \"type\": \"bar\", \"data\": [130, 160, 190, 220] }",
    "  ]",
    "}"
  ]),
  echarts("echarts-line", "平滑折线图", [
    "{",
    "  \"title\": { \"text\": \"⟦月度活跃用户⟧\" },",
    "  \"tooltip\": { \"trigger\": \"axis\" },",
    "  \"xAxis\": { \"type\": \"category\", \"data\": [\"1月\", \"2月\", \"3月\", \"4月\", \"5月\", \"6月\"] },",
    "  \"yAxis\": { \"type\": \"value\" },",
    "  \"series\": [{ \"name\": \"活跃用户\", \"type\": \"line\", \"smooth\": true, \"areaStyle\": {}, \"data\": [820, 932, 901, 1080, 1290, 1450] }]",
    "}"
  ]),
  echarts("echarts-pie", "环形图", [
    "{",
    "  \"title\": { \"text\": \"⟦渠道来源⟧\", \"left\": \"center\" },",
    "  \"tooltip\": { \"trigger\": \"item\" },",
    "  \"legend\": { \"bottom\": 0 },",
    "  \"series\": [{",
    "    \"type\": \"pie\", \"radius\": [\"42%\", \"72%\"],",
    "    \"data\": [{ \"name\": \"自然流量\", \"value\": 42 }, { \"name\": \"活动\", \"value\": 28 }, { \"name\": \"推荐\", \"value\": 18 }, { \"name\": \"其他\", \"value\": 12 }]",
    "  }]",
    "}"
  ]),
  echarts("echarts-scatter", "散点图", [
    "{",
    "  \"title\": { \"text\": \"⟦投入与产出关系⟧\" },",
    "  \"tooltip\": { \"trigger\": \"item\" },",
    "  \"xAxis\": { \"name\": \"投入（人日）\" },",
    "  \"yAxis\": { \"name\": \"产出评分\" },",
    "  \"series\": [{ \"type\": \"scatter\", \"symbolSize\": 14, \"data\": [[8, 42], [12, 55], [18, 68], [25, 72], [31, 88]] }]",
    "}"
  ]),
  echarts("echarts-radar", "雷达图", [
    "{",
    "  \"title\": { \"text\": \"⟦方案能力评估⟧\" },",
    "  \"legend\": { \"data\": [\"当前方案\", \"目标方案\"] },",
    "  \"radar\": { \"indicator\": [{ \"name\": \"性能\", \"max\": 100 }, { \"name\": \"易用性\", \"max\": 100 }, { \"name\": \"稳定性\", \"max\": 100 }, { \"name\": \"可维护性\", \"max\": 100 }] },",
    "  \"series\": [{ \"type\": \"radar\", \"data\": [{ \"name\": \"当前方案\", \"value\": [78, 86, 82, 72] }, { \"name\": \"目标方案\", \"value\": [90, 88, 92, 86] }] }]",
    "}"
  ]),
  echarts("echarts-funnel", "漏斗图", [
    "{",
    "  \"title\": { \"text\": \"⟦转化漏斗⟧\" },",
    "  \"tooltip\": { \"trigger\": \"item\" },",
    "  \"series\": [{ \"type\": \"funnel\", \"left\": \"12%\", \"width\": \"76%\", \"sort\": \"descending\",",
    "    \"data\": [{ \"name\": \"访问\", \"value\": 1000 }, { \"name\": \"注册\", \"value\": 620 }, { \"name\": \"试用\", \"value\": 310 }, { \"name\": \"付费\", \"value\": 120 }] }]",
    "}"
  ]),
  echarts("echarts-gauge", "仪表盘", [
    "{",
    "  \"title\": { \"text\": \"⟦目标完成率⟧\" },",
    "  \"series\": [{ \"type\": \"gauge\", \"progress\": { \"show\": true }, \"detail\": { \"valueAnimation\": true, \"formatter\": \"{value}%\" }, \"data\": [{ \"value\": 76, \"name\": \"完成率\" }] }]",
    "}"
  ]),
  echarts("echarts-heatmap", "热力图", [
    "{",
    "  \"title\": { \"text\": \"⟦工作日活跃时段⟧\" },",
    "  \"tooltip\": { \"position\": \"top\" },",
    "  \"xAxis\": { \"type\": \"category\", \"data\": [\"周一\", \"周二\", \"周三\", \"周四\", \"周五\"] },",
    "  \"yAxis\": { \"type\": \"category\", \"data\": [\"上午\", \"中午\", \"下午\", \"晚上\"] },",
    "  \"visualMap\": { \"min\": 0, \"max\": 100, \"calculable\": true },",
    "  \"series\": [{ \"type\": \"heatmap\", \"data\": [[0, 0, 42], [1, 0, 55], [2, 0, 64], [3, 0, 48], [4, 0, 72], [0, 2, 70], [1, 2, 82], [2, 2, 76], [3, 2, 91], [4, 2, 66]] }]",
    "}"
  ])
];

export function resolveSnippet(body: string) {
  const matches = Array.from(body.matchAll(/⟦([^⟧]+)⟧/g));
  if (matches.length !== 1) throw new Error("模板必须且只能包含一个光标占位文本");
  const match = matches[0];
  const selected = match[1];
  return {
    text: body.slice(0, match.index) + selected + body.slice(match.index + match[0].length),
    selectionFrom: match.index,
    selectionTo: match.index + selected.length
  };
}

export function buildSnippetInsertion(value: string, from: number, to: number, body: string) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const resolved = resolveSnippet(body);
  return {
    from: start,
    to: end,
    text: prefix + resolved.text + suffix,
    selectionFrom: prefix.length + resolved.selectionFrom,
    selectionTo: prefix.length + resolved.selectionTo
  };
}
