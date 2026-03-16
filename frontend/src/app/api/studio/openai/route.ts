import { NextRequest, NextResponse } from "next/server";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestPayload {
  messages: Message[];
  schema?: Record<string, unknown>; // JSON schema for structured output
  model?: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: RequestPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, schema, model = "gpt-4o-mini" } = body;

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
  };

  if (schema) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema },
    };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";

  if (schema) {
    try {
      return NextResponse.json({ result: JSON.parse(content) });
    } catch {
      return NextResponse.json({ result: content });
    }
  }

  return NextResponse.json({ result: content });
}
