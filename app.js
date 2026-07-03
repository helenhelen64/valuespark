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
        <p class="eyebrow">PRIVATE THINKING PARTNER</p>
        <h1>把灵感慢慢推成判断。</h1>
        <p>ValueSpark 是一个私人 AI 思考工作台，帮你保存未完成的想法，并把它们推进成可回顾、可行动的洞见。</p>
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
            <p class="preview-title">Thread Workspace</p>
            ${[
              "Original Spark: 先保留想法最原始的温度。",
              "Core Question: 找出它真正想回答的问题。",
              "Key Assumptions: 标出需要验证的关键假设。",
              "Emerging Insight: 生成一段未来还能继续使用的判断。"
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
        <button class="button primary" data-open-thread="${spark.id}">进入 Thread</button>
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
            <p class="section-label">Original Spark</p>
            <h2>原始 Spark</h2>
            <div class="original-text">${escapeHtml(spark.content)}</div>
          </section>

          <section class="thread-section">
            <p class="section-label">Thinking Path</p>
            <h2>思考路径</h2>
            <ul class="thinking-list">
              ${thread.thinkingPath.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>

          <section class="thread-section">
            <p class="section-label">Structured Insight</p>
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
          <p class="section-label">Conversation</p>
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
        ? "AI 的价值来自帮助用户澄清问题和结构，而非只给出更快答案。"
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
