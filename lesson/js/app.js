const STORAGE_KEY = "aipassport-progress-v1";
const PRETEST_KEY = "aipassport-pretest-v1";
const PRETEST_CURSOR_KEY = "aipassport-pretest-cursor";
const PRETEST_BANDS = [
  [1, 10],
  [11, 20],
  [21, 30],
  [31, 40],
  [41, 50],
  [51, 60],
];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const state = {
  view: "gate",
  mode: "confirm",
  queue: [],
  index: 0,
  picked: null,
  revealed: false,
  session: [],
  title: "",
  answerChapter: 1,
  answerBand: 0,
  trackCursor: false,
  cursorBase: 0,
};

function progressKey() {
  return state.mode === "mock" ? PRETEST_KEY : STORAGE_KEY;
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey())) || {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(progressKey(), JSON.stringify(progress));
}

function loadCursor() {
  const value = Number(localStorage.getItem(PRETEST_CURSOR_KEY));
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, PRETEST.length);
}

function saveCursor(value) {
  localStorage.setItem(PRETEST_CURSOR_KEY, String(value));
}

function chapterById(id) {
  return CHAPTERS.find((chapter) => chapter.id === id);
}

function recordAnswer(question, picked) {
  const progress = loadProgress();
  const prev = progress[question.id] || { attempts: 0, correct: 0 };
  prev.attempts += 1;
  if (picked === question.answer) prev.correct += 1;
  prev.last = picked === question.answer;
  progress[question.id] = prev;
  saveProgress(progress);
}

function pool() {
  return state.mode === "mock" ? PRETEST : QUESTIONS;
}

function stats() {
  const progress = loadProgress();
  const items = pool();
  const answeredItems = items.filter((question) => progress[question.id]);
  const lastCorrect = answeredItems.filter((question) => progress[question.id].last).length;
  const wrong = items.filter((question) => progress[question.id] && !progress[question.id].last);
  return { answered: answeredItems.length, lastCorrect, wrong, progress };
}

function startQuiz(queue, title, options = {}) {
  state.view = "quiz";
  state.queue = queue;
  state.index = 0;
  state.picked = null;
  state.revealed = false;
  state.session = [];
  state.title = title;
  state.trackCursor = Boolean(options.trackCursor);
  state.cursorBase = options.cursorBase || 0;
  render();
}

function currentQuestion() {
  return state.queue[state.index];
}

function choose(value) {
  if (state.mode !== "confirm" || state.revealed) return;
  const question = currentQuestion();
  state.picked = value;
  state.revealed = true;
  state.session.push({
    id: question.id,
    ok: value === question.answer,
  });
  recordAnswer(question, value);
  render();
}

function selectChoice(label) {
  if (state.mode !== "mock" || state.revealed) return;
  state.picked = label;
  render({ keepScroll: true });
}

function submitAnswer() {
  if (state.mode !== "mock" || state.revealed || state.picked == null) return;
  const question = currentQuestion();
  state.revealed = true;
  state.session.push({
    id: question.id,
    ok: state.picked === question.answer,
  });
  recordAnswer(question, state.picked);
  if (state.trackCursor) saveCursor(state.cursorBase + state.index + 1);
  render();
}

function next() {
  if (state.index + 1 >= state.queue.length) {
    state.view = "result";
    render();
    return;
  }
  state.index += 1;
  state.picked = null;
  state.revealed = false;
  render();
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function explanationHtml(text) {
  const parts = String(text).split(/(?<=。)/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return `<p>${esc(text)}</p>`;
  const mid = Math.ceil(parts.length / 2);
  return `<p>${esc(parts.slice(0, mid).join(""))}</p><p>${esc(parts.slice(mid).join(""))}</p>`;
}

function drillHead(kicker, name, closeId) {
  const close = closeId
    ? `<button class="close" id="${closeId}" aria-label="閉じる">×</button>`
    : "";
  return `
    <header class="drill-head">
      ${close}
      <div class="series">
        <div class="kicker"><span class="spark" aria-hidden="true"></span>${esc(kicker)}</div>
        <div class="series-name">${esc(name)}</div>
      </div>
    </header>
  `;
}

function markClass(mark) {
  return /不|該当しない|含まない/.test(mark) ? "bad" : "good";
}

function explanationBlock(question) {
  const lead = question.lead ? `<p class="explain-lead">${esc(question.lead)}</p>` : "";
  const items = question.explanations.map((item) => `
    <li>
      <div class="mark ${markClass(item.mark)}">${esc(item.label)}　${esc(item.mark)}</div>
      <p>${esc(item.text)}</p>
    </li>
  `).join("");
  return `${lead}<ul class="explain">${items}</ul>`;
}

function statementsHtml(question) {
  if (!question.statements) return "";
  return `<ul class="statements">${question.statements.map((item) => `
    <li><b>${esc(item.label)}</b>${esc(item.text)}</li>
  `).join("")}</ul>`;
}

function renderGate() {
  return `
    <div class="screen">
      ${drillHead("AIパスポート", "学習")}
      <h1 class="home-lead">どちらを解きますか</h1>
      <div class="chapters">
        <button class="chapter" id="open-confirm">
          <div class="num">確認問題</div>
          <strong>○×で、章ごとに解く</strong>
          <small>第1章から第6章。選んだ瞬間に正誤が出ます。</small>
        </button>
        <button class="chapter" id="open-mock">
          <div class="num">模擬問題</div>
          <strong>4択の問1から問60</strong>
          <small>選択肢を選んでから、回答するを押します。</small>
        </button>
      </div>
      <p class="footer-note">成績はこの端末に保存されます。確認問題と模擬問題は別々に残ります。</p>
    </div>
  `;
}

function renderHome() {
  const { answered, lastCorrect, wrong } = stats();
  const accuracy = answered ? Math.round((lastCorrect / answered) * 100) : null;
  const cards = CHAPTERS.map((chapter) => {
    const items = QUESTIONS.filter((question) => question.chapter === chapter.id);
    const progress = loadProgress();
    const done = items.filter((question) => progress[question.id]).length;
    const good = items.filter((question) => progress[question.id]?.last).length;
    const ratio = items.length ? Math.round((good / items.length) * 100) : 0;
    return `
      <button class="chapter" data-chapter="${chapter.id}">
        <div class="num">第${chapter.id}章</div>
        <strong>${esc(chapter.title)}</strong>
        <div class="bar"><i style="width:${ratio}%"></i></div>
        <small>直近の正解 ${good} / ${items.length}問 ・ 回答済み ${done}問</small>
      </button>
    `;
  }).join("");

  return `
    <div class="screen">
      ${drillHead("AIパスポート", "確認問題", "gate")}
      <h1 class="home-lead">どの問題を解きますか</h1>
      <section class="stats">
        <div class="stat"><b>${answered}</b><span>回答した問題</span></div>
        <div class="stat"><b>${accuracy === null ? "—" : `${accuracy}%`}</b><span>直近の正答率</span></div>
        <div class="stat"><b>${QUESTIONS.length}</b><span>全問題数</span></div>
      </section>
      <div class="actions">
        <button class="btn" id="mix">10問シャッフル</button>
        <button class="btn secondary" id="all">全問を順番に</button>
        <button class="btn secondary" id="wrong" ${wrong.length ? "" : "disabled"}>間違えた問題（${wrong.length}）</button>
        <button class="btn secondary" id="answers">解答一覧</button>
      </div>
      <div class="chapters">${cards}</div>
      <button class="linkish" id="reset">成績をリセット</button>
      <p class="footer-note">第1章から第6章です。成績はこの端末に保存されます。ホーム画面に追加すると、電波が弱くても解けます。</p>
    </div>
  `;
}

function renderMockHome() {
  const { answered, lastCorrect, wrong } = stats();
  const accuracy = answered ? Math.round((lastCorrect / answered) * 100) : null;
  const cursor = loadCursor();
  const mixClass = cursor > 0 ? "btn secondary" : "btn";
  let fullButtons = `<button class="btn secondary" id="mock-full">全60問を順番に</button>`;
  if (cursor > 0 && cursor < PRETEST.length) {
    fullButtons = `
      <button class="btn" id="mock-resume">続きから（問${cursor + 1}〜）</button>
      <button class="btn secondary" id="mock-restart">最初から</button>
    `;
  } else if (cursor >= PRETEST.length) {
    fullButtons = `<button class="btn" id="mock-restart">最初から</button>`;
  }
  return `
    <div class="screen">
      ${drillHead("AIパスポート", "模擬問題", "gate")}
      <h1 class="home-lead">どの問題を解きますか</h1>
      <section class="stats">
        <div class="stat"><b>${answered}</b><span>回答した問題</span></div>
        <div class="stat"><b>${accuracy === null ? "—" : `${accuracy}%`}</b><span>直近の正答率</span></div>
        <div class="stat"><b>${PRETEST.length}</b><span>全問題数</span></div>
      </section>
      <div class="actions">
        <button class="${mixClass}" id="mock-mix">10問シャッフル</button>
        ${fullButtons}
        <button class="btn secondary" id="mock-wrong" ${wrong.length ? "" : "disabled"}>間違えた問題（${wrong.length}）</button>
        <button class="btn secondary" id="mock-answers">解答一覧</button>
      </div>
      <button class="linkish" id="mock-reset">成績をリセット</button>
      <p class="footer-note">問1から問60です。全60問だけ、途中から再開できます。最初からにしても成績は残ります。成績はこの端末に保存されます。</p>
    </div>
  `;
}

function choiceButton(value, label, symbol, picked) {
  const classes = ["choice"];
  if (state.revealed && picked) classes.push("is-picked");
  if (state.revealed && !picked) classes.push("is-dim");
  return `
    <button class="${classes.join(" ")}" data-choice="${value}" ${state.revealed ? "disabled" : ""}>
      <span class="badge" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8.2 6.4 11.1 12.5 4.8" stroke="#d19d27" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      ${symbol}
      <span class="choice-label">${label}</span>
    </button>
  `;
}

function renderQuiz() {
  const question = currentQuestion();
  const chapter = chapterById(question.chapter);
  const total = state.queue.length;
  const verdict = state.picked === question.answer;
  const kicker = chapter ? `第${chapter.id}章` : "AIパスポート";
  const series = chapter ? chapter.short : state.title;
  const circle = `<span class="symbol" aria-hidden="true"><span class="ring"></span></span>`;
  const cross = `<span class="symbol cross" aria-hidden="true"><b></b><b></b></span>`;
  const feedback = state.revealed
    ? `
      <section class="feedback">
        <div class="verdict ${verdict ? "good" : "bad"}">
          <span class="vmark" aria-hidden="true">${verdict ? "✓" : "!"}</span>
          ${verdict ? "正解！" : "不正解"}
        </div>
        <div class="point">
          <div class="point-head">
            <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="18" fill="#f6e7c8"/>
              <circle cx="18" cy="15" r="7" fill="#f3d2b0"/>
              <path d="M8 31c1.5-6 5-9 10-9s8.5 3 10 9" fill="#2f3540"/>
              <path d="M11 13c1-4 4-6 7-6s6 2 7 6" fill="#2a241f"/>
              <rect x="11" y="15" width="14" height="5" rx="2" fill="none" stroke="#2a241f" stroke-width="1.4"/>
              <path d="M18 15v5" stroke="#2a241f" stroke-width="1.2"/>
            </svg>
            マスターのワンポイント
          </div>
          ${explanationHtml(question.explanation)}
        </div>
        <button class="next" id="next">${state.index + 1 === total ? "結果を見る" : "次の問題へ"}</button>
      </section>
    `
    : "";
  return `
    <div class="screen">
      ${drillHead(kicker, series, "home")}
      <div class="qcount"><span class="qpill">Q${state.index + 1}</span><span class="qtotal">/ ${total}問</span></div>
      <p class="prompt">${esc(question.prompt)}</p>
      <p class="hint"><i>i</i>正しいか間違いか選んでください</p>
      <div class="choices">
        ${choiceButton(true, "正しい", circle, state.picked === true)}
        ${choiceButton(false, "間違い", cross, state.picked === false)}
      </div>
      ${feedback}
    </div>
  `;
}

function renderResult() {
  const correct = state.session.filter((item) => item.ok).length;
  const total = state.session.length;
  const misses = state.session.filter((item) => !item.ok);
  const items = misses.map((item) => {
    const question = QUESTIONS.find((entry) => entry.id === item.id);
    return `
      <li>
        <div><span class="tag">×</span>第${question.chapter}章 問${question.no}</div>
        <div class="q">${esc(question.prompt)}</div>
        <p>解答は ${question.answer ? "○" : "×"}。${esc(question.explanation)}</p>
      </li>
    `;
  }).join("");
  return `
    <div class="screen">
      ${drillHead("結果", state.title, "home")}
      <div class="score">${correct}<span> / ${total}</span></div>
      <p>${total ? `正答率 ${Math.round((correct / total) * 100)}%` : "回答がありません。"}</p>
      ${misses.length ? `<ul class="wrong-list">${items}</ul>` : `<p class="footer-note">この回は全問正解です。</p>`}
      <div class="actions" style="margin-top:18px">
        <button class="btn" id="retry-wrong" ${misses.length ? "" : "disabled"}>間違えた問題だけ</button>
        <button class="btn secondary" id="home2">一覧へ戻る</button>
      </div>
    </div>
  `;
}

function renderAnswers() {
  const chapter = chapterById(state.answerChapter) || CHAPTERS[0];
  const items = QUESTIONS.filter((question) => question.chapter === chapter.id);
  const tabs = CHAPTERS.map((item) => `
    <button class="key-tab ${item.id === chapter.id ? "is-on" : ""}" data-key-chapter="${item.id}">第${item.id}章</button>
  `).join("");
  const rows = items.map((question) => `
    <li class="key-row">
      <div class="key-mark ${question.answer ? "yes" : "no"}">${question.answer ? "○" : "×"}</div>
      <div>
        <div class="key-no">問${question.no}　${question.answer ? "正しい" : "間違い"}</div>
        <p class="key-prompt">${esc(question.prompt)}</p>
        <p class="key-note">${esc(question.explanation)}</p>
      </div>
    </li>
  `).join("");
  const yes = items.filter((question) => question.answer).length;
  return `
    <div class="screen wide">
      ${drillHead("解答一覧", chapter.title, "home")}
      <div class="key-tabs">${tabs}</div>
      <p class="key-count">正しい ${yes}問　／　間違い ${items.length - yes}問</p>
      <ol class="key-list">${rows}</ol>
    </div>
  `;
}

function mockChoice(choice, question) {
  const classes = ["choice", "text"];
  if (!state.revealed && state.picked === choice.label) classes.push("is-picked");
  if (state.revealed) {
    if (choice.label === question.answer) classes.push("is-correct");
    else if (choice.label === state.picked) classes.push("is-wrong");
    else classes.push("is-dim");
  }
  return `
    <button class="${classes.join(" ")}" data-mock="${choice.label}" ${state.revealed ? "disabled" : ""}>
      <span class="choice-no">${esc(choice.label)}</span>
      <span class="choice-label">${esc(choice.text)}</span>
    </button>
  `;
}

function renderMockQuiz() {
  const question = currentQuestion();
  const total = state.queue.length;
  const verdict = state.picked === question.answer;
  const feedback = state.revealed
    ? `
      <section class="feedback">
        <div class="verdict ${verdict ? "good" : "bad"}">
          <span class="vmark" aria-hidden="true">${verdict ? "✓" : "!"}</span>
          ${verdict ? "正解！" : "不正解"}
          <span class="answer-no">正解は ${esc(question.answer)}</span>
        </div>
        <div class="point">
          <div class="point-head">解説</div>
          ${explanationBlock(question)}
        </div>
        <button class="next" id="next">${state.index + 1 === total ? "結果を見る" : "次の問題へ"}</button>
      </section>
    `
    : `<button class="btn submit" id="submit" ${state.picked == null ? "disabled" : ""}>回答する</button>`;
  return `
    <div class="screen">
      ${drillHead("模擬問題", state.title, "home")}
      <div class="qcount">
        <span class="qpill">Q${state.index + 1}</span>
        <span class="qtotal">/ ${total}問</span>
        <span class="qbook">問${question.no}</span>
      </div>
      <p class="prompt long">${esc(question.prompt)}</p>
      ${statementsHtml(question)}
      ${state.revealed ? "" : `<p class="hint"><i>i</i>選択肢を選んでから、回答するを押してください</p>`}
      <div class="choices col">
        ${question.choices.map((choice) => mockChoice(choice, question)).join("")}
      </div>
      ${feedback}
    </div>
  `;
}

function renderMockResult() {
  const correct = state.session.filter((item) => item.ok).length;
  const total = state.session.length;
  const misses = state.session.filter((item) => !item.ok);
  const items = misses.map((item) => {
    const question = PRETEST.find((entry) => entry.id === item.id);
    return `
      <li>
        <div><span class="tag">×</span>問${question.no}</div>
        <div class="q">${esc(question.prompt)}</div>
        ${explanationBlock(question)}
      </li>
    `;
  }).join("");
  return `
    <div class="screen">
      ${drillHead("結果", state.title, "home")}
      <div class="score">${correct}<span> / ${total}</span></div>
      <p>${total ? `正答率 ${Math.round((correct / total) * 100)}%` : "回答がありません。"}</p>
      ${misses.length ? `<ul class="wrong-list">${items}</ul>` : `<p class="footer-note">この回は全問正解です。</p>`}
      <div class="actions" style="margin-top:18px">
        <button class="btn" id="retry-wrong" ${misses.length ? "" : "disabled"}>間違えた問題だけ</button>
        <button class="btn secondary" id="home2">一覧へ戻る</button>
      </div>
    </div>
  `;
}

function renderMockAnswers() {
  const [from, to] = PRETEST_BANDS[state.answerBand] || PRETEST_BANDS[0];
  const items = PRETEST.filter((question) => question.no >= from && question.no <= to);
  const tabs = PRETEST_BANDS.map(([start, end], index) => `
    <button class="key-tab ${index === state.answerBand ? "is-on" : ""}" data-band="${index}">問${start}–${end}</button>
  `).join("");
  const rows = items.map((question) => `
    <li class="key-row">
      <div class="key-mark yes">${esc(question.answer)}</div>
      <div>
        <div class="key-no">問${question.no}　正解 ${esc(question.answer)}</div>
        <p class="key-prompt">${esc(question.prompt)}</p>
        ${statementsHtml(question)}
        <ol class="key-choices">${question.choices.map((choice) => `<li><b>${esc(choice.label)}</b> ${esc(choice.text)}</li>`).join("")}</ol>
        ${explanationBlock(question)}
      </div>
    </li>
  `).join("");
  return `
    <div class="screen wide">
      ${drillHead("解答一覧", `問${from}–${to}`, "home")}
      <div class="key-tabs">${tabs}</div>
      <p class="key-count">${items.length}問</p>
      <ol class="key-list">${rows}</ol>
    </div>
  `;
}

function render(options = {}) {
  const root = document.getElementById("app");
  if (state.view === "gate") root.innerHTML = renderGate();
  else if (state.view === "quiz") root.innerHTML = state.mode === "mock" ? renderMockQuiz() : renderQuiz();
  else if (state.view === "result") root.innerHTML = state.mode === "mock" ? renderMockResult() : renderResult();
  else if (state.view === "answers") root.innerHTML = state.mode === "mock" ? renderMockAnswers() : renderAnswers();
  else root.innerHTML = state.mode === "mock" ? renderMockHome() : renderHome();
  if (state.view === "quiz" && state.trackCursor && !state.revealed) {
    saveCursor(state.cursorBase + state.index);
  }
  bind();
  if (options.keepScroll) return;
  if (state.view === "quiz" && state.revealed) {
    document.querySelector(".feedback")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
}

function bind() {
  const home = () => {
    state.view = "home";
    render();
  };
  const gate = () => {
    state.view = "gate";
    render();
  };
  document.getElementById("home")?.addEventListener("click", home);
  document.getElementById("home2")?.addEventListener("click", home);
  document.getElementById("gate")?.addEventListener("click", gate);
  document.getElementById("open-confirm")?.addEventListener("click", () => {
    state.mode = "confirm";
    state.view = "home";
    render();
  });
  document.getElementById("open-mock")?.addEventListener("click", () => {
    state.mode = "mock";
    state.view = "home";
    render();
  });
  document.getElementById("reset")?.addEventListener("click", () => {
    if (confirm("このブラウザに保存した成績を消します。よろしいですか？")) {
      localStorage.removeItem(STORAGE_KEY);
      render();
    }
  });
  document.getElementById("mix")?.addEventListener("click", () => {
    startQuiz(shuffle(QUESTIONS).slice(0, 10), "10問シャッフル");
  });
  document.getElementById("all")?.addEventListener("click", () => {
    startQuiz(QUESTIONS.slice(), "全問");
  });
  document.getElementById("answers")?.addEventListener("click", () => {
    state.view = "answers";
    state.answerChapter = 1;
    render();
  });
  document.querySelectorAll("[data-key-chapter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answerChapter = Number(button.dataset.keyChapter);
      render();
    });
  });
  document.getElementById("wrong")?.addEventListener("click", () => {
    const { wrong } = stats();
    if (!wrong.length) return;
    startQuiz(wrong, "間違えた問題");
  });
  document.querySelectorAll("[data-chapter]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.chapter);
      const chapter = chapterById(id);
      const queue = QUESTIONS.filter((question) => question.chapter === id);
      startQuiz(queue, `第${id}章 ${chapter.short}`);
    });
  });
  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => choose(button.dataset.choice === "true"));
  });
  document.getElementById("next")?.addEventListener("click", next);
  document.getElementById("retry-wrong")?.addEventListener("click", () => {
    const ids = state.session.filter((item) => !item.ok).map((item) => item.id);
    const source = state.mode === "mock" ? PRETEST : QUESTIONS;
    const queue = ids.map((id) => source.find((question) => question.id === id));
    startQuiz(queue, "間違えた問題");
  });
  document.getElementById("mock-mix")?.addEventListener("click", () => {
    startQuiz(shuffle(PRETEST).slice(0, 10), "10問シャッフル");
  });
  document.getElementById("mock-full")?.addEventListener("click", () => {
    startQuiz(PRETEST.slice(), "全60問", { trackCursor: true, cursorBase: 0 });
  });
  document.getElementById("mock-resume")?.addEventListener("click", () => {
    const cursor = loadCursor();
    startQuiz(PRETEST.slice(cursor), `問${cursor + 1}から`, { trackCursor: true, cursorBase: cursor });
  });
  document.getElementById("mock-restart")?.addEventListener("click", () => {
    saveCursor(0);
    startQuiz(PRETEST.slice(), "全60問", { trackCursor: true, cursorBase: 0 });
  });
  document.getElementById("mock-wrong")?.addEventListener("click", () => {
    const { wrong } = stats();
    if (!wrong.length) return;
    startQuiz(wrong, "間違えた問題");
  });
  document.getElementById("mock-answers")?.addEventListener("click", () => {
    state.view = "answers";
    state.answerBand = 0;
    render();
  });
  document.getElementById("mock-reset")?.addEventListener("click", () => {
    if (confirm("模擬問題の成績と続きの位置を消します。よろしいですか？")) {
      localStorage.removeItem(PRETEST_KEY);
      localStorage.removeItem(PRETEST_CURSOR_KEY);
      render();
    }
  });
  document.querySelectorAll("[data-mock]").forEach((button) => {
    button.addEventListener("click", () => selectChoice(button.dataset.mock));
  });
  document.getElementById("submit")?.addEventListener("click", submitAnswer);
  document.querySelectorAll("[data-band]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answerBand = Number(button.dataset.band);
      render();
    });
  });
}

if (location.hash.startsWith("#answers")) {
  const chapter = Number(location.hash.replace("#answers", "")) || 1;
  state.mode = "confirm";
  state.view = "answers";
  state.answerChapter = CHAPTERS.some((item) => item.id === chapter) ? chapter : 1;
}

document.addEventListener("keydown", (event) => {
  if (state.view !== "quiz") return;
  if (state.mode === "mock") {
    if (!state.revealed && ["1", "2", "3", "4"].includes(event.key)) selectChoice(event.key);
    if (event.key === "Enter") {
      if (state.revealed) next();
      else submitAnswer();
    }
    return;
  }
  if (event.key === "1" || event.key === "o" || event.key === "O") choose(true);
  if (event.key === "2" || event.key === "x" || event.key === "X") choose(false);
  if (event.key === "Enter" && state.revealed) next();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
