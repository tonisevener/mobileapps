const DocumentWorker = require('../html/DocumentWorker');
const NodeType = require('../nodeType');

const hrefRegex = /^\.\/([^#]+)#?(.+)?$/;
const trimLeadingRegex = /^\s+/;

/**
 * StructuredPage turns Parsoid HTML into JSON
 */
class StructuredPage extends DocumentWorker {
    /**
     * Run the next processing step.
     * @param {!DOMNode} node to process
     */
    process(node) {
        while (this.ancestor && this.ancestor !== node.parentNode) {
            if (this.ancestor === this.excludedNode) {
                this.excludedNode = undefined;
            }
            if (this.ancestor === this.anchorNode) {
                this.anchorNode = undefined;
                if (this.currentLink) {
                    this.currentLink.end = this.currentParagraph.text.length;
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

    processElement(element) {
        if (this.excludedNode) {
            return;
        }
        const tagName = element.tagName;
        if (this.isTopLevelSection(tagName, element)) {
            if (this.currentSection) {
                this.sections.push(this.currentSection);
            }
            this.currentSection = this.newSection();
            return;
        }
        switch (tagName) {
            case 'SPAN':
            case 'DIV':
            case 'TABLE':
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
        }
    }

    processText(text) {
        if (this.excludedNode || !this.currentParagraph) {
            return;
        }
        let textContent = text.textContent;
        if (!this.currentParagraph.text || this.currentParagraph.text === '') {
            textContent = textContent.replace(trimLeadingRegex, '');
        }
        this.currentParagraph.text += textContent;
    }

    newSection() {
        return {
            paragraphs: []
        };
    }

    processAnchor(anchor) {
        if (!this.currentParagraph) {
            return;
        }
        const rel = anchor.getAttribute('rel');
        if (rel !== 'mw:WikiLink') {
            return;
        }
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
            start: this.currentParagraph.text.length || 0
        };
        if (match[2]) {
            link.fragment = match[2];
        }
        this.currentLink = link;
        this.linkedEntities[match[1]] = '';
        this.currentParagraph.links.push(link);
    }

    processParagraph(paragraph) {
        if (this.currentParagraph && this.currentParagraph.text && this.currentParagraph.text.trim() !== '') {
            this.currentParagraph.text = this.currentParagraph.text.trim();
            this.currentSection.paragraphs.push(this.currentParagraph);
        }
        this.currentParagraph = { text: '', links: [] };
    }

    processHeader(header) {
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
     * Run the next finalization step. All of the DOM manipulation occurs here because
     * manipulating the DOM while walking it will result in an incomplete walk.
     */
    finalizeStep() {
        this.output = {
            linkedEntities: this.linkedEntities,
            sections: this.sections
        };
        return false;
    }

    /**
     * Returns a MobileHTML object ready for processing
     * @param {!Document} doc document to process
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

module.exports = StructuredPage;
