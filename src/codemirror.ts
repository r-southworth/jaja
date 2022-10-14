import { EditorView as CodeMirrorEditorView, keymap as cmKeymap, drawSelection , KeyBinding} from "@codemirror/view"
import { SelectionRange,  } from "@codemirror/state"

import { javascript } from "@codemirror/lang-javascript"
import {defaultKeymap} from "@codemirror/commands"
import {syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language"

import {exitCode} from "prosemirror-commands"
import {undo, redo} from "prosemirror-history"
import {keymap} from "prosemirror-keymap"

import {EditorView} from "prosemirror-view"
import {DOMParser,Node as ProsemirrorNode} from "prosemirror-model"

import { TextSelection, Selection } from "prosemirror-state"



import { mySchema } from "./schema"
import { ViewUpdate } from "@codemirror/view"


import {Transaction as CmTransaction} from '@codemirror/state'

export class CodeBlockView {
    cm: CodeMirrorEditorView
    updating: boolean
    dom: HTMLElement
    nodepm: ProsemirrorNode
    view: EditorView

    getPos: ()=>number



    constructor(node: ProsemirrorNode, view: EditorView, getPos: ()=>number) {
      // Store for later
      this.nodepm = node
      this.view = view
      this.getPos = getPos
  
      // Create a CodeMirror instance
      this.cm = new CodeMirrorEditorView({
        doc: this.nodepm.textContent,
        extensions: [
          cmKeymap.of([
            ...this.codeMirrorKeymap(),
            ...defaultKeymap
          ]),
          drawSelection(),
          syntaxHighlighting(defaultHighlightStyle),
          javascript(),
          CodeMirrorEditorView.updateListener.of(update => this.forwardUpdate(update))
        ]
      })
  
      // The editor's outer node is our DOM representation
      this.dom = this.cm.dom
  
      // This flag is used to avoid an update loop between the outer and
      // inner editor
      this.updating = false
    }

    forwardUpdate(update: ViewUpdate) {
        if (this.updating || !this.cm.hasFocus) return
        let offset = this.getPos() + 1, {main} = update.state.selection
        let selection = TextSelection.create(this.view.state.doc,
                                             offset + main.from, offset + main.to)
        if (update.docChanged || !this.view.state.selection.eq(selection)) {
          let tr = this.view.state.tr.setSelection(selection)
          update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
            if (text.length)
              tr.replaceWith(offset + fromA, offset + toA,
                             mySchema.text(text.toString()))
            else
              tr.delete(offset + fromA, offset + toA)
            offset += (toB - fromB) - (toA - fromA)
          })
          this.view.dispatch(tr)
        }
      }

      setSelection(anchor: number, head: number) {
        this.cm.focus()
        this.updating = true
        this.cm.dispatch({selection: {anchor, head}})
        this.updating = false
      }

      codeMirrorKeymap() : KeyBinding[]{
        let view = this.view
        return [
          {key: "ArrowUp", run: () => this.maybeEscapeLine(-1)},
          {key: "ArrowLeft", run: () => this.maybeEscapeChar( -1)},
          {key: "ArrowDown", run: () => this.maybeEscapeLine(1)},
          {key: "ArrowRight", run: () => this.maybeEscapeChar(1)},
          {key: "Ctrl-Enter", run: () => {
            if (!exitCode(view.state, view.dispatch)) return false
            view.focus()
            return true
          }},
          {key: "Ctrl-z", mac: "Cmd-z",
           run: () => undo(view.state, view.dispatch)},
          {key: "Shift-Ctrl-z", mac: "Shift-Cmd-z",
           run: () => redo(view.state, view.dispatch)},
          {key: "Ctrl-y", mac: "Cmd-y",
           run: () => redo(view.state, view.dispatch)}
        ]
      }

      maybeEscapeChar(dir: number):boolean {
        let state = this.cm.state
        let main = state.selection.main
        if (!main.empty) return false
        if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false
        let targetPos = this.getPos() + (dir < 0 ? 0 : this.nodepm.nodeSize)
        let selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
        let tr = this.view.state.tr.setSelection(selection).scrollIntoView()
        this.view.dispatch(tr)
        this.view.focus()
        return false
      }
      maybeEscapeLine(dir: number):boolean {
        let state = this.cm.state
        if (!state.selection.main.empty) return false   
        let main = state.doc.lineAt(state.selection.main.head)

        if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false
        let targetPos = this.getPos() + (dir < 0 ? 0 : this.nodepm.nodeSize)
        let selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
        let tr = this.view.state.tr.setSelection(selection).scrollIntoView()
        this.view.dispatch(tr)
        this.view.focus()
        return false
      }
      update(node: ProsemirrorNode) {
        if (node.type != this.nodepm.type) return false
        this.nodepm = node
        if (this.updating) return true
        let newText = node.textContent, curText = this.cm.state.doc.toString()
        if (newText != curText) {
          let start = 0, curEnd = curText.length, newEnd = newText.length
          while (start < curEnd &&
                 curText.charCodeAt(start) == newText.charCodeAt(start)) {
            ++start
          }
          while (curEnd > start && newEnd > start &&
                 curText.charCodeAt(curEnd - 1) == newText.charCodeAt(newEnd - 1)) {
            curEnd--
            newEnd--
          }
          this.updating = true
          this.cm.dispatch({
            changes: {
              from: start, to: curEnd,
              insert: newText.slice(start, newEnd)
            }
          })
          this.updating = false
        }
        return true
      }

      selectNode() { this.cm.focus() }
      stopEvent() { return true }
    }
  
    import {EditorState,Transaction,Command} from 'prosemirror-state'
    
     function arrowHandler(dir:  "up" | "down" | "left" | "right" | "forward" | "backward") {
        const fn =  (state: EditorState, dispatch: (tr: Transaction) => void, view: EditorView) : boolean => {
          if (state.selection.empty && view.endOfTextblock(dir)) {
            let side = dir == "left" || dir == "up" ? -1 : 1
            let $head = state.selection.$head
            let nextPos = Selection.near(
              state.doc.resolve(side > 0 ? $head.after() : $head.before()), side)
            if (nextPos.$head && nextPos.$head.parent.type.name == "code_block") {
              dispatch(state.tr.setSelection(nextPos))
              return true
            }
          }
          return false
        } 
        return fn as Command
      }
      
      export const arrowHandlers = keymap({
        ArrowLeft: arrowHandler("left"),
        ArrowRight: arrowHandler("right"),
        ArrowUp: arrowHandler("up"),
        ArrowDown: arrowHandler("down")
      })
      