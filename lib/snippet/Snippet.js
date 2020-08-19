// const P = require('bluebird');
// const Chunk = require('../html/Chunk');
// const DocumentWorker = require('../html/DocumentWorker');
// const tagsToRemove = new Set(['STYLE', 'SCRIPT']);
// const sectionTagNames = new Set(['SECTION']);
// /**
//  * TalkPage represents a structured version of a talk page.
//  * @param {!Document} doc Parsoid document
//  * @param {!String} lang the language of the document
//  * @param {?boolean} immediate whether or not to process the document immediately
//  */
// class Snippet extends DocumentWorker {
//   constructor(doc, immediate = true) {
//     super(doc, doc.body);
//     this.chunks = [];
//     this.firstSectionNode = undefined;
//     this.firstDivNode = undefined;
//     this.firstParagraphNode = undefined;
//     if (!immediate) {
//       return;
//     }
//     this.workSync();
//     this.finalizeSync();
//   }
//
//   /**
//    * Returns a promise that is fufilled by a TalkPage
//    * @param {!Document} doc Parsoid document
//    * @param {!String} lang the language of the document
//    * @param {?integer} limit the limit in ms for each processing chunk
//    */
//     static promise(doc) {
//       const snippet = new Snippet(doc, false);
//       return snippet.promise;
//     }
//
//     removeNodeButPreserveContents(node) {
//       while (node.childNodes.length > 0) {
//         const firstChild = node.firstChild;
//         if (firstChild) {
//           node.parentNode.insertBefore(firstChild, node);
//         }
//       }
//       node.parentNode.removeChild(node);
//     }
//     /**
//      * Process the document
//      * @param {?integer} limit the max number of DOMNodes to process
//      */
//       process(node) {
//
//         if (tagsToRemove.has(node.tagName)) {
//           node.parentNode.removeChild(node);
//           return;
//         }
//
//         if (sectionTagNames.has(node.tagName) && this.firstSectionNode === undefined) {
//           this.firstSectionNode = node;
//           removeNodeButPreserveContents(node);
//           return;
//         }
//
//       if (node.tagName === 'DIV' && this.firstDivNode === undefined) {
//         this.firstDivNode = node;
//         removeNodeButPreserveContents(node);
//         return;
//       }
//
//       if (node.tagName === 'P' && this.firstParagraphNode === undefined) {
//         this.firstParagraphNode = node;
//         removeNodeButPreserveContents(node);
//         return;
//       }
//
//       console.log(node.tagName);
//       console.log(doc.body.innerHTML);
//       // if (tagsToRemove.has(node.tagName)) {
//       //   node.remove();
//       //   return;
//       // }
//         // const chunk = new Chunk(node, false);
//         //
//         // while (this.ancestor && this.ancestor !== node.parentNode) {
//         //   const endChunk = new Chunk(this.ancestor, true);
//         //   this.chunks.push(endChunk);
//         //   this.ancestor = this.ancestor.parentNode;
//         // }
//         //
//         // if (chunk.isTag) {
//         //   this.ancestor = node;
//         //   this.chunks.push(chunk);
//         // } else if (chunk.isText) {
//         //   this.chunks.push(chunk);
//         // }
//       }
//
//       finalizeStep() {
//           return false;
//       }
// }
//
// module.exports = Snippet;
