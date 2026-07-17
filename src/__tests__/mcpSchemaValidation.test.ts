import { describe, expect, it } from "vitest";
import {
  validateMcpSchemaValue,
  validateMcpToolArguments,
} from "../lib/mcp/schemaValidation";

describe("MCP JSON Schema 校验", () => {
  const schema = {
    type: "object",
    required: ["query", "limit"],
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 2, maxLength: 20 },
      limit: { type: "integer", minimum: 1, maximum: 10 },
      tags: {
        type: "array",
        maxItems: 2,
        items: { type: "string", enum: ["docs", "code"] },
      },
    },
  };

  it("接受符合输入定义的嵌套参数", () => {
    expect(
      validateMcpToolArguments(schema, {
        query: "react",
        limit: 5,
        tags: ["docs", "code"],
      }),
    ).toBeNull();
  });

  it("拒绝缺失、越界和未声明的参数", () => {
    expect(validateMcpToolArguments(schema, { query: "react" })).toContain(
      "limit 是必填参数",
    );
    expect(
      validateMcpToolArguments(schema, { query: "react", limit: 11 }),
    ).toContain("不能大于 10");
    expect(
      validateMcpToolArguments(schema, {
        query: "react",
        limit: 5,
        unknown: true,
      }),
    ).toContain("不是工具声明的参数");
  });

  it("可复用同一校验器检查 structuredContent 输出", () => {
    const outputSchema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };

    expect(
      validateMcpSchemaValue(outputSchema, { answer: "ok" }, "工具输出"),
    ).toBeNull();
    expect(
      validateMcpSchemaValue(outputSchema, { answer: 42 }, "工具输出"),
    ).toContain("工具输出.answer 的类型不符合");
  });

  it("拒绝循环引用，避免恶意结构造成无限递归", () => {
    const value: Record<string, unknown> = {};
    value.child = value;
    const recursiveSchema: Record<string, unknown> = {
      type: "object",
      properties: {},
    };
    (recursiveSchema.properties as Record<string, unknown>).child =
      recursiveSchema;

    expect(
      validateMcpSchemaValue(recursiveSchema, value, "工具参数"),
    ).toContain("不能包含循环引用");
  });
});
