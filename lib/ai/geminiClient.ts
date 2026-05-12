import {
  GoogleGenerativeAI,
  SchemaType,
  type Part,
  type Schema,
} from "@google/generative-ai";
import type {
  AIClient,
  AICallOptions,
  AIConfig,
  AIResult,
  AIStreamChunk,
} from "./types";

function convertJsonSchemaToGemini(
  schema: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return schema;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      const type = value.toLowerCase();
      switch (type) {
        case "object":
          result.type = SchemaType.OBJECT;
          break;
        case "array":
          result.type = SchemaType.ARRAY;
          break;
        case "string":
          result.type = SchemaType.STRING;
          break;
        case "number":
          result.type = SchemaType.NUMBER;
          break;
        case "integer":
          result.type = SchemaType.INTEGER;
          break;
        case "boolean":
          result.type = SchemaType.BOOLEAN;
          break;
        default:
          result.type = SchemaType.STRING;
      }
    } else if (Array.isArray(value)) {
      if (key === "type") {
        result.type = SchemaType.STRING;
      } else {
        result[key] = value.map((v) =>
          typeof v === "object" && v !== null
            ? convertJsonSchemaToGemini(v as Record<string, unknown>)
            : v
        );
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = convertJsonSchemaToGemini(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function buildParts(options: AICallOptions): Part[] {
  const parts: Part[] = [];
  if (options.document) {
    parts.push({
      inlineData: {
        mimeType: options.document.mimeType,
        data: options.document.base64,
      },
    });
  }
  if (options.image) {
    parts.push({
      inlineData: {
        mimeType: options.image.mimeType,
        data: options.image.base64,
      },
    });
  }
  parts.push({ text: options.userPrompt });
  return parts;
}

export class GeminiClient implements AIClient {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(config: AIConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model;
  }

  describeModel(): string {
    return `gemini:${this.modelName}`;
  }

  async call(options: AICallOptions): Promise<AIResult> {
    if (options.tool) {
      const schema = convertJsonSchemaToGemini(options.tool.input_schema);
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        systemInstruction: options.system,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 2000,
          responseMimeType: "application/json",
          responseSchema: schema as unknown as Schema,
        },
      });
      const result = await model.generateContent(buildParts(options));
      const response = result.response;
      const text = response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Gemini lieferte kein gültiges JSON");
      }
      return {
        toolInput: parsed,
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        model: this.modelName,
      };
    }

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: options.system,
      generationConfig: { maxOutputTokens: options.maxTokens ?? 2000 },
    });
    const result = await model.generateContent(buildParts(options));
    const response = result.response;
    return {
      text: response.text(),
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      model: this.modelName,
    };
  }

  async *streamText(options: AICallOptions): AsyncGenerator<AIStreamChunk, void, void> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: options.system,
      generationConfig: { maxOutputTokens: options.maxTokens ?? 2000 },
    });
    const result = await model.generateContentStream(buildParts(options));
    for await (const chunk of result.stream) {
      const t = chunk.text();
      if (t) yield { type: "text", delta: t };
    }
    const final = await result.response;
    yield {
      type: "done",
      usage: {
        inputTokens: final.usageMetadata?.promptTokenCount || 0,
        outputTokens: final.usageMetadata?.candidatesTokenCount || 0,
        model: this.modelName,
      },
    };
  }
}
