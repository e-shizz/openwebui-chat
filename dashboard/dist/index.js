(function () {
  "use strict";

  const { React, hooks, components, utils, api } = window.__HERMES_PLUGIN_SDK__;
  const { useState, useEffect, useRef, useCallback } = hooks;
  const { Card, CardContent, Button, Input, Badge, Separator } = components;
  const { cn, timeAgo } = utils;

  /* ── CodeBlock with hover copy button ─────────────────────────────────────────────── */
  function CodeBlock({ code, lang, fontSize }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(() => {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }, [code]);

    const codeStyle = fontSize ? { fontSize: `${fontSize - 2}px`, lineHeight: 1.6 } : {};

    return React.createElement(
      "div",
      {
        className:
          "group relative bg-muted/80 bg-black/20 rounded-lg p-3 my-2 font-mono text-xs text-foreground overflow-x-auto border border-border/30",
      },
      /* Copy button — appears on hover */
      React.createElement(
        "button",
        {
          onClick: handleCopy,
          className:
            "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 hover:bg-background text-foreground text-[10px] border border-border/40 cursor-pointer z-10",
          title: "Copy to clipboard",
        },
        copied
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "svg",
                { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
                React.createElement("polyline", { points: "20 6 9 17 4 12" })
              ),
              "Copied!"
            )
          : React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "svg",
                { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
                React.createElement("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
                React.createElement("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
              ),
              "Copy"
            )
      ),
      /* Language label */
      lang &&
        React.createElement(
          "div",
          { className: "text-[10px] text-muted-foreground mb-1 select-none" },
          lang
        ),
      React.createElement(
        "pre",
        { className: "whitespace-pre-wrap break-words m-0", style: codeStyle },
        code
      )
    );
  }

  /* ── ChatBubble ─────────────────────────────────────────────── */
  function ChatBubble({ role, content, isStreaming, fontSize }) {
    const isUser = role === "user";
    const textStyle = fontSize ? { fontSize: `${fontSize}px`, lineHeight: 1.6 } : {};

    /* ── User: readable muted bubble ── */
    if (isUser) {
      return React.createElement(
        "div",
        { className: "flex w-full mb-3 justify-end" },
        React.createElement(
          "div",
          {
            className:
              "max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm bg-muted text-foreground border border-border/50",
          },
          React.createElement(
            "div",
            { className: "whitespace-pre-wrap break-words", style: textStyle },
            content
          ),
          isStreaming &&
            React.createElement("span", {
              className:
                "inline-block w-1.5 h-4 ml-1 bg-current align-middle animate-pulse rounded-sm",
            })
        )
      );
    }

    /* ── Assistant: plain text + code blocks in darker containers ── */
    function parseSegments(text) {
      if (!text) return [{ type: "text", content: "" }];
      const segments = [];
      const regex = /```(\w*)\n?([\s\S]*?)```/g;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
        }
        segments.push({ type: "code", lang: match[1], content: match[2] });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        segments.push({ type: "text", content: text.slice(lastIndex) });
      }
      return segments.length ? segments : [{ type: "text", content: text }];
    }

    const segments = parseSegments(content);
    const children = segments.map((seg, i) =>
      seg.type === "text"
        ? React.createElement(
            "div",
            { key: i, className: "whitespace-pre-wrap break-words text-foreground py-1", style: textStyle },
            seg.content
          )
        : React.createElement(CodeBlock, { key: i, code: seg.content, lang: seg.lang, fontSize })
    );

    if (isStreaming) {
      children.push(
        React.createElement("span", {
          key: "stream",
          className:
            "inline-block w-1.5 h-4 ml-1 bg-current align-middle animate-pulse rounded-sm",
        })
      );
    }

    return React.createElement(
      "div",
      { className: "flex w-full mb-3 justify-start" },
      React.createElement("div", { className: "max-w-[85%] text-sm leading-relaxed" }, children)
    );
  }

  /* ── SessionItem ────────────────────────────────────────────── */
  function SessionItem({ session, isActive, onClick }) {
    return React.createElement(
      "div",
      {
        onClick: onClick,
        className: cn(
          "cursor-pointer px-3 py-2.5 border-b border-border/40 transition-colors select-none",
          "hover:bg-accent/60",
          isActive && "bg-accent"
        ),
      },
      React.createElement(
        "div",
        { className: "font-medium text-sm truncate leading-tight" },
        session.title || session.preview || "Untitled chat"
      ),
      React.createElement(
        "div",
        { className: "flex items-center gap-2 mt-1" },
        React.createElement(
          "span",
          { className: "text-[11px] text-muted-foreground" },
          timeAgo(session.last_active || session.started_at)
        ),
        session.message_count > 0 &&
          React.createElement(
            Badge,
            { variant: "secondary", className: "text-[10px] h-4 px-1.5" },
            session.message_count
          ),
        !session.ended_at &&
          React.createElement("span", {
            className: "w-1.5 h-1.5 rounded-full bg-green-500 inline-block",
            title: "Active",
          })
      )
    );
  }

  /* ── MobileToggle ───────────────────────────────────────────── */
  function MobileToggle({ sidebarOpen, onToggle }) {
    return React.createElement(
      "button",
      {
        onClick: onToggle,
        className:
          "md:hidden fixed bottom-4 left-4 z-50 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center",
        title: sidebarOpen ? "Hide sessions" : "Show sessions",
      },
      sidebarOpen ? "✕" : "☰"
    );
  }

  /* ── Hermes ASCII caduceus (from TUI banner.ts) ────────────── */
  const CADUCEUS_ART = [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⡀⠀⣀⣀⠀⢀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⢀⣠⣴⣾⣿⣿⣇⠸⣿⣿⠇⣸⣿⣿⣷⣦⣄⡀⠀⠀⠀⠀⠀⠀",
    "⠀⢀⣠⣴⣶⠿⠋⣩⡿⣿⡿⠻⣿⡇⢠⡄⢸⣿⠟⢿⣿⢿⣍⠙⠿⣶⣦⣄⡀⠀",
    "⠀⠀⠉⠉⠁⠶⠟⠋⠀⠉⠀⢀⣈⣁⡈⢁⣈⣁⡀⠀⠉⠀⠙⠻⠶⠈⠉⠉⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣿⡿⠛⢁⡈⠛⢿⣿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠿⣿⣦⣤⣈⠁⢠⣴⣿⠿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠻⢿⣿⣦⡉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣦⣈⠛⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣴⠦⠈⠙⠿⣦⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⣤⡈⠁⢤⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠷⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠑⢶⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠁⢰⡆⠈⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⠈⣡⠞⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"
  ];
  /* ── OpenWebUIChat (main component) ─────────────────────────── */
  function OpenWebUIChat() {
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(() => {
      try {
        return typeof window !== "undefined" && window.innerWidth >= 768;
      } catch {
        return true;
      }
    });
    const [error, setError] = useState(null);
    const [fontSize, setFontSize] = useState(() => {
      try {
        const saved = localStorage.getItem("hermes-chat-font-size");
        return saved ? parseInt(saved, 10) : 14;
      } catch {
        return 14;
      }
    });
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    /* Load session list */
    const refreshSessions = useCallback(() => {
      api
        .getSessions(50, 0)
        .then((data) => setSessions(data.sessions || []))
        .catch((err) => console.error("Failed to load sessions:", err));
    }, []);

    useEffect(() => {
      refreshSessions();
    }, [refreshSessions]);

    /* Load messages when active session changes */
    useEffect(() => {
      if (!activeSessionId) {
        setMessages([]);
        return;
      }
      setError(null);
      api
        .getSessionMessages(activeSessionId)
        .then((data) => {
          const filtered = (data.messages || [])
            .filter((m) => {
              if (m.role === "user") return true;
              if (m.role === "assistant") {
                // Skip assistant messages that are purely tool-call turns
                // (no text content) — they look like empty bubbles.
                const hasContent = typeof m.content === "string" && m.content.trim().length > 0;
                return hasContent;
              }
              return false;
            })
            .map((m) => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : "",
            }));
          setMessages(filtered);
        })
        .catch((err) => {
          console.error("Failed to load messages:", err);
          setError("Could not load session messages.");
        });
    }, [activeSessionId]);

    /* Auto-scroll */
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, streamingContent]);

    /* Focus input on mount / when chat cleared */
    useEffect(() => {
      inputRef.current?.focus();
    }, [activeSessionId]);

    /* Persist font size */
    useEffect(() => {
      try {
        localStorage.setItem("hermes-chat-font-size", String(fontSize));
      } catch {}
    }, [fontSize]);

    const handleNewChat = useCallback(() => {
      setActiveSessionId(null);
      setMessages([]);
      setInputValue("");
      setStreamingContent("");
      setError(null);
      setSidebarOpen(false);
    }, []);

    const handleSelectSession = useCallback((id) => {
      setActiveSessionId(id);
      setStreamingContent("");
      setError(null);
      setSidebarOpen(false);
    }, []);

    const handleSend = useCallback(async () => {
      const text = inputValue.trim();
      if (!text || isLoading) return;

      setInputValue("");
      setIsLoading(true);
      setStreamingContent("");
      setError(null);
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      try {
        const res = await fetch("/api/plugins/openwebui-chat/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: activeSessionId, message: text }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status}: ${body}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentSessionId = activeSessionId;
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const msg = JSON.parse(payload);
              if (msg.type === "delta") {
                setStreamingContent((prev) => prev + (msg.content || ""));
              } else if (msg.type === "done") {
                currentSessionId = msg.session_id;
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: msg.result || "" },
                ]);
                setStreamingContent("");
                setIsLoading(false);
                streamDone = true;
                refreshSessions();
              } else if (msg.type === "error") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: "Error: " + (msg.message || "Unknown error") },
                ]);
                setStreamingContent("");
                setIsLoading(false);
                streamDone = true;
              }
            } catch (_) {
              /* ignore malformed SSE lines */
            }
          }
        }

        if (currentSessionId && currentSessionId !== activeSessionId) {
          setActiveSessionId(currentSessionId);
        }
      } catch (err) {
        console.error(err);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: " + err.message },
        ]);
        setIsLoading(false);
      }
    }, [inputValue, isLoading, activeSessionId, refreshSessions]);

    const handleKeyDown = useCallback(
      (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    /* ── Render ──────────────────────────────────────────────── */
    const hasContent = messages.length > 0 || streamingContent;

    const renderInputBar = (centered) =>
      React.createElement(
        "div",
        {
          className: cn(
            "w-full max-w-2xl mx-auto px-4",
            centered ? "" : "border-t border-border p-3 md:p-4"
          ),
        },
        React.createElement(
          "div",
          { className: "flex gap-2 items-end" },
          React.createElement(Input, {
            ref: inputRef,
            value: inputValue,
            onChange: (e) => setInputValue(e.target.value),
            onKeyDown: handleKeyDown,
            placeholder: "Message Hermes...",
            disabled: isLoading,
            className: "flex-1 min-h-[44px]",
            style: fontSize ? { fontSize: `${fontSize}px` } : {},
          }),
          React.createElement(
            Button,
            {
              onClick: handleSend,
              disabled: isLoading || !inputValue.trim(),
              size: "default",
            },
            isLoading ? "…" : "Send"
          )
        ),
        !centered && activeSessionId &&
          React.createElement(
            "div",
            { className: "text-[10px] text-muted-foreground text-center mt-1.5" },
            "Session: ",
            activeSessionId.slice(0, 20),
            "…"
          )
      );

    const renderSidebarContent = () =>
      React.createElement(
        React.Fragment,
        null,
        /* Sidebar header */
        React.createElement(
          "div",
          { className: "p-3 border-b border-border" },
          React.createElement(
            "div",
            { className: "flex items-center gap-2" },
            React.createElement(
              Button,
              { onClick: handleNewChat, className: "flex-1", size: "sm" },
              "+ New Chat"
            ),
          ),
          /* Font size slider */
          React.createElement(
            "div",
            { className: "mt-3 flex items-center gap-2" },
            React.createElement(
              "span",
              { className: "text-[10px] text-muted-foreground whitespace-nowrap" },
              "A"
            ),
            React.createElement("input", {
              type: "range",
              min: 12,
              max: 22,
              value: fontSize,
              onChange: (e) => setFontSize(parseInt(e.target.value, 10)),
              className: "flex-1 h-1 appearance-none bg-border rounded-full cursor-pointer accent-primary",
            }),
            React.createElement(
              "span",
              { className: "text-[11px] text-muted-foreground whitespace-nowrap" },
              fontSize + "px"
            )
          )
        ),
        /* Session list */
        React.createElement(
          "div",
          { className: "flex-1 overflow-y-auto" },
          sessions.length === 0 &&
            React.createElement(
              "div",
              { className: "p-4 text-xs text-muted-foreground text-center" },
              "No sessions yet"
            ),
          sessions.map((s) =>
            React.createElement(SessionItem, {
              key: s.id,
              session: s,
              isActive: s.id === activeSessionId,
              onClick: () => handleSelectSession(s.id),
            })
          )
        )
      );

    return React.createElement(
      "div",
      {
        className: "flex flex-col w-full overflow-hidden relative normal-case",
        style: { minHeight: "calc(100dvh - 100px)" },
      },

      /* Mobile toggle */
      React.createElement(MobileToggle, {
        sidebarOpen,
        onToggle: () => setSidebarOpen((v) => !v),
      }),

      /* Sidebar */
      React.createElement(
        "div",
        {
          className: cn(
            "flex flex-col bg-background border-r border-border",
            "absolute z-40 w-72 shadow-xl",
            "transition-transform duration-200 ease-in-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          ),
          style: { height: "calc(100dvh - 100px)" },
        },
        renderSidebarContent()
      ),

      /* Overlay for mobile sidebar */
      sidebarOpen &&
        React.createElement("div", {
          className: "md:hidden fixed inset-0 bg-black/30 z-30",
          onClick: () => setSidebarOpen(false),
        }),

      /* Main chat area */
      React.createElement(
        "div",
        { className: "flex flex-col flex-1 min-w-0 relative" },

        /* ── Empty state: centered hero with caduceus ── */
        !hasContent &&
          React.createElement(
            "div",
            { className: "flex-1 flex flex-col items-center px-4" },
            /* Caduceus + branding — centered vertically */
            React.createElement(
              "div",
              { className: "flex-1 flex flex-col items-center justify-center" },
              /* Caduceus ASCII art */
              React.createElement(
                "div",
                {
                  className: "flex flex-col items-center mb-6 select-none",
                  style: { fontFamily: "monospace", lineHeight: 1.15 },
                },
                CADUCEUS_ART.map((line, i) =>
                  React.createElement(
                    "div",
                    {
                      key: i,
                      className: cn(
                        "text-xs md:text-sm whitespace-pre",
                        i < 4 ? "text-amber-400" :
                        i < 8 ? "text-yellow-500" :
                        i < 12 ? "text-amber-600" : "text-yellow-700"
                      ),
                    },
                    line
                  )
                )
              ),
              /* Branding */
              React.createElement(
                "h1",
                { className: "text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-1" },
                "Nous Hermes"
              ),
              React.createElement(
                "p",
                { className: "text-sm text-muted-foreground" },
                "Messenger of the Digital Gods"
              )
            ),
            /* Input bar at bottom */
            renderInputBar(true)
          ),

        /* ── Active state: messages flow from top ── */
        hasContent &&
          React.createElement(
            "div",
            { className: "flex flex-col flex-1" },
            /* Messages scroll area */
            React.createElement(
              "div",
              { className: "flex-1 overflow-y-auto px-4 py-4 md:px-6" },
              error &&
                React.createElement(
                  "div",
                  { className: "p-3 mb-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20" },
                  error
                ),
              messages.map((msg, idx) =>
                React.createElement(ChatBubble, {
                  key: idx,
                  role: msg.role,
                  content: msg.content,
                  fontSize,
                })
              ),
              streamingContent &&
                React.createElement(ChatBubble, {
                  role: "assistant",
                  content: streamingContent,
                  isStreaming: true,
                  fontSize,
                }),
              React.createElement("div", { ref: messagesEndRef })
            ),
            /* Input bar pinned at bottom */
            renderInputBar(false)
          )
      )
    );
  }

  /* Register the plugin tab */
  window.__HERMES_PLUGINS__.register("openwebui-chat", OpenWebUIChat);
})();
