import React, { PureComponent } from 'react'
import { findDOMNode } from 'react-dom'
import PropTypes from 'prop-types'
import Selection from './Selection'
import DesignComponent from '../../DesignComponent'
import './DesignItem.css'

class DesignItem extends PureComponent {
  constructor (props) {
    super(props)

    this.state = {
      resizing: null
    }

    this.originalResizeCoord = null
    this.prevPosition = null
    this.minResizeLeft = null
    this.minResizeRight = null
    this.maxResizeLeft = null
    this.maxResizeRight = null

    this.getIndex = this.getIndex.bind(this)
    this.setItemNode = this.setItemNode.bind(this)
    this.setSelectionNode = this.setSelectionNode.bind(this)
    this.cloneComponent = this.cloneComponent.bind(this)
    this.removeComponentClone = this.removeComponentClone.bind(this)
    this.focusSelection = this.focusSelection.bind(this)
    this.handleClick = this.handleClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleResizeStart = this.handleResizeStart.bind(this)
    this.handleResize = this.handleResize.bind(this)
    this.handleResizeEnd = this.handleResizeEnd.bind(this)
    this.handleComponentDragStart = this.handleComponentDragStart.bind(this)
    this.handleComponentDragEnd = this.handleComponentDragEnd.bind(this)
  }

  componentDidMount () {
    this.focusSelection()

    this.initialDesignItemScroll = this.node.scrollTop
  }

  componentDidUpdate () {
    this.focusSelection()
  }

  getWidthInPercentage ({ numberOfCols, consumedCols }) {
    return 100 / (numberOfCols / consumedCols)
  }

  getIndex () {
    return this.props.getIndex(this.props.id)
  }

  setItemNode (el) {
    this.node = el
  }

  setSelectionNode (el) {
    this.selection = el
  }

  cloneComponent (componentNode) {
    let designItemDimensions = this.node.getBoundingClientRect()
    let { top, left, width, height } = componentNode.getBoundingClientRect()
    let componentClone = componentNode.cloneNode(true)

    this.componentReplacement.style.display = 'block'
    this.componentReplacement.style.top = `${top -  designItemDimensions.top}px`
    this.componentReplacement.style.left = `${left - designItemDimensions.left}px`
    this.componentReplacement.style.width = `${width}px`
    this.componentReplacement.style.height = `${height}px`

    componentClone.dataset.draggingPlaceholder = true

    this.componentClone = componentClone
    this.componentReplacement.appendChild(componentClone)
  }

  removeComponentClone () {
    this.componentReplacement.style.display = 'none'

    if (this.componentClone) {
      this.componentReplacement.removeChild(this.componentClone)
      this.componentClone = null
    }
  }

  focusSelection () {
    // in order for key events to work, the selection box must be focused
    if (this.selection) {
      findDOMNode(this.selection).focus()
    }
  }

  handleKeyDown (ev) {
    const { onComponentRemove, selection } = this.props

    ev.preventDefault()
    ev.stopPropagation()

    // when backspace or del key is pressed remove the component
    if ((ev.keyCode === 8 || ev.keyCode === 46) && onComponentRemove) {
      onComponentRemove({
        item: this.getIndex(),
        componentId: selection.component
      })
    }
  }

  handleClick (ev) {
    if (this.props.selection != null) {
      // stop progagation of click when the item is selected
      // this is necessary to prevent cleaning the selection
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  handleResizeStart (ev, direction) {
    let resizeLimits
    let position = 0
    const node = this.node

    this.originalResizeCoord = {
      x: ev.clientX,
      y: ev.clientY
    }

    this.prevPosition = null

    if (this.props.onResizeStart) {
      resizeLimits = this.props.onResizeStart({
        item: this.getIndex(),
        itemDimensions: node.getBoundingClientRect(),
        resize: {
          direction,
          position,
          prevPosition: this.prevPosition,
          x: ev.clientX,
          y: ev.clientY
        }
      })

      this.prevPosition = position

      resizeLimits = (resizeLimits == null) ? {
        minLeft: 0,
        minRight: 0
      } : {
        minLeft: 0,
        minRight: 0,
        ...resizeLimits
      }

      this.minResizeLeft = (resizeLimits.minLeft != null && resizeLimits.minLeft > 0) ? 0 : resizeLimits.minLeft
      this.minResizeRight = (resizeLimits.minRight != null && resizeLimits.minRight > 0) ? 0 : resizeLimits.minRight
      this.maxResizeLeft = resizeLimits.maxLeft
      this.maxResizeRight = resizeLimits.maxRight
    }

    this.setState({
      resizing: {
        direction,
        position
      }
    })
  }

  handleResize (ev, direction) {
    let previousResizingState = 'active'
    let resizingState
    let position
    let resizing

    if (this.state.resizing) {
      previousResizingState = this.state.resizing.state
    }

    if (direction === 'left') {
      position = this.originalResizeCoord.x - ev.clientX
    } else {
      position = ev.clientX - this.originalResizeCoord.x
    }

    // if for some reason the browser gives us the same position than the previous
    // then don't emit a event and don't update the selection
    if (position === this.prevPosition) {
      return
    }

    if (
      direction === 'left' &&
      this.minResizeLeft != null &&
      position <= 0 &&
      (this.minResizeLeft === 0 || position <= this.minResizeLeft)
    ) {
      position = this.minResizeLeft
    } else if (
      direction === 'right' &&
      this.minResizeRight != null &&
      position <= 0 &&
      (this.minResizeRight === 0 || position <= this.minResizeRight)
    ) {
      position = this.minResizeRight
    }

    if (direction === 'left') {
      if (this.maxResizeLeft != null && position > this.maxResizeLeft) {
        position = this.maxResizeLeft
      }
    } else {
      if (this.maxResizeRight != null && position > this.maxResizeRight) {
        position = this.maxResizeRight
      }
    }

    if (this.props.onResize) {
      resizingState = this.props.onResize({
        item: this.getIndex(),
        resize: {
          direction,
          position,
          prevPosition: this.prevPosition,
          minLeft: this.minResizeLeft,
          minRight: this.minResizeRight,
          maxLeft: this.maxResizeLeft,
          maxRight: this.maxResizeRight,
          x: ev.clientX,
          y: ev.clientY
        }
      })

      if (resizingState === false) {
        resizingState = 'invalid'
      } else if (resizingState === true) {
        resizingState = 'active'
      } else {
        resizingState = undefined
      }
    }

    this.prevPosition = position

    resizing = {
      direction,
      position
    }

    if (resizingState !== undefined) {
      resizing.state = resizingState
    } else {
      resizing.state = previousResizingState
    }

    this.setState({
      resizing
    })
  }

  handleResizeEnd (ev, direction) {
    ev.preventDefault();
    ev.stopPropagation();

    if (this.props.onResizeEnd) {
      this.props.onResizeEnd({
        item: this.getIndex(),
        resize: {
          direction,
          position: this.state.resizing.position,
          prevPosition: this.prevPosition,
          minLeft: this.minResizeLeft,
          minRight: this.minResizeRight,
          maxLeft: this.maxResizeLeft,
          maxRight: this.maxResizeRight,
          x: ev.clientX,
          y: ev.clientY
        }
      })
    }

    this.originalResizeCoord = null
    this.prevPosition = null
    this.minResizeLeft = null
    this.minResizeRight = null
    this.maxResizeLeft = null
    this.maxResizeRight = null

    this.setState({
      resizing: null
    })
  }

  handleComponentDragStart (componentInfo, componentNode) {
    this.cloneComponent(componentNode)

    if (this.props.onComponentDragStart) {
      return this.props.onComponentDragStart(componentInfo, componentNode)
    }

    return {}
  }

  handleComponentDragEnd () {
    this.removeComponentClone()

    if (this.props.onDragEndComponent) {
      return this.props.onDragEndComponent()
    }
  }

  render () {
    const {
      numberOfCols,
      layoutMode,
      leftSpace,
      space,
      selection,
      components,
      onComponentClick
    } = this.props

    const {
      resizing
    } = this.state

    let extraProps = {}
    let itemStyles = {}

    if (resizing) {
      itemStyles.opacity = 0.5
    }

    if (layoutMode === 'grid') {
      itemStyles.width = `${this.getWidthInPercentage({ numberOfCols, consumedCols: space })}%`

      if (leftSpace != null) {
        itemStyles.marginLeft = `${this.getWidthInPercentage({ numberOfCols, consumedCols: leftSpace })}%`
      }
    } else {
      itemStyles.width = `${space}px`

      if (leftSpace != null) {
        itemStyles.marginLeft = `${leftSpace}px`
      }
    }

    if (selection != null) {
      extraProps['data-selected'] = true
    }

    extraProps[`data-layout-${layoutMode}-mode`] = true

    return (
      <div
        ref={this.setItemNode}
        className="DesignItem"
        style={itemStyles}
        {...extraProps}
        onClick={this.handleClick}
      >
        {selection && (
          <Selection
            key="selection"
            ref={this.setSelectionNode}
            state={resizing ? resizing.state : undefined}
            left={resizing && resizing.direction === 'left' ? resizing.position : undefined}
            right={resizing && resizing.direction === 'right' ? resizing.position : undefined}
            onKeyDown={this.handleKeyDown}
            onResizeStart={this.handleResizeStart}
            onResize={this.handleResize}
            onResizeEnd={this.handleResizeEnd}
          />
        )}
        {components.map((component) => (
          <DesignComponent
            key={component.id}
            id={component.id}
            type={component.type}
            selected={selection && selection.component === component.id ? true : undefined}
            componentProps={component.props}
            onClick={onComponentClick}
            onDragStart={this.handleComponentDragStart}
            onDragEnd={this.handleComponentDragEnd}
          />
        ))}
        {/* placeholder for the DesignComponent replacement while dragging */}
        <div
          draggable="false"
          key="DesignComponent-replacement"
          ref={(el) => this.componentReplacement = el}
          style={{
            display: 'none',
            pointerEvents: 'none',
            position: 'absolute'
          }}
        />
      </div>
    )
  }
}

DesignItem.propTypes = {
  id: PropTypes.string,
  numberOfCols: PropTypes.number.isRequired,
  layoutMode: PropTypes.oneOf(['grid', 'fixed']).isRequired,
  leftSpace: PropTypes.number,
  space: PropTypes.number.isRequired,
  selection: PropTypes.object,
  components: PropTypes.array.isRequired,
  onComponentClick: PropTypes.func,
  onComponentDragStart: PropTypes.func,
  onComponentRemove: PropTypes.func,
  onResizeStart: PropTypes.func,
  onResize: PropTypes.func,
  onResizeEnd: PropTypes.func,
  getIndex: PropTypes.func.isRequired
}

export default DesignItem
