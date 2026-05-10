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
  const elSeedLine = $("wh-seed-line");
  const elSeedInput = $("wh-seed-input");
  const elCopySeed = $("wh-copy-seed");

  if (!elBoard || !elBoardWrap || !elTrace) return;

  const SUMMARY_MAX_WORDS = 15;
  const SEED_MAX_LEN = 80;

  /** @type {string | null} */
  let urlBaseSeed = null;
  /** Encoded stats from `?rival=` (friend’s run), XOR-obfuscated with this page’s seed. */
  let rivalEncodedFromUrl = null;

  const STAT_SALT = "wordhunt-rival-v1";

  /** Older links used `auto-` + hex; strip so the board matches plain hex seeds. */
  function stripLegacyAutoPrefix(s) {
    let t = String(s).trim();
    if (t.startsWith("auto-")) t = t.slice(5).trim();
    return t.slice(0, SEED_MAX_LEN);
  }

  function fnv1aMix(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function expandStatKey(seed, len) {
    const key = new Uint8Array(len);
    let x = fnv1aMix(seed + "|" + STAT_SALT);
    for (let i = 0; i < len; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      key[i] = x & 0xff;
    }
    return key;
  }

  function bytesToBase64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBytes(b64url) {
    const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
    const bin = atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Max words embedded in compare link (URL size); sorted by points, highest first. */
  const MAX_COMPARE_WORDS_IN_URL = 80;

  /** @param {Map<string, number>} foundScores */
  function wordListForComparePayload(foundScores) {
    const entries = Array.from(foundScores.entries()).map(([word, pts]) => ({
      word: word.toLowerCase(),
      pts,
    }));
    entries.sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word));
    const truncated = entries.length > MAX_COMPARE_WORDS_IN_URL;
    const slice = truncated ? entries.slice(0, MAX_COMPARE_WORDS_IN_URL) : entries;
    return { w: slice.map((e) => e.word), truncated };
  }

  /** @param {string} seed @param {Map<string, number> | undefined} foundScores */
  function encodeStatsPayload(seed, score, nWords, foundScores) {
    const enc = new TextEncoder();
    const payload = { s: score, n: nWords };
    if (foundScores && foundScores.size > 0) {
      const { w, truncated } = wordListForComparePayload(foundScores);
      payload.w = w;
      if (truncated) payload.wt = true;
    }
    const bytes = enc.encode(JSON.stringify(payload));
    const key = expandStatKey(seed, bytes.length);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i];
    return bytesToBase64Url(out);
  }

  /** @param {string} seed @param {string} b64url */
  function decodeStatsPayload(seed, b64url) {
    try {
      const raw = base64UrlToBytes(b64url);
      const key = expandStatKey(seed, raw.length);
      const dec = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) dec[i] = raw[i] ^ key[i];
      const o = JSON.parse(new TextDecoder().decode(dec));
      if (typeof o.s !== "number" || typeof o.n !== "number") return null;
      /** @type {string[] | null} */
      let wordList = null;
      if (Array.isArray(o.w)) {
        wordList = o.w.filter((x) => typeof x === "string").map((x) => String(x).toLowerCase());
      }
      return {
        score: o.s,
        words: o.n,
        wordList,
        wordsTruncated: o.wt === true,
      };
    } catch (_) {
      return null;
    }
  }

  function initSeedFromUrl() {
    const params = new URLSearchParams(location.search);
    const riv = params.get("rival");
    rivalEncodedFromUrl = riv != null && riv !== "" ? riv : null;

    const raw = params.get("seed");
    if (raw != null && raw !== "") {
      const t = stripLegacyAutoPrefix(raw.trim());
      urlBaseSeed = t === "" ? null : t;
    } else {
      urlBaseSeed = null;
    }

    if (urlBaseSeed != null) {
      syncSeededUrl();
    }
  }

  /** 16 hex chars — no prefix, easy to copy/paste. */
  function generateAutoSeedString() {
    try {
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        const buf = new Uint8Array(8);
        crypto.getRandomValues(buf);
        let hex = "";
        for (let i = 0; i < buf.length; i++) hex += buf[i].toString(16).padStart(2, "0");
        return hex;
      }
    } catch (_) {
      // fall through
    }
    const t = Date.now() >>> 0;
    const r = (Math.random() * 0xffffffff) >>> 0;
    return (t.toString(16) + r.toString(16)).replace(/^0+/, "").padStart(16, "0").slice(-16);
  }

  /** If the URL has no seed, create one and put it in the address bar (shareable). */
  function ensureAutoSeed() {
    if (urlBaseSeed != null) return;
    urlBaseSeed = generateAutoSeedString();
    syncSeededUrl();
  }

  async function copyTextRobust(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // fall through to execCommand
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function syncSeededUrl(options = {}) {
    const clearRival = options.clearRival === true;
    if (urlBaseSeed == null) return;
    const u = new URL(location.href);
    u.searchParams.set("seed", urlBaseSeed);
    u.searchParams.delete("board");
    if (clearRival) {
      u.searchParams.delete("rival");
      rivalEncodedFromUrl = null;
    } else if (rivalEncodedFromUrl) {
      u.searchParams.set("rival", rivalEncodedFromUrl);
    }
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }

  function stringToSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** @param {number} seedUint32 */
  function mulberry32(seedUint32) {
    let a = seedUint32 >>> 0;
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRng() {
    if (urlBaseSeed != null) {
      return mulberry32(stringToSeed(urlBaseSeed));
    }
    return () => Math.random();
  }

  function setSeedEditingEnabled(enabled) {
    if (elSeedInput) elSeedInput.disabled = !enabled;
  }

  function setNewBoardEnabled(enabled) {
    if (elNew) elNew.disabled = !enabled;
  }

  function updateSeedLine() {
    if (!elSeedLine || !elSeedInput) return;
    if (urlBaseSeed == null) {
      elSeedLine.hidden = true;
      elSeedInput.value = "";
      return;
    }
    elSeedLine.hidden = false;
    elSeedInput.value = urlBaseSeed;
  }

  /** Read seed field (or random if empty), sync URL, rebuild board. Call when starting a round or from new-board flows that need input sync. */
  function commitSeedFromInput() {
    let raw = elSeedInput ? stripLegacyAutoPrefix(elSeedInput.value) : "";
    const prevSeed = urlBaseSeed;
    const hadRival = rivalEncodedFromUrl != null;
    let generatedNew = false;
    if (raw === "") {
      raw = generateAutoSeedString();
      generatedNew = true;
    }
    urlBaseSeed = raw;
    const seedMatchesLoaded = prevSeed != null && prevSeed === raw;
    const preserveRival = hadRival && seedMatchesLoaded && !generatedNew;
    syncSeededUrl({ clearRival: !preserveRival });
    board = generateBoard();
    renderBoard();
    clearSelection();
    updateSeedLine();
    mustRollBeforeNextStart = false;
  }

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
  /** After a finished round, next start rolls a new seed/board so the same grid is never replayed. */
  let mustRollBeforeNextStart = false;

  /** @type {number | null} */
  let seedFeedbackTimer = null;

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

  function clearSeedCopiedFeedback() {
    if (seedFeedbackTimer != null) {
      window.clearTimeout(seedFeedbackTimer);
      seedFeedbackTimer = null;
    }
    const el = $("wh-seed-feedback");
    if (el) el.textContent = "";
  }

  function showSeedCopiedFeedback() {
    setMsg("Seed copied.");
    const el = $("wh-seed-feedback");
    if (el) {
      el.textContent = "Seed copied.";
      if (seedFeedbackTimer != null) window.clearTimeout(seedFeedbackTimer);
      seedFeedbackTimer = window.setTimeout(() => {
        el.textContent = "";
        seedFeedbackTimer = null;
      }, 2200);
    }
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

  /**
   * Weighted pick like English frequency, but down-weights letters that already
   * appear often on this board so repeats are rarer than i.i.d. draws.
   * @param {() => number} rng
   * @param {Map<string, number>} counts letter → times already on board
   */
  function randomLetter(rng, counts) {
    let total = 0;
    /** @type {Array<[string, number]>} */
    const adjusted = [];
    for (const [ch, w] of LETTER_BAG) {
      const c = counts.get(ch) ?? 0;
      const mult = 1 / (1 + 1.35 * c);
      const aw = w * mult;
      total += aw;
      adjusted.push([ch, aw]);
    }
    let roll = rng() * total;
    for (const [ch, aw] of adjusted) {
      roll -= aw;
      if (roll <= 0) return ch;
    }
    return "E";
  }

  function generateBoard() {
    const rng = createRng();
    const b = [];
    const counts = new Map();
    for (let i = 0; i < TILE_COUNT; i++) {
      const ch = randomLetter(rng, counts);
      b.push(ch);
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
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
    for (const tile of tiles) tile.classList.remove("is-active", "is-used", "is-dict-word", "is-dict-dup");
    setCurrent("");
    updateTrace();
  }

  /** While dragging: green if dict word new this round, yellow if already found. */
  function updatePathDictHint() {
    for (const tile of tiles) tile.classList.remove("is-dict-word", "is-dict-dup");
    if (!DICT || path.length === 0) return;
    const w = pathToWord().toLowerCase();
    if (w.length < MIN_LEN || !DICT.has(w)) return;
    const hint = foundScores.has(w) ? "is-dict-dup" : "is-dict-word";
    for (const idx of path) tiles[idx].classList.add(hint);
  }

  function pathToWord() {
    return path.map((i) => board[i]).join("");
  }

  function syncTileLetters() {
    const mask = "·";
    for (let i = 0; i < tiles.length; i++) {
      const ch = board[i];
      tiles[i].dataset.letter = ch;
      tiles[i].textContent = running ? ch : mask;
      tiles[i].classList.toggle("wordhunt__tile--masked", !running);
      tiles[i].setAttribute(
        "aria-label",
        running ? `Letter ${ch}, tile ${i + 1}` : `Hidden tile ${i + 1} of 25`
      );
    }
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
      btn.dataset.letter = board[i];
      btn.textContent = board[i];
      elBoard.appendChild(btn);
      tiles.push(btn);
    }

    queueMicrotask(() => {
      syncTileLetters();
      updateTrace();
    });
  }

  function addIdx(idx) {
    if (used.has(idx)) return;
    if (path.length > 0 && !isAdjacent(path[path.length - 1], idx)) return;
    path.push(idx);
    used.add(idx);
    tiles[idx].classList.add("is-active", "is-used");
    setCurrent(pathToWord());
    updatePathDictHint();
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

    elMsg.classList.remove("wordhunt__msg--flash-ok");
    li.classList.remove("wordhunt__word--flash-ok");
    void elMsg.offsetWidth;
    void li.offsetWidth;
    elMsg.classList.add("wordhunt__msg--flash-ok");
    li.classList.add("wordhunt__word--flash-ok");
    window.setTimeout(() => {
      elMsg.classList.remove("wordhunt__msg--flash-ok");
      li.classList.remove("wordhunt__word--flash-ok");
    }, 600);
  }

  function summaryRow(word, pts) {
    const li = document.createElement("li");
    li.append(`${word.toUpperCase()} · `);
    const strong = document.createElement("strong");
    strong.textContent = `${pts} pts`;
    li.append(strong);
    return li;
  }

  /** Re-score words from a compare payload (points are deterministic from length). */
  function entriesFromDecodedWords(words) {
    if (!words || !words.length) return [];
    return words
      .map((word) => ({ word, pts: scoreWord(word.length) }))
      .sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word));
  }

  /** Plain text for pasting to a friend after a compare round (no URL). */
  function formatCompareResultsPlainText(other, finalScore, finalWordCount) {
    let winnerSide = "Tie";
    if (finalScore !== other.score) winnerSide = finalScore > other.score ? "You" : "Friend";
    else if (finalWordCount !== other.words) winnerSide = finalWordCount > other.words ? "You" : "Friend";

    const shout = winnerSide === "You" ? "I won!" : winnerSide === "Friend" ? "You won!" : "We tied!";
    const winnerNeutral =
      winnerSide === "You" ? "Player 2" : winnerSide === "Friend" ? "Player 1" : "Tie";

    const lines = [shout, "", `Winner: ${winnerNeutral}`, "", `Player 1 — ${other.words} words, ${other.score} pts`];
    if (other.wordsTruncated && other.wordList && other.wordList.length > 0) {
      lines.push(`(Player 1 words in link: top ${other.wordList.length} by score)`);
    }
    const friendEntries = entriesFromDecodedWords(other.wordList);
    if (friendEntries.length === 0) {
      lines.push("(No word list in link for player 1 — totals only.)");
    } else {
      for (const { word, pts } of friendEntries) {
        lines.push(`  ${word.toUpperCase()} · ${pts} pts`);
      }
    }
    lines.push("", `Player 2 — ${finalWordCount} words, ${finalScore} pts`);
    const yourEntries = Array.from(foundScores.entries()).map(([word, pts]) => ({ word, pts }));
    yourEntries.sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word));
    for (const { word, pts } of yourEntries) {
      lines.push(`  ${word.toUpperCase()} · ${pts} pts`);
    }
    return lines.join("\n");
  }

  function populateSummaryListWithExpand(listEl, expandEl, entries) {
    if (!listEl || !expandEl) return;
    listEl.innerHTML = "";
    expandEl.hidden = true;
    expandEl.textContent = "Show more words";
    expandEl.onclick = null;
    if (entries.length === 0) return;

    const shown = entries.slice(0, SUMMARY_MAX_WORDS);
    const frag = document.createDocumentFragment();
    for (const { word, pts } of shown) frag.append(summaryRow(word, pts));
    listEl.append(frag);

    const extra = entries.length - SUMMARY_MAX_WORDS;
    if (extra > 0) {
      expandEl.hidden = false;
      expandEl.textContent = `Show ${extra} more ${extra === 1 ? "word" : "words"}`;
      expandEl.onclick = () => {
        const rest = entries.slice(SUMMARY_MAX_WORDS);
        const moreFrag = document.createDocumentFragment();
        for (const { word, pts } of rest) moreFrag.append(summaryRow(word, pts));
        listEl.append(moreFrag);
        expandEl.hidden = true;
        expandEl.onclick = null;
      };
    }
  }

  function hideCompareDualPanel() {
    const elDual = $("wh-compare-dual");
    if (elDual) elDual.hidden = true;
    const elWinner = $("wh-compare-winner");
    if (elWinner) elWinner.textContent = "";
    const elFriendLead = $("wh-compare-friend-lead");
    const elYouLead = $("wh-compare-you-lead");
    if (elFriendLead) elFriendLead.textContent = "";
    if (elYouLead) elYouLead.textContent = "";
    const elFriendList = $("wh-compare-friend-list");
    const elYouList = $("wh-compare-you-list");
    if (elFriendList) elFriendList.innerHTML = "";
    if (elYouList) elYouList.innerHTML = "";
    const elFriendEx = $("wh-compare-friend-expand");
    const elYouEx = $("wh-compare-you-expand");
    if (elFriendEx) {
      elFriendEx.hidden = true;
      elFriendEx.onclick = null;
    }
    if (elYouEx) {
      elYouEx.hidden = true;
      elYouEx.onclick = null;
    }
    if (elSummaryList) elSummaryList.hidden = false;
  }

  /** @param {{ score: number, words: number, wordList: string[] | null, wordsTruncated: boolean }} other */
  function renderCompareDual(other, finalScore, finalWordCount) {
    const elDual = $("wh-compare-dual");
    const elWinner = $("wh-compare-winner");
    const elFriendLead = $("wh-compare-friend-lead");
    const elYouLead = $("wh-compare-you-lead");
    const elFriendList = $("wh-compare-friend-list");
    const elYouList = $("wh-compare-you-list");
    const elFriendEx = $("wh-compare-friend-expand");
    const elYouEx = $("wh-compare-you-expand");

    if (!elDual || !elWinner || !elFriendLead || !elYouLead || !elFriendList || !elYouList || !elFriendEx || !elYouEx) {
      return;
    }

    let winnerSide = "Tie";
    if (finalScore !== other.score) winnerSide = finalScore > other.score ? "You" : "Friend";
    else if (finalWordCount !== other.words) winnerSide = finalWordCount > other.words ? "You" : "Friend";
    const winnerNeutral =
      winnerSide === "You" ? "Player 2" : winnerSide === "Friend" ? "Player 1" : "Tie";
    elWinner.textContent = `Winner: ${winnerNeutral}`;

    let friendLead = `${other.words} words · ${other.score} pts`;
    if (other.wordsTruncated && other.wordList && other.wordList.length > 0) {
      friendLead += ` · showing top ${other.wordList.length} words by score`;
    }
    elFriendLead.textContent = friendLead;
    elYouLead.textContent = `${finalWordCount} words · ${finalScore} pts`;

    if (elSummaryLead) elSummaryLead.textContent = "";

    if (elSummaryList) elSummaryList.hidden = true;
    if (elSummaryExpand) {
      elSummaryExpand.hidden = true;
      elSummaryExpand.onclick = null;
    }

    elFriendList.innerHTML = "";
    const friendEntries = entriesFromDecodedWords(other.wordList);
    if (friendEntries.length === 0) {
      const li = document.createElement("li");
      li.className = "wordhunt__compare-empty muted";
      li.textContent =
        "No word list for player 1 in this link (older shares only had totals). Ask player 1 to send a freshly copied compare link.";
      elFriendList.append(li);
      elFriendEx.hidden = true;
      elFriendEx.onclick = null;
    } else {
      populateSummaryListWithExpand(elFriendList, elFriendEx, friendEntries);
    }

    const yourEntries = Array.from(foundScores.entries()).map(([word, pts]) => ({ word, pts }));
    yourEntries.sort((a, b) => b.pts - a.pts || a.word.localeCompare(b.word));
    populateSummaryListWithExpand(elYouList, elYouEx, yourEntries);

    elDual.hidden = false;
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
    hideCompareDualPanel();
    const elAct = $("wh-summary-actions");
    const elCopyCmp = $("wh-copy-compare");
    const elCopyRes = $("wh-copy-results");
    const elShareLead = $("wh-share-lead");
    const elStatus = $("wh-summary-status");
    if (elAct) elAct.hidden = true;
    if (elCopyCmp) {
      elCopyCmp.onclick = null;
      elCopyCmp.hidden = false;
    }
    if (elCopyRes) {
      elCopyRes.onclick = null;
      elCopyRes.hidden = true;
    }
    if (elShareLead) elShareLead.textContent = "Share with a friend!";
    if (elStatus) elStatus.textContent = "";
    syncTileLetters();
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

  function finishRoundShareUI(finalScore, finalWordCount) {
    const elAct = $("wh-summary-actions");
    const elCopyCmp = $("wh-copy-compare");
    const elCopyRes = $("wh-copy-results");
    const elShareLead = $("wh-share-lead");
    const elStatus = $("wh-summary-status");

    let compareDecoded = null;
    if (urlBaseSeed && rivalEncodedFromUrl) {
      compareDecoded = decodeStatsPayload(urlBaseSeed, rivalEncodedFromUrl);
      if (compareDecoded) {
        renderCompareDual(compareDecoded, finalScore, finalWordCount);
      } else {
        hideCompareDualPanel();
      }
    } else {
      hideCompareDualPanel();
    }

    const onCompareResultsScreen = compareDecoded != null;

    if (!elAct || !urlBaseSeed) {
      if (elAct) elAct.hidden = true;
      return;
    }

    elAct.hidden = false;

    if (onCompareResultsScreen) {
      if (elShareLead) elShareLead.textContent = "Tell your friend who won:";
      if (elCopyCmp) {
        elCopyCmp.hidden = true;
        elCopyCmp.onclick = null;
      }
      if (elCopyRes) {
        elCopyRes.hidden = false;
        elCopyRes.onclick = async () => {
          const text = formatCompareResultsPlainText(compareDecoded, finalScore, finalWordCount);
          const ok = await copyTextRobust(text);
          if (ok) {
            if (elStatus) elStatus.textContent = "Results copied.";
            else setMsg("Results copied.");
          } else {
            window.prompt("Copy results:", text);
          }
        };
      }
    } else {
      if (elShareLead) elShareLead.textContent = "Share with a friend!";
      if (elCopyRes) {
        elCopyRes.hidden = true;
        elCopyRes.onclick = null;
      }
      if (elCopyCmp) {
        elCopyCmp.hidden = false;
        elCopyCmp.onclick = async () => {
          const enc = encodeStatsPayload(urlBaseSeed, finalScore, finalWordCount, foundScores);
          const u = new URL(location.href);
          u.searchParams.set("seed", urlBaseSeed);
          u.searchParams.set("rival", enc);
          u.searchParams.delete("board");
          const ok = await copyTextRobust(u.toString());
          if (ok) {
            if (elStatus) elStatus.textContent = "Compare link copied.";
            else setMsg("Compare link copied.");
          } else {
            window.prompt("Copy compare link:", u.toString());
          }
        };
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
    mustRollBeforeNextStart = true;
    setMsg("Time. Hit start for a new board.");
    clearSelection();
    setSeedEditingEnabled(true);
    setNewBoardEnabled(true);
    const finalScore = score;
    const finalWordCount = foundScores.size;
    showRoundSummary();
    finishRoundShareUI(finalScore, finalWordCount);
  }

  function rollNewChallenge() {
    urlBaseSeed = generateAutoSeedString();
    syncSeededUrl({ clearRival: true });
    board = generateBoard();
    renderBoard();
    clearSelection();
    updateSeedLine();
  }

  /** Mid-round “restart”: stop timer, hide summary, new seed/board, back to pre-start (masked). */
  function abortToIdleFromRestart() {
    if (!running) return;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    running = false;
    hideRoundSummary();
    remaining = ROUND_SECONDS;
    score = 0;
    foundScores = new Map();
    elWords.innerHTML = "";
    updateStats();
    elStart.textContent = "start";
    setSeedEditingEnabled(true);
    setNewBoardEnabled(true);
    rollNewChallenge();
    mustRollBeforeNextStart = false;
    syncTileLetters();
    setMsg("Ready. Hit start — letters unlock when the round begins.");
    clearSelection();
  }

  function startRound() {
    if (!DICT) return;
    clearSeedCopiedFeedback();
    hideRoundSummary();
    if (mustRollBeforeNextStart) {
      rollNewChallenge();
      mustRollBeforeNextStart = false;
    } else {
      commitSeedFromInput();
    }
    setSeedEditingEnabled(false);
    remaining = ROUND_SECONDS;
    score = 0;
    foundScores = new Map();
    elWords.innerHTML = "";
    running = true;
    setNewBoardEnabled(false);
    syncTileLetters();
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
    if (running) return;
    rollNewChallenge();
    mustRollBeforeNextStart = false;
    if (!running) setMsg("Ready. Hit start.");
  }

  function bindDrag() {
    elBoardWrap.addEventListener("selectstart", (e) => e.preventDefault());
    elBoardWrap.addEventListener("dragstart", (e) => e.preventDefault());

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
    setNewBoardEnabled(!running);
  }

  function boot() {
    initSeedFromUrl();
    ensureAutoSeed();
    board = generateBoard();
    renderBoard();
    updateSeedLine();
    bindDrag();
    bindBoardEvents();
    updateStats();

    elStart.addEventListener("click", () => {
      if (!DICT) return;
      if (running) {
        abortToIdleFromRestart();
        return;
      }
      startRound();
    });

    elNew.addEventListener("click", () => {
      newBoard();
    });

    if (elSeedInput) {
      elSeedInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!running) startRound();
        }
      });
    }

    if (elCopySeed) {
      elCopySeed.addEventListener("click", async () => {
        const text = urlBaseSeed ?? "";
        if (!text) return;
        const ok = await copyTextRobust(text);
        if (ok) showSeedCopiedFeedback();
        else window.prompt("Copy this seed (Ctrl/Cmd+C):", text);
      });
    }
  }

  boot();

  loadDictionary()
    .then((set) => {
      DICT = set;
      enableUI();
      setMsg("Ready. Hit start — letters unlock when the round begins.");
    })
    .catch((err) => {
      console.error(err);
      setMsg("Dictionary failed to load. Refresh to retry.");
    });
})();
