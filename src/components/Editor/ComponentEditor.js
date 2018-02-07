import React, { Component } from 'react'
import PropTypes from 'prop-types'
// (we disable the rule because eslint can recognize decorator usage in our setup)
// eslint-disable-next-line no-unused-vars
import { observer, inject, PropTypes as MobxPropTypes } from 'mobx-react'
import pick from 'lodash/pick'
import omit from 'lodash/omit'
import componentRegistry from '../../../shared/componentRegistry'
import expressionUtils from '../../../shared/expressionUtils'
import CommandButton from '../CommandButton'
import { defaultEditors, componentTypes, bindingEditor as bindingEditorConf } from '../../lib/configuration'
import TemplateEditor from './TemplateEditor'
import styles from './ComponentEditor.scss'

@inject((injected) => ({
  design: injected.editorStore.currentDesign,
  dataInput: injected.dataInputStore.value,
  dataFieldsMeta: injected.dataInputStore.fieldsMeta,
  getFullExpressionName: injected.dataInputStore.getFullExpressionName,
  getFullExpressionDisplayName: injected.dataInputStore.getFullExpressionDisplayName,
  updateComponent: injected.designsActions.updateComponent
}))
@observer
class ComponentEditor extends Component {
  constructor (props) {
    super(props)

    this.state = {
      templateEditor: null,
      selectedDataFieldEditor: null,
      composeTextEditor: null,
      bindingEditor: null
    }

    this.changesInterceptor = null

    this.connectToChangesInterceptor = this.connectToChangesInterceptor.bind(this)
    this.getDisplayName = this.getDisplayName.bind(this)
    this.getComponentIsFragment = this.getComponentIsFragment.bind(this)
    this.getMeta = this.getMeta.bind(this)
    this.getIcon = this.getIcon.bind(this)
    this.getValue = this.getValue.bind(this)
    this.getComponent = this.getComponent.bind(this)
    this.getPropMeta = this.getPropMeta.bind(this)
    this.getBindingMeta = this.getBindingMeta.bind(this)
    this.handleTemplateEditorOpen = this.handleTemplateEditorOpen.bind(this)
    this.handleBindingEditorOpen = this.handleBindingEditorOpen.bind(this)
    this.handleTemplateEditorSave = this.handleTemplateEditorSave.bind(this)
    this.handleBindingEditorSave = this.handleBindingEditorSave.bind(this)
    this.handleTemplateEditorClose = this.handleTemplateEditorClose.bind(this)
    this.handleBindingEditorClose = this.handleBindingEditorClose.bind(this)
    this.handleChanges = this.handleChanges.bind(this)
    this.handlePropChange = this.handlePropChange.bind(this)
    this.renderPropertiesEditor = this.renderPropertiesEditor.bind(this)
    this.renderBindingEditor = this.renderBindingEditor.bind(this)
  }

  componentWillUnmount () {
    this.changesInterceptor = null
  }

  connectToChangesInterceptor (changesInterceptor) {
    this.changesInterceptor = changesInterceptor
  }

  getComponentIsFragment () {
    const { design, id } = this.props

    return design.canvasRegistry.get(id).element.elementType === 'fragment'
  }

  getDisplayName () {
    const { type } = this.props

    return type
  }

  getPropertiesEditor (type) {
    let editorInfo

    if (type.indexOf('#') === -1) {
      editorInfo = componentTypes[type].propertiesEditor
    } else {
      editorInfo = defaultEditors.propertiesEditor
    }

    if (typeof editorInfo !== 'object') {
      return { editor: editorInfo, options: {} }
    }

    return editorInfo
  }

  getMeta () {
    const meta = componentRegistry.getComponentDefinition(this.props.type) || {}

    return omit(meta, ['module'])
  }

  getIcon () {
    const { design, id } = this.props
    let uiMeta

    if (this.getComponentIsFragment()) {
      uiMeta = componentTypes[design.canvasRegistry.get(id).element.ownerType]
    } else {
      uiMeta = componentTypes[this.props.type]
    }

    uiMeta = uiMeta || {}

    return uiMeta.icon != null ? uiMeta.icon : ''
  }

  getValue (collection, name) {
    if (collection == null) {
      return {}
    }

    if (name != null) {
      return collection[name]
    }

    return collection
  }

  getComponent () {
    const {
      template,
      properties,
      expressions
    } = this.props

    const bindings = this.props.bindings || {}

    return {
      template,
      properties,
      bindings,
      expressions
    }
  }

  getPropMeta (propName) {
    const meta = this.getMeta()
    let propsMeta = meta.propsMeta != null ? meta.propsMeta : {}
    let keys = propName == null ? '' : propName.split('.')
    let context = propsMeta
    let result

    for (let i = 0; i < keys.length; i++) {
      let key = keys[i]

      context = this.getValue(context, key)

      if (i === keys.length - 1) {
        result = context
        break
      }

      if (
        context == null ||
        typeof context !== 'object' ||
        typeof context.properties !== 'object'
      ) {
        result = context
        break
      }

      context = context.properties
      result = context
    }

    return result
  }

  getBindingMeta (bindingName, keyValue, options = {}) {
    const bindings = this.props.bindings || {}
    const expressions = this.props.expressions || {}
    const { dataFieldsMeta, getFullExpressionName, getFullExpressionDisplayName } = this.props

    const expression = expressionUtils.getExpression(
      expressions[bindingName],
      bindings[bindingName] != null ? bindings[bindingName].expression : undefined
    )

    let expressionName
    let expressionMeta

    const isSingleDataExpression = (expr) => {
      return (
        expr != null &&
        !Array.isArray(expr) &&
        expr.info != null &&
        expr.info.type === 'data'
      )
    }

    if (isSingleDataExpression(expression)) {
      expressionName = getFullExpressionName(expression.info.value)
    }

    if (expressionName != null) {
      expressionMeta = dataFieldsMeta[expressionName]
    }

    if (keyValue == null) {
      return expressionMeta
    }

    if (keyValue === 'displayName') {
      const expressionDisplayName = isSingleDataExpression(expression) ? (
        getFullExpressionDisplayName(expression.info.value)
      ) : undefined

      return `[${options.displayPrefix != null ? options.displayPrefix : ''}${
        expressionDisplayName != null ? (
          expressionDisplayName === '' ? '(root)' : expressionDisplayName
        ) : '(binding)'
      }]`
    }

    return expressionMeta ? expressionMeta[keyValue] : undefined
  }

  handleTemplateEditorOpen () {
    if (!this.state.templateEditor) {
      this.setState({
        templateEditor: true
      })
    } else {
      this.setState({
        templateEditor: null
      })
    }
  }

  handleBindingEditorOpen ({ propName, bindingName, context, options = {} }) {
    let targetBindingName = bindingName != null ? bindingName : propName

    if (!this.state.bindingEditor) {
      this.setState({
        bindingEditor: {
          propName,
          bindingName: targetBindingName,
          context,
          options
        }
      })
    } else {
      this.setState({
        bindingEditor: null
      })
    }
  }

  handleTemplateEditorSave (template) {
    const handleChanges = this.handleChanges

    handleChanges({
      origin: 'template',
      propName: undefined,
      changes: { template }
    })

    this.setState({
      templateEditor: null
    })
  }

  handleBindingEditorSave (changes) {
    const { bindingEditor } = this.state
    const handleChanges = this.handleChanges

    if (changes != null) {
      handleChanges({
        origin: 'bindings',
        propName: bindingEditor.propName,
        context: bindingEditor.context,
        changes
      })
    }

    this.setState({
      bindingEditor: null
    })
  }

  handleBindingEditorClose () {
    this.setState({
      bindingEditor: null
    })
  }

  handleTemplateEditorClose () {
    this.setState({
      templateEditor: null
    })
  }

  handleChanges ({ origin, propName, context, changes }) {
    const { id, type, template, properties, bindings, onChange } = this.props
    let changesInterceptor = this.changesInterceptor
    let newChanges
    let params

    params = {
      origin,
      id,
      propName,
      context,
      current: {
        componentType: type,
        template,
        props: properties,
        bindings
      },
      changes
    }

    if (changesInterceptor != null) {
      newChanges = changesInterceptor(params)
    } else {
      newChanges = changes
    }

    onChange(id, newChanges)
  }

  handlePropChange ({ propName, context, value }) {
    const handleChanges = this.handleChanges
    const { type, properties } = this.props
    let valid = true

    let newProps = {
      ...properties,
      [propName]: value
    }

    if (type === 'Image' && (propName === 'width' || propName === 'height')) {
      valid = value != null && !isNaN(value)

      if (valid) {
        newProps[propName] = value !== '' ? Number(value) : 0
      }
    }

    if (!valid) {
      return
    }

    handleChanges({
      origin: 'values',
      propName,
      context,
      changes: { props: newProps }
    })
  }

  renderPropertiesEditor () {
    const { type, dataInput, properties, bindings, expressions } = this.props

    let props = {
      dataInput,
      componentType: type,
      properties,
      bindings,
      expressions,
      options: {},
      getComponent: this.getComponent,
      getComponentMeta: this.getMeta,
      getPropMeta: this.getPropMeta,
      getBindingMeta: this.getBindingMeta,
      onBindingEditorOpen: this.handleBindingEditorOpen,
      onChange: this.handlePropChange,
      connectToChangesInterceptor: this.connectToChangesInterceptor
    }

    const editorInfo = this.getPropertiesEditor(type)

    if (editorInfo.options) {
      props.options = editorInfo.options
    }

    return (
      React.createElement(editorInfo.editor, { ...props })
    )
  }

  renderBindingEditor () {
    const { bindingEditor } = this.state
    const { type } = this.props
    const bindings = this.props.bindings || {}

    let editorInfo
    let bindingEditorProps

    if (!bindingEditor) {
      return null
    }

    bindingEditorProps = {
      componentType: type,
      propName: bindingEditor.propName,
      bindingName: bindingEditor.bindingName,
      binding: bindings[bindingEditor.bindingName],
      component: this.getComponent(),
      options: bindingEditor.options,
      getPropMeta: this.getPropMeta,
      onSave: this.handleBindingEditorSave,
      onClose: this.handleBindingEditorClose
    }

    editorInfo = componentTypes[type]

    if (editorInfo == null) {
      return null
    }

    const renderResolvedEditor = (resolvedEditor, props) => {
      let newProps
      let options

      if (typeof resolvedEditor.getOptions === 'function') {
        options = resolvedEditor.getOptions(
          pick(props, [
            'componentType',
            'propName',
            'bindingName',
            'binding',
            'component',
            'getPropMeta'
          ])
        )

        options = Object.assign({}, props.options, options)
      }

      if (options != null) {
        newProps = { ...props, options }
      } else {
        newProps = props
      }

      return React.createElement(
        resolvedEditor,
        newProps
      )
    }

    const runResolver = (resolver, props) => {
      const defaultBindingEditorComponents = bindingEditorConf.defaultComponents
      const defaultBindingEditorResolver = bindingEditorConf.defaultResolver
      const editorProps = { ...props }
      let editorOutput
      let result

      if (!resolver) {
        result = runResolver(defaultBindingEditorResolver, editorProps)
      } else {
        editorOutput = resolver({
          componentType: type,
          propName: bindingEditor.propName,
          bindingName: bindingEditor.bindingName,
          getPropMeta: this.getPropMeta
        })
      }

      if (result != null) {
        return result
      }

      if (editorOutput == null) {
        if (resolver && resolver !== defaultBindingEditorResolver) {
          result = runResolver(defaultBindingEditorResolver, editorProps)
        } else {
          result = {
            editor: defaultBindingEditorComponents.default,
            props: editorProps
          }
        }
      } else if (
        editorOutput.editor != null &&
        typeof editorOutput.editor === 'string' &&
        defaultBindingEditorComponents[editorOutput.editor] != null
      ) {
        editorProps.options = Object.assign({}, editorOutput.options, editorProps.options)

        result = {
          editor: defaultBindingEditorComponents[editorOutput.editor],
          props: editorProps
        }
      } else if (
        editorOutput.editor != null &&
        typeof editorOutput.editor === 'function'
      ) {
        editorProps.options = Object.assign({}, editorOutput.options, editorProps.options)

        result = {
          editor: editorOutput.editor,
          props: editorProps
        }
      } else {
        result = {
          editor: defaultBindingEditorComponents.default,
          props: editorProps
        }
      }

      return result
    }

    editorInfo = runResolver(editorInfo.bindingEditorResolver || undefined, bindingEditorProps)

    return renderResolvedEditor(
      editorInfo.editor,
      editorInfo.props
    )
  }

  renderTemplateEditor () {
    const { type, template } = this.props
    const { templateEditor } = this.state

    if (!templateEditor) {
      return null
    }

    return (
      <TemplateEditor
        componentType={type}
        template={template}
        onSave={this.handleTemplateEditorSave}
        onClose={this.handleTemplateEditorClose}
      />
    )
  }

  render () {
    const componentIsFragment = this.getComponentIsFragment()

    return (
      <div className={styles.componentEditor}>
        <div className={styles.componentEditorContent}>
          <h3 className={styles.componentEditorTitle}>
            <span className={`${styles.componentEditorTitleIcon} fa ${this.getIcon()}`} />
            &nbsp;
            {this.getDisplayName()}
          </h3>
          <hr className={styles.componentEditorSeparator} />
          {componentIsFragment === false && (
            <div className={styles.componentEditorOptions}>
              <CommandButton
                title='Edit component template'
                titlePosition='bottom'
                icon='code'
                onClick={this.handleTemplateEditorOpen}
              />
            </div>
          )}
          {this.renderPropertiesEditor()}
        </div>
        {this.renderBindingEditor()}
        {this.renderTemplateEditor()}
      </div>
    )
  }
}

ComponentEditor.wrappedComponent.propTypes = {
  design: MobxPropTypes.observableObject.isRequired,
  dataInput: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.array
  ]),
  dataFieldsMeta: PropTypes.object,
  id: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  template: PropTypes.string,
  properties: PropTypes.object.isRequired,
  bindings: PropTypes.object,
  expressions: PropTypes.object,
  getFullExpressionName: PropTypes.func.isRequired,
  getFullExpressionDisplayName: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired
}

export default ComponentEditor
