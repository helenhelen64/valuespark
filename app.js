const STORAGE_KEY = "valuespark.state.v1";

const sampleSparks = [
  {
    title: "AI 怎样帮助人从回答问题走向清晰思考？",
    content:
      "大多数 AI 工具都在追求更快的答案。我想探索一个更慢的思考空间，是否能帮助人在模糊问题里建立更清晰的结构。",
    tags: ["AI", "思考", "产品"]
  },
  {
    title: "为什么好想法总是在被写下来之前就消失？",
    content:
      "从意识到一个想法，到把它变成有用的东西，中间有一个很脆弱的瞬间。什么样的产品体验能保护这个瞬间？",
    tags: ["捕捉", "行为"]
  },
  {
    title: "ValueSpark 能不能成为一个私人未完成想法库？",
    content:
      "未完成的想法往往比整理好的笔记更有未来价值。这个产品也许能帮助用户重新打开那些松散灵感，并继续推进。",
    tags: ["灵感库", "洞见"]
  }
];

const statusMap = {
  "Unprocessed": "未处理",
  "In Thread": "思考中",
  "Insight Generated": "已生成洞见"
};

const statusOptions = ["全部", "未处理", "思考中", "已生成洞见"];

const defaultState = () => {
  const now = new Date().toISOString();
  const sparks = sampleSparks.map((spark, index) => {
    const id = crypto.randomUUID();
    return {
      id,
      title: spark.title,
      content: spark.content,
      summary: makeSummary(spark.content),
      tags: spark.tags,
      status: index === 0 ? "思考中" : "未处理",
      createdAt: now,
      updatedAt: now,
      threadId: id
    };
  });

  const threads = sparks.reduce((acc, spark) => {
    acc[spark.threadId] = createThreadFromSpark(spark);
    return acc;
  }, {});

  return {
    sparks,
    threads,
    settings: {
      apiKey: "",
      mockMode: true
    },
    onboardingComplete: false
  };
};

let state = loadState();
let toastTimer = null;
let captureOpen = false;
let onboardingStep = 0;
let onboardingDraft = "";

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.sparks) || !parsed.threads) return defaultState();
    parsed.sparks = parsed.sparks.map((spark) => ({
      ...spark,
      status: statusMap[spark.status] || spark.status,
      tags: Array.isArray(spark.tags) ? spark.tags : []
    }));
    Object.values(parsed.threads).forEach((thread) => {
      if (!Array.isArray(thread.thinkingPath) || thread.thinkingPath.some((item) => item.startsWith("这个 Spark 真正想澄清"))) {
        thread.thinkingPath = defaultThinkingPath();
      }
      if (!Array.isArray(thread.messages)) {
        thread.messages = [];
      }
    });
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function navigate(path) {
  window.location.hash = path;
}

function route() {
  const hash = window.location.hash || "#/";
  const path = hash.split("?")[0];
  if (path.startsWith("#/thread/")) {
    return { name: "thread", id: path.replace("#/thread/", "") };
  }
  if (path === "#/library") return { name: "library" };
  if (path === "#/space") return { name: "space" };
  if (path === "#/approach") return { name: "approach" };
  if (path === "#/cases") return { name: "cases" };
  if (path === "#/about") return { name: "about" };
  if (path === "#/settings") return { name: "settings" };
  return { name: "landing" };
}

function render() {
  const current = route();
  const app = document.querySelector("#app");

  app.innerHTML = `
    <div class="app-shell">
      ${current.name === "thread" ? "" : renderTopbar(current.name)}
      ${current.name === "landing" ? renderLanding() : ""}
      ${current.name === "library" ? renderLibrary() : ""}
      ${current.name === "thread" ? renderThread(current.id) : ""}
      ${current.name === "space" ? renderLibrary() : ""}
      ${current.name === "approach" ? renderApproach() : ""}
      ${current.name === "cases" ? renderCases() : ""}
      ${current.name === "about" ? renderAbout() : ""}
      ${current.name === "settings" ? renderSettings() : ""}
      ${!state.onboardingComplete && current.name !== "thread" ? renderOnboarding() : ""}
      <div id="toast-root"></div>
    </div>
  `;

  bindActions();
}

function renderTopbar(active) {
  const links = [
    ["landing", "#/", "首页"],
    ["library", "#/library", "图书馆"],
    ["space", "#/space", "思考空间"],
    ["approach", "#/approach", "思考方式"],
    ["cases", "#/cases", "案例"],
    ["about", "#/about", "关于"]
  ];

  return `
    <header class="topbar">
      <button class="brand button" data-route="#/">
        <span class="brand-mark">✧</span>
        <span>ValueSpark</span>
      </button>
      <nav class="nav" aria-label="主导航">
        ${links
          .map(([key, path, label]) => `<button class="${active === key ? "active" : ""}" data-route="${path}">${label}</button>`)
          .join("")}
        <button class="nav-cta" data-route="#/library">开始思考</button>
      </nav>
    </header>
  `;
}

function renderLanding() {
  return `
    <main>
      <section class="home-hero">
        <div class="home-mark">✧</div>
        <p class="eyebrow">PRIVATE THINKING PARTNER</p>
        <h1>把模糊想法，推成清晰洞见。</h1>
        <p>ValueSpark 陪你把想法慢慢拆开、审视、挑战，再沉淀成可以继续使用的判断。</p>
        <button class="button primary" data-start>开始记录你的第一个想法</button>
      </section>

      <section class="container home-split">
        <div>
          <p class="section-kicker">核心信念</p>
          <p>好的想法很少一次成型。它需要被拆解、被挑战、被反复审视。</p>
          <p>ValueSpark 把这个过程做成可见的结构，让你在混乱里保留真正有价值的线索。</p>
        </div>
        <div class="belief-list">
          <p>好的想法值得被认真对待</p>
          <p>推理过程比结论更重要</p>
          <p>慢思考是一种能力</p>
          <p>洞见需要被反复打磨</p>
        </div>
      </section>

      <section class="container process-strip">
        ${[
          ["01", "捕捉", "把任何模糊的想法写下来，先保留它的原始状态。"],
          ["02", "结构化", "把想法拆成事实、假设、路径和风险。"],
          ["03", "审视与挑战", "温和地提出反问，让盲区浮出水面。"],
          ["04", "结晶", "把思考凝结成可回顾、可行动的洞见。"]
        ]
          .map(
            ([num, title, body]) => `
              <article class="process-card">
                <span>${num}</span>
                <h3>${title}</h3>
                <p>${body}</p>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="container home-preview">
        <div class="library-preview">
          <p class="section-kicker">图书馆</p>
          <h2>所有想法都有一个可以回来的地方。</h2>
          <button class="button primary" data-route="#/library">进入图书馆</button>
        </div>
        <div class="thread-preview-card">
          <div class="chat-bubble dark">我有一个创业想法，但现在很模糊，不知道从哪里下手。</div>
          <div class="chat-bubble light">我们先把它慢慢拆开。当前最清晰的部分是什么？</div>
          <div class="reasoning-mini">
            <span>Observation</span>
            <p>这个想法里真正需要澄清的是用户场景和关键假设。</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderLibrary() {
  const filter = getParam("status") || "全部";
  const search = getParam("q") || "";
  const sparks = filteredSparks(search, filter);
  const insightCount = state.sparks.filter((spark) => spark.status === "已生成洞见").length;

  return `
    <main class="container library-page">
      <header class="library-header">
        <div>
          <h1>我的图书馆</h1>
          <p>共 ${state.sparks.length} 条记录 · ${insightCount} 个已生成洞见</p>
        </div>
        <div class="library-tools">
          <div class="search-box">
            <span>⌕</span>
            <input id="spark-search" value="${escapeAttr(search)}" data-search placeholder="搜索灵感、标题或关键词..." />
          </div>
          <select id="status-filter" data-filter>
            ${statusOptions
              .map((item) => `<option ${item === filter ? "selected" : ""}>${item}</option>`)
              .join("")}
          </select>
          <button class="button primary capture-button" data-focus-create>${captureOpen ? "收起捕捉" : "+ 捕捉新灵感"}</button>
        </div>
      </header>

      ${captureOpen ? renderCapturePanel() : ""}

      ${
        sparks.length
          ? `<section class="spark-grid">${sparks.map(renderSparkCard).join("")}${renderLibraryEmptyCard()}</section>`
          : `<section class="spark-grid">${renderLibraryEmptyCard()}</section>`
      }
    </main>
  `;
}

function renderCapturePanel() {
  return `
    <section class="create-panel" aria-label="创建 Spark">
      <div class="field">
        <label for="spark-title">标题</label>
        <input id="spark-title" data-create-title placeholder="例如：如何把一个模糊的创业想法结构化？" />
      </div>
      <div class="field field-wide">
        <label for="spark-content">原始内容</label>
        <textarea id="spark-content" data-create-content placeholder="随便写一个最近在想的事。它会先进入图书馆，之后可以慢慢展开。"></textarea>
      </div>
      <div class="field">
        <label for="spark-tags">标签</label>
        <input id="spark-tags" data-create-tags placeholder="产品, 写作, 创业" />
      </div>
      <button class="button primary" data-create-spark>保存到图书馆</button>
    </section>
  `;
}

function renderLibraryEmptyCard() {
  return `
    <article class="spark-card empty-card" data-focus-create>
      <div class="empty-star">✧</div>
      <p>继续捕捉灵感<br />它们会出现在这里</p>
    </article>
  `;
}

function renderSparkCard(spark) {
  const nodes = spark.status === "已生成洞见" ? 9 : spark.status === "思考中" ? 4 : 2;
  const dialogueCount = (state.threads[spark.threadId]?.messages || []).length;
  return `
    <article class="spark-card ${statusClass(spark.status)}">
      <div class="card-topline">
        <span class="status">${escapeHtml(spark.status)}</span>
        <span>${formatRelativeDate(spark.updatedAt)}</span>
      </div>
      <div class="card-main">
        <h3>${escapeHtml(spark.title)}</h3>
        <p>${escapeHtml(spark.summary)}</p>
      </div>
      <div class="spark-card-footer">
        <span>已提取 ${nodes} 个关键节点</span>
        <span>${dialogueCount} 条对话</span>
      </div>
      <div class="card-actions">
        <button class="button primary" data-open-thread="${spark.id}">继续思考</button>
        <button class="button danger icon" title="删除" data-delete-spark="${spark.id}">×</button>
      </div>
    </article>
  `;
}

function renderThread(id) {
  const spark = state.sparks.find((item) => item.id === id);
  if (!spark) {
    return `
      <main class="container page">
        <section class="empty">没有找到这个 Spark。</section>
      </main>
    `;
  }

  const thread = state.threads[spark.threadId] || createThreadFromSpark(spark);
  state.threads[spark.threadId] = thread;
  saveState();

  return `
    <main class="thread-page">
      <header class="thread-topline">
        <div class="thread-title-row">
          <button class="brand button" data-route="#/library">
            <span class="brand-mark">✧</span>
            <span>ValueSpark</span>
          </button>
          <span class="dot-separator">·</span>
          <h1>${escapeHtml(spark.title)}</h1>
          <span class="status">${escapeHtml(spark.status)}</span>
        </div>
        <div class="thread-settings">
          <span>模型：<strong>Mock AI</strong></span>
          <span>深度：<strong>高</strong></span>
          <button class="button" data-route="#/settings">设置</button>
        </div>
      </header>

      <section class="thinking-workspace">
        <section class="conversation-panel">
          <div class="dialogue thread-dialogue" data-dialogue>
            <div class="message user original-message">${escapeHtml(spark.content)}</div>
            ${thread.messages.map(renderMessage).join("")}
          </div>
          <div class="thread-input-shell">
            <form class="dialogue-form" data-message-form="${spark.id}">
              <textarea data-message-input placeholder="继续输入你的想法..."></textarea>
              <div class="thread-input-actions">
                <button class="button" type="button" data-message-preset="${spark.id}" data-preset-text="请继续加深这个思考，帮我看到更底层的问题。">加深思考</button>
                <button class="button" type="button" data-message-preset="${spark.id}" data-preset-text="请挑战这个想法里的关键假设，指出可能被忽略的盲区。">挑战假设</button>
                <button class="button primary" type="submit">发送</button>
              </div>
            </form>
            <p>当前深度：高（会更严格地挑战你的想法）</p>
          </div>
        </section>

        <aside class="reasoning-panel">
          <div class="reasoning-header">
            <div>
              <p class="section-kicker">可见推理过程</p>
              <h2>当前思考结构</h2>
            </div>
            <button class="button" data-export-markdown="${spark.id}">导出</button>
          </div>
          <div class="reasoning-cards">
            ${renderReasoningCards(spark, thread)}
          </div>
          <div class="reasoning-actions">
            <button class="button primary" data-generate-insight="${spark.id}">生成洞见</button>
            <button class="button" data-copy-summary="${spark.id}" ${thread.insight ? "" : "disabled"}>复制总结</button>
          </div>
          <div class="reasoning-footer">
            当前已识别 ${thread.insight ? "5" : "3"} 个关键节点 · ${thread.insight ? "3" : "2"} 个假设待验证
          </div>
        </aside>
      </section>
    </main>
  `;
}

function renderReasoningCards(spark, thread) {
  const insight = normalizeInsight(thread.insight || makeInsight(spark, thread));
  const cards = [
    ["Observation", "", "很多想法真正需要的，是把原始直觉从混乱里单独拿出来。"],
    ["Assumption", "挑战", insight.keyAssumptions[0]],
    ["Insight", "", insight.emergingInsight]
  ];

  return cards
    .map(
      ([label, sideLabel, body]) => `
        <article class="reasoning-card ${label.toLowerCase()}">
          <div>
            <span>${label}</span>
            ${sideLabel ? `<em>${sideLabel}</em>` : ""}
          </div>
          <p>${escapeHtml(body)}</p>
        </article>
      `
    )
    .join("");
}

function renderMessage(message) {
  return `
    <div class="message ${message.role}">
      ${escapeHtml(message.content)}
    </div>
  `;
}

function renderInsight(insight) {
  const normalized = normalizeInsight(insight);
  return `
    <div class="insight-grid">
      <div class="insight-item emphasis">
        <h3>Core Question / 核心问题</h3>
        <p>${escapeHtml(normalized.coreQuestion)}</p>
      </div>
      <div class="insight-item">
        <h3>Key Assumptions / 关键假设</h3>
        <ul>${normalized.keyAssumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div class="insight-item">
        <h3>Challenges / 挑战</h3>
        <ul>${normalized.challenges.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div class="insight-item">
        <h3>Emerging Insight / 正在浮现的洞见</h3>
        <p>${escapeHtml(normalized.emergingInsight)}</p>
      </div>
      <div class="insight-item">
        <h3>Next Actions / 下一步行动</h3>
        <ul>${normalized.nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div class="insight-item final">
        <h3>Final Note / 最终总结</h3>
        <p>${escapeHtml(normalized.finalSummary)}</p>
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <main class="container page">
      <header class="page-header">
        <div>
          <h1>设置</h1>
          <p>在接入真实 AI 前，Mock AI 会让第一版产品保持完整可用。</p>
        </div>
      </header>

      <section class="settings-panel">
        <div class="field">
          <label for="api-key">API Key</label>
          <input id="api-key" data-api-key value="${escapeAttr(state.settings.apiKey)}" placeholder="未来可以把 API Key 放在这里" />
          <p class="muted small">API Key 会保存在当前浏览器里，仅用于原型测试。</p>
        </div>
        <div class="section-actions">
          <button class="button primary" data-save-settings>保存</button>
        </div>
        <div class="settings-row">
          <div>
            <strong>Mock AI 模式</strong>
            <div class="muted small">思考伙伴现在使用本地原型回复。</div>
          </div>
          <span class="status">已开启</span>
        </div>
        <div class="settings-row">
          <div>
            <strong>Key 本地保存状态</strong>
            <div class="muted small">只在当前浏览器配置里可见。</div>
          </div>
          <span class="status">${state.settings.apiKey ? "已保存" : "未填写"}</span>
        </div>
      </section>
    </main>
  `;
}

function renderApproach() {
  return `
    <main class="content-page">
      <section class="content-hero">
        <p class="eyebrow">OUR APPROACH</p>
        <h1>追求更深的思考。</h1>
        <p>ValueSpark 的核心，是一种克制而有方法的思考方式。真正有价值的洞见，需要时间、结构与反复审视。</p>
      </section>

      <section class="content-split">
        <div>
          <p class="section-kicker">核心信念</p>
          <p>大多数 AI 工具都在追求快速给出答案。ValueSpark 追求的是让思考过程变得可见。</p>
          <p>它帮助你把模糊的灵感，一步步转化为清晰、可审视、可迭代的结构。</p>
        </div>
        <div>
          <p>我们相信：</p>
          <ul class="plain-list">
            <li>好的想法值得被认真对待</li>
            <li>推理过程比结论更重要</li>
            <li>深度思考需要外部结构支持</li>
            <li>AI 的角色是思考伙伴和结构放大器</li>
          </ul>
        </div>
      </section>

      <section class="content-stack">
        <p class="section-kicker">思考的四个阶段</p>
        ${[
          ["01", "捕捉（Capture）", "任何灵光一闪都可以被记录下来。这里的关键是降低摩擦，让想法先被保留。"],
          ["02", "结构化（Structure）", "把模糊想法拆解成事实、隐藏假设、可能路径和潜在风险。"],
          ["03", "审视与挑战（Challenge）", "提出反问，指出盲点，帮助你看到被忽略的变量。"],
          ["04", "结晶（Crystallize）", "把过程凝结成可输出的洞见、决策框架或行动路径。"]
        ]
          .map(
            ([num, title, body]) => `
              <article class="approach-card">
                <span>${num}</span>
                <div>
                  <h2>${title}</h2>
                  <p>${body}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    </main>
  `;
}

function renderCases() {
  const cases = [
    ["李明 · 独立开发者", "SaaS 产品定价", "从“随便定个价”到清晰的定价策略", "李明开发了一款小工具，上架后一直不知道该怎么定价。通过 ValueSpark，他把用户画像、竞品分析和价值假设全部推开讨论。", "最终结果：将定价调整为 29 美元/月，并增加了年付折扣。"],
    ["陈雨欣 · 产品经理", "功能优先级决策", "从团队争论不休到形成共识", "团队对下个季度要做哪些功能争论了三周。她把意见、数据和隐含假设输入 ValueSpark，逐步结构化梳理。", "最终结果：原本计划的 14 个功能收敛到 6 个。"],
    ["王思远 · 博士研究生", "论文框架梳理", "把一团乱麻的研究想法变成论文框架", "研究方向涉及多个交叉领域，脑子里有大量零散文献和假设。通过反复结构化，他把研究问题、方法论和贡献全部拆解清楚。", "最终结果：两周内完成论文大纲，并顺利通过开题。"],
    ["张薇 · 创业者", "商业模式梳理", "从什么都想做到清晰的商业模式", "她把每个商业想法里的假设、风险和资源需求逐一拆开比较。", "最终结果：砍掉 3 个方向，专注一个赛道。"],
    ["林浩 · 互联网大厂员工", "职业转型", "理清职业转型的复杂纠结", "他把担忧、优势、风险和生活需求全部摊开讨论。", "最终结果：先内部转岗做产品，三个月后心态完全不同。"]
  ];

  return `
    <main class="content-page">
      <section class="content-hero">
        <p class="eyebrow">REAL STORIES</p>
        <h1>真实的使用场景</h1>
        <p>不同背景的人，如何使用 ValueSpark 把模糊的想法，一步步变成清晰的洞见与决策。</p>
      </section>
      <section class="case-list">
        ${cases
          .map(
            ([person, tag, title, body, result]) => `
              <article class="case-card">
                <div><strong>${person}</strong><span>${tag}</span></div>
                <h2>${title}</h2>
                <p>${body}</p>
                <p class="result">${result}</p>
              </article>
            `
          )
          .join("")}
      </section>
      <section class="case-cta">
        <p>这些案例只是冰山一角。真正重要的是你自己的思考过程。</p>
        <button class="button primary" data-route="#/library">开始记录你的第一个想法</button>
      </section>
    </main>
  `;
}

function renderAbout() {
  return `
    <main class="content-page">
      <section class="content-hero">
        <h1>关于 ValueSpark</h1>
        <p>真正重要的想法，值得被认真、缓慢、结构化地对待。</p>
      </section>
      <section class="about-copy">
        <p class="section-kicker">为什么要做 ValueSpark</p>
        <p>现在的 AI 工具越来越快，也越来越会给出看起来合理的答案。但很少有人真正陪你把一个模糊、混乱、带着焦虑的想法，一点一点拆开、审视、重组。</p>
        <p>ValueSpark 为这个空白而生。它是一个愿意陪你一起慢下来的思考伙伴，把思考过程摊开看。</p>
        <div class="about-grid">
          <div><h3>思考需要外部结构</h3><p>把想法结构化地写出来、画出来，是对抗内耗很有效的办法。</p></div>
          <div><h3>慢思考是一种能力</h3><p>愿意慢下来的人，能看到别人看不到的联系和机会。</p></div>
          <div><h3>AI 应该放大思考</h3><p>我们希望 AI 帮你把自己的思考过程看得更清楚。</p></div>
          <div><h3>洞见需要被打磨</h3><p>真正有价值的想法很少一次成型，它需要挑战、拆解和重新组合。</p></div>
        </div>
        <p class="section-kicker">适合谁</p>
        <ul class="plain-list">
          <li>经常需要处理复杂、模糊问题的独立思考者</li>
          <li>厌倦快餐式 AI 回答，想把想法想透的人</li>
          <li>希望把自己的思考过程沉淀下来的人</li>
          <li>愿意为了更好的洞见付出一点耐心的人</li>
        </ul>
      </section>
    </main>
  `;
}

function renderOnboarding() {
  const steps = [
    `
      <div class="onboarding-center">
        <div class="home-mark">✧</div>
        <h2>欢迎来到 ValueSpark</h2>
        <p>这里是一个陪你把想法慢慢想清楚的伙伴。</p>
      </div>
    `,
    `
      <div>
        <h2>我们相信什么</h2>
        <p><strong>多数 AI 都在追求速度。</strong></p>
        <p>ValueSpark 选择深度。好的想法很少一次成型，它需要被拆解、被挑战、被反复审视。</p>
        <p>把思考过程摊开来看，是很有力的思考方式之一。</p>
      </div>
    `,
    `
      <div>
        <h2>它是如何工作的</h2>
        <div class="onboarding-process">
          <div><span>1</span><strong>捕捉灵感</strong><p>把任何模糊想法写下来。</p></div>
          <div><span>2</span><strong>结构化思考</strong><p>拆成事实、假设、路径和风险。</p></div>
          <div><span>3</span><strong>审视与挑战</strong><p>帮助你看到盲区。</p></div>
          <div><span>4</span><strong>生成洞见</strong><p>凝结成可回顾的成果。</p></div>
        </div>
      </div>
    `,
    `
      <div>
        <h2>现在，试着写下一个想法</h2>
        <p>不用担心写得多好。随便写一个你最近正在想的事。</p>
        <textarea class="onboarding-textarea" data-onboarding-draft placeholder="例如：我想把副业做成全职，但心里很焦虑......">${escapeHtml(onboardingDraft)}</textarea>
        <p class="muted small">这个想法会被保存到你的图书馆，你可以随时回来继续思考。</p>
      </div>
    `,
    `
      <div class="onboarding-center">
        <div class="home-mark">✧</div>
        <h2>欢迎来到 ValueSpark</h2>
        <p>你的第一个想法已经准备好进入图书馆。现在，去真正开始一次深度思考吧。</p>
      </div>
    `
  ];

  return `
    <div class="onboarding-screen" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section class="onboarding-card">
        <div class="onboarding-meta">
          <span>步骤 ${onboardingStep + 1} / ${steps.length}</span>
          <div class="progress"><i style="width: ${((onboardingStep + 1) / steps.length) * 100}%"></i></div>
        </div>
        <div class="onboarding-body" id="onboarding-title">
          ${steps[onboardingStep]}
        </div>
        <div class="onboarding-nav">
          <button class="text-button" data-onboarding-back ${onboardingStep === 0 ? "disabled" : ""}>← 上一步</button>
          ${
            onboardingStep === steps.length - 1
              ? `<button class="button primary" data-complete-onboarding>进入我的图书馆</button>`
              : `<button class="button primary" data-onboarding-next>下一步 →</button>`
          }
        </div>
      </section>
    </div>
  `;
}

function bindActions() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.route));
  });

  const start = document.querySelector("[data-start]");
  if (start) {
    start.addEventListener("click", () => navigate("#/library"));
  }

  const focusCreate = document.querySelector("[data-focus-create]");
  if (focusCreate) {
    focusCreate.addEventListener("click", () => {
      captureOpen = !captureOpen;
      render();
      document.querySelector("[data-create-title]")?.focus();
    });
  }

  const create = document.querySelector("[data-create-spark]");
  if (create) {
    create.addEventListener("click", createSpark);
  }

  const search = document.querySelector("[data-search]");
  if (search) {
    search.addEventListener("input", () => setParam("q", search.value));
  }

  const filter = document.querySelector("[data-filter]");
  if (filter) {
    filter.addEventListener("change", () => setParam("status", filter.value));
  }

  document.querySelectorAll("[data-open-thread]").forEach((button) => {
    button.addEventListener("click", () => openThread(button.dataset.openThread));
  });

  document.querySelectorAll("[data-delete-spark]").forEach((button) => {
    button.addEventListener("click", () => deleteSpark(button.dataset.deleteSpark));
  });

  document.querySelectorAll("[data-message-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage(form.dataset.messageForm);
    });
  });

  document.querySelectorAll("[data-message-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("[data-message-input]");
      if (!input) return;
      input.value = button.dataset.presetText;
      sendMessage(button.dataset.messagePreset);
    });
  });

  document.querySelectorAll("[data-generate-insight]").forEach((button) => {
    button.addEventListener("click", () => generateInsight(button.dataset.generateInsight));
  });

  document.querySelectorAll("[data-copy-summary]").forEach((button) => {
    button.addEventListener("click", () => copySummary(button.dataset.copySummary));
  });

  document.querySelectorAll("[data-export-markdown]").forEach((button) => {
    button.addEventListener("click", () => exportMarkdown(button.dataset.exportMarkdown));
  });

  const saveSettings = document.querySelector("[data-save-settings]");
  if (saveSettings) {
    saveSettings.addEventListener("click", () => {
      state.settings.apiKey = document.querySelector("[data-api-key]").value.trim();
      saveState();
      showToast("设置已保存到本地。");
      render();
    });
  }

  const completeOnboarding = document.querySelector("[data-complete-onboarding]");
  if (completeOnboarding) {
    completeOnboarding.addEventListener("click", () => {
      const draft = document.querySelector("[data-onboarding-draft]")?.value.trim() || onboardingDraft.trim();
      if (draft) {
        addSpark({
          title: makeSparkTitle(draft),
          content: draft,
          tags: ["初始想法"],
          status: "思考中"
        });
      }
      state.onboardingComplete = true;
      saveState();
      onboardingStep = 0;
      onboardingDraft = "";
      navigate("#/library");
      render();
    });
  }

  const nextOnboarding = document.querySelector("[data-onboarding-next]");
  if (nextOnboarding) {
    nextOnboarding.addEventListener("click", () => {
      onboardingDraft = document.querySelector("[data-onboarding-draft]")?.value || onboardingDraft;
      onboardingStep = Math.min(onboardingStep + 1, 4);
      render();
    });
  }

  const backOnboarding = document.querySelector("[data-onboarding-back]");
  if (backOnboarding) {
    backOnboarding.addEventListener("click", () => {
      onboardingDraft = document.querySelector("[data-onboarding-draft]")?.value || onboardingDraft;
      onboardingStep = Math.max(onboardingStep - 1, 0);
      render();
    });
  }
}

function createSpark() {
  const title = document.querySelector("[data-create-title]").value.trim();
  const content = document.querySelector("[data-create-content]").value.trim();
  const tagsRaw = document.querySelector("[data-create-tags]").value.trim();

  if (!title || !content) {
    showToast("请先填写标题和原始内容。");
    return;
  }

  addSpark({
    title,
    content,
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : ["未分类"],
    status: "未处理"
  });
  captureOpen = false;
  saveState();
  showToast("Spark 已保存。");
  render();
}

function addSpark({ title, content, tags, status }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const spark = {
    id,
    title,
    content,
    summary: makeSummary(content),
    tags,
    status,
    createdAt: now,
    updatedAt: now,
    threadId: id
  };

  state.sparks.unshift(spark);
  state.threads[id] = createThreadFromSpark(spark);
  return spark;
}

function openThread(id) {
  const spark = state.sparks.find((item) => item.id === id);
  if (!spark) return;

  if (spark.status === "未处理") {
    spark.status = "思考中";
    spark.updatedAt = new Date().toISOString();
    saveState();
  }

  navigate(`#/thread/${id}`);
}

function deleteSpark(id) {
  const spark = state.sparks.find((item) => item.id === id);
  if (!spark) return;

  state.sparks = state.sparks.filter((item) => item.id !== id);
  delete state.threads[spark.threadId];
  saveState();
  showToast("Spark 已删除。");
  render();
}

function sendMessage(sparkId) {
  const spark = state.sparks.find((item) => item.id === sparkId);
  if (!spark) return;

  const input = document.querySelector("[data-message-input]");
  const content = input.value.trim();
  if (!content) {
    showToast("先写下一段想法再发送。");
    return;
  }

  const thread = state.threads[spark.threadId];
  thread.messages.push({ role: "user", content, createdAt: new Date().toISOString() });
  thread.messages.push({ role: "ai", content: mockAiResponse(spark, content, thread), createdAt: new Date().toISOString() });
  spark.status = "思考中";
  spark.updatedAt = new Date().toISOString();
  state.threads[spark.threadId] = thread;
  saveState();
  render();
  const dialogue = document.querySelector("[data-dialogue]");
  if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
}

function generateInsight(sparkId) {
  const spark = state.sparks.find((item) => item.id === sparkId);
  if (!spark) return;

  const thread = state.threads[spark.threadId];
  thread.insight = makeInsight(spark, thread);
  spark.status = "已生成洞见";
  spark.updatedAt = new Date().toISOString();
  saveState();
  showToast("洞见已生成。");
  render();
}

async function copySummary(sparkId) {
  const spark = state.sparks.find((item) => item.id === sparkId);
  if (!spark) return;

  const thread = state.threads[spark.threadId];
  if (!thread.insight) return;

  const summary = normalizeInsight(thread.insight).finalSummary;
  try {
    await navigator.clipboard.writeText(summary);
    showToast("总结已复制。");
  } catch {
    showToast("复制失败。你可以手动选中总结。");
  }
}

function exportMarkdown(sparkId) {
  const spark = state.sparks.find((item) => item.id === sparkId);
  if (!spark) return;

  const thread = state.threads[spark.threadId];
  const markdown = buildMarkdown(spark, thread);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(spark.title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Markdown 已导出。");
}

function createThreadFromSpark(spark) {
  return {
    id: spark.threadId,
    sparkId: spark.id,
    thinkingPath: defaultThinkingPath(),
    messages: [
      {
        role: "ai",
        content:
          "这个 Spark 值得放慢来看。我会先保护它的原始直觉，再把它拆成核心问题、关键假设和可能挑战，最后帮助你形成一段可以继续推进的洞见。",
        createdAt: new Date().toISOString()
      }
    ],
    insight: null
  };
}

function defaultThinkingPath() {
  return [
    "Original Spark: 保留这个想法最原始、最没有被整理过的部分。",
    "Core Question: 找到它真正想澄清的那个问题。",
    "Key Assumptions: 标出让这个想法成立的关键前提。",
    "Challenges: 主动看见它最容易变弱的位置。",
    "Emerging Insight: 把当前材料压缩成一个可以继续使用的判断。"
  ];
}

function mockAiResponse(spark, content, thread) {
  const lower = `${spark.title} ${spark.content} ${content}`.toLowerCase();
  const angle = lower.includes("user") || lower.includes("用户")
    ? "用户需求"
    : lower.includes("ai")
      ? "思考质量"
      : lower.includes("product") || lower.includes("产品")
        ? "产品价值"
        : "核心判断";

  const prompts = {
    "用户需求": [
      "哪一个用户场景会产生最强需求？",
      "如果这个东西不存在，用户具体会失去什么？",
      "用户会用什么自己的话描述这个问题？"
    ],
    "思考质量": [
      "速度在哪些地方有帮助，又在哪些地方削弱思考？",
      "AI 在回答前应该先问什么？",
      "这个想法的哪一部分更需要结构化处理？"
    ],
    "产品价值": [
      "用户第一次使用时，必须发生什么才会觉得它有用？",
      "这个产品应该让哪一种行为变得更容易？",
      "用户使用十分钟后，应该看到什么可见进展？"
    ],
    "核心判断": [
      "这个想法里最强的判断是什么？",
      "什么情况会证明这个判断站不住？",
      "什么证据会让你更有信心继续推进？"
    ]
  };

  const selected = prompts[angle];
  return `这里真正值得用力的点是：${angle}。我建议把下一步收窄，先回答三个问题：

1. ${selected[0]}
2. ${selected[1]}
3. ${selected[2]}

你刚补充的内容提供了有效背景。下一步可以先命名最关键的假设，再围绕它设计一个很小的验证动作。`;
}

function makeInsight(spark, thread) {
  const userMessages = thread.messages.filter((message) => message.role === "user").map((message) => message.content);
  const combined = [spark.content, ...userMessages].join(" ");
  const corePhrase = spark.title.replace(/[?.!]+$/, "");
  const hasProductSignal = /产品|product|用户|user/i.test(combined);
  const hasAiSignal = /ai|人工智能|模型/i.test(combined);

  return {
    coreQuestion: `${corePhrase}?`,
    keyAssumptions: [
      hasProductSignal
        ? "这个想法对应一个真实、可重复出现的用户场景。"
        : "这个想法背后存在一个真实、可反复讨论的思考缺口。",
      hasAiSignal
        ? "AI 的价值来自帮助用户澄清问题和结构，核心目标是提升思考质量。"
        : "只要结构足够清晰，未完成的想法也能持续积累价值。",
      "用户愿意为了更清楚的判断，花一点时间补充背景和反复追问。"
    ],
    challenges: [
      "如果问题过于宽泛，Thread 会停留在温和总结，难以形成锋利判断。",
      "如果缺少具体场景，洞见会显得正确但不可行动。",
      "如果下一步行动过大，用户很难从一次思考进入真实推进。"
    ],
    emergingInsight:
      "这个 Spark 的潜力在于把模糊直觉变成可继续工作的结构。当前最重要的动作，是把问题收窄到一个真实场景，并识别最需要验证的假设。",
    nextActions: [
      "用一句话写清楚这个想法发生在哪个具体场景。",
      "列出一个让它成立的关键假设，以及一个会削弱它的反例。",
      "把下一轮思考变成一个可以在十分钟内完成的小型验证问题。"
    ],
    finalSummary: `${makeSummary(combined)} 当前最清晰的推进方式，是先保护原始 Spark 的直觉，再围绕核心问题、关键假设和具体场景生成下一步判断。`
  };
}

function buildMarkdown(spark, thread) {
  const insight = normalizeInsight(thread.insight || makeInsight(spark, thread));
  return `# ValueSpark 思考线程

## 原始 Spark

${spark.content}

## 思考路径

${thread.thinkingPath.map((item) => `- ${item}`).join("\n")}

## 对话

${thread.messages.map((message) => `### ${message.role === "ai" ? "ValueSpark" : "用户"}\n\n${message.content}`).join("\n\n")}

## 洞见

### Core Question / 核心问题

${insight.coreQuestion}

### Key Assumptions / 关键假设

${insight.keyAssumptions.map((item) => `- ${item}`).join("\n")}

### Challenges / 挑战

${insight.challenges.map((item) => `- ${item}`).join("\n")}

### Emerging Insight / 正在浮现的洞见

${insight.emergingInsight}

### Next Actions / 下一步行动

${insight.nextActions.map((item) => `- ${item}`).join("\n")}

### Final Note / 最终总结

${insight.finalSummary}
`;
}

function normalizeInsight(insight) {
  return {
    coreQuestion: insight.coreQuestion || "这个 Spark 真正想澄清的问题是什么？",
    keyAssumptions: insight.keyAssumptions || insight.judgements || ["这个想法值得继续被澄清。"],
    challenges: insight.challenges || ["需要把问题继续收窄到一个具体场景。"],
    emergingInsight:
      insight.emergingInsight ||
      insight.about ||
      "这个 Spark 的价值来自它背后的思考缺口。下一步需要把直觉转成更清晰的判断。",
    nextActions: insight.nextActions || ["写清楚具体场景。", "列出关键假设。", "设计一个小验证。"],
    finalSummary: insight.finalSummary || "这条 Thread 已经形成一段可以继续推进的初步洞见。"
  };
}

function filteredSparks(search, filter) {
  const query = search.trim().toLowerCase();
  return state.sparks.filter((spark) => {
    const matchesStatus = filter === "全部" || spark.status === filter;
    const haystack = `${spark.title} ${spark.content} ${spark.summary} ${spark.tags.join(" ")}`.toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    return matchesStatus && matchesSearch;
  });
}

function makeSummary(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 132) return cleaned;
  return `${cleaned.slice(0, 129).trim()}...`;
}

function getParam(key) {
  const [, queryString = ""] = (window.location.hash || "").split("?");
  return new URLSearchParams(queryString).get(key);
}

function setParam(key, value) {
  const base = "#/library";
  const params = new URLSearchParams((window.location.hash.split("?")[1] || ""));
  if (value && value !== "全部") params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${base}?${query}` : base);
  render();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatRelativeDate(value) {
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 31) return `${Math.round(days / 7)}周前`;
  return `${Math.round(days / 30)}个月前`;
}

function statusClass(status) {
  if (status === "已生成洞见") return "is-complete";
  if (status === "思考中") return "is-active";
  return "is-new";
}

function makeSparkTitle(text) {
  const summary = makeSummary(text).replace(/[。！？!?]+$/, "");
  return summary.length > 26 ? `${summary.slice(0, 24)}...` : summary || "我的第一个想法";
}

function showToast(message) {
  clearTimeout(toastTimer);
  const root = document.querySelector("#toast-root");
  if (!root) return;
  root.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  toastTimer = setTimeout(() => {
    root.innerHTML = "";
  }, 2200);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72) || "valuespark-thread";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

window.addEventListener("hashchange", render);
if (!window.location.hash) {
  window.location.hash = "#/";
} else {
  render();
}
