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
import {
  Modal,
  Button,
  Spin,
  Empty,
  Banner,
  Typography,
  JsonViewer,
} from '@douyinfe/semi-ui';
import { IconCopy } from '@douyinfe/semi-icons';
import { copy, showError, showSuccess } from '../../../../helpers';

const { Text } = Typography;

// formatJson 尝试将原始字符串格式化为缩进 JSON，并返回是否为合法 JSON。
// 合法时用 JsonViewer 着色折叠展示，否则回退为纯文本。
const formatJson = (raw) => {
  if (!raw) {
    return { text: '', isJson: false };
  }
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
  } catch (e) {
    return { text: raw, isJson: false };
  }
};

const jsonViewerOptions = {
  readOnly: true,
  autoWrap: true,
  formatOptions: { tabSize: 2 },
};

// JsonViewer 固定高度会在内容较少时留下大量空白，按行数估算并限制上下界。
const getJsonViewerHeight = (text, maxHeight) => {
  if (!text) {
    return 72;
  }
  const lineCount = text.split('\n').length;
  const estimated = lineCount * 18 + 44;
  return Math.min(maxHeight, Math.max(72, estimated));
};

const RequestAuditModal = ({
  showRequestAuditModal,
  setShowRequestAuditModal,
  requestAuditRecord,
  requestAuditLoading,
  t,
}) => {
  const body = formatJson(requestAuditRecord?.body);
  const headers = formatJson(requestAuditRecord?.headers);

  const copyValue = async (value) => {
    if (!value) {
      return;
    }
    if (await copy(value)) {
      showSuccess(t('已复制到剪贴板'));
      return;
    }
    showError(t('复制失败'));
  };

  const renderCodeBlock = (label, { text, isJson }, maxHeight = 240) => (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <Text type='tertiary' size='small'>
          {label}
        </Text>
        <Button
          icon={<IconCopy />}
          theme='borderless'
          type='tertiary'
          size='small'
          onClick={() => copyValue(text)}
          disabled={!text}
        >
          {t('复制')}
        </Button>
      </div>
      {isJson ? (
        <div
          style={{
            borderRadius: 8,
            border: '1px solid var(--semi-color-border)',
            overflow: 'hidden',
          }}
        >
          <JsonViewer
            value={text}
            width='100%'
            height={getJsonViewerHeight(text, maxHeight)}
            showSearch
            options={jsonViewerOptions}
          />
        </div>
      ) : (
        <pre
          style={{
            margin: 0,
            maxHeight,
            overflow: 'auto',
            padding: 12,
            borderRadius: 8,
            background: 'var(--semi-color-fill-0)',
            border: '1px solid var(--semi-color-border)',
            fontFamily:
              'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {text || t('空')}
        </pre>
      )}
    </div>
  );

  return (
    <Modal
      title={t('请求内容')}
      visible={showRequestAuditModal}
      onCancel={() => setShowRequestAuditModal(false)}
      footer={null}
      centered
      closable
      maskClosable
      width={720}
    >
      <div style={{ padding: '8px 20px 12px' }}>
        <Text type='tertiary' size='small'>
          {t(
            '查看该请求存储的请求体和请求头。图片和音频内容已省略；敏感请求头不会被存储。',
          )}
        </Text>

        {requestAuditLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '32px 0',
            }}
          >
            <Spin size='large' />
          </div>
        ) : requestAuditRecord ? (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: 'flex',
                gap: 24,
                flexWrap: 'wrap',
                marginBottom: 4,
              }}
            >
              <div>
                <Text type='tertiary' size='small'>
                  {t('用户')}
                </Text>
                <div style={{ fontWeight: 600 }}>
                  {requestAuditRecord.username || requestAuditRecord.user_id}
                </div>
              </div>
              <div>
                <Text type='tertiary' size='small'>
                  {t('模型')}
                </Text>
                <div style={{ fontWeight: 600 }}>
                  {requestAuditRecord.model_name || '-'}
                </div>
              </div>
            </div>

            {requestAuditRecord.truncated && (
              <Banner
                type='warning'
                closeIcon={null}
                description={t('内容已截断至配置的最大大小。')}
                style={{ marginTop: 8 }}
              />
            )}

            {renderCodeBlock(t('请求体'), body, 280)}
            {renderCodeBlock(t('请求头'), headers, 180)}
          </div>
        ) : (
          <Empty
            description={t('暂无请求内容')}
            style={{ padding: '32px 0 8px' }}
          />
        )}
      </div>
    </Modal>
  );
};

export default RequestAuditModal;
