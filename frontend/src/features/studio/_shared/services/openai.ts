const ENDPOINT = "/api/studio/openai";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Chat with GPT-4o-mini. Returns text or parsed JSON if schema provided. */
export async function chatWithOpenAI(
  messages: Message[],
  options?: {
    schema?: Record<string, unknown>;
    model?: string;
  }
): Promise<string | Record<string, unknown>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      schema: options?.schema,
      model: options?.model,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "OpenAI request failed");
  }

  const data = await res.json();
  return data.result;
}
