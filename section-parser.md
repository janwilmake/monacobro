I want a JS snippet that takes an editor state of a markdown file that has content and position/selection: { content:string, selection: { startLineNumber, startColumn, endLineNumber, endColumn } }. I want it to output sections of markdown based on the headers, and which section is active (based on the cursor position)

- Any header is a separator indicating the start ofa new section. The text before the first header is a section too, for every new header, the header + its content is a section.

- We can have one active section, based on the selection startLineNumber.

Please provide it as part of html with textarea and show the result in a textarea next to it that updates live. use a proper markdown parser to ensure we don't parse it wrongly, like marked
