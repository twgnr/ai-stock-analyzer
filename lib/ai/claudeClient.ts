import Anthropic from "@anthropic-ai/sdk";
import type {
  AIClient,
  AICallOptions,
  AIConfig,
  AIResult,
  AIStreamChunk,
} from "./types";

export class ClaudeClient implements AIClient {
  private client: Anthropic;
  private model: string;

  constructor(config: AIConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }

  describeModel(): string {
    return `claude:${this.model}`;
  }

  async call(options: AICallOptions): Promise<AIResult> {
    let userContent: Anthropic.MessageCreateParams["messages"][number]["content"];
    if (options.document) {
      userContent = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: options.document.base64,
          },
          ...(options.document.filename
            ? { title: options.document.filename }
            : {}),
        },
        { type: "text", text: options.userPrompt },
      ];
    } else if (options.image) {
      userContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: options.image.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: options.image.base64,
          },
        },
        { type: "text", text: options.userPrompt },
      ];
    } else {
      userContent = options.userPrompt;
    }

    // Prompt-Caching: Wenn cacheable (Default true) und ein System-Prompt
    // vorhanden ist, markieren wir diesen mit cache_control. Anthropic cached
    // die letzten ~1024 Tokens davor 5 Minuten lang. Bei wiederholten Calls
    // mit identischem Systemtext spart das ~90 % der Input-Token-Kosten.
    // Zu kurze Blöcke werden serverseitig still ignoriert — daher kein Risiko.
    const cacheable = options.cacheable !== false;
    const system: Anthropic.MessageCreateParams["system"] | undefined =
      options.system
        ? cacheable
          ? [
              {
                type: "text",
                text: options.system,
                cache_control: { type: "ephemeral" },
              },
            ]
          : options.system
        : undefined;

    const common = {
      model: this.model,
      max_tokens: options.maxTokens ?? 2000,
      system,
      messages: [{ role: "user" as const, content: userContent }],
    };

    if (options.tool) {
      const response = await this.client.messages.create({
        ...common,
        tools: [
          {
            name: options.tool.name,
            description: options.tool.description,
            input_schema: options.tool.input_schema as Anthropic.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: options.tool.name },
      });
      const toolUse = response.content.find(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use"
      );
      if (!toolUse) throw new Error("Claude lieferte kein Tool-Ergebnis");
      return {
        toolInput: toolUse.input,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        model: this.model,
      };
    }

    const response = await this.client.messages.create(common);
    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      model: this.model,
    };
  }

  async *streamText(options: AICallOptions): AsyncGenerator<AIStreamChunk, void, void> {
    // Streaming-Pfad nutzt nur Text — Tool-Use/Document-/Image-Inputs werden
    // nicht gestreamt, da der Caller dafür `call()` benutzt.
    const cacheable = options.cacheable !== false;
    const system: Anthropic.MessageCreateParams["system"] | undefined =
      options.system
        ? cacheable
          ? [
              {
                type: "text",
                text: options.system,
                cache_control: { type: "ephemeral" },
              },
            ]
          : options.system
        : undefined;

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens ?? 2000,
      system,
      messages: [{ role: "user" as const, content: options.userPrompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", delta: event.delta.text };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: "done",
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
        model: this.model,
      },
    };
  }
}
