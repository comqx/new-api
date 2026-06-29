/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

const OMITTED_TYPE_KEYS = {
  image_url: '图片内容已省略',
  input_image: '图片内容已省略',
  image: '图片内容已省略',
  input_audio: '音频内容已省略',
  audio: '音频内容已省略',
  input_file: '文件内容已省略',
  document: '文件内容已省略',
  file: '文件内容已省略',
  video_url: '视频内容已省略',
};

const ROLE_LABEL_KEYS = {
  system: '系统',
  user: '用户',
  assistant: '助手',
  tool: '工具回复',
  developer: '开发者',
};

const BODY_RESERVED_KEYS = new Set([
  'model',
  'messages',
  'tools',
  'system',
  'prompt',
]);

// formatJson 尝试将原始字符串格式化为缩进 JSON，并返回是否为合法 JSON。
export const formatJson = (raw) => {
  if (!raw) {
    return { text: '', isJson: false, data: null };
  }
  try {
    const data = JSON.parse(raw);
    return {
      text: JSON.stringify(data, null, 2),
      isJson: true,
      data,
    };
  } catch (e) {
    return { text: raw, isJson: false, data: null };
  }
};

// isChatRequestBody 判断请求体是否可按对话结构展示。
export const isChatRequestBody = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  if (Array.isArray(data.messages)) {
    return true;
  }
  if (typeof data.prompt === 'string') {
    return true;
  }
  return false;
};

export const getRoleLabelKey = (role) => ROLE_LABEL_KEYS[role] || role || '未知角色';

// formatContentParts 将 message content 转为可展示的文本块列表。
export const formatContentParts = (content, t, depth = 0) => {
  if (depth > 8) {
    return [{ kind: 'text', text: JSON.stringify(content, null, 2) }];
  }

  if (content == null) {
    return [{ kind: 'empty', text: t('空') }];
  }

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) {
      return [{ kind: 'empty', text: t('空') }];
    }
    return [{ kind: 'text', text: content }];
  }

  if (Array.isArray(content)) {
    const parts = [];
    content.forEach((part, index) => {
      if (!part || typeof part !== 'object') {
        parts.push({
          kind: 'text',
          text: String(part),
        });
        return;
      }

      const type = part.type || 'unknown';
      if (part.omitted === true || OMITTED_TYPE_KEYS[type]) {
        parts.push({
          kind: 'omitted',
          text: t(OMITTED_TYPE_KEYS[type] || '媒体内容已省略'),
          type,
        });
        return;
      }

      if (type === 'text' && typeof part.text === 'string') {
        parts.push({ kind: 'text', text: part.text });
        return;
      }

      if (type === 'tool_result') {
        const nested = formatContentParts(part.content, t, depth + 1);
        const toolUseId = part.tool_use_id ? ` (${part.tool_use_id})` : '';
        parts.push({
          kind: 'section',
          title: `${t('工具结果')}${toolUseId}`,
          parts: nested,
        });
        return;
      }

      if (type === 'tool_use') {
        parts.push({
          kind: 'section',
          title: t('工具调用'),
          parts: [
            {
              kind: 'text',
              text: [
                part.name ? `${t('名称')}: ${part.name}` : '',
                part.id ? `ID: ${part.id}` : '',
                part.input
                  ? `${t('参数')}:\n${JSON.stringify(part.input, null, 2)}`
                  : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        });
        return;
      }

      if (part.text && typeof part.text === 'string') {
        parts.push({ kind: 'text', text: part.text });
        return;
      }

      if (part.content != null) {
        parts.push({
          kind: 'section',
          title: type,
          parts: formatContentParts(part.content, t, depth + 1),
        });
        return;
      }

      parts.push({
        kind: 'text',
        text: JSON.stringify(part, null, 2),
      });

      if (index < content.length - 1) {
        parts.push({ kind: 'divider' });
      }
    });
    return parts.length > 0 ? parts : [{ kind: 'empty', text: t('空') }];
  }

  if (typeof content === 'object') {
    return [{ kind: 'text', text: JSON.stringify(content, null, 2) }];
  }

  return [{ kind: 'text', text: String(content) }];
};

export const formatToolCalls = (toolCalls, t) => {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return [];
  }

  return toolCalls.map((call, index) => {
    const fn = call?.function || {};
    let argsText = fn.arguments;
    if (typeof argsText === 'string' && argsText.trim()) {
      try {
        argsText = JSON.stringify(JSON.parse(argsText), null, 2);
      } catch (e) {
        // keep raw arguments string
      }
    } else if (argsText && typeof argsText === 'object') {
      argsText = JSON.stringify(argsText, null, 2);
    }

    return {
      index: index + 1,
      id: call?.id || '',
      name: fn.name || call?.name || t('未知工具'),
      arguments: argsText || '',
    };
  });
};

export const summarizeTools = (tools) => {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools.map((tool, index) => {
    if (!tool || typeof tool !== 'object') {
      return { index: index + 1, name: '', description: '', parameters: null };
    }

    const fn = tool.function || tool;
    return {
      index: index + 1,
      type: tool.type || 'function',
      name: fn.name || '',
      description: fn.description || '',
      parameters: fn.parameters || fn.input_schema || null,
    };
  });
};

export const getOtherRequestParams = (data) => {
  if (!data || typeof data !== 'object') {
    return [];
  }

  return Object.entries(data)
    .filter(([key]) => !BODY_RESERVED_KEYS.has(key))
    .map(([key, value]) => ({
      key,
      value:
        typeof value === 'object' && value !== null
          ? JSON.stringify(value, null, 2)
          : String(value),
    }));
};

export const formatSystemField = (system, t) => {
  if (system == null) {
    return null;
  }
  if (typeof system === 'string') {
    return system.trim() ? system : null;
  }
  if (Array.isArray(system)) {
    const parts = formatContentParts(system, t);
    return parts;
  }
  return JSON.stringify(system, null, 2);
};
