import OpenAI from "openai";
import type {
  AIClient,
  AICallOptions,
  AIConfig,
  AIResult,
  AIStreamChunk,
} from "./types";

export class OpenAICompatClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor(config: AIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model;
  }

  describeModel(): string {
    return `openai:${this.model}`;
  }

  async call(options: AICallOptions): Promise<AIResult> {
    if (options.document) {
      throw new Error(
        "PDF-Analyse wird vom aktuellen KI-Anbieter nicht unterstützt. Bitte in den Einstellungen Claude oder Gemini als Provider wählen."
      );
    }
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }

    if (options.image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: options.userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${options.image.mimeType};base64,${options.image.base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({ role: "user", content: options.userPrompt });
    }

    if (options.tool) {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 2000,
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: options.tool.name,
              description: options.tool.description,
              parameters: options.tool.input_schema as Record<string, unknown>,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: options.tool.name },
        },
      });
      const choice = response.choices[0];
      const call = choice.message.tool_calls?.[0];
      if (!call || call.type !== "function") {
        throw new Error("OpenAI-kompatibler Anbieter lieferte kein Tool-Call-Ergebnis");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(call.function.arguments);
      } catch {
        throw new Error("Tool-Arguments waren kein gültiges JSON");
      }
      return {
        toolInput: parsed,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        model: this.model,
      };
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 2000,
      messages,
    });
    return {
      text: response.choices[0]?.message.content || "",
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      model: this.model,
    };
  }

  async *streamText(options: AICallOptions): AsyncGenerator<AIStreamChunk, void, void> {
    if (options.document) {
      throw new Error(
        "PDF-Analyse wird vom aktuellen KI-Anbieter nicht unterstützt."
      );
    }
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.system) messages.push({ role: "system", content: options.system });
    if (options.image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: options.userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${options.image.mimeType};base64,${options.image.base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({ role: "user", content: options.userPrompt });
    }

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 2000,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    let lastUsage: OpenAI.CompletionUsage | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { type: "text", delta };
      if (chunk.usage) lastUsage = chunk.usage;
    }
    yield {
      type: "done",
      usage: {
        inputTokens: lastUsage?.prompt_tokens || 0,
        outputTokens: lastUsage?.completion_tokens || 0,
        model: this.model,
      },
    };
  }
}
