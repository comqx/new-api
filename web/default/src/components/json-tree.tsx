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
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

interface JsonNodeProps {
  value: JsonValue
  // nodeKey 是该节点在父对象/数组中的键名，根节点为 undefined。
  nodeKey?: string | number
  // 该节点缩进层级，用于左侧缩进。
  depth: number
  // 是否为父容器中的最后一个元素，决定行尾是否带逗号。
  isLast: boolean
  // 默认展开的最大层级，超过则折叠。
  defaultExpandDepth: number
}

function isExpandable(value: JsonValue): value is JsonValue[] | Record<string, JsonValue> {
  return value !== null && typeof value === 'object'
}

function ScalarValue({ value }: { value: Exclude<JsonValue, object> }) {
  if (typeof value === 'string') {
    return <span className='text-emerald-600 dark:text-emerald-400'>"{value}"</span>
  }
  if (typeof value === 'number') {
    return <span className='text-sky-600 dark:text-sky-400'>{value}</span>
  }
  if (typeof value === 'boolean') {
    return <span className='text-violet-600 dark:text-violet-400'>{String(value)}</span>
  }
  return <span className='text-muted-foreground'>null</span>
}

function NodeKey({ nodeKey }: { nodeKey: string | number | undefined }) {
  if (nodeKey === undefined) return null
  if (typeof nodeKey === 'number') return null // 数组下标不展示键名
  return (
    <>
      <span className='text-amber-600 dark:text-amber-400'>"{nodeKey}"</span>
      <span className='text-muted-foreground'>: </span>
    </>
  )
}

function JsonNode({
  value,
  nodeKey,
  depth,
  isLast,
  defaultExpandDepth,
}: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth)
  const indentStyle = { paddingLeft: `${depth * 14}px` }
  const comma = isLast ? '' : ','

  if (!isExpandable(value)) {
    return (
      <div style={indentStyle} className='whitespace-pre-wrap break-all'>
        <NodeKey nodeKey={nodeKey} />
        <ScalarValue value={value} />
        <span className='text-muted-foreground'>{comma}</span>
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const open = isArray ? '[' : '{'
  const close = isArray ? ']' : '}'
  const entries: [string | number, JsonValue][] = isArray
    ? value.map((v, i) => [i, v])
    : Object.entries(value)

  if (entries.length === 0) {
    return (
      <div style={indentStyle} className='break-all'>
        <NodeKey nodeKey={nodeKey} />
        <span className='text-muted-foreground'>
          {open}
          {close}
          {comma}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div
        style={indentStyle}
        className='hover:bg-muted/60 flex cursor-pointer select-none items-start rounded'
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground mt-[2px] size-3 shrink-0 transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <span className='break-all'>
          <NodeKey nodeKey={nodeKey} />
          <span className='text-muted-foreground'>{open}</span>
          {!expanded && (
            <span className='text-muted-foreground'>
              {' '}
              {isArray
                ? `${entries.length} items`
                : `${entries.length} keys`}{' '}
              {close}
              {comma}
            </span>
          )}
        </span>
      </div>
      {expanded && (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode
              key={k}
              value={v}
              nodeKey={k}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
          <div style={indentStyle} className='text-muted-foreground'>
            {close}
            {comma}
          </div>
        </>
      )}
    </div>
  )
}

interface JsonTreeProps {
  // 已解析的 JSON 值。
  data: JsonValue
  // 默认展开层级，0 表示根节点收起，默认展开前两层。
  defaultExpandDepth?: number
  className?: string
}

/**
 * JsonTree 以可折叠、语法着色的树形结构渲染 JSON 值，只读。
 * 适用于审计、调试等只需查看的场景。
 */
export function JsonTree({
  data,
  defaultExpandDepth = 2,
  className,
}: JsonTreeProps) {
  return (
    <div
      className={cn(
        'bg-muted overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed',
        className
      )}
    >
      <JsonNode
        value={data}
        depth={0}
        isLast
        defaultExpandDepth={defaultExpandDepth}
      />
    </div>
  )
}
