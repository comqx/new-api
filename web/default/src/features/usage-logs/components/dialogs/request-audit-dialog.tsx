/*
Copyright (C) 2023-2026 QuantumNous

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
import { useCallback, useEffect, useState } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/dialog'
import { JsonTree } from '@/components/json-tree'
import { getRelayAuditRecord } from '../../api'
import type { RelayAuditRecord } from '../../types'

interface RequestAuditDialogProps {
  requestId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin?: boolean
}

type ParsedContent =
  | { isJson: true; data: unknown; text: string }
  | { isJson: false; data: null; text: string }

// parseContent 尝试解析原始字符串为 JSON；成功时返回解析值供树形展示，
// 失败时回退为纯文本。text 始终为可复制的展示文本。
function parseContent(raw?: string): ParsedContent {
  if (!raw) return { isJson: false, data: null, text: '' }
  try {
    const data = JSON.parse(raw)
    return { isJson: true, data, text: JSON.stringify(data, null, 2) }
  } catch {
    return { isJson: false, data: null, text: raw }
  }
}

export function RequestAuditDialog({
  requestId,
  open,
  onOpenChange,
  isAdmin = true,
}: RequestAuditDialogProps) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<RelayAuditRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchRecord = useCallback(
    async (id: string) => {
      setIsLoading(true)
      setRecord(null)
      try {
        const result = await getRelayAuditRecord(id, isAdmin)
        if (result.success) {
          setRecord(result.data || null)
        } else {
          toast.error(result.message || t('Failed to fetch request content'))
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch request audit record:', error)
        toast.error(t('Failed to fetch request content'))
      } finally {
        setIsLoading(false)
      }
    },
    [t, isAdmin]
  )

  useEffect(() => {
    if (open && requestId) {
      fetchRecord(requestId)
    }
  }, [open, requestId, fetchRecord])

  const copy = useCallback(
    (value: string) => {
      navigator.clipboard
        .writeText(value)
        .then(() => toast.success(t('Copied to clipboard')))
        .catch(() => toast.error(t('Failed to copy')))
    },
    [t]
  )

  const body = parseContent(record?.body)
  const headers = parseContent(record?.headers)

  const CodeBlock = ({
    label,
    content,
  }: {
    label: string
    content: ParsedContent
  }) => (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between'>
        <Label className='text-muted-foreground text-xs'>{label}</Label>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-6 gap-1 px-2 text-xs'
          onClick={() => copy(content.text)}
          disabled={!content.text}
        >
          <Copy className='size-3' />
          {t('Copy')}
        </Button>
      </div>
      {content.isJson ? (
        <JsonTree data={content.data as never} className='max-h-80' />
      ) : (
        <pre className='bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs leading-relaxed break-all whitespace-pre-wrap'>
          {content.text || t('Empty')}
        </pre>
      )}
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Request Content')}
      description={t(
        'View the stored request body and headers for this request. Image and audio content is omitted; secret headers are not stored.'
      )}
      contentClassName='sm:max-w-2xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      {isLoading ? (
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='text-muted-foreground size-6 animate-spin' />
        </div>
      ) : record ? (
        <div className='space-y-4 py-2'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-1.5'>
              <Label className='text-muted-foreground text-xs'>
                {t('Username')}
              </Label>
              <div className='text-sm font-semibold'>
                {record.username || record.user_id}
              </div>
            </div>
            <div className='space-y-1.5'>
              <Label className='text-muted-foreground text-xs'>
                {t('Model')}
              </Label>
              <div className='text-sm font-semibold'>
                {record.model_name || '-'}
              </div>
            </div>
          </div>

          {record.truncated && (
            <div className='rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400'>
              {t('Content was truncated to the configured maximum size.')}
            </div>
          )}

          <CodeBlock label={t('Request Body')} content={body} />
          <CodeBlock label={t('Request Headers')} content={headers} />
        </div>
      ) : (
        <div className='text-muted-foreground py-8 text-center text-sm'>
          {t('No request content available')}
        </div>
      )}
    </Dialog>
  )
}
