import React, { Component } from 'react'
import PropTypes from 'prop-types'
// (we disable the rule because eslint can recognize decorator usage in our setup)
// eslint-disable-next-line no-unused-vars
import { observer, inject, PropTypes as MobxPropTypes } from 'mobx-react'
import MobxDevTools, { configureDevtool } from 'mobx-react-devtools'
import jsreportClient from 'jsreport-browser-client-dist'

// full url
jsreportClient.serverUrl = window.location.href.indexOf('/designer') === -1 ? (
  window.location.href
) : window.location.href.substring(0, window.location.href.indexOf('/designer'))

configureDevtool({
  updatesEnabled: false,
  logsEnabled: false,
  logFilter: change => {
    // hiding some logs when dragging
    return !(
      (change.type === 'reaction' || change.type === 'scheduled-reaction') &&
      (change.object && change.object.name.indexOf('ComponentDragLayer') !== -1)
    )
  }
})

@inject((injected) => ({
  data: injected.dataInputStore.value ? injected.dataInputStore.value : undefined,
  computedFields: injected.dataInputStore.computedFields ? injected.dataInputStore.computedFields : undefined
}))
@observer
class DevTools extends Component {
  constructor (props) {
    super(props)

    this.state = {
      inspectDesignGroups: null,
      inspectDesignPayload: null
    }
  }

  getDesignPayload () {
    const { design, computedFields } = this.props

    let lastGroupWithContent
    let designGroupsToSend = []
    let designObject = design.toJS()
    let payload

    designObject.groups.forEach((group, idx) => {
      let topSpace

      if (group.items.length === 0) {
        return
      }

      // calculating topSpace between groups
      if (lastGroupWithContent != null) {
        topSpace = (idx - lastGroupWithContent) - 1
      } else {
        topSpace = idx
      }

      if (topSpace != null && topSpace > 0) {
        group.topSpace = topSpace
      }

      lastGroupWithContent = idx
      designGroupsToSend.push(group)
    })

    payload = {
      canvas: {
        baseWidth: designObject.baseWidth,
        numberOfCols: designObject.numberOfCols,
        defaultNumberOfRows: designObject.defaultNumberOfRows,
        rowHeight: designObject.rowHeight
      }
    }

    if (computedFields != null) {
      payload.computedFields = computedFields
    }

    payload.groups = designGroupsToSend

    return payload
  }

  onInspectPayloadClick () {
    this.setState({
      inspectDesignPayload: JSON.stringify(this.getDesignPayload(), null, 2)
    })
  }

  onPreviewClick (recipe) {
    jsreportClient.render('_blank', {
      template: {
        design: this.getDesignPayload(),
        recipe: recipe
      },
      data: this.props.data
    })
  }

  render () {
    const {
      inspectDesignGroups,
      inspectDesignPayload
    } = this.state

    const {
      numberOfCols,
      groups
    } = this.props.design

    return (
      <div style={{ position: 'absolute', top: '8px', right: '200px', zIndex: 100 }}>
        <b>CANVAS: {numberOfCols} x {groups.length}, TOTAL ROWS: {groups.length}</b>
        {' '}
        <button onClick={() => this.onInspectPayloadClick()}>Inspect Design payload</button>
        <button onClick={() => this.onPreviewClick('phantom-pdf')}>Preview pdf</button>
        <button onClick={() => this.onPreviewClick('html')}>Preview html</button>
        {
          inspectDesignGroups && (
            <div style={{ backgroundColor: 'yellow', padding: '8px', position: 'absolute', top: '22px', right: '360px', zIndex: 100 }}>
              <b>Design groups</b>
              <br />
              <button onClick={() => this.setState({ inspectDesignGroups: null })}>Close</button>
              <br />
              <textarea rows='25' cols='40' defaultValue={inspectDesignGroups} />
              <br />
              <button onClick={() => this.setState({ inspectDesignGroups: null })}>Close</button>
            </div>
          )
        }
        {
          inspectDesignPayload && (
            <div style={{ backgroundColor: 'yellow', padding: '8px', position: 'absolute', top: '22px', right: '70px', zIndex: 100 }}>
              <b>Design payload</b>
              <br />
              <button onClick={() => this.setState({ inspectDesignPayload: null })}>Close</button>
              <br />
              <textarea rows='25' cols='40' defaultValue={inspectDesignPayload} />
              <br />
              <button onClick={() => this.setState({ inspectDesignPayload: null })}>Close</button>
            </div>
          )
        }
        <MobxDevTools />
      </div>
    )
  }
}

DevTools.wrappedComponent.propTypes = {
  design: MobxPropTypes.observableObject.isRequired,
  computedFields: PropTypes.array,
  data: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.array
  ])
}

export default DevTools
