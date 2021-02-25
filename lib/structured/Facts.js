const DocumentWorker = require('../html/DocumentWorker');
const NodeType = require('../nodeType');

const hrefRegex = /^\.\/([^#]+)#?(.+)?$/;
const trimLeadingRegex = /^\s+/;

/**
 * Walks a Parsoid DOM and splits the content into sections, paragraphs, and facts as it goes.
 * Facts are split by a sentence boundary with citations. Mid-sentence
 * citations don't split facts but are included with the references.
 * Currently the only sentence boundary in use is the period, would need
 * to use different hueristics for languages with different sentence delimiters.
 */
class Facts extends DocumentWorker {
    /**
     * Run the next processing step. This function is fed nodes from a TreeWalker
     * that is traversing the DOM.
     * @param {!DOMNode} node to process
     */
    process(node) {
        // Walk back up the tree, to determine if we're no longer in an excluded
        // node or an anchor.
        while (this.ancestor && this.ancestor !== node.parentNode) {
            if (this.ancestor === this.excludedNode) {
                this.excludedNode = undefined;
            }
            if (this.ancestor === this.anchorNode) {
                this.anchorNode = undefined;
                if (this.currentLink) {
                    this.currentLink.end = this.currentFact.text.length;
                }
            }
            this.ancestor = this.ancestor.parentNode;
        }
        switch (node.nodeType) {
            case NodeType.ELEMENT_NODE:
                this.processElement(node);
                break;
            case NodeType.TEXT_NODE:
                this.processText(node);
                break;
        }
        this.ancestor = node;
    }

    /**
     * Process a DOM element
     */
    processElement(element) {
        if (this.excludedNode) {
            // Skip if we're under an excluded node.
            return;
        }
        const tagName = element.tagName;
        if (this.isTopLevelSection(tagName, element)) {
            this.closeCurrentSection();
            return;
        }
        switch (tagName) {
            case 'SPAN':
                // Exlcude coordinate spans, other spans could probably be excluded as well
                if (element.id === 'coordinates') {
                    this.excludedNode = element;
                }
                break;
            case 'DIV':
            case 'TABLE':
            case 'FIGURE':
            case 'STYLE':
            case 'SCRIPT':
                // Leave this content out for now.
                // There could be a strategy for structuring these using the data-mw attribute
                this.excludedNode = element;
                break;
            case 'A':
                this.processAnchor(element);
                break;
            case 'P':
                this.processParagraph(element);
                break;
            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6':
                this.processHeader(element);
                break;
            case 'SUP':
                this.processSuperscript(element);
                break;
        }
    }

    // Append the text to the current fact if necessary
    processText(text) {
        if (this.excludedNode || !this.currentFact) {
            return;
        }
        let textContent = text.textContent;
        if (!this.currentFact.text || this.currentFact.text === '') {
            textContent = textContent.replace(trimLeadingRegex, '');
        }
        this.currentFact.text += textContent;
    }

    newSection() {
        return {
            paragraphs: []
        };
    }

    newFact() {
        return {
            text: '',
            references: [],
            links: []
        };
    }

    // WikiLinks are links to other articles, include these as annotations on the current fact.
    processWikiLink(anchor) {
        if (anchor.classList.contains('mw-disambig')) {
            return;
        }
        const href = anchor.getAttribute('href');
        if (!href) {
            return;
        }
        const match = hrefRegex.exec(href);
        if (!match[1]) {
            return;
        }
        this.anchorNode = anchor;
        const link = {
            title: match[1],
            start: this.currentFact.text.length || 0
        };
        if (match[2]) {
            link.fragment = match[2];
        }
        this.currentLink = link;
        this.linkedEntities[match[1]] = '';
        this.currentFact.links.push(link);
    }

    processAnchor(anchor) {
        if (!this.currentFact) {
            return;
        }
        // Only process WikiLinks (links to other articles)
        const rel = anchor.getAttribute('rel');
        switch (rel) {
            case 'mw:WikiLink':
                this.processWikiLink(anchor);
                break;
        }
    }

    processReference(sup) {
        this.excludedNode = sup;
        const anchor = sup.firstElementChild;
        if (!anchor) {
            return;
        }
        const href = anchor.getAttribute('href');
        if (!href) {
            return;
        }
        const match = hrefRegex.exec(href);
        const id = match[2];
        if (!id) {
            return;
        }
        this.currentFact.references.push(id);
        // This pulls in the reference content, but for now just including the
        // reference IDs to keep the response size down.
        // const referenceTextElement = this.doc.getElementById(`mw-reference-text-${id}`);
        // if (!referenceTextElement) {
        //     return;
        // }
        // // const citeElement = referenceTextElement.firstElementChild;
        // // if (!citeElement) {
        // //     return;
        // // }
        // const reference = { text: referenceTextElement.innerHTML, id };
        // // const data = sup.getAttribute('data-mw');
        // // if (data) {
        // //     const structuredRef = JSON.parse(data);
        // //     if (structuredRef) {
        // //         const attrs = structuredRef.attrs;
        // //         if (attrs) {
        // //             Object.keys(attrs).forEach(key => {
        // //                 reference[key] = attrs[key];
        // //             });
        // //         }
        // //     }
        // // }
        // this.currentFact.references.push(reference);
        const nextSibling = sup.nextSibling;
        if (nextSibling
            && nextSibling.nodeType === NodeType.ELEMENT_NODE
            && this.isReference(nextSibling)) {
            this.processReference(nextSibling);
            return;
        }
        this.treeWalker.currentNode = sup;
        this.closeCurrentFact(true);
    }

    isReference(element) {
        const rel = element.getAttribute('rel');
        return rel === 'dc:references';
    }

    processSuperscript(sup) {
        if (!this.isReference(sup)) {
            return;
        }
        this.processReference(sup);
    }

    closeCurrentSection() {
        this.closeCurrentParagraph();
        if (this.currentSection && this.currentSection.paragraphs.length > 0) {
            this.sections.push(this.currentSection);
        }
        this.currentSection = this.newSection();
    }

    closeCurrentParagraph() {
        this.closeCurrentFact();
        if (this.currentParagraph && this.currentParagraph.facts.length > 0) {
            this.currentSection.paragraphs.push(this.currentParagraph);
        }
        this.currentParagraph = { facts: [] };
    }

    closeCurrentFact(isPeriodRequired) {
        if (this.currentFact) {
            const trimmedFact = this.currentFact.text.trim();
            if (isPeriodRequired && !trimmedFact.endsWith('.')) {
                return;
            }
            if (trimmedFact !== '') {
                this.currentFact.text = trimmedFact;
                this.currentParagraph.facts.push(this.currentFact);
            }
        }
        this.currentFact = this.newFact();
    }

    processParagraph(paragraph) {
        this.closeCurrentParagraph();
    }

    processHeader(header) {
        this.excludedNode = header;
        if (!this.currentSection) {
            return;
        }
        if (this.currentSection.title) {
            return;
        }
        this.currentSection.title = header.textContent;
    }

    /**
     * Determines whether an element is a <section> tag with the <body> tag as its parent
     * @param {string} tagName capitalized tag name of the element
     * @param {Element} element
     * @return {boolean} true if the element is a <section> tag and its parent is a <body> tag
     */
    isTopLevelSection(tagName, element) {
        return tagName === 'SECTION' && element.parentElement.tagName === 'BODY';
    }

    /**
     * Run the next finalization step.
     * For now, just generates the output structure
     * and returns false to indicate there's no more work.
     */
    finalizeStep() {
        this.output = {
            linkedEntities: this.linkedEntities,
            sections: this.sections
        };
        return false;
    }

    /**
     * Returns a Facts object ready for processing
     * @param {!Document} doc parsoid document to process
     * @param {?Object} metadata metadata object that should include:
     *   {!string} revision the revision of the page
     *   {!string} tid the tid of the page
    */
    constructor(doc, metadata) {
        super(doc);
        this.metadata = metadata;
        this.sections = [];
        this.linkedEntities = {};
    }
}

module.exports = Facts;
