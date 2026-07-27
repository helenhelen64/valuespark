const STORAGE_KEY = "valuespark.state.v1";
const SESSION_KEYS_STORAGE = "valuespark.session-keys.v1";

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
      provider: "",
      model: "",
      flowVersion: 2
    },
    onboardingComplete: false
  };
};

let state = loadState();
let aiRuntime = {
  mode: "checking",
  provider: { id: "checking", label: "正在检测" },
  model: "正在检测",
  providers: []
};
let sessionKeys = loadSessionKeys();
let pendingAction = null;
let toastTimer = null;
let captureOpen = true;
let onboardingStep = 0;
let onboardingDraft = "";
let rotatingTextTimer = null;
let rotatingTextIndex = 0;

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
      if (!Array.isArray(thread.suggestedQuestions)) {
        thread.suggestedQuestions = [];
      }
    });
    // v1 原型曾把 Key 存在浏览器里。升级后立即清除这份敏感数据。
    if (parsed.settings?.apiKey) {
      delete parsed.settings.apiKey;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    const needsProviderFlowReset = parsed.settings?.flowVersion !== 2;
    parsed.settings = {
      provider: needsProviderFlowReset ? "" : String(parsed.settings?.provider || ""),
      model: needsProviderFlowReset ? "" : String(parsed.settings?.model || ""),
      flowVersion: 2
    };
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
  if (path === "#/space") {
    const latestSpark = state.sparks[0];
    return latestSpark ? { name: "thread", id: latestSpark.id } : { name: "library" };
  }
  if (path === "#/approach") return { name: "approach" };
  if (path === "#/cases") return { name: "cases" };
  if (path === "#/about") return { name: "about" };
  if (path === "#/settings") return { name: "settings" };
  if (path === "#/onboarding") return { name: "onboarding" };
  return { name: "landing" };
}

function render() {
  window.clearInterval(rotatingTextTimer);
  rotatingTextTimer = null;
  const current = route();
  const app = document.querySelector("#app");

  app.innerHTML = `
    <div class="app-shell">
      ${current.name === "thread" || current.name === "onboarding" ? "" : renderTopbar(current.name)}
      ${current.name === "landing" ? renderLanding() : ""}
      ${current.name === "library" ? renderLibrary() : ""}
      ${current.name === "thread" ? renderThread(current.id) : ""}
      ${current.name === "approach" ? renderApproach() : ""}
      ${current.name === "cases" ? renderCases() : ""}
      ${current.name === "about" ? renderAbout() : ""}
      ${current.name === "settings" ? renderSettings() : ""}
      ${current.name === "onboarding" ? renderOnboarding() : ""}
      <div id="toast-root"></div>
    </div>
  `;

  bindActions();
  if (current.name === "landing") initRotatingText();
}

function renderTopbar(active) {
  const links = [
    ["landing", "#/", "首页"],
    ["library", "#/library", "图书馆"],
    ["space", "#/space", "思考空间"],
    ["approach", "#/approach", "思考方式"],
    ["cases", "#/cases", "案例"],
    ["about", "#/about", "关于"],
    ["settings", "#/settings", "设置"]
  ];

  return `
    <header class="topbar">
      <button class="brand button" data-route="#/" aria-label="返回 ValueSpark 首页">
        <img class="brand-logo" src="./assets/logo/value-spark-logo.png" alt="" />
        <span class="brand-name">ValueSpark</span>
      </button>
      <nav class="nav" aria-label="主导航">
        ${links
          .map(([key, path, label]) => `<button class="${active === key ? "active" : ""}" data-route="${path}">${label}</button>`)
          .join("")}
        <button class="nav-cta" data-new-spark>开始思考</button>
      </nav>
    </header>
  `;
}

function renderLanding() {
  return `
    <main class="landing-page">
      <section class="landing-hero">
        <img class="landing-hero-logo" src="./assets/logo/value-spark-logo.png" alt="ValueSpark logo" />
        <h1>ValueSpark</h1>
        <div class="landing-subtitle">
          <p>让灵感真正 <span data-rotating-text>被认真捕捉</span></p>
        </div>
        <form class="landing-prompt" data-landing-form>
          <input
            type="text"
            data-landing-input
            aria-label="写下一个灵感"
            placeholder="写下一个灵感，我帮你慢慢想清楚"
            autocomplete="off"
          />
          <button type="submit" aria-label="开始思考">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        <div class="landing-prompts" aria-label="灵感提示">
          <button type="button" data-landing-preset="捕捉灵感">捕捉灵感</button>
          <button type="button" data-landing-preset="结构化思考">结构化思考</button>
          <button type="button" data-landing-preset="生成洞见">生成洞见</button>
        </div>
      </section>

      <section class="landing-features">
        <article>
          <span>CAPTURE</span>
          <h2>捕捉灵感</h2>
          <p>记录那些一闪而过但有价值的想法。</p>
        </article>
        <article>
          <span>STRUCTURE</span>
          <h2>结构化思考</h2>
          <p>把混乱念头拆成清晰的问题、路径和判断。</p>
        </article>
        <article>
          <span>INSIGHT</span>
          <h2>生成洞见</h2>
          <p>帮助你看见想法背后更深层的联系。</p>
        </article>
      </section>

      <footer class="landing-footer">
        <div>
          <a href="https://x.com/hezhu0564?s=20" target="_blank" rel="noopener noreferrer">X</a>
          <a href="https://t.me/crypto0xhelen" target="_blank" rel="noopener noreferrer">Telegram</a>
          <button type="button" data-route="#/about">About</button>
        </div>
        <p>© VALUE SPARK — THINK DEEPER</p>
      </footer>
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
      <section class="library-intro">
        <img class="library-brand-symbol" src="./assets/logo/value-spark-logo.png" alt="" />
        <div>
          <p class="section-kicker">你的私人思考搭档</p>
          <h1>今天，想把什么想清楚？</h1>
          <p>先保留原始想法，再进入一段有结构的深度对话。</p>
        </div>
      </section>

      ${captureOpen ? renderCapturePanel() : ""}

      <header class="library-header">
        <div>
          <h2>最近的火花</h2>
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
          <button class="button capture-button" data-focus-create>${captureOpen ? "收起输入" : "新建火花"}</button>
        </div>
      </header>

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
        <label for="spark-title">给这个想法一个名字</label>
        <input id="spark-title" data-create-title placeholder="例如：我的新产品应该从哪里开始？" />
      </div>
      <div class="field field-wide">
        <label for="spark-content">原始火花</label>
        <textarea id="spark-content" data-create-content placeholder="把脑子里还没成形的想法写下来。这里允许模糊、犹豫和不完整。"></textarea>
      </div>
      <div class="field">
        <label for="spark-tags">标签（可选）</label>
        <input id="spark-tags" data-create-tags placeholder="产品, 写作" />
      </div>
      <div class="capture-submit">
        <span>随时记录，不用完美</span>
        <button class="button primary" data-create-spark>存为火花</button>
      </div>
    </section>
  `;
}

function renderLibraryEmptyCard() {
  return `
    <article class="spark-card empty-card" data-focus-create>
      <img class="empty-logo" src="./assets/logo/value-spark-logo.png" alt="" />
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
  const isSending = pendingAction === `chat:${spark.id}`;
  const isGenerating = pendingAction === `insight:${spark.id}`;
  state.threads[spark.threadId] = thread;
  saveState();

  return `
    <main class="thread-page">
      <header class="thread-topline">
        <div class="thread-title-row">
          <button class="brand button" data-route="#/library">
            <img class="brand-logo" src="./assets/logo/value-spark-logo.png" alt="" />
            <span class="brand-name">ValueSpark</span>
          </button>
          <span class="dot-separator">·</span>
          <h1>${escapeHtml(spark.title)}</h1>
          <span class="status">${escapeHtml(spark.status)}</span>
        </div>
        <div class="thread-settings">
          <span class="runtime-pill">${runtimeModeLabel()}</span>
          <span>${escapeHtml(currentProviderLabel())} · ${escapeHtml(currentModelLabel())}</span>
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
              <textarea data-message-input placeholder="继续输入你的想法..." ${isSending ? "disabled" : ""}></textarea>
              ${
                thread.suggestedQuestions.length
                  ? `<div class="suggested-questions">
                      ${thread.suggestedQuestions
                        .map(
                          (question) =>
                            `<button class="question-chip" type="button" data-message-preset="${spark.id}" data-preset-text="${escapeAttr(question)}" ${isSending ? "disabled" : ""}>${escapeHtml(question)}</button>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }
              <div class="thread-input-actions">
                <button class="button" type="button" data-message-preset="${spark.id}" data-preset-text="请继续加深这个思考，帮我看到更底层的问题。" ${isSending ? "disabled" : ""}>加深思考</button>
                <button class="button" type="button" data-message-preset="${spark.id}" data-preset-text="请挑战这个想法里的关键假设，指出可能被忽略的盲区。" ${isSending ? "disabled" : ""}>挑战假设</button>
                <button class="button primary" type="submit" ${isSending ? "disabled" : ""}>${isSending ? "思考中…" : "发送"}</button>
              </div>
            </form>
            <p>当前深度：高（会更严格地挑战你的想法）</p>
          </div>
        </section>

        <aside class="reasoning-panel">
          <div class="reasoning-header">
            <div>
              <p class="section-kicker">LOGIC CHAIN</p>
              <h2>思考路径</h2>
            </div>
            <button class="button" data-export-markdown="${spark.id}">导出</button>
          </div>
          <div class="reasoning-cards">
            ${renderReasoningCards(spark, thread)}
            ${thread.insight ? renderInsight(thread.insight) : ""}
          </div>
          <div class="reasoning-actions">
            <button class="button primary" data-generate-insight="${spark.id}" ${isGenerating ? "disabled" : ""}>${isGenerating ? "生成中…" : "生成洞见"}</button>
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
  const structure = thread.structure || {};
  const cards = [
    ["Observation", "", structure.observation || "很多想法真正需要的，是把原始直觉从混乱里单独拿出来。"],
    ["Assumption", "挑战", structure.keyAssumption || insight.keyAssumptions[0]],
    ["Insight", "", structure.emergingInsight || insight.emergingInsight]
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
  const selectedProviderId = state.settings.provider || "";
  const selectedProvider = getSelectedProvider();
  const models = selectedProvider?.models || [];
  const supportsSessionKey = Boolean(selectedProviderId) && selectedProvider?.id !== "ollama";
  const hasKey = supportsSessionKey && hasSessionApiKey(selectedProvider.id);
  return `
    <main class="settings-page">
      <header class="settings-page-header">
        <h1>设置</h1>
        <p>管理你的思考偏好、账户与使用体验</p>
      </header>

      <section class="settings-section">
        <p class="settings-section-title">账户</p>
        <div class="original-setting-card account-card">
          <div class="account-identity">
            <span class="account-avatar">H</span>
            <div>
              <strong>Helen Zhu</strong>
              <p>hezhu0564@gmail.com</p>
            </div>
          </div>
          <button class="button" type="button">切换账户</button>
        </div>
        <div class="account-actions">
          <button class="button" type="button">编辑资料</button>
          <button class="button danger" type="button">退出登录</button>
        </div>
      </section>

      <section class="settings-section">
        <p class="settings-section-title">AI 模型</p>
        <div class="original-setting-card ai-setting-card">
          <div class="setting-copy">
            <strong>选择供应商、模型并填写 API Key</strong>
            <p>API Key 只保留在当前浏览器会话，并经由 ValueSpark 服务端代理用于模型请求。</p>
          </div>
        <div class="model-picker-grid">
          <div class="field">
            <label for="ai-provider">AI 供应商</label>
            <select id="ai-provider" data-ai-provider>
              <option value="" ${selectedProviderId ? "" : "selected"} disabled>请选择 AI 供应商</option>
              ${aiRuntime.providers
                .map(
                  (provider) =>
                    `<option value="${escapeAttr(provider.id)}" ${selectedProviderId === provider.id ? "selected" : ""}>${escapeHtml(provider.label)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="ai-model">模型</label>
            <select id="ai-model" data-ai-model ${models.length ? "" : "disabled"}>
              ${
                models.length
                  ? models
                      .map(
                        (model) =>
                          `<option value="${escapeAttr(model.id)}" ${state.settings.model === model.id ? "selected" : ""}>${escapeHtml(model.label)}</option>`
                      )
                      .join("")
                  : `<option>请先选择供应商</option>`
              }
            </select>
          </div>
        </div>
        <div class="api-key-panel">
          ${
            supportsSessionKey
              ? `<div class="api-key-control">
                  <input
                    type="password"
                    data-session-api-key
                    aria-label="${escapeAttr(selectedProvider.label)} API Key"
                    placeholder="${hasKey ? "当前会话已保存密钥，可输入新值替换" : "粘贴 API Key"}"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button class="button primary" data-save-api-key>保存并启用</button>
                  ${hasKey ? `<button class="button" data-clear-api-key>清除</button>` : ""}
                </div>`
              : `<p class="api-key-placeholder">${
                  selectedProvider?.id === "ollama"
                    ? "Ollama 使用站点管理员配置的本地服务地址。"
                    : "选择供应商后即可粘贴对应的 API Key。"
                }</p>`
          }
          <div class="api-key-privacy">服务器仅代理本次请求，不保存、返回或写入日志。</div>
        </div>
        ${
          selectedProvider && (selectedProvider.configured || hasKey)
            ? `<div class="connection-ready">
                <span>已启用</span>
                <strong>${escapeHtml(selectedProvider.label)} · ${escapeHtml(currentModelLabel())}</strong>
              </div>`
            : ""
        }
        </div>
      </section>

      <section class="settings-section">
        <p class="settings-section-title">思考偏好</p>
        <div class="original-setting-card preference-card">
          <div>
            <strong>默认思考深度</strong>
            <div class="depth-options">
              <button type="button">浅</button>
              <button class="selected" type="button">中</button>
              <button type="button">深</button>
            </div>
            <p class="setting-hint">影响 AI 默认的思考强度与追问频率</p>
          </div>

          <div>
            <strong>AI 回应风格</strong>
            <div class="response-styles">
              <button class="selected" type="button"><strong>苏格拉底式</strong><span>通过提问帮助你自己发现答案</span></button>
              <button type="button"><strong>结构化</strong><span>直接给出清晰的框架与节点</span></button>
              <button type="button"><strong>温和挑战</strong><span>指出潜在盲点但语气柔和</span></button>
              <button type="button"><strong>直接型</strong><span>高效给出结论与建议</span></button>
            </div>
          </div>

          <div class="setting-switch-row">
            <div>
              <strong>允许 AI 主动提出反问</strong>
              <p>在你长时间沉默时主动帮助推进思考</p>
            </div>
            ${renderSettingSwitch("允许 AI 主动提出反问")}
          </div>
        </div>
      </section>

      <section class="settings-section">
        <p class="settings-section-title">专注与通知</p>
        <div class="original-setting-card stacked-settings">
          <div class="setting-switch-row">
            <div><strong>思考时自动勿扰</strong><p>进入深度思考时屏蔽所有通知</p></div>
            ${renderSettingSwitch("思考时自动勿扰")}
          </div>
          <div class="setting-switch-row">
            <div><strong>洞见生成提醒</strong><p>当 AI 认为有重要洞见时通知你</p></div>
            ${renderSettingSwitch("洞见生成提醒")}
          </div>
        </div>
      </section>

      <section class="settings-section">
        <p class="settings-section-title">语言</p>
        <div class="original-setting-card setting-switch-row">
          <div><strong>界面语言</strong><p>语言设置会影响 AI 的表达风格</p></div>
          <select class="original-select" aria-label="界面语言">
            <option>中文（简体）</option>
            <option>English</option>
          </select>
        </div>
      </section>

      <section class="settings-section">
        <p class="settings-section-title">本月思考容量</p>
        <div class="original-setting-card capacity-card">
          <div class="capacity-head">
            <div>
              <p>已完成高质量思考</p>
              <strong>37 <span>条洞见</span></strong>
            </div>
            <button class="button accent-outline" type="button">解锁更深层思考</button>
          </div>
          <p>本月已进行 <strong>184 次</strong> 深度对话 · 累计结构化 <strong>1,276</strong> 个思考节点</p>
          <p>相当于帮你节省了约 <strong>47 小时</strong> 的混乱思考时间</p>
        </div>
      </section>

      <section class="settings-section">
        <p class="settings-section-title">数据与记忆</p>
        <div class="original-setting-card stacked-settings">
          <div class="setting-switch-row">
            <div><strong>记忆保留策略</strong><p>AI 可参考的历史思考范围</p></div>
            <select class="original-select" aria-label="记忆保留策略">
              <option>最近 30 天</option>
              <option>最近 90 天</option>
              <option>全部历史</option>
            </select>
          </div>
          <div class="setting-switch-row export-setting">
            <div><strong>导出我的思考档案</strong><p>支持 Markdown / PDF / 结构化 JSON</p></div>
            <button class="text-button export-link" type="button">导出</button>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderSettingSwitch(label) {
  return `
    <label class="setting-toggle">
      <input type="checkbox" checked aria-label="${escapeAttr(label)}" />
      <span></span>
    </label>
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
    <main class="content-page about-page">
      <section class="content-hero about-hero">
        <h1>关于 ValueSpark</h1>
        <p>我们相信，真正重要的想法，值得被认真、缓慢、结构化地对待。</p>
      </section>

      <section class="about-copy">
        <section class="about-section">
          <p class="section-kicker">为什么要做 ValueSpark</p>
          <div class="about-prose">
            <p>现在的 AI 工具越来越快，也越来越会“讨好”用户。它们能瞬间给你一个看起来合理的答案，但很少有人真正陪你把一个模糊、混乱、甚至带着焦虑的想法，一点一点拆开、审视、重组。</p>
            <p>我在做产品和思考个人方向时，经常会遇到那种“脑子里有很多东西，但怎么也理不清”的状态。和 ChatGPT 聊几句虽然能得到一些启发，但总感觉缺少了某种“重量”和“陪伴”。</p>
            <p>ValueSpark 就是为了填补这个空白而生的。它不是一个更聪明的聊天机器人，而是一个愿意陪你一起慢下来、把思考过程摊开看的伙伴。</p>
          </div>
        </section>

        <section class="about-section">
          <p class="section-kicker">我们的信念</p>
          <div class="about-grid">
            <div>
              <h3>思考需要外部结构</h3>
              <p>大脑在处理复杂问题时很容易陷入循环和盲区。把想法结构化地写出来、画出来，是对抗这种局限最有效的办法之一。</p>
            </div>
            <div>
              <h3>慢思考是一种能力</h3>
              <p>在快节奏的时代，愿意且能够慢下来的人，反而能看到别人看不到的联系和机会。</p>
            </div>
            <div>
              <h3>AI 应该是思考的放大器，而不是替代品</h3>
              <p>我们不想让 AI 替你做决定，而是想让它帮你把自己的思考过程看得更清楚。</p>
            </div>
            <div>
              <h3>洞见需要被反复打磨</h3>
              <p>真正有价值的想法很少能一次成型。它需要被挑战、被拆解、被重新组合。</p>
            </div>
          </div>
        </section>

        <section class="about-section">
          <p class="section-kicker">适合谁</p>
          <div class="about-prose">
            <p>ValueSpark 不是为所有人准备的。它特别适合以下几类人：</p>
            <ul class="plain-list">
              <li>经常需要处理复杂、模糊问题的独立思考者（开发者、产品人、研究者、创业者）</li>
              <li>厌倦了快餐式 AI 回答，想要真正把想法想透的人</li>
              <li>希望把自己的思考过程沉淀下来，而不是每次都从零开始的人</li>
              <li>愿意为了更好的洞见，付出一点“慢”的耐心的人</li>
            </ul>
          </div>
        </section>

        <section class="about-section">
          <p class="section-kicker">关于我</p>
          <div class="about-prose">
            <p>我是 Helen（@hezhu0564），一个长期关注 AI 工具和深度思考方式的独立开发者。</p>
            <p>在过去几年里，我自己一直在和“想法太多但理不清”的状态斗争，也试过几乎所有主流 AI 工具。我发现，真正能帮到我的工具，不是那些能最快给出答案的，而是能陪我把思考过程慢慢展开的。</p>
            <p>ValueSpark 就是我自己真正想要用的工具，也是我希望能和更多同类的人一起用好的东西。</p>
          </div>
        </section>

        <section class="about-contact">
          <p class="section-kicker">联系与交流</p>
          <p>如果你对 ValueSpark 有任何想法、建议，或者只是想聊聊深度思考这件事，欢迎随时联系我。</p>
          <div>
            <a href="https://x.com/hezhu0564?s=20" target="_blank" rel="noopener noreferrer">X / Twitter @hezhu0564</a>
            <a href="https://t.me/crypto0xhelen" target="_blank" rel="noopener noreferrer">Telegram @crypto0xhelen</a>
          </div>
        </section>
      </section>
    </main>
  `;
}

function renderOnboarding() {
  const steps = [
    `
      <div class="onboarding-center">
        <img class="home-logo" src="./assets/logo/value-spark-logo.png" alt="ValueSpark" />
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
        <img class="home-logo" src="./assets/logo/value-spark-logo.png" alt="ValueSpark" />
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

  const landingForm = document.querySelector("[data-landing-form]");
  if (landingForm) {
    landingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createSparkFromLanding();
    });
  }

  document.querySelectorAll("[data-landing-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("[data-landing-input]");
      if (!input) return;
      input.value = button.dataset.landingPreset;
      input.focus();
    });
  });

  document.querySelectorAll("[data-focus-create]").forEach((focusCreate) => {
    focusCreate.addEventListener("click", () => {
      captureOpen = !captureOpen;
      render();
      if (captureOpen) {
        document.querySelector("[data-create-content]")?.focus();
      }
    });
  });

  const newSpark = document.querySelector("[data-new-spark]");
  if (newSpark) {
    newSpark.addEventListener("click", () => {
      if (route().name === "landing") {
        document.querySelector("[data-landing-input]")?.focus();
        return;
      }
      captureOpen = true;
      if (route().name !== "library") {
        navigate("#/library");
        return;
      }
      render();
      document.querySelector("[data-create-content]")?.focus();
    });
  }

  document.querySelectorAll(".depth-options button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".depth-options button").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

  document.querySelectorAll(".response-styles button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".response-styles button").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });

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
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendMessage(form.dataset.messageForm);
    });
  });

  document.querySelectorAll("[data-message-preset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = document.querySelector("[data-message-input]");
      if (!input) return;
      input.value = button.dataset.presetText;
      await sendMessage(button.dataset.messagePreset);
    });
  });

  document.querySelectorAll("[data-generate-insight]").forEach((button) => {
    button.addEventListener("click", async () => generateInsight(button.dataset.generateInsight));
  });

  document.querySelectorAll("[data-copy-summary]").forEach((button) => {
    button.addEventListener("click", () => copySummary(button.dataset.copySummary));
  });

  document.querySelectorAll("[data-export-markdown]").forEach((button) => {
    button.addEventListener("click", () => exportMarkdown(button.dataset.exportMarkdown));
  });

  const aiProvider = document.querySelector("[data-ai-provider]");
  if (aiProvider) {
    aiProvider.addEventListener("change", () => {
      state.settings.provider = aiProvider.value;
      const provider = getSelectedProvider();
      state.settings.model = provider?.models?.[0]?.id || "";
      saveState();
      render();
      showToast("AI 供应商已切换。");
    });
  }

  const aiModel = document.querySelector("[data-ai-model]");
  if (aiModel) {
    aiModel.addEventListener("change", () => {
      state.settings.model = aiModel.value;
      saveState();
      render();
      showToast("模型选择已保存。");
    });
  }

  const saveApiKey = document.querySelector("[data-save-api-key]");
  if (saveApiKey) {
    saveApiKey.addEventListener("click", () => {
      const provider = getSelectedProvider();
      const apiKey = document.querySelector("[data-session-api-key]")?.value.trim() || "";
      if (!provider || !apiKey) {
        showToast("请先填写 API Key。");
        return;
      }
      sessionKeys[provider.id] = apiKey;
      saveSessionKeys();
      render();
      showToast(`${provider.label} API Key 已保存，可以开始使用。`);
    });
  }

  const clearApiKey = document.querySelector("[data-clear-api-key]");
  if (clearApiKey) {
    clearApiKey.addEventListener("click", () => {
      const provider = getSelectedProvider();
      if (!provider) return;
      delete sessionKeys[provider.id];
      saveSessionKeys();
      render();
      showToast(`${provider.label} 会话密钥已清除。`);
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

function initRotatingText() {
  const phrases = ["被认真捕捉", "形成结构", "成长为洞见", "变得清晰"];
  const element = document.querySelector("[data-rotating-text]");
  if (!element) return;

  rotatingTextIndex = 0;
  element.textContent = phrases[rotatingTextIndex];
  rotatingTextTimer = window.setInterval(() => {
    element.classList.add("is-changing");
    window.setTimeout(() => {
      rotatingTextIndex = (rotatingTextIndex + 1) % phrases.length;
      element.textContent = phrases[rotatingTextIndex];
      element.classList.remove("is-changing");
    }, 520);
  }, 2200);
}

function createSparkFromLanding() {
  const input = document.querySelector("[data-landing-input]");
  const content = input?.value.trim() || "";
  if (!content) {
    input?.focus();
    return;
  }

  const spark = addSpark({
    title: makeSparkTitle(content),
    content,
    tags: ["灵感"],
    status: "思考中"
  });
  saveState();
  openThread(spark.id);
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

async function sendMessage(sparkId) {
  const spark = state.sparks.find((item) => item.id === sparkId);
  if (!spark || pendingAction) return;
  if (!ensureAiReady()) return;

  const input = document.querySelector("[data-message-input]");
  const content = input.value.trim();
  if (!content) {
    showToast("先写下一段想法再发送。");
    return;
  }

  const thread = state.threads[spark.threadId];
  thread.messages.push({ role: "user", content, createdAt: new Date().toISOString() });
  spark.status = "思考中";
  spark.updatedAt = new Date().toISOString();
  state.threads[spark.threadId] = thread;
  saveState();
  pendingAction = `chat:${spark.id}`;
  render();
  let completionNotice = "";

  try {
    const result = await requestAi({
      action: "chat",
      spark: { title: spark.title, content: spark.content },
      messages: thread.messages.slice(0, -1),
      userMessage: content,
      provider: state.settings.provider,
      model: state.settings.model
    });
    thread.messages.push({ role: "ai", content: result.data.reply, createdAt: new Date().toISOString() });
    thread.suggestedQuestions = result.data.followUpQuestions || [];
    thread.structure = normalizeThinkingStructure(result.data.thinkingPath);
    thread.thinkingPath = thinkingPathToList(thread.structure);
    aiRuntime = {
      ...aiRuntime,
      mode: result.mode,
      provider: result.provider,
      model: result.model
    };
  } catch (error) {
    aiRuntime = {
      ...aiRuntime,
      mode: "error"
    };
    completionNotice = error.message || "模型连接失败，请检查供应商、模型和 API Key。";
  } finally {
    pendingAction = null;
    saveState();
    render();
    if (completionNotice) showToast(completionNotice);
    const dialogue = document.querySelector("[data-dialogue]");
    if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
  }
}

async function generateInsight(sparkId) {
  const spark = state.sparks.find((item) => item.id === sparkId);
  if (!spark || pendingAction) return;
  if (!ensureAiReady()) return;

  const thread = state.threads[spark.threadId];
  pendingAction = `insight:${spark.id}`;
  render();
  let completionNotice = "";

  try {
    const result = await requestAi({
      action: "insight",
      spark: { title: spark.title, content: spark.content },
      messages: thread.messages,
      provider: state.settings.provider,
      model: state.settings.model
    });
    thread.insight = normalizeInsight(result.data);
    thread.structure = {
      observation: thread.structure?.observation || makeSummary(spark.content),
      coreQuestion: thread.insight.coreQuestion,
      keyAssumption: thread.insight.keyAssumptions[0],
      challenge: thread.insight.challenges[0],
      emergingInsight: thread.insight.emergingInsight
    };
    thread.thinkingPath = thinkingPathToList(thread.structure);
    aiRuntime = {
      ...aiRuntime,
      mode: result.mode,
      provider: result.provider,
      model: result.model
    };
    spark.status = "已生成洞见";
    spark.updatedAt = new Date().toISOString();
    completionNotice = "洞见已生成。";
  } catch (error) {
    aiRuntime = {
      ...aiRuntime,
      mode: "error"
    };
    completionNotice = error.message || "模型连接失败，请检查供应商、模型和 API Key。";
  } finally {
    pendingAction = null;
    saveState();
    render();
    showToast(completionNotice);
  }
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
    structure: null,
    suggestedQuestions: [],
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

async function requestAi(payload) {
  const apiKey = sessionKeys[payload.provider] || "";
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, apiKey })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.data) {
    throw new Error(result.error || "模型连接失败，请检查供应商、模型和 API Key。");
  }
  return result;
}

async function loadAiStatus(showResult = false) {
  let notice = "";
  try {
    const response = await fetch("/api/ai", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("status unavailable");
    const result = await response.json();
    aiRuntime = {
      mode: result.mode,
      provider: result.provider,
      model: result.model,
      providers: result.providers || []
    };
    normalizeModelSelection();
    if (showResult) notice = "供应商目录已更新。";
  } catch {
    aiRuntime = {
      mode: "unavailable",
      provider: { id: "", label: "尚未连接" },
      model: "",
      providers: []
    };
    if (showResult) notice = "服务端代理暂时无法连接。";
  }
  render();
  if (notice) showToast(notice);
}

function runtimeModeLabel() {
  if (aiRuntime.mode === "checking") return "检测中";
  const provider = getSelectedProvider();
  if (provider) return provider.configured || hasSessionApiKey(provider.id) ? "已连接" : "待填写 Key";
  return "待配置";
}

function getSelectedProvider() {
  if (!aiRuntime.providers.length) return null;
  if (!state.settings.provider || state.settings.provider === "auto") return null;
  return aiRuntime.providers.find((provider) => provider.id === state.settings.provider) || null;
}

function normalizeModelSelection() {
  const provider = getSelectedProvider();
  if (!provider) return;
  if (!provider.models.some((model) => model.id === state.settings.model)) {
    state.settings.model = provider.models[0]?.id || "";
    saveState();
  }
}

function currentProviderLabel() {
  return getSelectedProvider()?.label || "请选择供应商";
}

function currentModelLabel() {
  return state.settings.model || "请选择模型";
}

function hasSessionApiKey(providerId) {
  return Boolean(providerId && sessionKeys[providerId]);
}

function ensureAiReady() {
  const provider = getSelectedProvider();
  const ready = provider
    && state.settings.model
    && (provider.configured || hasSessionApiKey(provider.id));
  if (ready) return true;

  navigate("#/settings");
  setTimeout(() => {
    showToast("请依次选择供应商、模型并填写 API Key。");
  }, 0);
  return false;
}

function loadSessionKeys() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEYS_STORAGE) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSessionKeys() {
  sessionStorage.setItem(SESSION_KEYS_STORAGE, JSON.stringify(sessionKeys));
}

function normalizeThinkingStructure(value) {
  return {
    observation: value?.observation || "当前材料提供了新的具体背景。",
    coreQuestion: value?.coreQuestion || "这个 Spark 真正想澄清的问题是什么？",
    keyAssumption: value?.keyAssumption || "这个想法背后存在一个值得验证的关键前提。",
    challenge: value?.challenge || "需要继续把问题收窄到一个具体场景。",
    emergingInsight: value?.emergingInsight || "清晰的场景和验证标准会帮助这条思考继续推进。"
  };
}

function thinkingPathToList(value) {
  const structure = normalizeThinkingStructure(value);
  return [
    `Observation: ${structure.observation}`,
    `Core Question: ${structure.coreQuestion}`,
    `Key Assumption: ${structure.keyAssumption}`,
    `Challenge: ${structure.challenge}`,
    `Emerging Insight: ${structure.emergingInsight}`
  ];
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
loadAiStatus();
