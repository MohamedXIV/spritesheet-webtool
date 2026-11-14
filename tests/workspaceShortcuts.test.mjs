import test from 'node:test';
import assert from 'node:assert/strict';
import { findWorkspaceShortcut } from '../src/lib/workspaceShortcuts.ts';

const bindings = [
  { id:'save', key:'s', mod:true, allowWhenEditing:true, run() {} },
  { id:'undo', key:'z', mod:true, run() {} },
  { id:'redo', key:'y', mod:true, run() {} },
  { id:'redo-shift', key:'z', mod:true, shift:true, run() {} },
];

test('Ctrl+S and Cmd+S both trigger app save even inside text inputs', () => {
  const key='S';
  for(const mods of [{ctrlKey:true,metaKey:false},{ctrlKey:false,metaKey:true}]) {
    assert.equal(findWorkspaceShortcut({key,shiftKey:false,altKey:false,...mods},bindings,true)?.id,'save');
  }
});
test('native input undo is preserved, but workspace Undo works outside inputs', () => {
  const event={key:'z',ctrlKey:true,metaKey:false,shiftKey:false,altKey:false};
  assert.equal(findWorkspaceShortcut(event,bindings,true),null);
  assert.equal(findWorkspaceShortcut(event,bindings,false)?.id,'undo');
});
test('shift redo, alt combinations and keys without modifiers are explicit', () => {
  const e={key:'Z',ctrlKey:true,metaKey:false,shiftKey:true,altKey:false};
  assert.equal(findWorkspaceShortcut(e,bindings,false)?.id,'redo-shift');
  assert.equal(findWorkspaceShortcut({...e,altKey:true},bindings,false),null);
  assert.equal(findWorkspaceShortcut({...e,ctrlKey:false,shiftKey:false},bindings,false),null);
});

test('physical Ctrl+KeyS saves even when Arabic keyboard emits س', () => {
  const event = { key: 'س', code: 'KeyS', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
  assert.equal(findWorkspaceShortcut(event, bindings, true)?.id, 'save');
  assert.equal(findWorkspaceShortcut({ ...event, ctrlKey: false }, bindings, true), null);
  assert.equal(findWorkspaceShortcut({ ...event, code: 'KeyA' }, bindings, true), null);
});
