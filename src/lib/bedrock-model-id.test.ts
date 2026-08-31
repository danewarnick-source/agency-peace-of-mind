import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  geoPrefixForRegion,
  isInferenceProfileId,
  resolveBedrockModelId,
} from "./bedrock-model-id.ts";

describe("resolveBedrockModelId", () => {
  it("throws when unset — does not invent a Claude id", () => {
    assert.throws(() => resolveBedrockModelId(""), /BEDROCK_MODEL_ID is not configured/);
    assert.throws(() => resolveBedrockModelId(undefined), /BEDROCK_MODEL_ID is not configured/);
  });

  it("passes through an on-demand inference profile", () => {
    const id = "us.anthropic.claude-sonnet-4-6";
    assert.deepEqual(resolveBedrockModelId(id, "us-east-1"), {
      modelId: id,
      remapped: false,
    });
    assert.equal(isInferenceProfileId(id), true);
  });

  it("passes through a profile ARN", () => {
    const arn =
      "arn:aws:bedrock:us-east-1:684707794522:inference-profile/us.anthropic.claude-sonnet-4-6";
    assert.equal(resolveBedrockModelId(arn).modelId, arn);
    assert.equal(resolveBedrockModelId(arn).remapped, false);
  });

  it("prefixes a bare Anthropic foundation model id", () => {
    const out = resolveBedrockModelId(
      "anthropic.claude-sonnet-4-6",
      "us-east-1",
    );
    assert.equal(out.modelId, "us.anthropic.claude-sonnet-4-6");
    assert.equal(out.remapped, true);
  });

  it("uses the Hive-known short id from cancelled draft jobs", () => {
    const out = resolveBedrockModelId("claude-sonnet-4-6", "us-east-1");
    assert.equal(out.modelId, "us.anthropic.claude-sonnet-4-6");
    assert.equal(out.remapped, true);
  });

  it("picks eu/apac geo from AWS_REGION", () => {
    assert.equal(geoPrefixForRegion("eu-west-1"), "eu");
    assert.equal(geoPrefixForRegion("ap-southeast-1"), "apac");
    assert.equal(geoPrefixForRegion("us-west-2"), "us");
    const eu = resolveBedrockModelId("anthropic.claude-sonnet-4-6", "eu-central-1");
    assert.equal(eu.modelId, "eu.anthropic.claude-sonnet-4-6");
  });
});
