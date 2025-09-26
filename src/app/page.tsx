"use client";

import { useCoAgent, useCopilotAction, useCopilotAdditionalInstructions, useCopilotMessagesContext } from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotChat, CopilotPopup } from "@copilotkit/react-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import MarkdownIt, { } from "markdown-it";
import { Button } from "@/components/ui/button"
import AppChatHeader, { PopupHeader } from "@/components/canvas/AppChatHeader";
import { X, MoreHorizontal, Plus, Menu } from "lucide-react"
import CardRenderer from "@/components/canvas/CardRenderer";
import ShikiHighlighter from "react-shiki/web";
import { motion, useScroll, useTransform, useMotionValueEvent } from "motion/react";
import { EmptyState } from "@/components/empty-state";
import { cn, getContentArg } from "@/lib/utils";
import { diffWords } from "diff";
import type { AgentState, Item, ItemData, ProjectData, EntityData, NoteData, ChartData, CardType } from "@/lib/canvas/types";
import { initialState, isNonEmptyAgentState, defaultDataFor } from "@/lib/canvas/state";
import { projectAddField4Item, projectSetField4ItemText, projectSetField4ItemDone, projectRemoveField4Item, chartAddField1Metric, chartSetField1Label, chartSetField1Value, chartRemoveField1Metric } from "@/lib/canvas/updates";
import useMediaQuery from "@/hooks/use-media-query";
import ItemHeader from "@/components/canvas/ItemHeader";
import NewItemMenu from "@/components/canvas/NewItemMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import MarkdownEditor from "@/components/MarkdownEditor";
import { TextMessage, ActionExecutionMessage, ResultMessage, AgentStateMessage, Role, Message } from "@copilotkit/runtime-client-gql"
import { AngleSelector } from "@/components/canvas/AngleSelector";
import { ConfirmChanges } from "@/components/canvas/ConfirmChanges";

export default function CopilotKitPage() {
  const { state, setState } = useCoAgent<AgentState>({
    name: "story_agent",
    initialState,
  });

  // Global cache for the last non-empty agent state
  const cachedStateRef = useRef<AgentState>(state ?? initialState);
  useEffect(() => {
    if (isNonEmptyAgentState(state)) {
      cachedStateRef.current = state as AgentState;
    }
  }, [state]);
  // we use viewState to avoid transient flicker; TODO: troubleshoot and remove this workaround
  const viewState: AgentState = isNonEmptyAgentState(state) ? (state as AgentState) : cachedStateRef.current;

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [showJsonView, setShowJsonView] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const { scrollY } = useScroll({ container: scrollAreaRef });
  const headerScrollThreshold = 64;
  const headerOpacity = useTransform(scrollY, [0, headerScrollThreshold], [1, 0]);
  const [headerDisabled, setHeaderDisabled] = useState<boolean>(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descTextareaRef = useRef<HTMLInputElement | null>(null);
  const lastCreationRef = useRef<{ type: CardType; name: string; id: string; ts: number } | null>(null);
  const lastChecklistCreationRef = useRef<Record<string, { text: string; id: string; ts: number }>>({});
  const lastMetricCreationRef = useRef<Record<string, { label: string; value: number | ""; id: string; ts: number }>>({});
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const { messages, setMessages } = useCopilotMessagesContext();
  const [currentDocument, setCurrentDocument] = useState("");

  // Conversations state
  type Conversation = { id: string; title: string; createdAt: number; messages: any; state: any };
  const LS_CONVS = "canvas_conversations_v1";
  const LS_SELECTED = "canvas_selected_conversation_v1";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");

  // Initialize conversations from localStorage
  useEffect(() => {
    try {
      debugger
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_CONVS) : null;
      const saved: Conversation[] = raw ? JSON.parse(raw) : [];
      const valid = Array.isArray(saved) ? saved.filter((c) => c && typeof c.id === "string") : [];
      let sel = typeof window !== "undefined" ? window.localStorage.getItem(LS_SELECTED) ?? "" : "";
      if (!valid.length) {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const first: Conversation = { id, title: "Chat 1", createdAt: Date.now(), messages: [], state: {} };
        setConversations([first]);
        setSelectedConversationId(id);
        return;
      }
      let mapped = valid.map((c) => {
        let finalMessages = [];
        for (const message of c?.messages) {
          if (message?.type === "TextMessage") {
            finalMessages.push(new TextMessage({
              role: message?.role === "user" ? Role.User : Role.Assistant,
              content: message?.content
            }));
          }
          else if (message?.type === "ActionExecutionMessage") {
            finalMessages.push(new ActionExecutionMessage({
              name: message?.name,
              arguments: message?.arguments
            }));
          }
          else if (message?.type === "ResultMessage") {
            finalMessages.push(new ResultMessage({
              actionExecutionId: message?.actionExecutionId,
              actionName: message?.actionName,
              result: message?.result
            }));
          }
          else if (message?.type === "AgentStateMessage") {
            finalMessages.push(new AgentStateMessage({
              agentName: message?.agentName,
              state: message?.state
            }));
          }
        }
        return {
          ...c,
          messages: finalMessages
        }
      });
      setConversations(mapped);
      setMessages(mapped[0].messages);
      if (!sel || !mapped.some((c) => c.id === sel)) {
        sel = mapped[0].id;
      }
      setSelectedConversationId(sel);
    } catch {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setConversations([{ id, title: "Chat 1", createdAt: Date.now(), messages: [], state: {} }]);
      setSelectedConversationId(id);
    }
  }, []);

  // Persist conversations and selection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      window.localStorage.setItem(LS_CONVS, JSON.stringify(conversations));
      // window.localStorage.setItem("wishlist", JSON.stringify(state?.favorites));
    };

    // Runs when user closes tab or refreshes
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [conversations]);


  useEffect(() => {
    debugger
    let index = conversations.findIndex((conversation: Conversation) => conversation.id === selectedConversationId)
    if (index != -1) {
      let modifiedConversation = conversations
      modifiedConversation[index].messages = messages
      modifiedConversation[index].state = state
      setConversations(modifiedConversation)
    }

  }, [messages, selectedConversationId])


  const createConversation = useCallback((title?: string) => {
    setConversations((prev) => {
      const count = prev.length + 1;
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const conv: Conversation = { id, title: (title ?? `Chat ${count}`) || `Chat ${count}`, createdAt: Date.now(), messages: [], state: {} };
      const next = [conv, ...prev];
      setSelectedConversationId(id);
      return next;
    });
  }, []);

  const renameConversation = useCallback((id: string) => {
    const current = conversations.find((c) => c.id === id);
    const nextTitle = typeof window !== "undefined" ? window.prompt("Rename conversation", current?.title ?? "") : null;
    if (nextTitle == null) return;
    const title = nextTitle.trim();
    if (!title) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, [conversations]);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (!next.length) {
        const nid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const first: Conversation = { id: nid, title: "Chat 1", createdAt: Date.now(), messages: [], state: {} };
        setSelectedConversationId(nid);
        return [first];
      }
      if (selectedConversationId === id) setSelectedConversationId(next[0].id);
      return next;
    });
  }, [selectedConversationId]);

  const clearAllConversations = useCallback(() => {
    const ok = typeof window !== "undefined" ? window.confirm("Clear all conversations?") : true;
    if (!ok) return;
    const nid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const first: Conversation = { id: nid, title: "Chat 1", createdAt: Date.now(), messages: [], state: {} };
    setConversations([first]);
    setSelectedConversationId(nid);
  }, []);

  useMotionValueEvent(scrollY, "change", (y) => {
    const disable = y >= headerScrollThreshold;
    setHeaderDisabled(disable);
    if (disable) {
      titleInputRef.current?.blur();
      descTextareaRef.current?.blur();
    }
  });

  useEffect(() => {
    console.log("[CoAgent state updated]", state);
  }, [state]);

  // Reset JSON view when there are no items
  useEffect(() => {
    const itemsCount = (viewState?.items ?? []).length;
    if (itemsCount === 0 && showJsonView) {
      setShowJsonView(false);
    }
  }, [viewState?.items, showJsonView]);

  function fromMarkdown(text: string) {
    const md = new MarkdownIt({
      typographer: true,
      html: true,
    });

    return md.render(text);
  }
  useCopilotAction({
    name: "selectAngle",
    description: "Select an angle for the story",
    parameters: [{
      name: "angles",
      type: "string[]",
      description: "A list of angles from which user can select"
    }],
    renderAndWaitForResponse: ({ args, respond }) => <AngleSelector args={args} respond={respond} />
  })

  useCopilotAction({
    name: "generateStoryAndConfirm",
    description: "Generate a story and confirm it",
    parameters: [
      {
        name: "story",
        type: "string",
        description: "The story that is generated. Strictly markdown format."
      },
      {
        name: "title",
        type: "string",
        description: "The title of the story"
      },
      {
        name: "description",
        type: "string",
        description: "The description of the story"
      }
    ],
    renderAndWaitForResponse: ({ args, respond }) => <ConfirmChanges args={args} respond={respond} status={undefined}
      onReject={function (): void {
        throw new Error("Function not implemented.");
      }} onConfirm={function (): void {
        throw new Error("Function not implemented.");
      }} editor={undefined} currentDocument={""} setCurrentDocument={function (document: string): void {
        throw new Error("Function not implemented.");
      }} />
  })



  const getStatePreviewJSON = (s: AgentState | undefined): Record<string, unknown> => {
    const snapshot = (s ?? initialState) as AgentState;
    const { globalTitle, globalDescription, items } = snapshot;
    return {
      globalTitle: globalTitle ?? initialState.globalTitle,
      globalDescription: globalDescription ?? initialState.globalDescription,
      items: items ?? initialState.items,
    };
  };


  // Strengthen grounding: always prefer shared state over chat history
  useCopilotAdditionalInstructions({
    instructions: (() => {
      const items = viewState.items ?? initialState.items;
      const gTitle = viewState.globalTitle ?? "";
      const gDesc = viewState.globalDescription ?? "";
      const summary = items
        .slice(0, 5)
        .map((p: Item) => `id=${p.id} • name=${p.name} • type=${p.type}`)
        .join("\n");
      const fieldSchema = [
        "FIELD SCHEMA (authoritative):",
        "- project.data:",
        "  - field1: string (text)",
        "  - field2: string (select: 'Option A' | 'Option B' | 'Option C'; empty string means unset)",
        "  - field3: string (date 'YYYY-MM-DD')",
        "  - field4: ChecklistItem[] where ChecklistItem={id: string, text: string, done: boolean, proposed: boolean}",
        "- entity.data:",
        "  - field1: string",
        "  - field2: string (select: 'Option A' | 'Option B' | 'Option C'; empty string means unset)",
        "  - field3: string[] (selected tags; subset of field3_options)",
        "  - field3_options: string[] (available tags)",
        "- note.data:",
        "  - field1: string (textarea)",
        "- chart.data:",
        "  - field1: Array<{id: string, label: string, value: number | ''}> with value in [0..100] or ''",
      ].join("\n");
      const toolUsageHints = [
        "TOOL USAGE HINTS:",
        "- To create cards, call createItem with { type: 'project' | 'entity' | 'note' | 'chart', name?: string } and use returned id.",
        "- Prefer calling specific actions: setProjectField1, setProjectField2, setProjectField3, addProjectChecklistItem, setProjectChecklistItem, removeProjectChecklistItem.",
        "- field2 values: 'Option A' | 'Option B' | 'Option C' | '' (empty clears).",
        "- field3 accepts natural dates (e.g., 'tomorrow', '2025-01-30'); it will be normalized to YYYY-MM-DD.",
        "- Checklist edits accept either the generated id (e.g., '001') or a numeric index (e.g., '1', 1-based).",
        "- For charts, values are clamped to [0..100]; use clearChartField1Value to clear an existing metric value.",
        "- Card subtitle/description keywords (description, overview, summary, caption, blurb) map to setItemSubtitleOrDescription. Never write these to data.field1 for non-note items.",
        "LOOP CONTROL: When asked to 'add a couple' items, add at most 2 and stop. Avoid repeated calls to the same mutating tool in one turn.",
        "RANDOMIZATION: If the user specifically asks for random/mock values, you MAY generate and set them right away using the tools (do not block for more details).",
        "VERIFICATION: After tools run, re-read the latest state and confirm what actually changed.",
      ].join("\n");
      return [
        "ALWAYS ANSWER FROM SHARED STATE (GROUND TRUTH).",
        "If a command does not specify which item to change, ask the user to clarify before proceeding.",
        `Global Title: ${gTitle || "(none)"}`,
        `Global Description: ${gDesc || "(none)"}`,
        `Conversation ID: ${selectedConversationId || "(none)"}`,
        "Items (sample):",
        summary || "(none)",
        fieldSchema,
        toolUsageHints,
      ].join("\n");
    })(),
  });


  // Canvas helpers restored
  const updateItem = useCallback(
    (itemId: string, updates: Partial<Item>) => {
      setState((prev) => {
        const base = prev ?? initialState;
        const items: Item[] = base.items ?? [];
        const nextItems = items.map((p) => (p.id === itemId ? { ...p, ...updates } : p));
        return { ...base, items: nextItems } as AgentState;
      });
    },
    [setState]
  );

  const updateItemData = useCallback(
    (itemId: string, updater: (prev: ItemData) => ItemData) => {
      setState((prev) => {
        const base = prev ?? initialState;
        const items: Item[] = base.items ?? [];
        const nextItems = items.map((p) => (p.id === itemId ? { ...p, data: updater(p.data) } : p));
        return { ...base, items: nextItems } as AgentState;
      });
    },
    [setState]
  );

  const deleteItem = useCallback((itemId: string) => {
    setState((prev) => {
      const base = prev ?? initialState;
      const existed = (base.items ?? []).some((p) => p.id === itemId);
      const items: Item[] = (base.items ?? []).filter((p) => p.id !== itemId);
      return { ...base, items, lastAction: existed ? `deleted:${itemId}` : `not_found:${itemId}` } as AgentState;
    });
  }, [setState]);

  const toggleTag = useCallback((itemId: string, tag: string) => {
    updateItemData(itemId, (prev) => {
      const anyPrev = prev as { field3?: string[] };
      if (Array.isArray(anyPrev.field3)) {
        const selected = new Set<string>(anyPrev.field3 ?? []);
        if (selected.has(tag)) selected.delete(tag); else selected.add(tag);
        return { ...anyPrev, field3: Array.from(selected) } as ItemData;
      }
      return prev;
    });
  }, [updateItemData]);

  const addItem = useCallback((type: CardType, name?: string) => {
    const t: CardType = type;
    let createdId = "";
    setState((prev) => {
      const base = prev ?? initialState;
      const items: Item[] = base.items ?? [];
      const maxExisting = items.reduce((max, it) => {
        const parsed = Number.parseInt(String(it.id ?? "0"), 10);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 0);
      const priorCount = Number.isFinite(base.itemsCreated) ? (base.itemsCreated as number) : 0;
      const nextNumber = Math.max(priorCount, maxExisting) + 1;
      createdId = String(nextNumber).padStart(4, "0");
      const item: Item = {
        id: createdId,
        type: t,
        name: name && name.trim() ? name.trim() : "",
        subtitle: "",
        data: defaultDataFor(t),
      };
      const nextItems = [...items, item];
      return { ...base, items: nextItems, itemsCreated: nextNumber, lastAction: `created:${createdId}` } as AgentState;
    });
    return createdId;
  }, [setState]);


  function diffPartialText(
    oldText: string,
    newText: string,
    isComplete: boolean = false
  ) {
    let oldTextToCompare = oldText;
    if (oldText.length > newText.length && !isComplete) {
      // make oldText shorter
      oldTextToCompare = oldText.slice(0, newText.length);
    }

    const changes = diffWords(oldTextToCompare, newText);

    let result = "";
    changes.forEach((part) => {
      if (part.added) {
        result += `<em>${part.value}</em>`;
      } else if (part.removed) {
        result += `<s>${part.value}</s>`;
      } else {
        result += part.value;
      }
    });

    if (oldText.length > newText.length && !isComplete) {
      result += oldText.slice(newText.length);
    }

    return result;
  }


  const titleClasses = cn(
    /* base styles */
    "w-full outline-none rounded-md px-2 py-1",
    "bg-transparent placeholder:text-gray-400",
    "ring-1 ring-transparent transition-all ease-out",
    /* hover styles */
    "hover:ring-border",
    /* focus styles */
    "focus:ring-2 focus:ring-accent/50 focus:shadow-sm focus:bg-accent/10",
    "focus:shadow-accent focus:placeholder:text-accent/65 focus:text-accent",
  );

  return (
    <div
      style={{ "--copilot-kit-primary-color": "#2563eb" } as CopilotKitCSSProperties}
      className="h-screen flex flex-col"
    >
      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversations Sidebar (Left) */}
        <aside className="max-md:hidden flex flex-col min-w-64 w-[24vw] max-w-120 p-4 pr-0">
          <div className="h-full flex flex-col align-start w-full shadow-lg rounded-2xl border border-sidebar-border overflow-hidden bg-card">
            <div className="p-4 border-b border-sidebar-border flex items-center justify-between gap-2">
              <h3 className="font-bold text-sidebar-foreground">Conversations</h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => createConversation()}>
                  <Plus className="size-4" />
                  <span className="sr-only">New chat</span>
                </Button>
                <Button size="sm" variant="destructive" onClick={clearAllConversations}>Clear all</Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <ul className="flex flex-col gap-1">
                {conversations.map((c) => {
                  const selected = c.id === selectedConversationId;
                  return (
                    <li key={c.id} className={cn("group rounded-lg border transition-colors", selected ? "border-accent bg-accent/10" : "border-border hover:border-accent/40 hover:bg-accent/5")}>
                      <div className="flex items-center">
                        <button
                          type="button"
                          className={cn("flex-1 text-left px-3 py-2 truncate", selected ? "text-accent" : "")}
                          onClick={() => setSelectedConversationId(c.id)}
                          title={c.title}
                        >
                          {c.title}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Conversation menu"
                              className="px-2 py-2 text-muted-foreground hover:text-foreground"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => renameConversation(c.id)}>Rename</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem data-variant="destructive" onClick={() => deleteConversation(c.id)}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>
        {/* Main Content */}
        <main className="relative flex flex-1 h-full">
          <div ref={scrollAreaRef} className="relative overflow-auto size-full px-4 sm:px-8 md:px-10 py-4">
            <div className={cn(
              "relative mx-auto max-w-7xl h-full min-h-8",
              (showJsonView || (viewState.items ?? []).length === 0) && "flex flex-col",
            )}>
              {/* Global Title & Description (hidden in JSON view) */}
              {!showJsonView && (
                <motion.div style={{ opacity: headerOpacity }} className="sticky top-0 mb-6">
                  <input
                    ref={titleInputRef}
                    disabled={headerDisabled}
                    value={viewState?.globalTitle ?? initialState.globalTitle}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setState((prev) => ({ ...(prev ?? initialState), globalTitle: e.target.value }))
                    }
                    placeholder="Canvas title..."
                    className={cn(titleClasses, "text-2xl font-semibold")}
                  />
                  <input
                    ref={descTextareaRef}
                    disabled={headerDisabled}
                    value={viewState?.globalDescription ?? initialState.globalDescription}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setState((prev) => ({ ...(prev ?? initialState), globalDescription: e.target.value }))
                    }
                    placeholder="Canvas description..."
                    className={cn(titleClasses, "mt-2 text-sm leading-6 resize-none overflow-hidden")}
                  />
                </motion.div>
              )}

              {(viewState.items ?? []).length === 0 ? (
                <div className="flex-1 pb-4">
                  <MarkdownEditor className="mx-auto max-w-5xl h-[calc(100vh-220px)]" />
                </div>
              ) : (
                <div className="flex-1 py-0 overflow-hidden">
                  {showJsonView ? (
                    <div className="pb-16 size-full">
                      <div className="rounded-2xl border shadow-sm bg-card size-full overflow-auto max-md:text-sm">
                        <ShikiHighlighter language="json" theme="github-light">
                          {JSON.stringify(getStatePreviewJSON(viewState), null, 2)}
                        </ShikiHighlighter>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-6 lg:grid-cols-2 pb-20">
                      {(viewState.items ?? []).map((item) => (
                        <article key={item.id} className="relative rounded-2xl border p-5 shadow-sm transition-colors ease-out bg-card hover:border-accent/40 focus-within:border-accent/60">
                          <button
                            type="button"
                            aria-label="Delete card"
                            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-card text-gray-400 hover:bg-accent/10 hover:text-accent transition-colors"
                            onClick={() => deleteItem(item.id)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <ItemHeader
                            id={item.id}
                            name={item.name}
                            subtitle={item.subtitle}
                            description={""}
                            onNameChange={(v) => updateItem(item.id, { name: v })}
                            onSubtitleChange={(v) => updateItem(item.id, { subtitle: v })}
                          />

                          <div className="mt-6">
                            <CardRenderer item={item} onUpdateData={(updater) => updateItemData(item.id, updater)} onToggleTag={(tag) => toggleTag(item.id, tag)} />
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {(viewState.items ?? []).length > 0 ? (
            <div className={cn(
              "absolute left-1/2 -translate-x-1/2 bottom-4",
              "inline-flex rounded-lg shadow-lg bg-card",
              "[&_button]:bg-card [&_button]:w-22 md:[&_button]:h-10",
              "[&_button]:shadow-none! [&_button]:hover:bg-accent",
              "[&_button]:hover:border-accent [&_button]:hover:text-accent",
              "[&_button]:hover:bg-accent/10!",
            )}>
              <NewItemMenu
                onSelect={(t: CardType) => addItem(t)}
                align="center"
                className="rounded-r-none border-r-0 peer"
              />
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "gap-1.25 text-base font-semibold rounded-l-none",
                  "peer-hover:border-l-accent!",
                )}
                onClick={() => setShowJsonView((v) => !v)}
              >
                {showJsonView
                  ? "Canvas"
                  : <>JSON</>
                }
              </Button>
            </div>
          ) : null}
        </main>
        {/* Chat Sidebar (Right) */}
        <aside className="max-md:hidden flex flex-col min-w-80 w-[30vw] max-w-120 p-4 pl-0">
          <div className="h-full flex flex-col align-start w-full shadow-lg rounded-2xl border border-sidebar-border overflow-hidden">
            <AppChatHeader />
            {isDesktop && (
              <CopilotChat
                key={selectedConversationId}
                className="flex-1 overflow-auto w-full"
                labels={{
                  title: "Agent",
                  initial:
                    "👋 Hi!! I am Frankie, a story generator agent. I can help you to generate stories based on your needs. \n\nAdded to that, I can pull posts from subreddits and generate stories based on them.",
                }}
                suggestions={[
                  { title: "Add a Project", message: "Create a new project." },
                  { title: "Add an Entity", message: "Create a new entity." },
                  { title: "Add a Note", message: "Create a new note." },
                  { title: "Add a Chart", message: "Create a new chart." },
                ]}
              />
            )}
          </div>
        </aside>
      </div>
      {/* Mobile: Conversations Drawer and Hamburger */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Open conversations"
          className="fixed z-40 left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-foreground shadow-sm"
          onClick={() => setMobileDrawerOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Drawer Overlay */}
        <div
          className={cn(
            "fixed inset-0 z-50 transition-opacity",
            mobileDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Drawer Panel */}
        <div
          className={cn(
            "fixed z-50 left-0 top-0 bottom-0 w-[85vw] max-w-96 bg-card border-r shadow-xl transition-transform",
            mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="p-4 border-b border-sidebar-border flex items-center justify-between gap-2">
            <h3 className="font-bold">Conversations</h3>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { createConversation(); setMobileDrawerOpen(false); }}>
                <Plus className="size-4" />
                <span className="sr-only">New chat</span>
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { clearAllConversations(); setMobileDrawerOpen(false); }}>Clear all</Button>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent/10"
                onClick={() => setMobileDrawerOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="h-[calc(100%-56px)] overflow-auto p-2">
            <ul className="flex flex-col gap-1">
              {conversations.map((c) => {
                const selected = c.id === selectedConversationId;
                return (
                  <li key={c.id} className={cn("group rounded-lg border transition-colors", selected ? "border-accent bg-accent/10" : "border-border hover:border-accent/40 hover:bg-accent/5")}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        className={cn("flex-1 text-left px-3 py-2 truncate", selected ? "text-accent" : "")}
                        onClick={() => { setSelectedConversationId(c.id); setMobileDrawerOpen(false); }}
                        title={c.title}
                      >
                        {c.title}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Conversation menu"
                            className="px-2 py-2 text-muted-foreground hover:text-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { renameConversation(c.id); }}>Rename</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem data-variant="destructive" onClick={() => { deleteConversation(c.id); }}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Mobile Chat Popup - conditionally rendered to avoid duplicate rendering */}
        {!isDesktop && (
          <CopilotPopup
            Header={PopupHeader}
            labels={{
              title: "Agent",
              initial:
                "👋 Share a brief or ask to extract fields. Changes will sync with the canvas in real time.",
            }}
            suggestions={[
              {
                title: "Add a Project",
                message: "Create a new project.",
              },
              {
                title: "Add an Entity",
                message: "Create a new entity.",
              },
              {
                title: "Add a Note",
                message: "Create a new note.",
              },
              {
                title: "Add a Chart",
                message: "Create a new chart.",
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}



