// The one catalogue of verbs, shared by inference (askModel) and training (`reflex teach`), so the
// model is trained on exactly the prompt it is asked with. Constraints come from how Ollama's
// functiongemma renderer differs from the HF template (docs/research/training-on-mac.md):
//   - flat `string` parameters only: nested objects and arrays are not rendered;
//   - no `enum`: it is not rendered, so training and inference would see different prompts;
//   - no system message at inference: Ollama then renders DEVELOPER_LINE, which training uses verbatim.

export const DEVELOPER_LINE = 'You can do function calling with the following functions:'

const TOOLS = [
  ['open', 'Open a folder, file, app or web page on this Mac', 'What to open, as the person named it'],
  ['reveal', 'Show a file or folder in Finder', 'The file or folder, as the person named it'],
  ['copy', 'Copy a file, image or text to the clipboard', 'What to copy, as the person named it'],
  ['shortcut', 'Run a Shortcut from the Shortcuts app', 'The Shortcut name'],
].map(([name, description, target]) => ({
  type: 'function',
  function: {
    name, description,
    parameters: { type: 'object', required: ['target'], properties: { target: { type: 'string', description: target } } },
  },
}))

export const toolsFor = () => TOOLS
