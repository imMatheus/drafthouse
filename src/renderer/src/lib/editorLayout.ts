import type { WorkspaceTab } from './workspaceTabs'

// ----------------------------------------------------------------------------
// Editor layout model (VS Code-style split editor groups).
//
// The editor area is a tree. Leaves are `EditorGroup`s — each owns its own tab
// strip, tab list and active tab. Internal nodes are `SplitNode`s that arrange
// their children either in a `row` (side by side) or a `column` (stacked),
// nested arbitrarily so groups can sit beside AND under each other.
// ----------------------------------------------------------------------------

export interface EditorGroup {
  id: string
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id'] | null
}

export type SplitDirection = 'row' | 'column'

export interface GroupNode {
  type: 'group'
  group: EditorGroup
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: SplitDirection
  children: LayoutNode[]
  // Fractional weights parallel to `children`, normalized to sum to 1.
  sizes: number[]
}

export type LayoutNode = GroupNode | SplitNode

// Where a dragged tab lands relative to a target group. Edge positions split
// the layout; `center` merges the tab into the target group.
export type DropPosition = 'left' | 'right' | 'up' | 'down' | 'center'

const MIN_SPLIT_FRACTION = 0.08

let idCounter = 0

function nextId(prefix: string): string {
  idCounter += 1
  // Date.now() is fine in the renderer; combined with a monotonic counter it's
  // unique within a session and round-trips through persistence unchanged.
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

export function createGroupId(): string {
  return nextId('group')
}

export function createSplitId(): string {
  return nextId('split')
}

export function createEditorGroup(tabs: WorkspaceTab[], activeTabId?: WorkspaceTab['id'] | null): EditorGroup {
  return {
    id: createGroupId(),
    tabs,
    activeTabId: activeTabId ?? tabs[tabs.length - 1]?.id ?? null
  }
}

export function groupNode(group: EditorGroup): GroupNode {
  return { type: 'group', group }
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export function collectGroups(node: LayoutNode): EditorGroup[] {
  if (node.type === 'group') return [node.group]
  return node.children.flatMap(collectGroups)
}

export function countGroups(node: LayoutNode): number {
  if (node.type === 'group') return 1
  return node.children.reduce((total, child) => total + countGroups(child), 0)
}

export function findGroup(node: LayoutNode, groupId: string): EditorGroup | null {
  if (node.type === 'group') return node.group.id === groupId ? node.group : null
  for (const child of node.children) {
    const found = findGroup(child, groupId)
    if (found) return found
  }
  return null
}

export function findGroupContainingTab(node: LayoutNode, tabId: WorkspaceTab['id']): EditorGroup | null {
  if (node.type === 'group') return node.group.tabs.some((tab) => tab.id === tabId) ? node.group : null
  for (const child of node.children) {
    const found = findGroupContainingTab(child, tabId)
    if (found) return found
  }
  return null
}

export function firstGroupId(node: LayoutNode): string {
  return collectGroups(node)[0]?.id ?? createGroupId()
}

// ----------------------------------------------------------------------------
// Group-level helpers
// ----------------------------------------------------------------------------

export function removeTabFromGroup(group: EditorGroup, tabId: WorkspaceTab['id']): EditorGroup {
  const index = group.tabs.findIndex((tab) => tab.id === tabId)
  if (index === -1) return group

  const tabs = group.tabs.filter((tab) => tab.id !== tabId)
  let activeTabId = group.activeTabId
  if (group.activeTabId === tabId) {
    activeTabId = tabs[index - 1]?.id ?? tabs[index]?.id ?? null
  }

  return { ...group, tabs, activeTabId }
}

export function addTabToGroup(group: EditorGroup, tab: WorkspaceTab, index?: number): EditorGroup {
  const exists = group.tabs.some((existing) => existing.id === tab.id)
  if (exists) {
    return { ...group, activeTabId: tab.id }
  }

  const tabs = [...group.tabs]
  if (index === undefined || index < 0 || index > tabs.length) {
    tabs.push(tab)
  } else {
    tabs.splice(index, 0, tab)
  }

  return { ...group, tabs, activeTabId: tab.id }
}

// ----------------------------------------------------------------------------
// Tree transforms (all pure — return a new tree)
// ----------------------------------------------------------------------------

export function replaceGroup(
  node: LayoutNode,
  groupId: string,
  update: (group: EditorGroup) => EditorGroup
): LayoutNode {
  if (node.type === 'group') {
    return node.group.id === groupId ? groupNode(update(node.group)) : node
  }
  return { ...node, children: node.children.map((child) => replaceGroup(child, groupId, update)) }
}

export function mapAllGroups(node: LayoutNode, update: (group: EditorGroup) => EditorGroup): LayoutNode {
  if (node.type === 'group') return groupNode(update(node.group))
  return { ...node, children: node.children.map((child) => mapAllGroups(child, update)) }
}

/**
 * Remove a group from the tree, collapsing now-redundant split nodes and
 * renormalizing sizes. Returns `null` if the whole tree would be empty.
 */
export function removeGroup(node: LayoutNode, groupId: string): LayoutNode | null {
  if (node.type === 'group') {
    return node.group.id === groupId ? null : node
  }

  const keptChildren: LayoutNode[] = []
  const keptSizes: number[] = []
  node.children.forEach((child, index) => {
    const next = removeGroup(child, groupId)
    if (next !== null) {
      keptChildren.push(next)
      keptSizes.push(node.sizes[index] ?? 1 / node.children.length)
    }
  })

  if (keptChildren.length === 0) return null
  if (keptChildren.length === 1) return keptChildren[0]

  const total = keptSizes.reduce((sum, value) => sum + value, 0)
  const sizes = total > 0 ? keptSizes.map((value) => value / total) : keptChildren.map(() => 1 / keptChildren.length)

  return { ...node, children: keptChildren, sizes }
}

/**
 * Insert `newGroup` adjacent to the target group. If the target's parent split
 * already runs along the desired axis, the new group slots in beside it and
 * shares the target's space; otherwise the target group is wrapped in a fresh
 * split node.
 */
export function splitWithGroup(
  node: LayoutNode,
  targetGroupId: string,
  position: Exclude<DropPosition, 'center'>,
  newGroup: EditorGroup
): LayoutNode {
  const direction: SplitDirection = position === 'left' || position === 'right' ? 'row' : 'column'
  const insertBefore = position === 'left' || position === 'up'

  function insert(current: LayoutNode): LayoutNode {
    if (current.type === 'group') {
      if (current.group.id !== targetGroupId) return current
      const children = insertBefore ? [groupNode(newGroup), current] : [current, groupNode(newGroup)]
      return { type: 'split', id: createSplitId(), direction, children, sizes: [0.5, 0.5] }
    }

    const targetIndex = current.children.findIndex(
      (child) => child.type === 'group' && child.group.id === targetGroupId
    )

    if (targetIndex !== -1 && current.direction === direction) {
      const children = [...current.children]
      const sizes = [...current.sizes]
      const insertIndex = insertBefore ? targetIndex : targetIndex + 1
      const half = (sizes[targetIndex] ?? 1 / children.length) / 2
      sizes[targetIndex] = half
      children.splice(insertIndex, 0, groupNode(newGroup))
      sizes.splice(insertIndex, 0, half)
      return { ...current, children, sizes }
    }

    return { ...current, children: current.children.map(insert) }
  }

  return flattenLayout(insert(node))
}

/**
 * Remove a tab from a group, collapsing the group out of the tree if it becomes
 * empty. Falls back to keeping the (empty) group when it's the only one left.
 */
export function removeTabAndCollapse(node: LayoutNode, groupId: string, tabId: WorkspaceTab['id']): LayoutNode {
  const group = findGroup(node, groupId)
  if (!group) return node

  const updated = removeTabFromGroup(group, tabId)
  if (updated.tabs.length === 0) {
    return removeGroup(node, groupId) ?? groupNode(updated)
  }
  return replaceGroup(node, groupId, () => updated)
}

export function setSplitSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'group') return node
  if (node.id === splitId && sizes.length === node.children.length) {
    const total = sizes.reduce((sum, value) => sum + value, 0)
    const normalized = total > 0 ? sizes.map((value) => value / total) : node.sizes
    return { ...node, sizes: normalized, children: node.children.map((child) => setSplitSizes(child, splitId, sizes)) }
  }
  return { ...node, children: node.children.map((child) => setSplitSizes(child, splitId, sizes)) }
}

/**
 * Merge nested splits that share the same direction into a single split,
 * distributing sizes proportionally. Keeps the tree tidy after structural edits
 * so resize handles behave predictably.
 */
export function flattenLayout(node: LayoutNode): LayoutNode {
  if (node.type === 'group') return node

  const children: LayoutNode[] = []
  const sizes: number[] = []

  node.children.forEach((child, index) => {
    const flat = flattenLayout(child)
    const slot = node.sizes[index] ?? 1 / node.children.length
    if (flat.type === 'split' && flat.direction === node.direction) {
      const childTotal = flat.sizes.reduce((sum, value) => sum + value, 0) || flat.children.length
      flat.children.forEach((grandChild, grandIndex) => {
        children.push(grandChild)
        sizes.push(slot * ((flat.sizes[grandIndex] ?? 1 / flat.children.length) / childTotal))
      })
    } else {
      children.push(flat)
      sizes.push(slot)
    }
  })

  if (children.length === 1) return children[0]

  const total = sizes.reduce((sum, value) => sum + value, 0)
  const normalized = total > 0 ? sizes.map((value) => value / total) : children.map(() => 1 / children.length)
  return { ...node, children, sizes: normalized }
}

export { MIN_SPLIT_FRACTION }
