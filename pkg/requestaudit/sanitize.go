package requestaudit

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/common"
)

// auditablePaths 仅审计文本对话端点。图片生成/音频/embedding/responses 等结构不同，
// 本期不审计，避免半成品的图片过滤把 base64 原样落库。
var auditablePaths = map[string]bool{
	"/v1/chat/completions": true, // OpenAI chat
	"/v1/completions":      true, // OpenAI legacy completions
	"/v1/messages":         true, // Claude messages
	"/pg/chat/completions": true, // dashboard playground
}

func isAuditablePath(path string) bool {
	return auditablePaths[path]
}

// omittedContentTypes 是对话 content 数组中需要剥离正文（base64/URL）的项类型，
// 替换为占位符以保留对话结构与轮次，丢弃体积。
// 覆盖 OpenAI（image_url/input_audio/file 等）与 Claude（image/document）两种格式。
var omittedContentTypes = map[string]bool{
	// OpenAI
	"image_url":   true,
	"input_image": true,
	"input_audio": true,
	"audio":       true,
	"input_file":  true,
	"video_url":   true,
	// Claude / 通用
	"image":    true,
	"document": true,
	"file":     true,
}

// sanitizeChatBody 解析对话 body（OpenAI chat 或 Claude messages），将 messages[].content
// 数组中的图片/音频/文件项替换为 {"type":"<orig>","omitted":true} 占位符（含 tool_result 内嵌套项）。
// 其余字段原样保留。解析失败返回 (nil, false)，调用方据此跳过该请求（不把超大二进制原样入库）。
func sanitizeChatBody(body []byte) ([]byte, bool) {
	var root map[string]json.RawMessage
	if err := common.Unmarshal(body, &root); err != nil {
		return nil, false
	}
	rawMessages, ok := root["messages"]
	if !ok {
		// 非 messages 结构（如 /v1/completions 的 prompt），无图片可剥，原样返回。
		return body, true
	}

	var messages []map[string]json.RawMessage
	if err := common.Unmarshal(rawMessages, &messages); err != nil {
		return nil, false
	}

	changed := false
	for _, msg := range messages {
		rawContent, ok := msg["content"]
		if !ok {
			continue
		}
		// content 为字符串时保留；为数组时逐项过滤。
		if newContent, partChanged := sanitizeContentParts(rawContent); partChanged {
			msg["content"] = newContent
			changed = true
		}
	}

	if !changed {
		return body, true
	}

	newMessages, err := common.Marshal(messages)
	if err != nil {
		return nil, false
	}
	root["messages"] = newMessages
	out, err := common.Marshal(root)
	if err != nil {
		return nil, false
	}
	return out, true
}

// sanitizeContentParts 处理一个 content 值：若为对象数组，则把图片/音频/文件项替换为占位符，
// 并递归处理 tool_result 等可嵌套 content 的项。返回新值与是否发生改动。
// 非数组（如字符串 content）原样返回，changed=false。
// maxDepth 限制递归深度，防止恶意深层嵌套耗尽栈。
func sanitizeContentParts(rawContent json.RawMessage) (json.RawMessage, bool) {
	return sanitizeContentPartsWithDepth(rawContent, 0)
}

const maxSanitizeDepth = 10

func sanitizeContentPartsWithDepth(rawContent json.RawMessage, depth int) (json.RawMessage, bool) {
	if depth > maxSanitizeDepth {
		return rawContent, false
	}
	var parts []map[string]json.RawMessage
	if err := common.Unmarshal(rawContent, &parts); err != nil {
		return rawContent, false
	}

	changed := false
	for i, part := range parts {
		var typ string
		if rawType, ok := part["type"]; ok {
			_ = common.Unmarshal(rawType, &typ)
		}
		if omittedContentTypes[typ] {
			// 标识为某类媒体但不保留其正文（base64/URL）。
			parts[i] = map[string]json.RawMessage{
				"type":    part["type"],
				"omitted": json.RawMessage("true"),
			}
			changed = true
			continue
		}
		// 递归处理嵌套 content（如 Claude tool_result 内可携带图片）。
		if nested, ok := part["content"]; ok {
			if newNested, nestedChanged := sanitizeContentPartsWithDepth(nested, depth+1); nestedChanged {
				part["content"] = newNested
				changed = true
			}
		}
	}

	if !changed {
		return rawContent, false
	}
	newContent, err := common.Marshal(parts)
	if err != nil {
		return rawContent, false
	}
	return newContent, true
}

// auditHeaderWhitelist 是允许落库的请求头（白名单制）。
// 任何密钥/凭证类头（Authorization/X-Api-Key/Cookie 等）不在其列，永不落库。
var auditHeaderWhitelist = []string{
	"Content-Type",
	"Accept",
	"Accept-Encoding",
	"User-Agent",
	"X-Forwarded-For",
	"X-Real-Ip",
	"X-Request-Id",
}

// collectWhitelistedHeaders 按白名单采集请求头并序列化为 JSON 字符串。
func collectWhitelistedHeaders(get func(string) string) string {
	picked := map[string]string{}
	for _, h := range auditHeaderWhitelist {
		if v := get(h); v != "" {
			picked[h] = v
		}
	}
	if len(picked) == 0 {
		return ""
	}
	out, err := common.Marshal(picked)
	if err != nil {
		return ""
	}
	return string(out)
}
