(function () {
  const STORAGE_KEY = "site-theme";
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");

  function normalizeTheme(theme) {
    if (theme === "midnight") return "dark";
    return theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    const next = normalizeTheme(theme);
    root.dataset.theme = next;
    if (toggle) {
      const isDark = next === "dark";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute(
        "aria-label",
        isDark ? "switch to light mode" : "switch to dark mode"
      );
      toggle.title = isDark ? "light mode" : "dark mode";
      const label = toggle.querySelector(".theme-toggle__label");
      if (label) {
        label.textContent = isDark ? "light mode" : "dark mode";
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {
      /* ignore */
    }
  }

  function initTheme() {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
    if (stored === "dark" || stored === "light" || stored === "midnight") {
      applyTheme(stored === "midnight" ? "dark" : stored);
    } else if (stored === "lavender") {
      applyTheme("light");
    } else {
      applyTheme(root.dataset.theme || "light");
    }
  }

  initTheme();

  if (toggle) {
    toggle.addEventListener("click", function () {
      const current = normalizeTheme(root.dataset.theme || "light");
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var FILE_ICON_SVG =
    '<svg class="explorer-file-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm5 18H5V4h8v4h4v12z"/></svg>';
  var PANEL_HIDE_HTML =
    '<svg class="explorer-file-ico explorer-file-ico--narrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizePath() {
    const parts = location.pathname.split("/").filter(Boolean);
    const leaf = parts.length ? parts[parts.length - 1] : "index.html";
    return { parts, leaf };
  }

  function renderSidebar() {
    const mount = document.getElementById("sidebar-root");
    if (!mount) return;

    const { leaf } = normalizePath();

    function linkRow(href, label, active) {
      return (
        '<li class="tree__file">' +
        '<a class="tree__link' +
        (active ? " is-active" : "") +
        '" href="' +
        href +
        '"' +
        (active ? ' aria-current="page"' : "") +
        ">" +
        '<span class="tree__gutter" aria-hidden="true"></span>' +
        '<span class="tree__name">' +
        escapeHtml(label) +
        "</span></a></li>"
      );
    }

    function nestedFolder(label, rows) {
      return (
        "<li>" +
        '<details class="tree__folder tree__folder--nested">' +
        "<summary>" +
        '<span class="tree__chev" aria-hidden="true"></span>' +
        '<span class="tree__name">' +
        escapeHtml(label) +
        "</span></summary>" +
        '<ul class="tree__children">' +
        rows.join("") +
        "</ul></details></li>"
      );
    }

    function topFolder(label, rows) {
      return (
        "<li>" +
        '<details class="tree__folder">' +
        "<summary>" +
        '<span class="tree__chev" aria-hidden="true"></span>' +
        '<span class="tree__name">' +
        escapeHtml(label) +
        "</span></summary>" +
        '<ul class="tree__children">' +
        rows.join("") +
        "</ul></details></li>"
      );
    }

    const rows = [];

    rows.push(
      '<li class="tree__file">' +
        '<a class="tree__link' +
        (leaf === "index.html" ? " is-active" : "") +
        '" href="/index.html"' +
        (leaf === "index.html" ? ' aria-current="page"' : "") +
        ">" +
        '<span class="tree__gutter" aria-hidden="true"></span>' +
        '<span class="tree__name">index.html</span></a></li>'
    );

    rows.push(
      topFolder("research", [
        linkRow("/research/sam-lab.html", "sam-lab.html", leaf === "sam-lab.html"),
        linkRow("/research/iral-lab.html", "iral-lab.html", leaf === "iral-lab.html"),
      ])
    );
    rows.push(
      topFolder("employment", [
        linkRow("/employment/cse220-ta.html", "cse220-ta.html", leaf === "cse220-ta.html"),
        nestedFolder("bwl", []),
      ])
    );
    rows.push(topFolder("classes", []));
    rows.push(
      topFolder("personal", [
        linkRow("/personal/artwork.html", "artwork.html", leaf === "artwork.html"),
        linkRow("/personal/dance.html", "dance.html", leaf === "dance.html"),
      ])
    );

    mount.innerHTML =
      '<p class="sidebar__label">explorer</p>' +
      '<nav class="tree" aria-label="Site">' +
      '<ul class="tree__root">' +
      rows.join("") +
      "</ul></nav>";

    const active = mount.querySelector("[aria-current='page']");
    if (active) {
      let el = active;
      while (el && el !== mount) {
        if (el.tagName === "DETAILS") {
          el.open = true;
        }
        el = el.parentElement;
      }
    }
  }

  /** File icon on the left edge + collapse control inside the explorer panel. */
  function wireSidebarDock() {
    if (document.getElementById("sidebar-dock")) return;

    const shell = document.querySelector(".app-shell");
    const panel = document.getElementById("sidebar-panel");
    const mount = document.getElementById("sidebar-root");
    if (!shell || !panel || !mount) return;

    const STORAGE = "site-sidebar-collapsed";
    const mqMobile = window.matchMedia("(max-width: 52rem)");

    const dock = document.createElement("button");
    dock.id = "sidebar-dock";
    dock.type = "button";
    dock.className = "sidebar-dock";
    dock.setAttribute("aria-controls", "sidebar-panel");
    dock.innerHTML = FILE_ICON_SVG;
    dock.setAttribute("aria-label", "Open explorer");
    if (shell.parentNode === document.body) {
      document.body.insertBefore(dock, shell);
    } else {
      document.body.insertBefore(dock, document.body.firstChild);
    }

    const collapse = document.createElement("button");
    collapse.id = "sidebar-collapse-btn";
    collapse.type = "button";
    collapse.className = "sidebar-inline-collapse";
    collapse.innerHTML = PANEL_HIDE_HTML;
    collapse.setAttribute("aria-label", "Hide explorer");
    panel.insertBefore(collapse, mount);

    function readStored() {
      try {
        const v = localStorage.getItem(STORAGE);
        if (v === null) return true;
        return v === "1";
      } catch (_) {
        return true;
      }
    }

    function writeStored(collapsed) {
      try {
        localStorage.setItem(STORAGE, collapsed ? "1" : "0");
      } catch (_) {
        /* ignore */
      }
    }

    function syncDock() {
      const mobile = mqMobile.matches;
      const drawerOpen = panel.classList.contains("sidebar--open");
      const desktopCollapsed = shell.classList.contains("app-shell--sidebar-collapsed");

      if (mobile) {
        dock.classList.toggle("sidebar-dock--hidden", drawerOpen);
        dock.setAttribute("aria-expanded", String(drawerOpen));
        dock.setAttribute("aria-label", drawerOpen ? "Explorer open" : "Open explorer");
        collapse.hidden = !drawerOpen;
      } else {
        dock.classList.toggle("sidebar-dock--hidden", !desktopCollapsed);
        dock.removeAttribute("aria-expanded");
        dock.setAttribute("aria-label", "Open explorer");
        collapse.hidden = desktopCollapsed;
      }

      var explorerOpen = (!mobile && !desktopCollapsed) || (mobile && drawerOpen);
      document.body.classList.toggle("explorer-expanded", explorerOpen);
      window.dispatchEvent(new CustomEvent("site-explorer-layout"));
    }

    function setDrawerOpen(open) {
      panel.classList.toggle("sidebar--open", open);
      document.body.style.overflow = open && mqMobile.matches ? "hidden" : "";
      syncDock();
    }

    function setCollapsed(collapsed) {
      if (mqMobile.matches) return;
      shell.classList.toggle("app-shell--sidebar-collapsed", collapsed);
      writeStored(collapsed);
      syncDock();
    }

    dock.addEventListener("click", function () {
      if (mqMobile.matches) {
        setDrawerOpen(!panel.classList.contains("sidebar--open"));
      } else {
        setCollapsed(false);
      }
    });

    collapse.addEventListener("click", function () {
      if (mqMobile.matches) {
        setDrawerOpen(false);
      } else {
        setCollapsed(true);
      }
    });

    panel.addEventListener("click", function (e) {
      if (!e.target.closest("a")) return;
      if (mqMobile.matches) setDrawerOpen(false);
    });

    document.addEventListener("click", function (e) {
      if (!panel.classList.contains("sidebar--open")) return;
      if (!mqMobile.matches) return;
      if (e.target.closest("#command-shell")) return;
      if (panel.contains(e.target) || dock.contains(e.target)) return;
      setDrawerOpen(false);
    });

    function onViewportChange() {
      if (mqMobile.matches) {
        shell.classList.remove("app-shell--sidebar-collapsed");
        document.body.style.overflow = panel.classList.contains("sidebar--open") ? "hidden" : "";
      } else {
        document.body.style.overflow = "";
        panel.classList.remove("sidebar--open");
        shell.classList.toggle("app-shell--sidebar-collapsed", readStored());
      }
      syncDock();
    }

    if (typeof mqMobile.addEventListener === "function") {
      mqMobile.addEventListener("change", onViewportChange);
    } else {
      mqMobile.addListener(onViewportChange);
    }

    onViewportChange();
  }

  renderSidebar();
  wireSidebarDock();

  function wireCommandTerminal() {
    if (document.getElementById("command-shell")) return;

    var HEIGHT_KEY = "site-terminal-height-px";
    var OPEN_TARGETS = {
      home: "/index.html",
      index: "/index.html",
      education: "/classes.html",
      edu: "/classes.html",
      classes: "/classes.html",
      research: "/research.html",
      sam: "/research/sam-lab.html",
      samlab: "/research/sam-lab.html",
      "sam-lab": "/research/sam-lab.html",
      iral: "/research/iral-lab.html",
      iral_lab: "/research/iral-lab.html",
      "iral-lab": "/research/iral-lab.html",
      morphable: "/research/iral-lab.html",
      morpheus: "/research/iral-lab.html",
      tzoumas: "/research/iral-lab.html",
      employment: "/employment.html",
      work: "/employment.html",
      cse220_ta: "/employment/cse220-ta.html",
      msu_ta: "/employment/cse220-ta.html",
      personal: "/personal.html",
      artwork: "/personal/artwork.html",
      art: "/personal/artwork.html",
      dance: "/personal/dance.html",
      rxn: "/personal/dance.html",
      eecs281: "/classes/eecs281.html",
      rob101: "/classes/rob101.html",
      graph: "/projects/eecs281-graph-demo.html",
      graph_demo: "/projects/eecs281-graph-demo.html",
      bot_race: "/projects/rob101-bot-race.html",
      interface: "/projects/research-ui-lab.html",
      interface_study: "/projects/research-ui-lab.html",
      bwl: "/employment/bwl/overview.html",
      "projects/graph": "/projects/eecs281-graph-demo.html",
      "projects/bot_race": "/projects/rob101-bot-race.html",
      "projects/interface": "/projects/research-ui-lab.html",
      "projects/bwl": "/employment/bwl/overview.html",
      "employment/bwl": "/employment/bwl/overview.html",
      "employment/bwl/overview": "/employment/bwl/overview.html",
      "education/overview": "/classes.html",
      "classes/overview": "/classes.html",
      "research/sam-lab": "/research/sam-lab.html",
      "research/iral-lab": "/research/iral-lab.html",
      "research/overview": "/research.html",
      "employment/overview": "/employment.html",
      "employment/cse220-ta": "/employment/cse220-ta.html",
      "personal/overview": "/personal.html",
      "personal/artwork": "/personal/artwork.html",
      "personal/dance": "/personal/dance.html",
      "education/eecs281": "/classes/eecs281.html",
      "education/rob101": "/classes/rob101.html",
      "classes/eecs281": "/classes/eecs281.html",
      "classes/rob101": "/classes/rob101.html",
      "/index.html": "/index.html",
      "/education.html": "/classes.html",
      "/classes.html": "/classes.html",
      "/research.html": "/research.html",
      "/research/sam-lab.html": "/research/sam-lab.html",
      "/research/iral-lab.html": "/research/iral-lab.html",
      "/employment.html": "/employment.html",
      "/employment/cse220-ta.html": "/employment/cse220-ta.html",
      "/employment/bwl/overview.html": "/employment/bwl/overview.html",
      "/personal.html": "/personal.html",
      "/personal/artwork.html": "/personal/artwork.html",
      "/personal/dance.html": "/personal/dance.html",
      "/education/eecs281.html": "/classes/eecs281.html",
      "/education/rob101.html": "/classes/rob101.html",
      "/education/overview.html": "/classes.html",
      "/classes/eecs281.html": "/classes/eecs281.html",
      "/classes/rob101.html": "/classes/rob101.html",
      "/classes/overview.html": "/classes.html",
      "/research/overview.html": "/research.html",
      "/employment/overview.html": "/employment.html",
      "/personal/overview.html": "/personal.html",
      "/projects/eecs281-graph-demo.html": "/projects/eecs281-graph-demo.html",
      "/projects/rob101-bot-race.html": "/projects/rob101-bot-race.html",
      "/projects/research-ui-lab.html": "/projects/research-ui-lab.html",
      "/projects/bwl-dashboard.html": "/employment/bwl/overview.html",
    };

    function resolveNavigateTarget(raw) {
      if (!raw) return null;
      var q = raw.replace(/^["']|["']$/g, "").trim();
      if (!q) return null;
      var lower = q.toLowerCase();
      if (OPEN_TARGETS[lower]) return OPEN_TARGETS[lower];
      if (q.charAt(0) === "/") {
        if (/\.html$/i.test(q)) return q.split("?")[0].split("#")[0];
        return null;
      }
      return null;
    }

    var cwdSegments = [];
    var termPx = 0;

    /** Logical directories you may cd into (matches site layout; no projects/ at repo root). */
    var CD_VALID_TOP = {
      classes: true,
      research: true,
      employment: true,
      personal: true,
    };

    /** Virtual listings for `ls` (keys match cwdKey()). */
    var LS_DIRS = {
      "": [
        { type: "file", name: "index.html" },
        { type: "dir", name: "research" },
        { type: "dir", name: "employment" },
        { type: "dir", name: "classes" },
        { type: "dir", name: "personal" },
      ],
      classes: [],
      research: [
        { type: "file", name: "overview.html" },
        { type: "file", name: "sam-lab.html" },
        { type: "file", name: "iral-lab.html" },
      ],
      employment: [
        { type: "file", name: "overview.html" },
        { type: "file", name: "cse220-ta.html" },
        { type: "dir", name: "bwl" },
      ],
      "employment/bwl": [],
      personal: [
        { type: "file", name: "artwork.html" },
        { type: "file", name: "dance.html" },
      ],
    };

    function cwdKey() {
      return cwdSegments.length ? cwdSegments.join("/").toLowerCase() : "";
    }

    function cwdDisplay() {
      return cwdSegments.length ? "~/site/" + cwdSegments.join("/") : "~/site";
    }

    function isValidCwdSegments(segments) {
      if (!segments || !segments.length) return true;
      if (segments.length === 1) return !!CD_VALID_TOP[segments[0].toLowerCase()];
      if (
        segments.length === 2 &&
        segments[0].toLowerCase() === "employment" &&
        segments[1].toLowerCase() === "bwl"
      ) {
        return true;
      }
      return false;
    }

    function foldPathDots(baseSegments, pathSegments) {
      var stack = baseSegments.slice();
      for (var i = 0; i < pathSegments.length; i++) {
        var s = pathSegments[i].toLowerCase();
        if (s === "..") {
          stack.pop();
        } else if (s !== ".") {
          stack.push(s);
        }
      }
      return stack;
    }

    function computeCdTarget(arg) {
      var a = (arg || "").trim();
      if (!a || a === "~" || /^~\/?$/.test(a)) return { ok: true, segments: [] };
      if (a === "/") return { ok: true, segments: [] };
      var segments;
      if (a.charAt(0) === "/" || /^~\/?site\/?/i.test(a)) {
        var body = a.charAt(0) === "/" ? a.slice(1) : a.replace(/^~\/?site\/?/i, "");
        body = body.replace(/^\/+/, "");
        segments = body.split("/").filter(Boolean).map(function (p) {
          return p.toLowerCase();
        });
        segments = foldPathDots([], segments);
      } else {
        segments = foldPathDots(
          cwdSegments,
          a.split("/").filter(Boolean).map(function (p) {
            return p.toLowerCase();
          })
        );
      }
      if (segments.length === 1) {
        var topDir = segments[0].toLowerCase();
        if (topDir === "education" || topDir === "edu") {
          segments[0] = "classes";
        }
      }
      if (!isValidCwdSegments(segments)) {
        return { ok: false, segments: segments };
      }
      return { ok: true, segments: segments };
    }

    function resolveWithCwd(raw) {
      if (!raw) return null;
      var q = raw.replace(/^["']|["']$/g, "").trim();
      if (!q) return null;
      while (q.startsWith("./")) {
        q = q.slice(2);
      }
      if (q.charAt(0) === "/") {
        return resolveNavigateTarget(q);
      }
      var direct = resolveNavigateTarget(q);
      if (direct) return direct;

      var parts = q.split("/").filter(Boolean);
      if (!parts.length) return null;

      var last = parts[parts.length - 1];
      var isHtml = /\.html$/i.test(last);
      var dirParts = isHtml ? parts.slice(0, -1) : parts;
      var stack = foldPathDots(cwdSegments, dirParts);

      if (isHtml) {
        var full = "/" + stack.join("/") + "/" + last.toLowerCase();
        return resolveNavigateTarget(full);
      }

      var joined = stack.join("/").toLowerCase();
      if (OPEN_TARGETS[joined]) return OPEN_TARGETS[joined];
      return null;
    }

    var shell = document.createElement("div");
    shell.id = "command-shell";
    shell.className = "command-shell";
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML =
      '<div class="command-shell__resize" role="separator" aria-orientation="horizontal" aria-label="Drag to resize terminal" tabindex="0"></div>' +
      '<div class="command-shell__head">' +
      '<span class="command-shell__title">terminal</span>' +
      '<span class="command-shell__hint">Ctrl+` · drag top edge</span>' +
      '<button type="button" class="command-shell__close" aria-label="Close terminal">×</button>' +
      "</div>" +
      '<div class="command-shell__out" id="command-out" aria-live="polite"></div>' +
      '<form class="command-shell__form" id="command-form" autocomplete="off">' +
      '<span class="command-shell__prompt" id="command-prompt" aria-hidden="true"><span id="command-prompt-cwd" class="command-shell__cwd">~/site</span> $</span>' +
      '<input type="text" id="command-input" class="command-shell__input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Terminal command" />' +
      "</form>";

    document.body.appendChild(shell);

    var out = document.getElementById("command-out");
    var form = document.getElementById("command-form");
    var input = document.getElementById("command-input");
    var closeBtn = shell.querySelector(".command-shell__close");
    var resizeEl = shell.querySelector(".command-shell__resize");
    var promptCwd = document.getElementById("command-prompt-cwd");

    var termOpen = false;
    var cmdHistory = [];
    var histIdx = 0;

    function explorerOpen() {
      return document.body.classList.contains("explorer-expanded");
    }

    function clampHeight(px) {
      var minH = 120;
      var cap = explorerOpen()
        ? Math.min(window.innerHeight * 0.44, 320)
        : Math.min(window.innerHeight * 0.72, 520);
      return Math.round(Math.max(minH, Math.min(cap, px)));
    }

    function readStoredHeight() {
      try {
        var n = parseInt(localStorage.getItem(HEIGHT_KEY), 10);
        if (n > 0) return clampHeight(n);
      } catch (_) {
        /* ignore */
      }
      return clampHeight(Math.round(window.innerHeight * 0.28));
    }

    function applyHeight(px) {
      termPx = clampHeight(px);
      shell.style.height = termPx + "px";
      document.body.style.setProperty("--term-height", termPx + "px");
      try {
        localStorage.setItem(HEIGHT_KEY, String(termPx));
      } catch (_) {
        /* ignore */
      }
      resizeEl.setAttribute("aria-valuenow", String(termPx));
    }

    function syncTermHeightCap() {
      if (!termOpen) return;
      applyHeight(termPx || readStoredHeight());
    }

    function refreshPrompt() {
      if (promptCwd) {
        promptCwd.textContent = cwdDisplay();
      }
    }

    function appendOut(html) {
      var line = document.createElement("div");
      line.className = "command-shell__line";
      line.innerHTML = html;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }

    function appendErr(text) {
      appendOut('<span class="command-shell__err">' + escapeHtml(text) + "</span>");
    }

    function appendMuted(text) {
      appendOut('<span class="command-shell__muted">' + escapeHtml(text) + "</span>");
    }

    function echoPromptPrefix() {
      return (
        '<span class="command-shell__prompt command-shell__prompt--echo"><span class="command-shell__cwd">' +
        escapeHtml(cwdDisplay()) +
        "</span> $</span>"
      );
    }

    function printHelp() {
      appendMuted("Commands:");
      appendMuted("  help              — this list");
      appendMuted("  ls                — files in current directory");
      appendMuted("  open <name>       — navigate (uses cwd for relative names)");
      appendMuted("  cd [path]         — cwd (folders only; use open for .html pages)");
      appendMuted("                    site root: research, employment, classes, personal");
      appendMuted("  pwd               — print cwd");
      appendMuted("  echo <text>       — print text");
      appendMuted("  date              — current date/time");
      appendMuted("  clear | cls       — clear output");
      appendMuted("Drag the top strip to resize.");
    }

    function printLs() {
      var key = cwdKey();
      var list = LS_DIRS[key];
      if (!list || !list.length) {
        appendMuted("  (empty)");
        return;
      }
      /* Preserve LS_DIRS order (e.g. research: sam-lab before iral-lab). */
      var ordered = list.slice();
      for (var j = 0; j < ordered.length; j++) {
        var e = ordered[j];
        appendMuted("  " + (e.type === "dir" ? e.name + "/" : e.name));
      }
    }

    function cdMatchesListingFile(raw) {
      var want = (raw || "").trim().toLowerCase().replace(/^\.\//, "");
      if (!want) return null;
      var list = LS_DIRS[cwdKey()];
      if (!list) return null;
      var base = want.replace(/\.html$/i, "");
      for (var i = 0; i < list.length; i++) {
        if (list[i].type !== "file") continue;
        var n = list[i].name.toLowerCase();
        var nb = n.replace(/\.html$/i, "");
        if (n === want || nb === base) return list[i].name;
      }
      return null;
    }

    function runCd(arg) {
      var a = (arg || "").trim();
      if (!a || a === "~" || a === "~/") {
        cwdSegments = [];
        refreshPrompt();
        appendMuted(cwdDisplay());
        return;
      }
      if (a === "..") {
        cwdSegments.pop();
        refreshPrompt();
        appendMuted(cwdDisplay());
        return;
      }
      if (a === "/") {
        cwdSegments = [];
        refreshPrompt();
        appendMuted(cwdDisplay());
        return;
      }
      if (/^~\//.test(a) && !/^~\/?site\/?/i.test(a)) {
        appendErr("cd: use ~/site/<dir>, /, .., or a folder name (classes, research, …)");
        return;
      }
      var result = computeCdTarget(a);
      if (!result.ok) {
        var fileHit = cdMatchesListingFile(arg);
        if (fileHit) {
          appendErr(
            "cd: " + fileHit + ": not a directory (only folders like classes/ are cwd targets)"
          );
          appendMuted("Try: open " + fileHit);
        } else {
          appendErr("cd: no such directory: " + (arg || "").trim());
        }
        return;
      }
      cwdSegments = result.segments;
      refreshPrompt();
      appendMuted(cwdDisplay());
    }

    function runLine(line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      cmdHistory.push(trimmed);
      histIdx = cmdHistory.length;
      appendOut(echoPromptPrefix() + " " + escapeHtml(trimmed));

      var parts = trimmed.split(/\s+/);
      var cmd = parts[0].toLowerCase();
      var arg = parts.slice(1).join(" ").trim();

      if (cmd === "help" || cmd === "?") {
        printHelp();
        return;
      }
      if (cmd === "clear" || cmd === "cls") {
        out.innerHTML = "";
        return;
      }
      if (cmd === "ls") {
        printLs();
        return;
      }
      if (cmd === "pwd") {
        appendMuted(cwdDisplay());
        return;
      }
      if (cmd === "cd") {
        runCd(arg);
        return;
      }
      if (cmd === "echo") {
        appendMuted(arg || "");
        return;
      }
      if (cmd === "date") {
        appendMuted(new Date().toString());
        return;
      }
      if (cmd === "open") {
        var href = resolveWithCwd(arg);
        if (href) {
          appendMuted("→ " + href);
          window.location.assign(href);
        } else {
          appendErr("Unknown route: " + (arg || "(missing argument)"));
          appendMuted("Try: ls   or   cd research   then   open sam-lab.html   or   open /research/sam-lab.html");
        }
        return;
      }
      appendErr("Unknown command: " + cmd);
      appendMuted("Type help for commands.");
    }

    var dragStartY = 0;
    var dragStartH = 0;
    var resizeActive = false;

    function onResizePointerMove(e) {
      if (!resizeActive) return;
      if (e.cancelable) e.preventDefault();
      var dy = dragStartY - e.clientY;
      applyHeight(dragStartH + dy);
    }

    function endResize() {
      if (!resizeActive) return;
      resizeActive = false;
      shell.classList.remove("command-shell--resizing");
      document.removeEventListener("pointermove", onResizePointerMove, true);
      document.removeEventListener("pointerup", endResize, true);
      document.removeEventListener("pointercancel", endResize, true);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function startResize(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      resizeActive = true;
      shell.classList.add("command-shell--resizing");
      dragStartY = e.clientY;
      dragStartH = shell.getBoundingClientRect().height;
      /* Capture on document so drags keep working when the cursor crosses the explorer sidebar */
      document.addEventListener("pointermove", onResizePointerMove, true);
      document.addEventListener("pointerup", endResize, true);
      document.addEventListener("pointercancel", endResize, true);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    }

    resizeEl.addEventListener("pointerdown", startResize);
    resizeEl.addEventListener("dblclick", function () {
      applyHeight(explorerOpen() ? 200 : Math.round(window.innerHeight * 0.3));
    });

    window.addEventListener("resize", syncTermHeightCap);
    window.addEventListener("site-explorer-layout", syncTermHeightCap);

    function setTermOpen(open) {
      termOpen = open;
      shell.classList.toggle("command-shell--open", open);
      document.body.classList.toggle("has-command-shell", open);
      shell.setAttribute("aria-hidden", String(!open));
      if (open) {
        termPx = readStoredHeight();
        applyHeight(termPx);
        input.focus();
      } else {
        document.body.style.removeProperty("--term-height");
        shell.style.height = "";
      }
      var tbtn = document.getElementById("terminal-toggle");
      if (tbtn) {
        tbtn.setAttribute("aria-expanded", String(open));
        tbtn.setAttribute("aria-pressed", String(open));
      }
    }

    function toggleTerm() {
      setTermOpen(!termOpen);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      runLine(input.value);
      input.value = "";
    });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (!cmdHistory.length) return;
      e.preventDefault();
      if (e.key === "ArrowUp") {
        if (histIdx > 0) {
          histIdx -= 1;
        } else {
          histIdx = 0;
        }
      } else {
        if (histIdx < cmdHistory.length - 1) {
          histIdx += 1;
        } else {
          histIdx = cmdHistory.length;
          input.value = "";
          return;
        }
      }
      input.value = cmdHistory[histIdx] || "";
    });

    closeBtn.addEventListener("click", function () {
      setTermOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      var isBackquote = e.key === "`" || e.code === "Backquote";
      if ((e.ctrlKey || e.metaKey) && isBackquote) {
        var t = e.target;
        if (
          t &&
          (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") &&
          t !== input
        ) {
          return;
        }
        e.preventDefault();
        toggleTerm();
        return;
      }
      if (e.key === "Escape" && termOpen) {
        setTermOpen(false);
      }
    });

    var actions = document.querySelector(".site-header__actions");
    if (actions && !document.getElementById("terminal-toggle")) {
      var tbtn = document.createElement("button");
      tbtn.type = "button";
      tbtn.id = "terminal-toggle";
      tbtn.className = "terminal-toggle";
      tbtn.setAttribute("aria-expanded", "false");
      tbtn.setAttribute("aria-pressed", "false");
      tbtn.setAttribute("aria-controls", "command-shell");
      tbtn.setAttribute("aria-label", "Toggle command terminal");
      tbtn.title = "Terminal (Ctrl+`)";
      tbtn.innerHTML =
        '<svg class="terminal-toggle__ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 16l-4-4 4-4-1.4-1.4L1.6 12l5 5L8 16zm8 2H8v-2h8v2zm0-8H8V8h8v2zm0-8H8V4h8v2z"/></svg>' +
        '<span class="terminal-toggle__cap">terminal</span>';
      var themeBtn = document.getElementById("theme-toggle");
      if (themeBtn) {
        actions.insertBefore(tbtn, themeBtn);
      } else {
        actions.appendChild(tbtn);
      }
      tbtn.addEventListener("click", function () {
        toggleTerm();
      });
    }

    appendMuted("Type help for commands.");
    window.dispatchEvent(new CustomEvent("site-explorer-layout"));
  }

  wireCommandTerminal();
})();
