import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { trace } from "./logger.js";

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
 * Truncate and clean text for naming prompt.
 */
function prepareTextForNaming(text, maxLength) {
  return text.replace(/\n/g, " ").substring(0, maxLength);
}

/**
 * Build the full prompt for the naming session.
 */
function buildNamingPrompt(userPrompt, assistantResponse) {
  const truncatedPrompt = prepareTextForNaming(userPrompt, 300);
  const truncatedResponse = prepareTextForNaming(assistantResponse, 600);

  return `${NAME_GEN_PROMPT}\n\nUser: "${truncatedPrompt}"\nAssistant: "${truncatedResponse}"\n\nRemember: reply ONLY with the title. Nothing else. No markdown. No quotes. Just the title.`;
}

/**
 * Clean and validate the generated name.
 */
function cleanName(name) {
  return name
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[^\w\s\-—–]/g, "")
    .trim()
    .substring(0, 80);
}

/**
 * Create the event subscriber for the naming session.
 */
function createNamingSubscriber(resolve) {
  let name = "";
  let done = false;

  const unsub = (event) => {
    if(event.assistantMessageEvent?.type !=='thinking_delta')
      trace('name-session event: ',event.type,event.assistantMessageEvent?.type, event.assistantMessageEvent?.delta)
    if(event.type ==='message_update'){
      const ev = event.assistantMessageEvent;
      if (ev?.type === "text_delta" && ev.delta) {
        name += ev.delta;
      }
    }else if(event.type ==='agent_end'){
      done = true;
      resolve();
    }
  };
  return {
    unsub,
    getName: () => name,
    isDone: () => done,
  };
}

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

    const fullPrompt = buildNamingPrompt(userPrompt, assistantResponse);
    console.log('naming-session created: ',fullPrompt.length)

    let resolvePrompt;
    const promptDone = new Promise((r) => { resolvePrompt = r; });

    const subscriber = createNamingSubscriber(resolvePrompt);
    namingSession.subscribe(subscriber.unsub)
    // unsub = (event) => {
    //   subscriber.unsub(event);
    //   if (subscriber.isDone()) resolvePrompt();
    // };
    console.log('naming-session sending prompt: ',fullPrompt.length)
    await namingSession.prompt(fullPrompt, {});
    console.log('got naming-session result: ',fullPrompt.length)

    if (!subscriber.isDone()) {
      console.log('waiting for subs-done: ')
      await promptDone;
    }

    const name = cleanName(subscriber.getName());

    return name || "Chat";
  } catch (err) {
    console.error("[generateSessionName] Error:", err);
    return "Chat";
  } finally {
    unsub();
    namingSession?.dispose();
  }
}
