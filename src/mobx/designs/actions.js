import pick from 'lodash/pick'
import { action } from 'mobx'
import { store as editorStore } from '../editor'
import store, {
  Design,
  DesignItem,
  DesignComponent
} from './store'
import { ComponentDragTypes } from '../../Constants'
import {
  generateGroup,
  // generateFragmentInstance,
  findProjectedFilledAreaInGrid,
  findProjectedFilledAreaInGridWhenResizing,
  findMarkedArea,
  addComponentToDesign,
  addFragmentInstanceToComponentInDesign,
  removeComponentInDesign,
  updateComponentInDesign,
  updateItemSize
} from './helpers'

const ACTION = 'DESIGNS'

export const add = action(`${ACTION}_ADD`, ({ config, definition }) => {
  let newDesign
  let elementRecords = []

  let designDefaults = {
    baseWidth: editorStore.defaultBaseWidth,
    defaultNumberOfRows: editorStore.defaultNumberOfRows,
    numberOfCols: editorStore.defaultNumberOfCols,
    rowHeight: editorStore.defaultRowHeight,
    groups: [],
    selection: null,
    highlightedArea: null
  }

  if (config) {
    designDefaults = Object.assign(designDefaults, pick(
      config,
      ['baseWidth', 'defaultNumberOfRows', 'numberOfCols', 'rowHeight']
    ))
  }

  if (definition) {
    designDefaults = Object.assign(designDefaults, pick(
      definition,
      ['baseWidth', 'defaultNumberOfRows', 'numberOfCols', 'rowHeight']
    ))
  }

  if (definition && Array.isArray(definition.groups)) {
    let originalGroups = []
    let lastGroupIndex = null

    definition.groups.forEach((group) => {
      let currentGroupIndex
      let lastItemEnd = null

      if (group.topSpace != null) {
        for (let i = 1; i <= group.topSpace; i++) {
          let newEmptyGroup = generateGroup({
            layoutMode: 'grid'
          })

          elementRecords.push([newEmptyGroup, lastGroupIndex == null ? i - 1 : lastGroupIndex + i])
          originalGroups.push(newEmptyGroup)
        }

        lastGroupIndex += group.topSpace
        lastGroupIndex -= 1
      }

      const newGroup = generateGroup({
        layoutMode: group.layoutMode
        // NOTE: for now we intentionally don't add "topSpace"
        // to the group because this field is not being kept in sync
        // while using the designer, it is calculted in the end when the design
        // json is exported, so it does not makes sense to have it in the store for now
      })

      currentGroupIndex = lastGroupIndex == null ? 0 : lastGroupIndex + 1

      newGroup.items = group.items.map((item, itemIndex) => {
        let newItem
        let start = lastItemEnd == null ? 0 : lastItemEnd

        start = start + item.leftSpace == null ? 0 : item.leftSpace

        let itemDefaults = {
          leftSpace: item.leftSpace,
          start,
          end: (start + item.space) - 1,
          minSpace: item.minSpace,
          space: item.space,
          parent: newGroup
        }

        lastItemEnd = itemDefaults.end

        newItem = new DesignItem(itemDefaults)

        elementRecords.push([newItem, itemIndex])

        newItem.components = item.components.map((comp, compIndex) => {
          let newComp = new DesignComponent({
            type: comp.type,
            props: comp.props,
            bindings: comp.bindings,
            expressions: comp.expressions,
            template: comp.template,
            parent: newItem
          })

          elementRecords.push([newComp, compIndex, {
            groupId: newGroup.id,
            groupIndex: currentGroupIndex,
            itemId: newItem.id,
            itemIndex
          }])

          return newComp
        })

        return newItem
      })

      elementRecords.push([newGroup, currentGroupIndex])
      lastGroupIndex += 1

      originalGroups.push(newGroup)
    })

    // filling rest to match default number of rows in design
    if (designDefaults.defaultNumberOfRows - 1 > originalGroups.length) {
      const rest = (designDefaults.defaultNumberOfRows - 1) - originalGroups.length

      for (let i = 1; i <= rest; i++) {
        const newGroup = generateGroup({
          layoutMode: 'grid'
        })

        elementRecords.push([newGroup, lastGroupIndex == null ? 0 : lastGroupIndex + 1])
        lastGroupIndex += 1

        originalGroups.push(newGroup)
      }
    }

    const placeholderGroup = generateGroup({
      layoutMode: 'grid',
      placeholder: true
    })

    elementRecords.push([placeholderGroup, lastGroupIndex == null ? 0 : lastGroupIndex + 1])
    lastGroupIndex += 1

    originalGroups.push(placeholderGroup)

    designDefaults.groups = originalGroups
  } else {
    for (let i = 0, max = designDefaults.defaultNumberOfRows - 1; i <= max; i++) {
      let groupDefaults = {
        layoutMode: editorStore.defaultLayoutMode
      }

      let newGroup

      // last group is placeholder
      if (i === max) {
        groupDefaults.placeholder = true
      }

      newGroup = generateGroup(groupDefaults)
      elementRecords.push([newGroup, i])

      designDefaults.groups.push(newGroup)
    }
  }

  newDesign = new Design(designDefaults)

  elementRecords.forEach((item) => {
    let [ el, index, extra ] = item

    if (extra) {
      newDesign.canvasRegistry.set(el.id, {
        index,
        element: el,
        ...extra
      })
    } else {
      newDesign.canvasRegistry.set(el.id, {
        index,
        element: el
      })
    }
  })

  store.designs.set(newDesign.id, newDesign)
})

export const update = action(`${ACTION}_UPDATE`, (designId, changes) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  // TODO: check here to only update observable properties?
  Object.keys(changes).forEach((key) => { design[key] = changes[key] })
})

export const updateElement = action(`${ACTION}_UPDATE_ELEMENT`, (designId, elementId, changes) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  let element = design.canvasRegistry.get(elementId)

  if (!element) {
    return
  }

  element = element.element

  // TODO: check here to only update observable properties?
  Object.keys(changes).forEach((key) => { element[key] = changes[key] })
})

export const clearSelection = action(`${ACTION}_CLEAR_SELECTION`, (designId) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  if (design.selection == null) {
    return
  }

  design.selection.forEach((elementId) => {
    if (!design.canvasRegistry.has(elementId)) {
      return
    }

    design.canvasRegistry.get(elementId).element.selected = false
  })

  design.selection = null
})

export const setSelection = action(`${ACTION}_SET_SELECTION`, (designId, componentId) => {
  const design = store.designs.get(designId)
  let component
  let currentElement
  let newSelection

  if (!design) {
    return
  }

  component = design.canvasRegistry.get(componentId)

  if (component) {
    component = component.element
  }

  if (!component) {
    return
  }

  clearSelection(design.id)

  currentElement = component
  newSelection = []

  while (currentElement != null) {
    if (
      currentElement.elementType === 'group' ||
      currentElement.elementType === 'item' ||
      currentElement.elementType === 'component' ||
      (currentElement.elementType === 'fragment' &&
      currentElement.mode === 'inline')
    ) {
      currentElement.selected = true
      newSelection.unshift(currentElement.id)
    }

    currentElement = currentElement.parent
  }

  design.selection = newSelection
})

export const highlightArea = action(`${ACTION}_HIGHLIGHT_AREA`, (designId, highlightedArea) => {
  const design = store.designs.get(designId)

  if (!design || highlightedArea == null) {
    return
  }

  design.highlightedArea = highlightedArea
})

export const highlightAreaFromDrag = action(`${ACTION}_HIGHLIGHT_AREA_FROM_DRAG`, (designId, dragPayload) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  const {
    dragType,
    draggedEl,
    targetCanvas,
    initialClientOffset,
    initialSourceClientOffset,
    clientOffset
  } = dragPayload

  const { x: cursorOffsetX } = clientOffset
  const targetElementType = targetCanvas.elementType

  let highlightedArea
  let markedArea
  let markTargetIsBlock = false
  let markTargetDimensions
  let markTargetId
  let markMoveType

  if (targetElementType === 'fragment') {
    const instanceDimensions = targetCanvas.instanceDimensions

    highlightedArea = {
      filled: true,
      conflict: false
    }

    highlightedArea.contextBox = {
      top: instanceDimensions.top,
      left: instanceDimensions.left,
      width: instanceDimensions.width,
      height: instanceDimensions.height
    }

    if (targetCanvas.componentBehind != null) {
      markTargetDimensions = targetCanvas.componentBehind.dimensions
      markTargetId = targetCanvas.componentBehind.id
    } else {
      // when no component, make the mark a block target
      markTargetIsBlock = true
      // when no component, make the mark always after
      markMoveType = 'after'
      markTargetId = targetCanvas.instance
      markTargetDimensions = instanceDimensions
    }

    markedArea = findMarkedArea({
      design,
      referencePoint: clientOffset,
      moveType: markMoveType,
      originElementId: dragType === ComponentDragTypes.COMPONENT ? (
        draggedEl.id
      ) : undefined,
      targetDimensions: markTargetDimensions,
      targetIsBlock: markTargetIsBlock,
      targetType: 'fragment',
      targetId: markTargetId
    })

    if (markedArea) {
      highlightedArea.mark = markedArea
    }
  } else {
    const { numberOfCols, colWidth } = design
    const { height, top, left } = targetCanvas.groupDimensions
    const targetOnItem = targetCanvas.item != null
    let noConflictItem
    let originColIndex
    let colInCursor = cursorOffsetX - left

    let targetColInfo = {
      height,
      top
    }

    if (draggedEl.consumedCols === 1) {
      // when only 1 col will be consumed start col should be
      // based on cursor position for the best experience
      originColIndex = cursorOffsetX - left
    } else if (draggedEl.pointerPreviewPosition != null) {
      // when pointer position has been defined in the preview
      // start col should be based on the left corner
      originColIndex = (cursorOffsetX - draggedEl.pointerPreviewPosition.x) - left
    } else {
      // when pointer position has been not defined in the preview
      // get pointer position and then start col should be based on the left corner
      originColIndex = (cursorOffsetX - (initialClientOffset.x - initialSourceClientOffset.x)) - left
    }

    originColIndex = Math.floor(originColIndex / colWidth)
    colInCursor = Math.floor(colInCursor / colWidth)

    if (colInCursor < 0) {
      colInCursor = 0
    } else if (colInCursor > numberOfCols - 1) {
      colInCursor = numberOfCols - 1
    }

    if (originColIndex < 0) {
      targetColInfo.startOffset = Math.abs(originColIndex)
      targetColInfo.index = 0
    } else if (originColIndex > numberOfCols - 1) {
      targetColInfo.index = numberOfCols - 1
    } else {
      targetColInfo.index = originColIndex
    }

    targetColInfo.cursorIndex = colInCursor
    targetColInfo.left = left + (targetColInfo.index * colWidth)

    if (
      dragType === ComponentDragTypes.COMPONENT &&
      draggedEl.canvas.group === targetCanvas.group
    ) {
      const originItem = design.canvasRegistry.get(draggedEl.canvas.item).element

      // only have no conflict if the origin item has
      // only 1 component, these allows moving an item if it only
      // has 1 component, when the item has more than one it correctly
      // represent space conflicts if any
      if (originItem.components.length <= 1) {
        noConflictItem = draggedEl.canvas.item
      }
    }

    highlightedArea = findProjectedFilledAreaInGrid({
      design,
      targetGroup: targetCanvas.group,
      targetColInfo,
      colsToConsume: draggedEl.consumedCols,
      noConflictItem
    })

    if (targetOnItem) {
      let targetItem = design.canvasRegistry.get(targetCanvas.item).element

      highlightedArea.contextBox = {
        top: highlightedArea.areaBox.top,
        left: left + (targetItem.start * colWidth),
        width: ((targetItem.end - targetItem.start) + 1) * colWidth,
        height: highlightedArea.areaBox.height
      }

      if (targetCanvas.componentBehind != null) {
        markTargetDimensions = targetCanvas.componentBehind.dimensions
        markTargetId = targetCanvas.componentBehind.id
      } else {
        // when no component, make the mark a block target
        markTargetIsBlock = true
        // when no component, make the mark always after
        markMoveType = 'after'
        markTargetId = targetItem.id
        markTargetDimensions = document.getElementById(targetItem.id).getBoundingClientRect()
      }

      markedArea = findMarkedArea({
        design,
        referencePoint: clientOffset,
        moveType: markMoveType,
        originElementId: dragType === ComponentDragTypes.COMPONENT ? (
          draggedEl.id
        ) : undefined,
        targetDimensions: markTargetDimensions,
        targetIsBlock: markTargetIsBlock,
        targetType: 'component',
        targetId: markTargetId
      })

      if (markedArea) {
        highlightedArea.mark = markedArea
      }

      // don't show element filled area, just the context
      delete highlightedArea.areaBox
    } else {
      highlightedArea.contextBox = null
    }
  }

  let currentDropHighlightElement

  if (targetElementType === 'fragment') {
    currentDropHighlightElement = design.canvasRegistry.get(targetCanvas.fragment).element
  } else {
    currentDropHighlightElement = design.canvasRegistry.get(targetCanvas.group).element
  }

  if (design.currentDropHighlightElementId != null) {
    const prevDropHighlightElement = design.canvasRegistry.get(design.currentDropHighlightElementId).element
    prevDropHighlightElement.dropHighlight = false
  }

  currentDropHighlightElement.dropHighlight = true

  design.currentDropHighlightElementId = currentDropHighlightElement.id

  highlightArea(design.id, highlightedArea)
})

export const clearHighlightArea = action(`${ACTION}_CLEAR_HIGHLIGHT_AREA`, (designId) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  if (design.highlightedArea != null) {
    design.highlightedArea = null
  }

  if (design.currentDropHighlightElementId != null) {
    const dropHighlightElement = design.canvasRegistry.get(design.currentDropHighlightElementId).element

    dropHighlightElement.dropHighlight = false
    design.currentDropHighlightElementId = null
  }
})

export const addComponent = action(`${ACTION}_ADD_COMPONENT`, (designId, payload) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  const { component, componentSize, targetArea } = payload

  let result = addComponentToDesign({
    design,
    component,
    componentSize,
    targetArea
  })

  return {
    newComponent: result.newComponent
  }
})

export const addOrRemoveFragmentInstanceInComponent = action(`${ACTION}_ADD_OR_REMOVE_FRAGMENT_IN_COMPONENT`, (designId, fragmentsIds, fragmentsCollectionToProcess) => {
  const design = store.designs.get(designId)
  let staleInstances = []

  if (!design) {
    return staleInstances
  }

  if (fragmentsIds.length === 0) {
    return staleInstances
  }

  fragmentsIds.forEach((fragId) => {
    let currentFragment = design.canvasRegistry.get(fragId)

    if (!currentFragment) {
      return
    }

    currentFragment = currentFragment.element

    let newFragment = fragmentsCollectionToProcess[currentFragment.name]

    if (currentFragment.instances.length === 0) {
      let instancesToAdd = []

      if (newFragment != null) {
        instancesToAdd = newFragment.instances
      }

      addFragmentInstanceToComponentInDesign({
        design,
        fragment: currentFragment,
        instance: instancesToAdd
      })
    } else {
      let instancesToRemoveCount

      if (!newFragment) {
        instancesToRemoveCount = currentFragment.instances.length
      } else {
        instancesToRemoveCount = currentFragment.instances.length - newFragment.instances.length
      }

      if (instancesToRemoveCount > 0) {
        // removing instances
        currentFragment.instances.splice(
          currentFragment.instances.length - instancesToRemoveCount,
          instancesToRemoveCount
        )
      }

      if (instancesToRemoveCount === currentFragment.instances.length) {
        staleInstances = currentFragment.instances.map((instance) => ({
          type: currentFragment.type,
          id: instance.id
        }))
      } else {
        newFragment.instances.forEach((newInstance, newInstanceIndex) => {
          const currentFragmentInstance = currentFragment.instances[newInstanceIndex]

          if (currentFragmentInstance != null) {
            // update existing instance
            const originalTag = currentFragmentInstance.tag

            currentFragmentInstance.tag = newInstance.tag
            currentFragmentInstance.style = newInstance.style

            if (currentFragment.mode === 'inline') {
              const originalSketch = currentFragmentInstance.sketch

              currentFragmentInstance.sketch = newInstance.sketch

              // update template when something in sketch or tag has changed
              if (
                `${newInstance.tag}/${newInstance.sketch}` !== `${originalTag}/${originalSketch}`
              ) {
                currentFragmentInstance.template = newInstance.template
              }
            }

            if (newInstance.tag !== originalTag) {
              staleInstances.push({
                type: currentFragment.type,
                id: currentFragmentInstance.id
              })
            }
          } else {
            // add new fragment instance
            addFragmentInstanceToComponentInDesign({
              design,
              fragment: currentFragment,
              instance: newInstance
            })
          }
        })
      }
    }
  })

  return staleInstances
})

export const removeComponent = action(`${ACTION}_REMOVE_COMPONENT`, (designId, componentId, opts = {}) => {
  const design = store.designs.get(designId)
  let options = Object.assign({}, { select: false }, opts)

  if (!design) {
    return
  }

  const {
    prevComponent,
    nextComponent
  } = removeComponentInDesign({ design, componentId })

  // clear selection if removed component is in it
  if (Array.isArray(design.selection) && design.selection.indexOf(componentId) !== -1) {
    clearSelection(design.id)
  }

  if (options.select && prevComponent) {
    setSelection(design.id, prevComponent.id)
  } else if (options.select && nextComponent) {
    setSelection(design.id, nextComponent.id)
  }
})

export const addOrRemoveComponentFromDrag = action(`${ACTION}_ADD_OR_REMOVE_COMPONENT_FROM_DRAG`, (designId, dragPayload, opts = {}) => {
  const design = store.designs.get(designId)
  let options = Object.assign({}, { select: false }, opts)

  if (!design) {
    return
  }

  const {
    dragType,
    draggedEl,
    targetCanvas
  } = dragPayload

  let componentToProcess

  if (dragType === ComponentDragTypes.COMPONENT) {
    componentToProcess = (
      design.canvasRegistry.get(draggedEl.canvas.component).element.toJS(true)
    )

    removeComponent(design.id, componentToProcess.id, {
      select: false
    })
  } else {
    componentToProcess = {
      type: draggedEl.name,
      props: draggedEl.props,
      fragments: draggedEl.fragments
    }
  }

  let targetArea = {
    ...targetCanvas
  }

  if (targetCanvas.elementType !== 'fragment') {
    // always have a minSpace of 1
    targetArea.minSpace = 1
  }

  const {
    newComponent
  } = addComponent(design.id, {
    component: componentToProcess,
    componentSize: draggedEl.size,
    targetArea
  })

  if (options.select) {
    setSelection(design.id, newComponent.id)
  }
})

export const startResizeElement = action(`${ACTION}_START_RESIZE_ELEMENT`, (designId, elementId, payload) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  let element = design.canvasRegistry.get(elementId)

  if (!element) {
    return
  }

  element = element.element

  let {
    direction,
    x,
    y,
    containerDimensions,
    elementDimensions
  } = payload

  const { colWidth } = design

  let resizing = {}
  let limits = {}
  let highlightedArea
  let group = element.parent

  resizing = {
    direction,
    originalCoord: { x, y },
    position: 0
  }

  limits.maxLeft = Math.round(elementDimensions.left - containerDimensions.left)
  limits.maxRight = Math.round(containerDimensions.right - elementDimensions.right)

  if (element.space !== element.minSpace) {
    let min = Math.abs(element.space - element.minSpace)

    if (group.layoutMode === 'grid') {
      min = min * colWidth
    }

    min = Math.round(min) * -1

    limits.minLeft = min

    if (limits.minLeft != null && limits.minLeft > 0) {
      limits.minLeft = 0
    }

    limits.minRight = min

    if (limits.minRight != null && limits.minRight > 0) {
      limits.minRight = 0
    }
  } else {
    limits.minLeft = 0
    limits.minRight = 0
  }

  resizing.limits = limits

  highlightedArea = findProjectedFilledAreaInGrid({
    design,
    targetGroup: group.id,
    targetColInfo: {
      height: elementDimensions.height,
      top: elementDimensions.top,
      left: elementDimensions.left,
      index: element.start
    },
    colsToConsume: (element.end - element.start) + 1
  })

  highlightedArea.conflict = false

  resizing.baseHighlightedArea = highlightedArea
  resizing.highlightedArea = highlightedArea

  highlightArea(design.id, highlightedArea)

  design.isResizing = true

  element.resizing = resizing
})

export const resizeElement = action(`${ACTION}_RESIZE_ELEMENT`, (designId, elementId, payload) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  let element = design.canvasRegistry.get(elementId)

  if (!element) {
    return
  }

  element = element.element

  if (!element.isResizing) {
    return
  }

  let { direction, x } = payload
  let { resizing } = element
  let prevPosition = resizing.position
  let { minLeft, minRight, maxLeft, maxRight } = resizing.limits
  let previousResizingState = resizing.state || 'active'
  let position
  let newResizing

  if (direction === 'left') {
    position = resizing.originalCoord.x - x
  } else {
    position = x - resizing.originalCoord.x
  }

  // if for some reason the position is the same than the previous
  // then don't update
  if (position === prevPosition) {
    return
  }

  // normalizing according to minLeft, minRight
  if (
    direction === 'left' &&
    minLeft != null &&
    position <= 0 &&
    (minLeft === 0 || position <= minLeft)
  ) {
    position = minLeft
  } else if (
    direction === 'right' &&
    minRight != null &&
    position <= 0 &&
    (minRight === 0 || position <= minRight)
  ) {
    position = minRight
  }

  // normalizing according to maxLeft, maxRight
  if (direction === 'left' && maxLeft != null && position > maxLeft) {
    position = maxLeft
  } else if (direction === 'right' && maxRight != null && position > maxRight) {
    position = maxRight
  }

  const highlightedAreaWhenResizing = findProjectedFilledAreaInGridWhenResizing({
    design,
    element,
    newResizePosition: position
  })

  newResizing = { ...resizing }

  newResizing.position = position

  design.isResizing = true

  if (!highlightedAreaWhenResizing) {
    newResizing.state = previousResizingState
    element.resizing = newResizing
    return
  }

  newResizing.highlightedArea = highlightedAreaWhenResizing

  if (!highlightedAreaWhenResizing.conflict) {
    newResizing.state = 'active'
  } else {
    newResizing.state = 'invalid'
  }

  highlightArea(design.id, highlightedAreaWhenResizing)

  element.resizing = newResizing
})

export const endResizeElement = action(`${ACTION}_END_RESIZE_ELEMENT`, (designId, elementId, payload) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  let element = design.canvasRegistry.get(elementId)

  if (!element) {
    return
  }

  element = element.element

  if (!element.isResizing) {
    return
  }

  let group = element.parent
  let layoutMode = group.layoutMode
  let { baseHighlightedArea, highlightedArea } = element.resizing

  const cleanup = () => {
    // we mark that resizing in designer has ended sometime later,
    // this is needed because we switch "isResizing" on the next interaction
    // "handleGeneralClickOrDragStart", and because some browsers has inconsistences
    // (like not firing click events after resizing) we need to ensure to have
    // "isResizing" in correct state
    setTimeout(() => {
      if (design.isResizing) {
        update(design.id, { isResizing: false })
      }
    }, 100)

    clearHighlightArea(design.id)

    element.resizing = null
  }

  if (
    (layoutMode === 'grid' &&
    baseHighlightedArea.start === highlightedArea.start &&
    baseHighlightedArea.end === highlightedArea.end) ||
    (layoutMode === 'fixed' &&
    baseHighlightedArea.areaBox.width === highlightedArea.areaBox.width) ||
    highlightedArea.conflict
  ) {
    return cleanup()
  }

  updateItemSize({
    design,
    item: element,
    start: element.resizing.highlightedArea.start,
    end: element.resizing.highlightedArea.end
  })

  cleanup()
})

export const updateComponent = action(`${ACTION}_UPDATE_COMPONENT`, (designId, componentId, changes) => {
  const design = store.designs.get(designId)

  if (!design) {
    return
  }

  let component = design.canvasRegistry.get(componentId)

  if (!component) {
    return
  }

  component = component.element

  const { props, bindings, expressions, template } = changes

  updateComponentInDesign({
    design,
    component,
    props,
    bindings,
    expressions,
    template
  })
})
