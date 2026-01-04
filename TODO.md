Goal: Get a js-installable version of this that:

- Paste large text to automatically create a pastebin link
- Hold shift while pasting to always paste the original content
- Drag and drop files to upload
- As well as all features possible.

Possibly, the paste behavior needs not be part of this lib, but possibly it should.

Basically, add paste- and drop-interceptors.

PROBLEMS

- if you click below the last line, it selects all. instead, the behavior should be that the cursor goes to the bottom
- if you paste a url, the view scrolls all the way down. scroll isn't needed when just one url is inserted, ideally the view shouldn't shift
