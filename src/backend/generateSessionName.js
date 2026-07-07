import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const NAME_GEN_PROMPT = `You are a helpful assistant that suggests concise, descriptive titles for chat conversations.

Rules:
- Suggest a very short title (max 5 words)
- The title should capture the main topic or goal of the conversation
- Reply with ONLY the title, nothing else
- Do NOT use markdown, quotes, or any formatting
- Do NOT use tools or think — just respond with the title directly

Examples:
User: "How do I set up a React project with TypeScript?"
Assistant: [gives instructions]
Title: React TypeScript Setup

User: "Fix the login bug in my Node.js API"
Assistant: [fixes bug]
Title: Login Bug Fix

User: "Explain how binary search works"
Assistant: [explains]
Title: Binary Search Explanation

Now, generate a title for this conversation.
Reply ONLY with the title. Nothing else. No markdown. No quotes. Just the title.`;

/**
 * Generate a session name using the default LLM.
 *
 * Creates a temporary in-memory session with no tools and a dedicated
 * system prompt so the LLM only replies with a short title.
 */
export async function generateSessionName(userPrompt, assistantResponse) {
  const tempManager = SessionManager.inMemory();
  let namingSession;
  let unsub = () => {};
  try {
    const result = await createAgentSession({
      sessionManager: tempManager,
      cwd: process.cwd(),
      tools: [],
    });
    namingSession = result.session;

    const truncatedPrompt = userPrompt.replace(/\n/g, " ").substring(0, 300);
    const truncatedResponse = assistantResponse.replace(/\n/g, " ").substring(0, 600);

    const fullPrompt = `${NAME_GEN_PROMPT}\n\nUser: "${truncatedPrompt}"\nAssistant: "${truncatedResponse}"\n\nRemember: reply ONLY with the title. Nothing else. No markdown. No quotes. Just the title.`;

    let name = "";
    let done = false;
    let resolvePrompt;
    const promptDone = new Promise((r) => { resolvePrompt = r; });

    unsub = namingSession.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const ev = event.assistantMessageEvent;
          if (ev?.type === "text_delta" && ev.delta) {
            name += ev.delta;
          }
          break;
        }
        case "agent_end": {
          done = true;
          resolvePrompt();
          break;
        }
      }
    });

    await namingSession.prompt(fullPrompt, {});

    if (!done) {
      await promptDone;
    }

    name = name
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[^\w\s\-—–]/g, "")
      .trim()
      .substring(0, 80);

    return name || "Chat";
  } catch (err) {
    console.error("[generateSessionName] Error:", err);
    return "Chat";
  } finally {
    unsub();
    namingSession?.dispose();
  }
}
