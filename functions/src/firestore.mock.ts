/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-jsdoc */
/* istanbul ignore file */
export class FirestoreMock {
  store: { [key: string]: any } = {};

  collection(path: string) {
    let exists = true;
    const doc = path.split('/').reduce((anchor, path) => anchor[path] || ((exists = false), {}), this.store);

    return {
      get: async () => ({
        docs: Object.entries(doc).map(([_, v]) => ({
          data: () => v,
        })),
        exists,
        data: () => doc,
      }),
      doc: (docName: string) => this.collection(`${path}/${docName}`),
    };
  }
}
