// In-memory stand-in for the device filesystem, keyed by path, so tests can assert
// that chats are written to a file rather than to key/value cache.
const files = new Map();

class File {
  constructor(directory, name) {
    this.uri = `${directory.uri}${name}`;
  }
  get exists() {
    return files.has(this.uri);
  }
  create() {
    if (!files.has(this.uri)) files.set(this.uri, "");
  }
  write(contents) {
    files.set(this.uri, contents);
  }
  text() {
    return Promise.resolve(files.get(this.uri) ?? null);
  }
  textSync() {
    return files.get(this.uri) ?? null;
  }
  delete() {
    files.delete(this.uri);
  }
}

const Paths = { document: { uri: "file:///mock/documents/" } };

module.exports = { File, Paths, __files: files };
