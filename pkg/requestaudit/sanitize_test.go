package requestaudit

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizeChatBody_StripsImageContent(t *testing.T) {
	body := []byte(`{
		"model": "gpt-4o",
		"messages": [
			{"role": "user", "content": [
				{"type": "text", "text": "describe this"},
				{"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAABBBBCCCCDDDD"}}
			]}
		]
	}`)

	out, ok := sanitizeChatBody(body)
	require.True(t, ok)
	assert.NotContains(t, string(out), "AAAABBBBCCCCDDDD", "base64 image payload must be stripped")
	assert.Contains(t, string(out), "describe this", "text content must be preserved")

	// 结构应保留：messages -> content 数组里图片项变占位符。
	var parsed struct {
		Messages []struct {
			Content []map[string]any `json:"content"`
		} `json:"messages"`
	}
	require.NoError(t, common.Unmarshal(out, &parsed))
	require.Len(t, parsed.Messages, 1)
	require.Len(t, parsed.Messages[0].Content, 2)
	assert.Equal(t, true, parsed.Messages[0].Content[1]["omitted"])
	assert.Equal(t, "image_url", parsed.Messages[0].Content[1]["type"])
}

func TestSanitizeChatBody_PreservesStringContentAndOtherFields(t *testing.T) {
	body := []byte(`{"model":"gpt-4","temperature":0,"messages":[{"role":"user","content":"hello"}]}`)
	out, ok := sanitizeChatBody(body)
	require.True(t, ok)

	var parsed map[string]any
	require.NoError(t, common.Unmarshal(out, &parsed))
	assert.Equal(t, "gpt-4", parsed["model"])
	// 显式零值字段不应被丢弃。
	assert.Contains(t, string(out), "temperature")
}

func TestSanitizeChatBody_InvalidJSONSkipped(t *testing.T) {
	_, ok := sanitizeChatBody([]byte(`not json at all`))
	assert.False(t, ok, "invalid JSON must be skipped, not stored raw")
}

func TestCollectWhitelistedHeaders_ExcludesSecrets(t *testing.T) {
	headers := map[string]string{
		"Content-Type":  "application/json",
		"User-Agent":    "curl/8.0",
		"Authorization": "Bearer sk-secret",
		"Cookie":        "session=abc",
		"X-Api-Key":     "secret-key",
	}
	out := collectWhitelistedHeaders(func(k string) string { return headers[k] })

	assert.Contains(t, out, "application/json")
	assert.Contains(t, out, "curl/8.0")
	assert.NotContains(t, out, "sk-secret", "Authorization must not be stored")
	assert.NotContains(t, out, "session=abc", "Cookie must not be stored")
	assert.NotContains(t, out, "secret-key", "X-Api-Key must not be stored")
}

func TestIsAuditablePath(t *testing.T) {
	assert.True(t, isAuditablePath("/v1/chat/completions"))
	assert.True(t, isAuditablePath("/v1/completions"))
	assert.True(t, isAuditablePath("/v1/messages"))
	assert.True(t, isAuditablePath("/pg/chat/completions"))
	assert.False(t, isAuditablePath("/v1/images/generations"))
	assert.False(t, isAuditablePath("/v1/embeddings"))
	assert.False(t, isAuditablePath("/v1/responses"))
}

func TestSanitizeChatBody_StripsClaudeImageAndDocument(t *testing.T) {
	// Claude messages 格式：content[].type == "image"/"document"，base64 在 source.data。
	body := []byte(`{
		"model": "claude-3-5-sonnet",
		"max_tokens": 1024,
		"messages": [
			{"role": "user", "content": [
				{"type": "text", "text": "what is in this image"},
				{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "CLAUDEIMG64DATA"}},
				{"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": "CLAUDEPDF64DATA"}}
			]}
		]
	}`)

	out, ok := sanitizeChatBody(body)
	require.True(t, ok)
	assert.NotContains(t, string(out), "CLAUDEIMG64DATA", "Claude image base64 must be stripped")
	assert.NotContains(t, string(out), "CLAUDEPDF64DATA", "Claude document base64 must be stripped")
	assert.Contains(t, string(out), "what is in this image", "text must be preserved")

	var parsed struct {
		Messages []struct {
			Content []map[string]any `json:"content"`
		} `json:"messages"`
	}
	require.NoError(t, common.Unmarshal(out, &parsed))
	require.Len(t, parsed.Messages, 1)
	require.Len(t, parsed.Messages[0].Content, 3)
	assert.Equal(t, "image", parsed.Messages[0].Content[1]["type"])
	assert.Equal(t, true, parsed.Messages[0].Content[1]["omitted"])
	assert.Equal(t, "document", parsed.Messages[0].Content[2]["type"])
	assert.Equal(t, true, parsed.Messages[0].Content[2]["omitted"])
}

func TestSanitizeChatBody_StripsNestedToolResultImage(t *testing.T) {
	// Claude tool_result 可在 content 内嵌套图片，需递归剥离。
	body := []byte(`{
		"messages": [
			{"role": "user", "content": [
				{"type": "tool_result", "tool_use_id": "t1", "content": [
					{"type": "text", "text": "result"},
					{"type": "image", "source": {"type": "base64", "data": "NESTEDIMG64"}}
				]}
			]}
		]
	}`)

	out, ok := sanitizeChatBody(body)
	require.True(t, ok)
	assert.NotContains(t, string(out), "NESTEDIMG64", "nested tool_result image must be stripped")
	assert.Contains(t, string(out), "result", "nested text must be preserved")
}

func TestSanitizeContentParts_DepthLimit(t *testing.T) {
	// 构造深度 > maxSanitizeDepth 的嵌套 content，验证不会栈溢出而是安全返回。
	inner := `{"type":"text","text":"deep"}`
	for i := 0; i <= maxSanitizeDepth+1; i++ {
		inner = `[{"type":"tool_result","content":` + inner + `}]`
	}
	body := []byte(`{"messages":[{"role":"user","content":` + inner + `}]}`)

	// 不应 panic；应正常返回（可能带未处理的深层内容，但不崩溃）。
	out, ok := sanitizeChatBody(body)
	require.True(t, ok, "deeply nested body should not cause failure")
	assert.Contains(t, string(out), "deep", "shallow text must still be preserved")
}
