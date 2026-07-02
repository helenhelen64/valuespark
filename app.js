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
  if (path === "#/settings") return { name: "settings" };
  return { name: "landing" };
}

function render() {
  const current = route();
  const app = document.querySelector("#app");
  const shell = ["library", "thread", "settings"].includes(current.name);

  app.innerHTML = `
    <div class="app-shell">
      ${shell ? renderTopbar(current.name) : ""}
      ${current.name === "landing" ? renderLanding() : ""}
      ${current.name === "library" ? renderLibrary() : ""}
      ${current.name === "thread" ? renderThread(current.id) : ""}
      ${current.name === "settings" ? renderSettings() : ""}
      ${!state.onboardingComplete && shell ? renderOnboarding() : ""}
      <div id="toast-root"></div>
    </div>
  `;

  bindActions();
}

function renderTopbar(active) {
  return `
    <header class="topbar">
      <button class="brand button" data-route="#/">
        <span class="brand-mark">VS</span>
        <span>ValueSpark</span>
      </button>
      <nav class="nav" aria-label="主导航">
        <button class="${active === "library" ? "active" : ""}" data-route="#/library">灵感库</button>
        <button class="${active === "settings" ? "active" : ""}" data-route="#/settings">设置</button>
      </nav>
    </header>
  `;
}

function renderLanding() {
  return `
    <main class="container landing">
      <section class="hero-copy">
        <h1>把灵感变成可用洞见。</h1>
        <p>ValueSpark 是一个私人 AI 思考工作台，帮你捕捉想法，并把它整理成清晰判断。</p>
        <div class="hero-actions">
          <button class="button primary" data-start>开始使用</button>
          <button class="button" data-route="#/library">进入灵感库</button>
        </div>
      </section>
      <section class="workspace-preview" aria-label="ValueSpark 工作台预览">
        <div class="preview-panel">
          <div class="preview-column">
            <p class="preview-title">灵感库</p>
            ${state.sparks
              .slice(0, 3)
              .map(
                (spark) => `
                  <div class="mini-spark">
                    <strong>${escapeHtml(spark.title)}</strong>
                    <span>${escapeHtml(spark.summary)}</span>
                  </div>
                `
              )
              .join("")}
          </div>
          <div class="preview-thread">
            <p class="preview-title">思考路径</p>
            ${[
              "这个灵感里真正值得拆解的张力是什么？",
              "哪一个关键假设需要最先验证？",
              "什么样的洞见明天依然有用？"
            ]
              .map((line) => `<div class="path-line">${line}</div>`)
              .join("")}
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

  return `
    <main class="container page">
      <header class="page-header">
        <div>
          <h1>灵感库</h1>
          <p>每一个洞见，都开始于一小束灵感。</p>
        </div>
        <button class="button primary" data-focus-create>新建 Spark</button>
      </header>

      <section class="create-panel" aria-label="创建 Spark">
        <div class="field">
          <label for="spark-title">标题</label>
          <input id="spark-title" data-create-title placeholder="一个问题、判断，或还没成形的想法" />
        </div>
        <div class="field">
          <label for="spark-content">原始内容</label>
          <textarea id="spark-content" data-create-content placeholder="在想法消失前，把它先捕捉下来。"></textarea>
        </div>
        <div class="field">
          <label for="spark-tags">标签</label>
          <input id="spark-tags" data-create-tags placeholder="AI, 写作, 产品" />
        </div>
        <button class="button primary" data-create-spark>创建</button>
      </section>

      <section class="toolbar" aria-label="灵感库筛选">
        <div class="field">
          <label for="spark-search">搜索</label>
          <input id="spark-search" value="${escapeAttr(search)}" data-search placeholder="搜索 Spark" />
        </div>
        <div class="field">
          <label for="status-filter">状态</label>
          <select id="status-filter" data-filter>
            ${statusOptions
              .map((item) => `<option ${item === filter ? "selected" : ""}>${item}</option>`)
              .join("")}
          </select>
        </div>
      </section>

      ${
        sparks.length
          ? `<section class="spark-grid">${sparks.map(renderSparkCard).join("")}</section>`
          : `<section class="empty">每一个洞见，都开始于一小束灵感。</section>`
      }
    </main>
  `;
}

function renderSparkCard(spark) {
  return `
    <article class="spark-card">
      <div>
        <h3>${escapeHtml(spark.title)}</h3>
        <p>${escapeHtml(spark.summary)}</p>
        <div class="meta-row">
          <span class="status">${escapeHtml(spark.status)}</span>
          <span class="tag">${formatDate(spark.updatedAt)}</span>
          ${spark.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
      <div class="card-actions">
        <button class="button primary" data-open-thread="${spark.id}">打开线程</button>
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
    <main class="container page">
      <header class="page-header">
        <div>
          <h1>${escapeHtml(spark.title)}</h1>
          <p>${escapeHtml(spark.summary)}</p>
        </div>
        <button class="button" data-route="#/library">返回灵感库</button>
      </header>

      <section class="thread-layout">
        <div class="thread-stack">
          <section class="thread-section">
            <h2>原始 Spark</h2>
            <div class="original-text">${escapeHtml(spark.content)}</div>
          </section>

          <section class="thread-section">
            <h2>思考路径</h2>
            <ul class="thinking-list">
              ${thread.thinkingPath.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>

          <section class="thread-section">
            <h2>洞见</h2>
            ${
              thread.insight
                ? renderInsight(thread.insight)
                : `<p class="muted">当线程里有足够材料后，可以生成一份结构化洞见。</p>`
            }
            <div class="section-actions">
              <button class="button primary" data-generate-insight="${spark.id}">生成洞见</button>
              <button class="button" data-copy-summary="${spark.id}" ${thread.insight ? "" : "disabled"}>复制总结</button>
              <button class="button" data-export-markdown="${spark.id}">导出 Markdown</button>
            </div>
          </section>
        </div>

        <section class="thread-section">
          <h2>对话</h2>
          <div class="dialogue" data-dialogue>
            ${thread.messages.map(renderMessage).join("")}
          </div>
          <form class="dialogue-form" data-message-form="${spark.id}">
            <div class="field">
              <label for="message-input">继续推进这个想法</label>
              <textarea id="message-input" data-message-input placeholder="补充背景、疑问，或下一个问题。"></textarea>
            </div>
            <button class="button primary" type="submit">发送</button>
          </form>
        </section>
      </section>
    </main>
  `;
}

function renderMessage(message) {
  return `
    <div class="message ${message.role}">
      ${escapeHtml(message.content)}
    </div>
  `;
}

function renderInsight(insight) {
  return `
    <div class="insight-grid">
      <div class="insight-item">
        <h3>核心问题</h3>
        <p>${escapeHtml(insight.coreQuestion)}</p>
      </div>
      <div class="insight-item">
        <h3>这个 Spark 真正在讨论什么</h3>
        <p>${escapeHtml(insight.about)}</p>
      </div>
      <div class="insight-item">
        <h3>关键判断</h3>
        <ul>${insight.judgements.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div class="insight-item">
        <h3>下一步行动</h3>
        <ul>${insight.nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div class="insight-item">
        <h3>最终总结</h3>
        <p>${escapeHtml(insight.finalSummary)}</p>
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

function renderOnboarding() {
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section class="modal">
        <h2 id="onboarding-title">一种更安静的 AI 思考方式。</h2>
        <p class="muted">ValueSpark 帮你把未完成的想法保留下来，并慢慢推进成可用洞见。</p>
        <div class="onboarding-steps">
          <div class="onboarding-step">在灵感消失前捕捉它。</div>
          <div class="onboarding-step">把零散想法整理成可见的思考路径。</div>
          <div class="onboarding-step">生成真正能被使用的洞见。</div>
        </div>
        <button class="button primary" data-complete-onboarding>进入工作台</button>
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
    focusCreate.addEventListener("click", () => document.querySelector("[data-create-title]")?.focus());
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
      state.onboardingComplete = true;
      saveState();
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

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const spark = {
    id,
    title,
    content,
    summary: makeSummary(content),
    tags: tagsRaw
      ? tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : ["未分类"],
    status: "未处理",
    createdAt: now,
    updatedAt: now,
    threadId: id
  };

  state.sparks.unshift(spark);
  state.threads[id] = createThreadFromSpark(spark);
  saveState();
  showToast("Spark 已保存。");
  render();
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

  const summary = thread.insight.finalSummary;
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
    thinkingPath: [
      "这个 Spark 真正想澄清的问题是什么？",
      "谁会在什么场景下需要这个想法？",
      "它和显而易见的版本有什么差异？",
      "继续投入前，最需要验证的假设是什么？",
      "一个有用的下一步应该长什么样？"
    ],
    messages: [
      {
        role: "ai",
        content:
          "这个 Spark 值得放慢来看。我会先把表层想法和它背后更深的问题分开，然后判断哪些部分需要澄清、验证，或变成具体下一步。",
        createdAt: new Date().toISOString()
      }
    ],
    insight: null
  };
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

  return {
    coreQuestion: `${corePhrase}?`,
    about:
      "这个 Spark 的核心，是把一个未完成的想法推进成更清晰的判断。关键工作是找出隐藏假设、用户场景，以及最小可行动作。",
    judgements: [
      "这个 Spark 的价值来自真实的思考缺口，核心关注点是思考质量。",
      "第一版应该通过问题、路径和总结，让用户看见自己的思考进展。",
      "当它聚焦一个具体用户场景时，想法会更容易变强。"
    ],
    nextActions: [
      "用一句话写清楚具体用户场景。",
      "列出让这个想法值得继续推进的关键假设。",
      "把下一轮思考变成一个小型验证问题。"
    ],
    finalSummary: `${makeSummary(combined)} 最清晰的下一步，是定义用户场景，检验核心假设，并把输出保持在未来可以回顾和继续推进的程度。`
  };
}

function buildMarkdown(spark, thread) {
  const insight = thread.insight || makeInsight(spark, thread);
  return `# ValueSpark 思考线程

## 原始 Spark

${spark.content}

## 思考路径

${thread.thinkingPath.map((item) => `- ${item}`).join("\n")}

## 对话

${thread.messages.map((message) => `### ${message.role === "ai" ? "ValueSpark" : "用户"}\n\n${message.content}`).join("\n\n")}

## 洞见

### 核心问题

${insight.coreQuestion}

### 这个 Spark 真正在讨论什么

${insight.about}

### 关键判断

${insight.judgements.map((item) => `- ${item}`).join("\n")}

### 最终总结

${insight.finalSummary}

## 下一步行动

${insight.nextActions.map((item) => `- ${item}`).join("\n")}
`;
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
