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

import React from 'react';
import { Tag, Typography } from '@douyinfe/semi-ui';
import {
  formatContentParts,
  formatSystemField,
  formatToolCalls,
  getOtherRequestParams,
  getRoleLabelKey,
  summarizeTools,
} from './parseChatRequestBody';

const { Text } = Typography;

const roleTagColor = {
  system: 'purple',
  user: 'blue',
  assistant: 'green',
  tool: 'orange',
  developer: 'cyan',
};

const contentTextStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily:
    'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.6,
};

const sectionStyle = {
  borderRadius: 8,
  border: '1px solid var(--semi-color-border)',
  background: 'var(--semi-color-fill-0)',
  padding: '10px 12px',
};

const ContentParts = ({ parts }) => {
  if (!parts || parts.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {parts.map((part, index) => {
        if (part.kind === 'divider') {
          return (
            <div
              key={`divider-${index}`}
              style={{
                borderTop: '1px dashed var(--semi-color-border)',
                margin: '2px 0',
              }}
            />
          );
        }

        if (part.kind === 'section') {
          return (
            <div key={`section-${index}`} style={sectionStyle}>
              <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 6 }}>
                {part.title}
              </Text>
              <ContentParts parts={part.parts} />
            </div>
          );
        }

        if (part.kind === 'omitted') {
          return (
            <Text key={`omitted-${index}`} type='warning' size='small'>
              [{part.text}]
            </Text>
          );
        }

        if (part.kind === 'empty') {
          return (
            <Text key={`empty-${index}`} type='tertiary' size='small'>
              {part.text}
            </Text>
          );
        }

        return (
          <pre key={`text-${index}`} style={contentTextStyle}>
            {part.text}
          </pre>
        );
      })}
    </div>
  );
};

const MessageCard = ({ message, index, t }) => {
  const role = message?.role || 'unknown';
  const contentParts = formatContentParts(message?.content, t);
  const toolCalls = formatToolCalls(message?.tool_calls, t);

  return (
    <div style={sectionStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Tag color={roleTagColor[role] || 'grey'} size='small'>
          {t(getRoleLabelKey(role))}
        </Tag>
        <Text type='tertiary' size='small'>
          {t('消息')} #{index + 1}
        </Text>
        {message?.name ? (
          <Text type='tertiary' size='small'>
            {t('名称')}: {message.name}
          </Text>
        ) : null}
        {message?.tool_call_id ? (
          <Text type='tertiary' size='small'>
            tool_call_id: {message.tool_call_id}
          </Text>
        ) : null}
      </div>

      <ContentParts parts={contentParts} />

      {toolCalls.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text type='tertiary' size='small'>
            {t('工具调用')} ({toolCalls.length})
          </Text>
          {toolCalls.map((call) => (
            <div
              key={`${call.id || call.index}-${call.name}`}
              style={{
                borderRadius: 6,
                border: '1px solid var(--semi-color-border)',
                background: 'var(--semi-color-bg-1)',
                padding: '8px 10px',
              }}
            >
              <Text strong size='small' style={{ display: 'block' }}>
                {call.index}. {call.name}
              </Text>
              {call.id ? (
                <Text type='tertiary' size='small' style={{ display: 'block', marginTop: 2 }}>
                  ID: {call.id}
                </Text>
              ) : null}
              {call.arguments ? (
                <pre style={{ ...contentTextStyle, marginTop: 6 }}>
                  {call.arguments}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const StructuredRequestBody = ({ data, t, maxHeight = 360 }) => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const systemField = formatSystemField(data.system, t);
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const tools = summarizeTools(data.tools);
  const otherParams = getOtherRequestParams(data);
  const prompt =
    typeof data.prompt === 'string' && data.prompt.trim() ? data.prompt : '';

  return (
    <div
      style={{
        maxHeight,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '2px 0',
      }}
    >
      {data.model ? (
        <div>
          <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 4 }}>
            {t('模型')}
          </Text>
          <Text strong>{data.model}</Text>
        </div>
      ) : null}

      {systemField ? (
        <div>
          <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 6 }}>
            {t('系统提示词')}
          </Text>
          <div style={sectionStyle}>
            {Array.isArray(systemField) ? (
              <ContentParts parts={systemField} />
            ) : (
              <pre style={contentTextStyle}>{systemField}</pre>
            )}
          </div>
        </div>
      ) : null}

      {prompt ? (
        <div>
          <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 6 }}>
            {t('Prompt')}
          </Text>
          <div style={sectionStyle}>
            <pre style={contentTextStyle}>{prompt}</pre>
          </div>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div>
          <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 6 }}>
            {t('消息')} ({messages.length})
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((message, index) => (
              <MessageCard
                key={`${message?.role || 'msg'}-${index}`}
                message={message}
                index={index}
                t={t}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div>
          <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 6 }}>
            {t('工具定义')} ({tools.length})
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tools.map((tool) => (
              <div key={`tool-${tool.index}-${tool.name}`} style={sectionStyle}>
                <Text strong size='small' style={{ display: 'block' }}>
                  {tool.index}. {tool.name || t('未命名工具')}
                </Text>
                {tool.description ? (
                  <Text
                    type='secondary'
                    size='small'
                    style={{ display: 'block', marginTop: 4, lineHeight: 1.5 }}
                  >
                    {tool.description}
                  </Text>
                ) : null}
                {tool.parameters ? (
                  <pre style={{ ...contentTextStyle, marginTop: 8 }}>
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {otherParams.length > 0 ? (
        <div>
          <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 6 }}>
            {t('其他参数')}
          </Text>
          <div style={sectionStyle}>
            {otherParams.map((item) => (
              <div key={item.key} style={{ marginBottom: 8 }}>
                <Text type='tertiary' size='small' style={{ display: 'block', marginBottom: 2 }}>
                  {item.key}
                </Text>
                <pre style={contentTextStyle}>{item.value}</pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StructuredRequestBody;
