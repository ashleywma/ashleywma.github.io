(() => {
  const BOARD_SIZE = 5;
  const TILE_COUNT = BOARD_SIZE * BOARD_SIZE;
  const ROUND_SECONDS = 90;
  const MIN_LEN = 3;

  const DICT_URL = "/assets/words/enable2k.txt";

  const $ = (id) => document.getElementById(id);

  const elTime = $("wh-time");
  const elScore = $("wh-score");
  const elCount = $("wh-count");
  const elStart = $("wh-start");
  const elNew = $("wh-new");
  const elBoard = $("wh-board");
  const elBoardWrap = $("wh-board-wrap");
  const elTrace = $("wh-trace");
  const elCurrent = $("wh-current");
  const elMsg = $("wh-msg");
  const elWords = $("wh-words");
  const elPlay = $("wh-play");
  const elSummary = $("wh-summary");
  const elSummaryLead = $("wh-summary-lead");
  const elSummaryList = $("wh-summary-list");
  const elSummaryExpand = $("wh-summary-expand");
  const elFound = $("wh-found");

  if (!elBoard || !elBoardWrap || !elTrace) return;

  const SUMMARY_MAX_WORDS = 15;

  /** @type {Set<string> | null} */
  let DICT = null;

  /** @type {string[]} */
  let board = [];
  /** @type {HTMLButtonElement[]} */
  let tiles = [];

  let selecting = false;
  /** @type {number | null} */
  let activePointerId = null;
  /** @type {{ x: number; y: number } | null} */
  let lastPointerClient = null;

  /** @type {number[]} */
  let path = [];
  /** @type {Set<number>} */
  let used = new Set();

  let running = false;
  let remaining = ROUND_SECONDS;
  let timer = null;

  /** @type {Map<string, number>} word (lowercase) → points for that word */
  let foundScores = new Map();
  let score = 0;

  const SCORE_BY_LEN = new Map([
    [3, 100],
    [4, 400],
    [5, 800],
    [6, 1400],
    [7, 1800],
    [8, 2200],
  ]);

  function scoreWord(len) {
    if (len < 8) return SCORE_BY_LEN.get(len) ?? 0;
    return (SCORE_BY_LEN.get(8) ?? 0) + (len - 8) * 400;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function setMsg(text) {
    elMsg.textContent = text;
  }

  function setCurrent(text) {
    elCurrent.textContent = text;
  }

  function updateStats() {
    elTime.textContent = String(remaining);
    elScore.textContent = String(score);
    elCount.textContent = String(foundScores.size);
  }

  function idxToRC(idx) {
    return { r: Math.floor(idx / BOARD_SIZE), c: idx % BOARD_SIZE };
  }

  function isAdjacent(a, b) {
    const A = idxToRC(a);
    const B = idxToRC(b);
    const dr = Math.abs(A.r - B.r);
    const dc = Math.abs(A.c - B.c);
    return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
  }

  const LETTER_BAG = [
    ["E", 12.7],
    ["T", 9.1],
    ["A", 8.2],
    ["O", 7.5],
    ["I", 7.0],
    ["N", 6.7],
    ["S", 6.3],
    ["H", 6.1],
    ["R", 6.0],
    ["D", 4.3],
    ["L", 4.0],
    ["C", 2.8],
    ["U", 2.8],
    ["M", 2.4],
    ["W", 2.4],
    ["F", 2.2],
    ["G", 2.0],
    ["Y", 2.0],
    ["P", 1.9],
    ["B", 1.5],
    ["V", 1.0],
    ["K", 0.8],
    ["J", 0.15],
    ["X", 0.15],
    ["Q", 0.1],
    ["Z", 0.07],
  ];
  const LETTER_TOTAL = LETTER_BAG.reduce((acc, [, w]) => acc + w, 0);

  function randomLetter() {
    let roll = Math.random() * LETTER_TOTAL;
    for (const [ch, w] of LETTER_BAG) {
      roll -= w;
      if (roll <= 0) return ch;
    }
    return "E";
  }

  function generateBoard() {
    const b = [];
    for (let i = 0; i < TILE_COUNT; i++) b.push(randomLetter());
    return b;
  }

  function tileCenterNorm(idx) {
    const tile = tiles[idx];
    if (!tile) return { x: 0, y: 0 };
    const wrap = elBoardWrap.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    const x = (r.left + r.width / 2 - wrap.left) / wrap.width;
    const y = (r.top + r.height / 2 - wrap.top) / wrap.height;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  /** @returns {{ x: number; y: number }} */
  function clientToNorm(clientX, clientY) {
    const wrap = elBoardWrap.getBoundingClientRect();
    const x = (clientX - wrap.left) / wrap.width;
    const y = (clientY - wrap.top) / wrap.height;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function updateTrace() {
    elTrace.innerHTML = "";
    if (path.length === 0) return;

    const polyPts = path
      .map((i) => {
        const p = tileCenterNorm(i);
        return `${p.x * 100},${p.y * 100}`;
      })
      .join(" ");

    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "currentColor");
    poly.setAttribute("stroke-width", "3");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("vector-effect", "non-scaling-stroke");
    poly.setAttribute("points", polyPts);
    elTrace.appendChild(poly);

    if (selecting && lastPointerClient) {
      const last = tileCenterNorm(path[path.length - 1]);
      const finger = clientToNorm(lastPointerClient.x, lastPointerClient.y);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.setAttribute("opacity", "0.45");
      line.setAttribute("x1", String(last.x * 100));
      line.setAttribute("y1", String(last.y * 100));
      line.setAttribute("x2", String(finger.x * 100));
      line.setAttribute("y2", String(finger.y * 100));
      elTrace.appendChild(line);
    }
  }

  function clearSelection() {
    selecting = false;
    activePointerId = null;
    lastPointerClient = null;
    path = [];
    used.clear();
    for (const tile of tiles) tile.classList.remove("is-active", "is-used");
    setCurrent("");
    updateTrace();
  }

  function pathToWord() {
    return path.map((i) => board[i]).join("");
  }

  function renderBoard() {
    elBoard.innerHTML = "";
    tiles = [];

    for (let i = 0; i < TILE_COUNT; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wordhunt__tile";
      btn.setAttribute("role", "gridcell");
      btn.setAttribute("aria-label", `Letter ${board[i]}, tile ${i + 1}`);
      btn.dataset.idx = String(i);
      btn.textContent = board[i];
      elBoard.appendChild(btn);
      tiles.push(btn);
    }

    queueMicrotask(() => updateTrace());
  }

  function addIdx(idx) {
    if (used.has(idx)) return;
    if (path.length > 0 && !isAdjacent(path[path.length - 1], idx)) return;
    path.push(idx);
    used.add(idx);
    tiles[idx].classList.add("is-active", "is-used");
    setCurrent(pathToWord());
    updateTrace();
  }

  function tileFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const tile = el && el.closest && el.closest(".wordhunt__tile");
    if (!tile || !elBoard.contains(tile)) return null;
    return tile;
  }

  function submitCurrent() {
    if (!running) return;
    const word = pathToWord();
    if (word.length === 0) {
      clearSelection();
      return;
    }

    const normalized = word.toLowerCase();
    clearSelection();

    if (normalized.length < MIN_LEN) {
      setMsg(`Too short (min ${MIN_LEN}).`);
      return;
    }
    if (!DICT || !DICT.has(normalized)) {
      setMsg("Not in dictionary.");
      return;
    }
    if (foundScores.has(normalized)) {
      setMsg("Already found.");
      return;
    }

    const pts = scoreWord(normalized.length);
    foundScores.set(normalized, pts);
    score += pts;
    updateStats();
    setMsg(`+${pts} (${normalized.toUpperCase()})`);

    const li = document.createElement("li");
    li.className = "wordhunt__word";
    const spanWord = document.createElement("span");
    spanWord.className = "wordhunt__word-text";
    spanWord.textContent = normalized.toUpperCase();
    const spanPts = document.createElement("span");
    spanPts.className = "wordhunt__word-pts";
    spanPts.textContent = String(pts);
    li.append(spanWord, spanPts);
    elWords.prepend(li);
  }

  function summaryRow(word, pts) {
    const li = document.createElement("li");
    li.append(`${word.toUpperCase()} · `);
    const strong = document.createElement("strong");
    strong.textContent = `${pts} pts`;
    li.append(strong);
    return li;
  }

  function hideRoundSummary() {
    if (!elSummary || !elSummaryLead || !elSummaryList) return;
    if (elPlay) elPlay.hidden = false;
    if (elFound) elFound.hidden = false;
    elSummary.hidden = true;
    elSummaryLead.textContent = "";
    elSummaryList.innerHTML = "";
    if (elSummaryExpand) {
      elSummaryExpand.hidden = true;
      elSummaryExpand.textContent = "Show more words";
      elSummaryExpand.onclick = null;
    }
  }

  function showRoundSummary() {
    if (!elSummary || !elSummaryLead || !elSummaryList) return;

    const entries = Array.from(foundScores.entries()).map(([word, pts]) => ({ word, pts }));
    entries.sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word));

    if (elPlay) elPlay.hidden = true;
    if (elFound) elFound.hidden = true;
    elSummary.hidden = false;

    elSummaryLead.textContent = `${entries.length} words · ${score} pts total`;

    if (entries.length === 0) {
      elSummaryList.innerHTML = "";
      if (elSummaryExpand) {
        elSummaryExpand.hidden = true;
        elSummaryExpand.onclick = null;
      }
      return;
    }

    const shown = entries.slice(0, SUMMARY_MAX_WORDS);
    const frag = document.createDocumentFragment();
    for (const { word, pts } of shown) frag.append(summaryRow(word, pts));
    elSummaryList.innerHTML = "";
    elSummaryList.append(frag);

    if (elSummaryExpand) {
      const extra = entries.length - SUMMARY_MAX_WORDS;
      if (extra > 0) {
        elSummaryExpand.hidden = false;
        elSummaryExpand.textContent = `Show ${extra} more ${extra === 1 ? "word" : "words"}`;
        elSummaryExpand.onclick = () => {
          const rest = entries.slice(SUMMARY_MAX_WORDS);
          const moreFrag = document.createDocumentFragment();
          for (const { word, pts } of rest) moreFrag.append(summaryRow(word, pts));
          elSummaryList.append(moreFrag);
          elSummaryExpand.hidden = true;
          elSummaryExpand.onclick = null;
        };
      } else {
        elSummaryExpand.hidden = true;
        elSummaryExpand.onclick = null;
      }
    }
  }

  function stopRound() {
    running = false;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    elStart.textContent = "start";
    setMsg("Time. Hit start to play again.");
    clearSelection();
    showRoundSummary();
  }

  function startRound() {
    if (!DICT) return;
    running = true;
    remaining = ROUND_SECONDS;
    score = 0;
    foundScores = new Map();
    elWords.innerHTML = "";
    hideRoundSummary();
    elStart.textContent = "restart";
    setMsg("Press and drag across touching letters — release to submit.");
    clearSelection();
    updateStats();

    if (timer) window.clearInterval(timer);
    timer = window.setInterval(() => {
      remaining -= 1;
      updateStats();
      if (remaining <= 0) stopRound();
    }, 1000);
  }

  function newBoard() {
    board = generateBoard();
    renderBoard();
    clearSelection();
    if (!running) setMsg("Ready. Hit start.");
  }

  function bindDrag() {
    elBoardWrap.addEventListener(
      "pointerdown",
      (e) => {
        if (!running) return;
        const tile = e.target.closest && e.target.closest(".wordhunt__tile");
        if (!tile || !elBoard.contains(tile)) return;
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();

        clearSelection();
        selecting = true;
        activePointerId = e.pointerId;
        lastPointerClient = { x: e.clientX, y: e.clientY };
        addIdx(Number(tile.dataset.idx));

        try {
          elBoardWrap.setPointerCapture(e.pointerId);
        } catch (_) {
          // Older browsers — pointermove still often works once selecting is true
        }
        updateTrace();
      },
      { passive: false }
    );

    elBoardWrap.addEventListener("pointermove", (e) => {
      if (!running || !selecting) return;
      if (activePointerId != null && e.pointerId !== activePointerId) return;
      lastPointerClient = { x: e.clientX, y: e.clientY };

      const hit = tileFromPoint(e.clientX, e.clientY);
      if (hit) addIdx(Number(hit.dataset.idx));
      updateTrace();
    });

    const endGesture = (e, submit) => {
      if (activePointerId != null && e.pointerId !== activePointerId) return;
      if (!selecting) return;
      selecting = false;
      activePointerId = null;
      lastPointerClient = null;
      try {
        elBoardWrap.releasePointerCapture(e.pointerId);
      } catch (_) {
        // ignore
      }
      updateTrace();
      if (submit) submitCurrent();
      else clearSelection();
    };

    elBoardWrap.addEventListener("pointerup", (e) => endGesture(e, true));
    elBoardWrap.addEventListener("pointercancel", (e) => {
      endGesture(e, false);
      setMsg("Selection cleared.");
    });

    /** @returns {ResizeObserver | null} */
    const RO = typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
    if (RO)
      new RO(() => {
        if (path.length > 0) updateTrace();
      }).observe(elBoardWrap);
    window.addEventListener("scroll", () => {
      if (path.length > 0) updateTrace();
    }, true);
  }

  function bindBoardEvents() {
    elBoard.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        clearSelection();
        setMsg("Selection cleared.");
      }
      if (e.key === "Enter") {
        submitCurrent();
      }
    });
  }

  async function loadDictionary() {
    setMsg("Loading dictionary…");
    const res = await fetch(DICT_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Failed to load dictionary (${res.status})`);
    const text = await res.text();
    const set = new Set();
    for (const line of text.split(/\r?\n/)) {
      const w = line.trim().toLowerCase();
      if (w.length >= MIN_LEN) set.add(w);
    }
    return set;
  }

  function enableUI() {
    elStart.disabled = false;
    elNew.disabled = false;
  }

  function boot() {
    board = generateBoard();
    renderBoard();
    bindDrag();
    bindBoardEvents();
    updateStats();

    elStart.addEventListener("click", () => {
      if (!DICT) return;
      startRound();
    });

    elNew.addEventListener("click", () => {
      newBoard();
    });
  }

  boot();

  loadDictionary()
    .then((set) => {
      DICT = set;
      enableUI();
      setMsg("Ready. Hit start.");
    })
    .catch((err) => {
      console.error(err);
      setMsg("Dictionary failed to load. Refresh to retry.");
    });
})();
