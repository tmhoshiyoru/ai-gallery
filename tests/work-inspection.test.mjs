import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectWork } from '../scripts/work-inspection.mjs';

test('skip saved Gemini conversation with multiple independent signals', () => {
  const html = '<title>Google Gemini</title><a href="https://gemini.google.com">Gemini</a><user-query></user-query><model-response></model-response>';
  assert.equal(inspectWork(html).isConversation, true);
});
test('Gemini mention alone and dynamically created canvas do not mean conversation', () => {
  assert.equal(inspectWork('<title>Game made with Gemini</title><script>new THREE.WebGLRenderer()</script>').isConversation, false);
  assert.equal(inspectWork('<a href="https://gemini.google.com">Credit</a><canvas></canvas>').isConversation, false);
});
test('detect plain CSS viewport height dependencies without treating min-height as fixed height', () => {
  assert.equal(inspectWork('<style>body, html {height:100%; overflow:hidden}</style>').requiresViewportHeight, true);
  assert.equal(inspectWork('<style>body {height:100vh}</style>').requiresViewportHeight, true);
  assert.equal(inspectWork('<style>body {min-height:100vh}</style>').requiresViewportHeight, false);
});
