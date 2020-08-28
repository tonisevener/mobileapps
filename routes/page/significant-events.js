const router = require('../../lib/util').router();
const mUtil = require('../../lib/mobile-util');
const mwapi = require('../../lib/mwapi');
const mwrestapi = require('../../lib/mwrestapi');
const BBPromise = require('bluebird');
const api = require('../../lib/api-util');
const express = require('express');
const parsoidApi = require('../../lib/parsoid-access');
const encoding = require('@root/encoding');
const ParsoidJS = require('parsoid-jsapi');
const PRFunPromise = require('prfun');
const tUtil = require('../../lib/talk/TalkPageTopicUtilities');
const Snippet = require('../../lib/snippet/Snippet');
const NodeType = require('../../lib/nodeType');
let app;

const significantChangesCache = {};
const maxAllowedCachedArticleSignificantEvents = 100;

const tagReplacements = {
    A: 'a',
    B: 'b',
    I: 'i',
    SUP: 'sup',
    SUB: 'sub',
    DT: 'b',
    CODE: 'b',
    BIG: 'b',
    LI: 'li',
    OL: 'ol',
    UL: 'ul',
    DL: 'ul',
    DD: 'li'
};

const tagsToRemoveEntirely = 'script,style';
const tagsToRemoveButKeepContents = new Set(['P', 'DIV', 'SPAN']);
const escapeRegex = /[<>]/g;
const escapeMap = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;'
};
const attributesToRemoveMap = {
    style: true,
    id: true,
    class: true,
    rel: true,
    about: true,
    'data-mw': true,
    typeof: true
};

const escape = text => {
    return text.replace(escapeRegex, (match) => {
        return escapeMap[match] || '';
    });
};

class CharacterChangeWithSections {
    constructor(counts, addedSections, deletedSections) {
        this.counts = counts;
        this.addedSections = addedSections;
        this.deletedSections = deletedSections;
    }
}

class CharacterChange {
    constructor(addedCount, deletedCount) {
        this.addedCount = addedCount;
        this.deletedCount = deletedCount;
    }

    totalCount() {
        return this.addedCount + this.deletedCount;
    }
}

class SmallOutput {
    constructor(revid, timestamp, user, userid) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'small-change';
        this.user = user;
        this.userid = userid;
    }
}

class ConsolidatedSmallOutput {
    constructor(count) {
        this.count = count;
        this.outputType = 'small-change';
    }
}

class VandalismOutput {
    constructor(revid, timestamp, user, userid, sections) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'vandalism-revert';
        this.user = user;
        this.userid = userid;
        this.sections = sections;
    }
}

class NewReferenceOutput {
    constructor(sections, templates) {
        this.outputType = 'new-template';
        this.sections = sections;
        this.templates = templates;
    }
}

class AddedTextOutputExpanded {
    constructor(characterChangeWithSections, snippet, snippetType, snippetHighlightRanges) {
        this.outputType = 'added-text';
        this.snippet = snippet;
        this.snippetType = snippetType;
        this.snippetHighlightRanges = snippetHighlightRanges;
        this.characterCount = characterChangeWithSections.counts.addedCount;
        this.sections = characterChangeWithSections.addedSections;
    }
}

class AddedTextOutput {
    constructor(addedTextOutputExpanded) {
        this.outputType = addedTextOutputExpanded.outputType;
        this.snippet = addedTextOutputExpanded.snippet;
        this.snippetType = addedTextOutputExpanded.snippetType;
        this.characterCount = addedTextOutputExpanded.characterCount;
        this.sections = addedTextOutputExpanded.sections;
    }
}

class DeletedTextOutput {
    constructor(characterChangeWithSections) {
        this.outputType = 'deleted-text';
        this.characterCount = characterChangeWithSections.counts.deletedCount;
        this.sections = characterChangeWithSections.deletedSections;
    }
}

class LargeOutput {
    constructor(largeOutputExpanded) {
        this.revid = largeOutputExpanded.revid;
        this.timestamp = largeOutputExpanded.timestamp;
        this.outputType = 'large-change';
        this.user = largeOutputExpanded.user;
        this.userid = largeOutputExpanded.userid;
        this.significantChanges = largeOutputExpanded.significantChanges;
    }
}

class LargeOutputExpanded {
    constructor(revid, timestamp, user, userid, significantChanges) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'large-change';
        this.user = user;
        this.userid = userid;
        this.significantChanges = significantChanges;
    }
}

class NewTalkPageTopicExtended {
    constructor(revid, timestamp, user, userid, snippet, type, highlightRanges, characterChange,
                section) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'new-talk-page-topic';
        this.snippet = snippet;
        this.type = type;
        this.highlightRanges = highlightRanges;
        this.user = user;
        this.userid = userid;
        this.characterChange = characterChange;
        this.section = section;
    }
}

class NewTalkPageTopic {
    constructor(newTalkPageTopicExpanded) {
        this.revid = newTalkPageTopicExpanded.revid;
        this.timestamp = newTalkPageTopicExpanded.timestamp;
        this.outputType = 'new-talk-page-topic';
        this.snippet = newTalkPageTopicExpanded.snippet;
        this.user = newTalkPageTopicExpanded.user;
        this.userid = newTalkPageTopicExpanded.userid;
        this.section = newTalkPageTopicExpanded.section;
    }
}

class PreformattedSnippet {
    constructor(revid, outputType, snippet, snippetType, snippetHighlightRanges,
                indexOfSignificantChanges) {
        this.revid = revid;
        this.outputType = outputType;
        this.snippet = snippet;
        this.snippetType = snippetType;
        this.snippetHighlightRanges = snippetHighlightRanges;
        this.indexOfSignificantChanges = indexOfSignificantChanges;
    }
}

function getThreshold(req) {
    return req.query.threshold === null || req.query.threshold === undefined ?
        100 : req.query.threshold;
}

function insertSubstringInString(originalString, substring, index) {
    if (index > 0) {
        return originalString.substring(0, index) + substring + originalString.substring(index,
            originalString.length);
    }

    return substring + originalString;
}

function stringByRemovingSubstring(originalString, beginningIndex, endIndex) {
    const firstSubstring = originalString.substring(0,beginningIndex);
    const secondSubstring = originalString.substring(endIndex);
    return firstSubstring + secondSubstring;
}

const diffAndRevisionPromise = (req, revision) => {
    if (revision.parentid === null || revision.parentid === undefined || revision.parentid === 0) {
        return Object.assign({
            revision: revision,
            body: null
        });
    }
    return mwrestapi.queryForDiff(req, revision.parentid, revision.revid)
        .then( (response) => {
            return Object.assign({
                revision: revision,
                body: response.body
            });
        })
        .catch(e => {
            return Object.assign({
                revision: revision,
                body: null
            });
        });
};

function removeNodeButPreserveContents(node) {
    while (node.childNodes.length > 0) {
        const firstChild = node.firstChild;
        if (firstChild) {
            node.parentNode.insertBefore(firstChild, node);
        }
    }
    node.parentNode.removeChild(node);
}

function renameNodeAndClearOutAttributes(doc, node, newNodeName) {

    // first clear out attributes
    for (var i = 0; i < node.attributes.length; i++) {
        var attrib = node.attributes[i];
        if (attributesToRemoveMap[attrib] === true) {
            node.removeAttribute(attrib);
        }
    }

    // then rename node if necessary
    if (node.tagName.toLowerCase() === newNodeName.toLowerCase()) {
        return;
    }

    var newNode = doc.createElement(newNodeName);
    newNode.innerHTML = node.innerHTML;
    node.parentNode.replaceChild(newNode, node);
}

function recursivelyEvaluateNode(doc, node) {

    if (node.nodeType === NodeType.ELEMENT_NODE) {
        const sub = tagReplacements[node.tagName];

        if (!sub) {
            if (tagsToRemoveButKeepContents.has(node.tagName)) {
                removeNodeButPreserveContents(node);
            } else {
                if (node.tagName !== 'BODY') {
                    node.parentNode.removeChild(node);
                }
            }
        } else {
            renameNodeAndClearOutAttributes(doc, node, sub);
        }
    } else if (node.nodeType === NodeType.TEXT_NODE) {
        node.textContent = escape(node.textContent);
    }

    if (node.childElementCount > 0) {
        Array.from(node.children).forEach(child => {
            recursivelyEvaluateNode(doc, child);
        });
    }
}

class UnexpectedSnippetFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnexpectedSnippetFormatError';
    }
}

const formattedSnippetFromTextPromise = (req, text) => {

    const headers = Object.assign( {
        accept: 'text/html',
        profile: 'https://www.mediawiki.org/wiki/Specs/Mobile-HTML/1.0.0',
        'content-type': 'multipart/form-data',
        'output-mode': 'editPreview'
    });

    const formData = Object.assign({
        wikitext: text
    });

    const request = Object.assign({
        method: 'post',
        uri: `https://en.wikipedia.org/api/rest_v1/transform/wikitext/to/mobile-html/${req.params.title}`,
        query: {},
        headers: headers,
        body: formData
    });

    return req.issueRequest(request)
        .then( (response) => {
            return mUtil.createDocument(response.body);
        }).then( (response) => {

            // removing tags here
            const elementsToRemove = response.querySelectorAll(tagsToRemoveEntirely);
            const elementsToRemoveList = Array.prototype.slice.call(elementsToRemove);
            const references = response.body.getElementsByClassName('mw-references-wrap');
            const referencesList = Array.prototype.slice.call(references);
            const finalListToStrip = elementsToRemoveList.concat(referencesList);
            finalListToStrip.forEach( (script) => {
                script.parentNode.removeChild(script);
            });

            // mobile-html endpoint seems to return a wrapper pcs, section and paragraph element.
            // strip these out as well.

            const pcsElement = response.getElementById('pcs');
            if (pcsElement) {
                const section = pcsElement.firstChild;
                if (section.tagName === 'SECTION') {
                    removeNodeButPreserveContents(section);
                }

                const paragraph = pcsElement.firstChild;
                if (paragraph && paragraph.tagName === 'P') {
                    removeNodeButPreserveContents(paragraph);
                }
            } else {
                throw new UnexpectedSnippetFormatError();
            }

            removeNodeButPreserveContents(pcsElement);

            // now walk remaining doc elements and strip unsupported elements

            recursivelyEvaluateNode(response, response.body);

            return response;
        })
        .then((response) => {
            return response.body.innerHTML;
        })
        .catch( (e) => {
            return null;
        });
};

const snippetPromise = (req, preformattedSnippet) => {

    if (preformattedSnippet.snippet === null ||
        preformattedSnippet.snippet === undefined ||
        preformattedSnippet.snippetType === null ||
        preformattedSnippet.snippetType === undefined ||
        preformattedSnippet.snippetType === 2) {
        // deleted complete line type.
        // we shouldn't get here but gracefully return null for snippet without trying to
        // format
        preformattedSnippet.snippet = null;
        return preformattedSnippet;
    }

    var strippedSnippet;
    const addHighlightStart = 'ioshighlightstart';
    const highlightEnd = 'ioshighlightend';

    const addHighlightStartBin = encoding.strToBin(addHighlightStart);
    const highlightEndBin = encoding.strToBin(highlightEnd);

    // strip deleted ranges from snippet
    // add added delimiters to type 3 & 5 snippet (Added and deleted words in line)
    // delimiters are later used for truncation starting point
    if (preformattedSnippet.outputType === 'large-change') {
        var snippetBinary = encoding.strToBin(preformattedSnippet.snippet);
        switch (preformattedSnippet.snippetType) {
            case 1: // Added complete line
                break;
            case 2: // Deleted complete line
                // should be caught earlier
                break;
            case 5:
            case 3: // Added and deleted words in line

                if (preformattedSnippet.snippetHighlightRanges === null ||
                preformattedSnippet.snippetHighlightRanges === undefined) {
                    break;
                }

                // first strip deleted text
                for (var d = preformattedSnippet.snippetHighlightRanges.length - 1; d >= 0; d-- ) {
                    const range = preformattedSnippet.snippetHighlightRanges[d];

                    switch (range.type) {
                        case 0: // Added
                            break;
                        case 1: // Deleted
                            snippetBinary = stringByRemovingSubstring(snippetBinary, range.start,
                                range.start + range.length);

                            for (var i = d; i < preformattedSnippet.snippetHighlightRanges.length;
                                 i++) {
                                const iRange = preformattedSnippet.snippetHighlightRanges[i];
                                switch (iRange.type) {
                                    case 0: // Added
                                        iRange.start -= range.length;
                                        preformattedSnippet.snippetHighlightRanges[i] = iRange;
                                        break;
                                    case 1: // Deleted
                                        break;
                                    default:
                                        break;
                                }
                            }
                            break;
                        default:
                            break;
                    }
                }

                // filter out deleted ranges
                // eslint-disable-next-line no-case-declarations
                const addedHighlightRanges = preformattedSnippet.snippetHighlightRanges
                    .filter(range => range.type !== null && range.type !== undefined &&
                        range.type === 0);

                // then add added text delimiters
                var addOffset = 0;
                addedHighlightRanges.forEach(function (range) {
                    switch (range.type) {
                        case 0: // Added
                            if (range.start === null || range.start === undefined) {
                                break;
                            }
                            snippetBinary = insertSubstringInString(snippetBinary,
                                addHighlightStartBin, range.start + addOffset);
                            addOffset += addHighlightStartBin.length;
                            break;
                        case 1: // Deleted
                            break;
                        default:
                            break;
                    }

                    snippetBinary = insertSubstringInString(snippetBinary, highlightEndBin,
                        range.start + addOffset + range.length);
                    addOffset += highlightEndBin.length;
                });
                break;
            default:
                break;
        }

        strippedSnippet = encoding.binToStr(snippetBinary);
    } else { // new talk page topic
        strippedSnippet = preformattedSnippet.snippet;
    }

    // make request to format to mobile-html, reassign result back to snippet
    return formattedSnippetFromTextPromise(req, strippedSnippet)
        .then( (response) => {
            // truncate snippet if needed
            // note: there's an interesting case where the existence of the delimiters changes the
            // output. In this case being next to
            // a wikitext link caused Parsoid to think that this was a new wikitext article
            // rather than an existing one. I'm forging ahead as I think the worst that could
            // happen is a missing link
            // but if other issues occur, we should remove delimiters. With that we would lose
            // all possibility of stretch goal highlighting
            // and truncation

            if (!response) {
                preformattedSnippet.snippet = null;
                return preformattedSnippet;
            }

            var truncatedSnippet = response;
            if (preformattedSnippet.snippetType !== undefined &&
                preformattedSnippet.snippetType !== null &&
                preformattedSnippet.snippetType === 5 || preformattedSnippet.snippetType === 3) {
                // try to trim the areas before the first ioshighlightstart and after the last
                // ioshighlight start so snippet is
                // focused on area that changed
                const firstStart = response.indexOf('ioshighlightstart');
                const lastStart = response.lastIndexOf('ioshighlightend');

                // early exit here - some highlighting was inadvertantly pruned out,
                // so don't attempt to truncate or preserve highlight delimiters
                if (firstStart === -1 || lastStart === -1) {
                    if (firstStart === -1 && lastStart !== -1) {
                        truncatedSnippet = truncatedSnippet.replace(/ioshighlightend/g, '');
                    }

                    if (firstStart !== -1 && lastStart === -1) {
                        truncatedSnippet = truncatedSnippet.replace(/ioshighlightstart/g, '');
                    }

                    preformattedSnippet.snippet = truncatedSnippet;
                    return preformattedSnippet;
                }

                // If highlighting starts at the beginning of the line, don't
                // truncate or prepend ...
                // Otherwise truncate and prepend ...
                // all lines truncate at the last highlight end line and suffix with ...
                // regardless if
                // it's the last thing in the snippet.
                truncatedSnippet = truncatedSnippet.slice(0, lastStart + 'ioshighlightend'.length);
                truncatedSnippet = truncatedSnippet.concat('...');
                if (firstStart > 0) {
                    truncatedSnippet = truncatedSnippet.slice(firstStart);
                    truncatedSnippet = '...'.concat(truncatedSnippet);
                }

                // UNCOMMENT THIS LINE IF HIGHLIGHTING IS NOT WORTH IT
                // truncatedSnippet = truncatedSnippet.replace(/ioshighlightstart/g, '')
                // .replace(/ioshighlightend/g, '');
            }

            truncatedSnippet = truncatedSnippet.replace(/ioshighlightstart/g, '<span class=\'highlight-start\'>').replace(/ioshighlightend/g, '</span>');
            preformattedSnippet.snippet = truncatedSnippet;
            return preformattedSnippet;
        });
};

const snippetPromises = (req, preformattedSnippets) => {
    return BBPromise.map(preformattedSnippets, function(preformattedSnippet) {
        return snippetPromise(req, preformattedSnippet);
    });
};

const diffAndRevisionPromises = (req, revisions) => {
    return BBPromise.map(revisions, function(revision) {
        return diffAndRevisionPromise(req, revision);
    });
};

function talkPageTitle(req) {
    return `Talk:${req.params.title}`;
}

const talkPageRevisionsPromise = (req, rvStart, rvEnd) => {
    return mwapi.queryForRevisions(req, talkPageTitle(req), 100, rvStart, rvEnd )
        .catch(e => {
            return null;
        });
};

function keyTitleForCache(req, title) {
    var keyTitle = title || req.params.title;
    const threshold = getThreshold(req);
    keyTitle = `${threshold}-${keyTitle}`;

    return keyTitle;
}

function getCachedAndUncachedItems(revisions, req, title) {

    // add cache to output and filter out of processing flow
    const uncachedRevisions = [];
    const cachedOutput = [];

    if (!revisions) {
        return Object.assign({
            uncachedRevisions: [],
            cachedOutput: []
        });
    }

    const keyTitle = keyTitleForCache(req, title);
    for (var i = 0; i < revisions.length; i++) {
        const revision = revisions[i];
        const domainDict = significantChangesCache[req.params.domain];
        if (domainDict) {
            const titleDict = domainDict[keyTitle];
            if (titleDict) {
                const cacheItem = titleDict[revision.revid];
                if (cacheItem) {
                    cachedOutput.push(cacheItem);
                    continue;
                }
            }
        }

        uncachedRevisions.push(revision);
    }

    return Object.assign({
        uncachedRevisions: uncachedRevisions,
        cachedOutput: cachedOutput
    });
}

function outputTypeCountsTowardsCache(outputType) {
    return outputType === 'large-change' || outputType === 'vandalism-revert';
}

function calculateCacheForTitleIsMaxedOut(titleDict) {
    // eslint-disable-next-line no-restricted-properties
    var titleArray = Object.values(titleDict);
    if (titleArray.length > 0) {
        titleArray.pop(); // remove maxedOut element
        const filteredObjects = titleArray.filter(outputObject =>
            outputTypeCountsTowardsCache(outputObject.outputType));
        return filteredObjects.length >= maxAllowedCachedArticleSignificantEvents;
    }

    return false;
}

function cacheForTitleIsMaxedOut(req, title) {
    const keyTitle = keyTitleForCache(req, title);
    var domainDict = significantChangesCache[req.params.domain];
    if (domainDict) {
        var titleDict = domainDict[keyTitle];
        if (titleDict) {
            if (titleDict.maxedOut) {
                return true;
            }
        }
    }

    return false;
}

function latestAndEarliestCachedRevisionTimestamp(req, title) {
    var domainDict = significantChangesCache[req.params.domain];
    const keyTitle = keyTitleForCache(req, title);
    if (domainDict) {
        var titleDict = domainDict[keyTitle];
        if (titleDict) {
            // eslint-disable-next-line no-restricted-properties
            var titleArray = Object.values(titleDict);
            if (titleArray.length > 0) {
                titleArray.pop(); // remove maxedOut element
                const sortedTitleObjects = titleArray.sort(function (a, b) {
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });
                var latestTimestamp = null;
                var earliestTimestamp = null;
                if (sortedTitleObjects.length > 0) {
                    latestTimestamp = sortedTitleObjects[0].timestamp;
                    earliestTimestamp = sortedTitleObjects[sortedTitleObjects.length - 1].timestamp;
                }

                return Object.assign( {
                    latestTimestamp: latestTimestamp,
                    earliestTimestamp: earliestTimestamp
                });
            }
        }
    }

    return null;
}

function setSignificantChangesCache(req, title, item) {
    var domainDict = significantChangesCache[req.params.domain];
    const keyTitle = keyTitleForCache(req, title);
    if (domainDict) {
        var titleDict = domainDict[keyTitle];
        if (titleDict) {
            titleDict[item.revid] = item;
            titleDict.maxedOut = calculateCacheForTitleIsMaxedOut(titleDict);
        } else {
            titleDict = {};
            titleDict[item.revid] = item;
            titleDict.maxedOut = calculateCacheForTitleIsMaxedOut(titleDict);
            domainDict[keyTitle] = titleDict;
        }
    } else {
        titleDict = {};
        titleDict[item.revid] = item;
        titleDict.maxedOut = calculateCacheForTitleIsMaxedOut(titleDict);
        domainDict = {};
        domainDict[keyTitle] = titleDict;
        significantChangesCache[req.params.domain] = domainDict;
    }
}

function cleanupCache(req) {

    // cleanup article cache
    var domainDict = significantChangesCache[req.params.domain];
    const articleTitle = keyTitleForCache(req, null);
        if (domainDict) {
        var titleDict = domainDict[articleTitle];
        if (titleDict) {
            // eslint-disable-next-line no-restricted-properties
            var titleArray = Object.values(titleDict);
            if (titleArray.length > 0) {
                titleArray.pop(); // remove maxedOut element

                const sortedTitleArray = titleArray.sort(function(a, b) {
                    if (a.timestamp && b.timestamp) {
                        return new Date(b.timestamp) - new Date(a.timestamp);
                    }
                    return 0;
                });
                const significantCachedObjects = sortedTitleArray.filter(outputObject => {
                    if (outputObject.outputType) {
                        return outputTypeCountsTowardsCache(outputObject.outputType);
                    }

                     return false;
                });

                const delta = significantCachedObjects.length -
                    maxAllowedCachedArticleSignificantEvents;

                var timestampCutoff = null;
                if (delta > 0 && delta < significantCachedObjects.length &&
                    significantCachedObjects.length > 0) {
                    const significantCachedObject =
                        significantCachedObjects[significantCachedObjects.length - delta - 1];
                    timestampCutoff = significantCachedObject.timestamp;
                }

                // clean out all cached article and cached talk page revisions
                // after the 100th significant event
                if (timestampCutoff) {
                    const cutoffDate = new Date(timestampCutoff);

                    // clean out from article cache
                    for (var s = sortedTitleArray.length - 1; s >= 0; s--) {
                        const sortedObjectToConsider = sortedTitleArray[s];
                        if (sortedObjectToConsider.timestamp !== null &&
                            sortedObjectToConsider.timestamp !== undefined) {
                            const objectDate = new Date(sortedObjectToConsider.timestamp);
                            if (objectDate < cutoffDate) {
                                delete titleDict[sortedObjectToConsider.revid];
                            } else {
                                break;
                            }
                        }
                    }

                    // clean out from talk page cache
                    // todo: why on earth do we get a talkPageTitle is not a function error here?
                    var talkPageTitle = `Talk:${req.params.title}`;
                    const keyTalkPageTitle = keyTitleForCache(req, talkPageTitle);
                    var talkPageTitleDict = domainDict[keyTalkPageTitle];
                    if (talkPageTitleDict) {
                        // eslint-disable-next-line no-restricted-properties
                        var talkPageTitleArray = Object.values(talkPageTitleDict);
                        if (talkPageTitleArray.length > 0) {
                            talkPageTitleArray.pop(); // remove maxedOut element
                            const sortedTalkPageTitleArray =
                                talkPageTitleArray.sort(function(a, b) {
                                return new Date(b.timestamp) - new Date(a.timestamp);
                            });

                            for (var t = sortedTalkPageTitleArray.length - 1; t >= 0; t--) {
                                const sortedTalkObjectToConsider = sortedTalkPageTitleArray[t];
                                const talkObjectDate = new
                                Date(sortedTalkObjectToConsider.timestamp);
                                if (talkObjectDate < cutoffDate) {
                                    delete talkPageTitleDict[sortedTalkObjectToConsider.revid];
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                }
            }

        }
    }
}

function getSummaryText(req) {
    var domainDict = significantChangesCache[req.params.domain];
    const articleTitle = keyTitleForCache(req, null);
    if (domainDict) {
        var titleDict = domainDict[articleTitle];
        if (titleDict) {
            // eslint-disable-next-line no-restricted-properties
            var titleArray = Object.values(titleDict);
            if (titleArray.length > 0) {
                titleArray.pop(); // remove maxedOut element
                const sortedTitleArray = titleArray.sort(function (a, b) {
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });
                const earliestItem = sortedTitleArray[sortedTitleArray.length - 1];
                if (earliestItem.timestamp !== undefined && earliestItem.timestamp !== null) {
                    const earliestTimestamp = earliestItem.timestamp;
                    var userids = [];
                    for (var i = 0; i <= titleArray.length - 1; i++) {
                        const object = titleArray[i];
                        userids.push(object.userid);
                    }
                    var dedupedUserIds = new Set(userids);
                    const numUsers = dedupedUserIds.size;

                    return Object.assign({
                        earliestTimestamp: earliestTimestamp,
                        numChanges: titleArray.length,
                        numUsers: numUsers
                    });
                }
            }
        }
    }

    return Object.assign( {
        earliestTimestamp: null,
        dedupedUserIds: null,
        numUsers: null
    });
}

function getSectionForDiffLine(diffBody, diffLine) {

    if (!diffBody || !diffLine) {
        return null;
    }

    var fromSection = null;
    var toSection = null;

    // safety
    if (!diffBody.from ||
    !diffBody.from.sections ||
    !diffBody.to ||
    !diffBody.to.sections ||
    !diffLine.offset) {
        return null;
    }

    // capture intro
    if ((!diffBody.from.sections ||
        diffBody.from.sections.length === 0) &&
        (!diffBody.to.sections ||
            diffBody.to.sections.length === 0)) {
        return null;
    }

    // diffLine.offset.from = 0 is still valid if it's at the very beginning of the article.
    // In this case javascript evaluates diffLine.offset.from to false,
    // hence the need for the separate check.
    if ((diffLine.offset.from || diffLine.offset.from === 0) &&
        diffBody.from.sections && diffBody.from.sections.length > 0 &&
        diffLine.offset.from < diffBody.from.sections[0].offset) {
        fromSection = 'Intro';
    }

    if ((diffLine.offset.to || diffLine.offset.to === 0) &&
        diffBody.to.sections && diffBody.to.sections.length > 0 &&
        diffLine.offset.to < diffBody.to.sections[0].offset) {
        toSection = 'Intro';
    }

    if (fromSection && toSection) {
        if (diffLine.offset.to && diffLine.offset.to.length > 0) {
            return toSection;
        } else {
            return fromSection;
        }
    }

    var prevSection = null;
    if (!fromSection && diffLine.offset.from) {
        for (let i = 0; i < diffBody.from.sections.length; i++) {
            const section = diffBody.from.sections[i];

            if (diffLine.offset.from < section.offset && prevSection) {
                if (prevSection.heading) {
                    fromSection = prevSection.heading;
                    break;
                }
            }

            prevSection = section;
        }

        if (!fromSection && diffLine.offset.from > 0) {
            if (prevSection.heading) {
                fromSection = prevSection.heading;
            }

        }
    }

    if (!toSection && diffLine.offset.to) {
        prevSection = null;
        for (let i = 0; i < diffBody.to.sections.length; i++) {

            const section = diffBody.to.sections[i];
            if (diffLine.offset.to < section.offset && prevSection) {
                if (prevSection.heading) {
                    toSection = prevSection.heading;
                    break;
                }
            }

            prevSection = section;
        }

        if (!toSection && diffLine.offset.to > 0) {
            if (prevSection.heading) {
                toSection = prevSection.heading;
            }
        }
    }

    if (diffLine.offset.to) {
        return toSection;
    } else {
        return fromSection;
    }
}

function updateDiffAndRevisionsWithCharacterCount(diffAndRevisions) {

    if (!diffAndRevisions) {
        return;
    }

    // Loop through diffs, filter out type 0 (context type) and assign byte change properties
    // to the remaining

    for (var i = 0; i < diffAndRevisions.length; i++) {
        const diffAndRevision = diffAndRevisions[i];

        if (!diffAndRevision.body || !diffAndRevision.body.diff) {
            continue;
        }

        var filteredDiffs = [];

        var aggregateAddedCount = 0;
        var aggregateDeletedCount = 0;
        var aggregateAddedSections = new Set();
        var aggregateDeletedSections = new Set();

        for (var d = 0; d < diffAndRevision.body.diff.length; d++) {
            const diff = diffAndRevision.body.diff[d];

            if (diff.type === undefined ||
            diff.type === null ||
            diff.text === undefined ||
            diff.text === null) {
                continue;
            }

            var lineAddedCount = 0;
            var lineDeletedCount = 0;
            switch (diff.type) {
                case 0: // Context line type
                    continue;
                case 1: // Add complete line type
                    lineAddedCount = diff.text.length;
                    break;
                case 2: // Delete complete line type
                    lineDeletedCount = diff.text.length;
                    break;
                case 5: // Move paragraph destination type (also has added and deleted
                // ranges in line)
                // eslint-disable-next-line no-fallthrough
                case 3: // Change line type (add and deleted ranges in line)

                    if (diff.highlightRanges === undefined ||
                        diff.highlightRanges === null) {
                        break;
                    }

                    for (var h = 0; h < diff.highlightRanges.length; h++) {
                        const range = diff.highlightRanges[h];

                        if (range.start === null ||
                            range.start === undefined ||
                        range.length === null ||
                        range.length === undefined) {
                            continue;
                        }

                        const binaryText = encoding.strToBin(diff.text);
                        const binaryRangeText = binaryText.substring(range.start,
                            range.start + range.length);
                        const rangeText = encoding.binToStr(binaryRangeText);
                        const lengthToCalculate = rangeText.length;

                        switch (range.type) {
                            case 0: // Add range type
                                lineAddedCount += lengthToCalculate;
                                break;
                            case 1: // Delete range type
                                lineDeletedCount += lengthToCalculate;
                                break;
                            default:
                                break;
                        }
                    }
                    break;
                default:
                    break;
            }

            aggregateAddedCount += lineAddedCount;
            aggregateDeletedCount += lineDeletedCount;

            if (lineAddedCount > 0 ) {
                const section = getSectionForDiffLine(diffAndRevision.body, diff);
                if (section) {
                    aggregateAddedSections.add(section);
                }
            }

            if (lineDeletedCount > 0) {
                const section = getSectionForDiffLine(diffAndRevision.body, diff);
                if (section) {
                    aggregateDeletedSections.add(section);
                }
            }

            diff.characterChange = new CharacterChange(lineAddedCount, lineDeletedCount);
            filteredDiffs.push(diff);
        }

        const aggregateCounts = new CharacterChange(aggregateAddedCount, aggregateDeletedCount);
        diffAndRevision.characterChangeWithSections = new CharacterChangeWithSections(
            aggregateCounts, Array.from(aggregateAddedSections),
            Array.from(aggregateDeletedSections));
        diffAndRevision.body.diff = filteredDiffs;
    }
}

function templateNamesToCallOut() {
    return ['cite', 'citation', 'short description'];
}

function needsToParseForAddedTemplates(text, includeOpeningBraces) {

    if (text === undefined ||
    text === null ||
    includeOpeningBraces === undefined ||
    includeOpeningBraces === null) {
        return false;
    }

    const names = templateNamesToCallOut();

    for (var n = 0; n < names.length; n++) {
        const name = names[n];

        if ((text.includes(`{{${name}`) && includeOpeningBraces) || (text.includes(`${name}`) &&
            !includeOpeningBraces)) {
            return true;
        }
    }

    return false;
}

// BUG: https://en.wikipedia.org/w/index.php?title=United_States&type=revision
// &diff=965295364&oldid=965071033
// Should we be catching added <ref> tags?
// ANOTHER BUG:
// Sometimes new citations have spaces within deemed the same, so only part of it
// is sent in as text whereas we need all of cite.
// See here
// https://en.wikipedia.org/w/index.php?title=United_States&type=revision&diff=971349395&oldid=971332725
// Also this one
// https://en.wikipedia.org/w/index.php?title=United_States&type=revision&diff=971260075&oldid=971259267
// Definitely some mangled 'added-text' snippets going on here.
// https://en.wikipedia.org/w/index.php?title=United_States&type=revision&diff=970665187&oldid=970577931
function structuredTemplatePromise(text, diffItem, revision) {
    return new BBPromise((resolve) => {
        var main = PRFunPromise.async(function*() {
            var pdoc = yield ParsoidJS.parse(text, { pdoc: true });
            const splitTemplates = yield PRFunPromise.map(pdoc.filterTemplates(),
                ParsoidJS.toWikitext);
            var templateObjects = [];

            // Note: for now just grabbing the first split template
            // (which includes only parent templates and not nested)
            // to avoid duplicate template problem. If we need nested support we can loop through
            // all split templates, then uniquely identify and dedupe templates later.
            if (splitTemplates.length === 0) {
                // bail early
                const result = Object.assign( {
                    revision: revision,
                    diffItem: diffItem,
                    templates: templateObjects
                });
                resolve(result);
                return;
            }
            for (var s = 0; s < 1; s++) {
                const splitTemplateText = splitTemplates[s];

                const innerPdoc = yield ParsoidJS.parse(splitTemplateText, { pdoc: true });
                const individualTemplates = innerPdoc.filterTemplates();
                if (individualTemplates !== undefined && individualTemplates !== null) {
                    for (var i = 0; i < individualTemplates.length; i++) {
                        const template = individualTemplates[i];

                        if (!needsToParseForAddedTemplates(template.name, false)) {
                            continue;
                        }

                        if (template.name === undefined ||
                            template.name === null ||
                            template.params === undefined ||
                            template.params === null) {
                            continue;
                        }

                        var dict = {};
                        dict.name = template.name;
                        for (var p = 0; p < template.params.length; p++) {
                            const param = template.params[p].name;
                            if (param !== undefined && param !== null) {
                                const value = yield template.get(param).value.toWikitext();
                                dict[param] = value;
                            }
                        }
                        templateObjects.push(dict);
                    }
                }
            }
            const result = Object.assign( {
               revision: revision,
                diffItem: diffItem,
               templates: templateObjects
            });
            resolve(result);
        });

        main().done();
    });
}

function addStructuredTemplates(diffAndRevisions) {

    var promises = [];

    if (!diffAndRevisions) {
        return Promise.all(promises)
            .then( (response) => {
                return diffAndRevisions;
            });
    }

    for (var i = 0; i < diffAndRevisions.length; i++) {
        const diffAndRevision = diffAndRevisions[i];

        if (diffAndRevision.body === null ||
        diffAndRevision.body === undefined ||
        diffAndRevision.body.diff === null ||
        diffAndRevision.body.diff === undefined ||
            diffAndRevision.revision === null ||
            diffAndRevision.revision === undefined) {
            continue;
        }

        for (var d = 0; d < diffAndRevision.body.diff.length; d++) {
            const diffItem = diffAndRevision.body.diff[d];

            if (diffItem.text === undefined ||
                diffItem.text === null) {
                continue;
            }

            switch (diffItem.type) {
                case 1: // Add complete line type
                    if (needsToParseForAddedTemplates(diffItem.text, true)) {
                        promises.push(structuredTemplatePromise(diffItem.text, diffItem,
                            diffAndRevision.revision));
                    }
                    break;
                case 5:
                case 3: {

                    const binaryText = encoding.strToBin(diffItem.text);
                    var previousBinaryRangeText = null;
                    var previousRangeEndIndex = null;
                    for (var h = 0; h < diffItem.highlightRanges.length; h++) {
                        const range = diffItem.highlightRanges[h];

                        if (range.start === undefined ||
                            range.start === null ||
                            range.length === undefined ||
                            range.length === null) {
                            continue;
                        }

                        switch (range.type) {
                            case 0: { // Add range type

                                const binaryRangeText = binaryText.substring(range.start,
                                    range.start + range.length);
                                if (previousBinaryRangeText !== null &&
                                    previousRangeEndIndex !== null) {

                                    const inBetweenText = binaryText.substring(
                                        previousRangeEndIndex,
                                        range.start);
                                    if (inBetweenText === ' ') {
                                        previousBinaryRangeText += inBetweenText;
                                        previousBinaryRangeText += binaryRangeText;
                                        previousRangeEndIndex = range.start + range.length;
                                        continue;
                                    } else {
                                        // before attempting to send off for template parsing,
                                        // grab following '}}' to capture edge case templates
                                        const nextTwoCharacters = binaryText
                                            .substring(previousRangeEndIndex,
                                            previousRangeEndIndex + 2);
                                        if (nextTwoCharacters === '}}') {
                                            previousBinaryRangeText += '}}';
                                        }
                                        const rangeText = encoding
                                            .binToStr(previousBinaryRangeText);
                                        if (needsToParseForAddedTemplates(rangeText,
                                            true)) {
                                            promises.push(structuredTemplatePromise(rangeText,
                                                diffItem,
                                                diffAndRevision.revision));
                                        }

                                        previousBinaryRangeText = binaryRangeText;
                                        previousRangeEndIndex = range.start + range.length;
                                    }

                                } else {
                                    previousBinaryRangeText = binaryRangeText;
                                    previousRangeEndIndex = range.start + range.length;
                                    continue;
                                }
                            }
                                break;
                            case 1: // Deleted
                                // if there's a space before deleted text, include it
                                // so it gets picked up in inBetweenText check up there
                                // const textBeforeDeleted = binaryText.substring(range.start - 1,
                                //     (range.start - 1) + 1);
                                // if (textBeforeDeleted === ' ') {
                                //     previousRangeEndIndex = range.start - 1;
                                // } else {
                                //     previousRangeEndIndex = range.start + range.length;
                                // }

                                previousRangeEndIndex = range.start + range.length;

                        }
                    }

                    // there's probably one last straggler range that we haven't checked
                    // due to how we're doing things

                    if (previousBinaryRangeText !== null && previousRangeEndIndex !== null) {

                        // before attempting to send off for template parsing,
                        // grab following '}}' to capture edge case templates
                        const nextTwoCharacters = binaryText.substring(previousRangeEndIndex,
                            previousRangeEndIndex + 2);
                        if (nextTwoCharacters === '}}') {
                            previousBinaryRangeText += '}}';
                        }

                        // also if first 2 characters start with '}}', it might throw things off
                        const firstTwoCharacters = previousBinaryRangeText.substring(0,
                            2);
                        if (firstTwoCharacters === '}}') {
                            previousBinaryRangeText = previousBinaryRangeText.substring(2,
                                previousBinaryRangeText.length);
                        }

                        const rangeText = encoding.binToStr(previousBinaryRangeText);
                        if (needsToParseForAddedTemplates(rangeText, true)) {
                            promises.push(structuredTemplatePromise(rangeText, diffItem,
                                diffAndRevision.revision));
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        }
    }

    return Promise.all(promises)
        .then( (response) => {

           // loop through responses, add to revision.

            diffAndRevisions.forEach( (diffAndRevision) => {

                var templatesAndDiffItems = [];
                response.forEach( (item) => {

                   if (item.revision !== null &&
                   item.revision !== undefined &&
                   diffAndRevision.revision !== null &&
                   diffAndRevision.revision !== undefined &&
                   item.templates !== null &&
                   item.templates !== undefined &&
                   item.templates.length > 0) {
                       if (item.revision.revid === diffAndRevision.revision.revid) {
                           const templateAndDiffItem = Object.assign({
                               templates: item.templates,
                               diffItem: item.diffItem
                           });

                           templatesAndDiffItems.push(templateAndDiffItem);
                       }
                   }
               });

                diffAndRevision.templatesAndDiffItems = templatesAndDiffItems;
            });

            return diffAndRevisions;
        });
}

function getNewTopicDiffAndRevisions(talkDiffAndRevisions) {

    if (talkDiffAndRevisions === null ||
        talkDiffAndRevisions === undefined) {
        return null;
    }

     const newSectionTalkPageDiffAndRevisions = [];
    // const talkPage = talkPageBody.query.pages;
    // const talkPageObject = talkPage[Object.keys(talkPage)[0]];
    // const talkPageRevisions = talkPageObject.revisions;
    for (var index = 0; index < talkDiffAndRevisions.length; index++) {
        const diffAndRevision = talkDiffAndRevisions[index];

        if (diffAndRevision.revision === null ||
        diffAndRevision.revision === undefined ||
        diffAndRevision.revision.comment === null ||
        diffAndRevision.revision.comment === undefined ||
            diffAndRevision.revision.userid === null ||
            diffAndRevision.revision.userid === undefined ||
            diffAndRevision.revision.tags === null ||
            diffAndRevision.revision.tags === undefined) {
            continue;
        }

        if (diffAndRevision.revision.comment.toLowerCase().includes('new section')
            && !diffAndRevision.revision.comment.toLowerCase()
                .includes('semi-protected edit request') // don't show semi-protected edit requests
            && diffAndRevision.revision.userid !== 4936590) { // don't show signbot topics
            // see if this section was reverted in previous iterations
            var wasReverted = false;
            if (index - 1 > 0) {
                var nextDiffAndRevision = talkDiffAndRevisions[index - 1];
                if (nextDiffAndRevision.revision.userid === 4936590) { // signbot,
                    // look for next revision
                    if (index - 2 > 0) {
                        nextDiffAndRevision = talkDiffAndRevisions[index - 2];
                    }
                }
                if (nextDiffAndRevision.revision.tags.includes('mw-undo') ||
                    nextDiffAndRevision.revision.tags.includes('mw-rollback')) {
                    wasReverted = true;
                }
            }
            if (wasReverted === false) {
                newSectionTalkPageDiffAndRevisions.push(diffAndRevision);
            }
        }
    }

    return newSectionTalkPageDiffAndRevisions;
}

function getAllChangedDiffLines(diffBody) {
    const allChangedDiffLines = diffBody.diff.filter((item) => {
       return item.type !== 0;
    });
    return allChangedDiffLines;
}

function getLargestDiffLine(diffBody) {

    if (diffBody === null ||
        diffBody === undefined ||
        diffBody.diff === null ||
        diffBody.diff === undefined) {
        return null;
    }

    diffBody.diff.sort(function(a, b) {

        if (b.characterChange === null ||
        b.characterChange === undefined ||
            a.characterChange === null ||
            a.characterChange === undefined) {
            return 0;
        }

        return b.characterChange.totalCount() - a.characterChange.totalCount();
    });

    if (diffBody.diff.length > 0) {
        const largestDiffLine = diffBody.diff[0];
        return largestDiffLine;
    }

    return null;
}

function getLargestDiffLineOfAdded(diffBody) {

    if (diffBody === null ||
        diffBody === undefined ||
        diffBody.diff === null ||
        diffBody.diff === undefined) {
        return null;
    }

    diffBody.diff.sort(function(a, b) {

        if (b.characterChange === null ||
            b.characterChange === undefined ||
            a.characterChange === null ||
            a.characterChange === undefined) {
            return 0;
        }

        return b.characterChange.addedCount - a.characterChange.addedCount;
    });

    if (diffBody.diff.length > 0) {
        const largestDiffLine = diffBody.diff[0];
        return largestDiffLine;
    }

    return null;
}

function textContainsEmptyLineOrSection(text) {

    if (text === null ||
    text === undefined) {
        return false;
    }

    const trimmedText = text.trim();
    return (trimmedText.length === 0 || text.includes('=='));
}

function getFirstDiffLineWithContent(diffBody) {

    if (diffBody === null ||
        diffBody === undefined ||
        diffBody.diff === null ||
        diffBody.diff === undefined) {
        return null;
    }

    for (let i = 0; i < diffBody.diff.length; i++) {
        const diff = diffBody.diff[i];

        if (diff.type === null ||
        diff.type === undefined ||
            diff.text === null ||
            diff.text === undefined) {
            continue;
        }

        switch (diff.type) {
            case 0: // Context line type
                continue;
            default:
                if (textContainsEmptyLineOrSection(diff.text)) {
                    continue;
                } else {
                    return diff;
                }
        }
    }

    return null;
}

function sortOutput(output) {

    if (output === null ||
    output === undefined) {
        return null;
    }

    // sort by date
    return output.sort(function(a, b) {

        if (b.timestamp === null ||
        b.timestamp === undefined ||
        a.timestamp === null ||
        a.timestamp === undefined) {
            return 0;
        }

        return new Date(b.timestamp) - new Date(a.timestamp);
    });
}

function cleanOutput(output) {

    if (output === null ||
    output === undefined) {
        return null;
    }

    // collapses small changes, converts large changes only to info needed

    const cleanedOutput = [];
    let numSmallChanges = 0;
    for (var i = 0; i < output.length; i++) {
        const item = output[i];

        if (item.outputType === null ||
        item.outputType === undefined) {
            continue;
        }

        if (item.outputType === 'small-change') {
            numSmallChanges++;
            continue;
        } else {
            if (numSmallChanges > 0) {
                const change = new ConsolidatedSmallOutput(numSmallChanges);
                cleanedOutput.push(change);
                numSmallChanges = 0;
            }

            if (item.outputType === 'large-change') {
                cleanedOutput.push(new LargeOutput(item));
            } else if (item.outputType === 'new-talk-page-topic') {
                cleanedOutput.push(new NewTalkPageTopic(item));
            } else {
                cleanedOutput.push(item);
            }
        }
    }

    if (numSmallChanges > 0) {
        const change = new ConsolidatedSmallOutput(numSmallChanges);
        cleanedOutput.push(change);
        numSmallChanges = 0;
    }

    return cleanedOutput;
}

function editCountsAndGroupsPromise(req, cleanedOutput) {

    if (cleanedOutput === undefined ||
    cleanedOutput === null) {
        return null;
    }

    // gather unique userids
    var userids = [];
    cleanedOutput.forEach( (outputItem) => {
        if (outputItem.userid !== undefined && outputItem.userid !== null &&
            outputItem.userid !== 0) {
            userids.push(outputItem.userid);
        }
    });
    var dedupedIdsSet = new Set(userids);
    var dedupedIds = Array.from(dedupedIdsSet);
    // fetch counts and groups
    return mwapi.queryForUsers(req, dedupedIds)
        .then( (response) => {
            // distribute results back into cleanedOutput

            if (response.body === null ||
            response.body === undefined ||
            response.body.query === null ||
            response.body.query === undefined ||
            response.body.query.users === null ||
            response.body.query.users === undefined) {
                cleanedOutput.forEach( (outputItem) => {
                    if (outputItem.outputType !== 'small-change') {
                        outputItem.userGroups = null;
                        outputItem.userEditCount = null;
                    }
                });
                return cleanedOutput;
            }

            const users = response.body.query.users;
            users.forEach( (user) => {
                cleanedOutput.forEach( (outputItem) => {

                    if (outputItem.userid !== null &&
                    outputItem.userid !== undefined &&
                    user.userid !== null &&
                    user.userid !== undefined) {
                        if (outputItem.userid === user.userid) {
                            outputItem.userGroups = user.groups;
                            outputItem.userEditCount = user.editcount;
                        }
                    }
                });
            });

            return cleanedOutput;
        })
        .catch( (e) => {
            return cleanedOutput;
        });
}

function isRequestingFirstPage(req) {
    return req.query.rvstartid === undefined || req.query.rvstartid === null;
}

function shaFromSortedOutput(req, sortedOutput) {

    if (sortedOutput === null ||
    sortedOutput === undefined) {
        return null;
    }

    if (!isRequestingFirstPage(req)) {
        return null;
    }

    var shaTitle;
    var shaRevID;
    for (var i = 0; i < sortedOutput.length; i++) {
        const output = sortedOutput[i];

        if (output.outputType === undefined ||
            output.outputType === null ||
            output.revid === undefined ||
            output.revid === null) {
            continue;
        }

        if (output.outputType === 'large-change') {
            shaTitle = req.params.title;
            shaRevID = output.revid;
            break;
        }

        if (output.outputType === 'new-talk-page-topic') {
            shaTitle = talkPageTitle(req);
            shaRevID = output.revid;
            break;
        }
    }

    if (shaTitle === undefined || shaTitle === null || shaRevID === undefined ||
        shaRevID === null) {
        // grab first item, even if it's a small type
        for (var s = 0; s < sortedOutput.length; s++) {
            const output = sortedOutput[s];
            if (output.outputType === undefined ||
                output.outputType === null ||
                output.revid === undefined ||
                output.revid === null) {
                continue;
            }

            if (output.outputType === 'small-change') {
                shaTitle = req.params.title;
                shaRevID = output.revid;
                break;
            }
        }
    }

    if (shaTitle === undefined || shaTitle === null || shaRevID === undefined ||
        shaRevID === null) {
        return null;
    }

    return tUtil.createSha256(`${shaTitle}${shaRevID}`);
}

class MalformedArticleRevisionResponse extends Error {
    constructor(message) {
        super(message);
        this.name = 'MalformedArticleRevisionResponse';
    }
}

class AllArticleDiffCallsFailed extends Error {
    constructor(message) {
        super(message);
        this.name = 'AllArticleDiffCallsFailed';
    }
}

function getSignificantEvents(req, res) {

    // STEP 1: Gather list of article revisions
    return mwapi.queryForRevisions(req)
        .then( (response) => {

            // STEP 2: All at once gather diffs for each uncached revision and list of
            // talk page revisions

            if (response.body === undefined ||
            response.body === null ||
            response.body.query === undefined ||
            response.body.query === null ||
            response.body.query.pages === undefined ||
            response.body.query.pages === null ||
            response.body.query.pages[0] === undefined ||
            response.body.query.pages[0] === null ||
                response.body.query.pages[0].revisions === undefined ||
                response.body.query.pages[0].revisions === null) {
                throw new MalformedArticleRevisionResponse();
            }

            const revisions = response.body.query.pages[0].revisions;

            // BEGIN: PAGE CUTOFF LOGIC
            // page cutoff: if cache is maxed out, filter out any revisions
            // that occur before the cutoff
            const cutoff = latestAndEarliestCachedRevisionTimestamp(req);
            var filteredRevisions;
            const isMaxedOut = cacheForTitleIsMaxedOut(req);
            if (isMaxedOut && cutoff && cutoff.earliestTimestamp) {
                filteredRevisions = revisions.filter((revision) => {
                    if (revision.timestamp === undefined || revision.timestamp === null ||
                    cutoff.earliestTimestamp === undefined || cutoff.earliestTimestamp === null) {
                        return 0;
                    }
                    return new Date(revision.timestamp) > new Date(cutoff.earliestTimestamp);
                });
            } else {
                filteredRevisions = revisions;
            }

            // if cache is maxed out and filteredRevisions contains
            // revisions from after the latest cached revision,
            // propagate flag for needing cleanup later
            var needsCacheCleanup = false;
            if (isMaxedOut) {
                for (var i = 0; i < filteredRevisions.length; i++) {

                    const revision = filteredRevisions[i];

                    if (revision.timestamp === undefined || revision.timestamp === null ||
                        cutoff.earliestTimestamp === undefined ||
                        cutoff.earliestTimestamp === null) {
                        continue;
                    }

                    const timestamp = new Date(revision.timestamp);
                    const latestCacheTimestamp = new Date(cutoff.latestTimestamp);
                    if (timestamp > latestCacheTimestamp) {
                        needsCacheCleanup = true;
                        break;
                    }
                }
            }
            // END: PAGE CUTOFF LOGIC

            var nextRvStartId = null;
            var talkPageRvStartId = null;
            var talkPageRvEndId = null;
            if (filteredRevisions && filteredRevisions.length > 0) {
                const earliestRevision = filteredRevisions[filteredRevisions.length - 1];
                const latestRevision = filteredRevisions[0];
                if (earliestRevision.parentid !== null && earliestRevision.parentid !== undefined
                && latestRevision.timestamp !== null && latestRevision.timestamp !== undefined) {
                    nextRvStartId = earliestRevision.parentid;
                    // if rvstartid is missing from query, they are fetching the first page
                    // if they are fetching the first page, we don't want to block of
                    // talk page revision fetching at the start, in case talk page topics came in
                    // after the latest article revision
                    talkPageRvStartId = isRequestingFirstPage(req) ? null :
                        latestRevision.timestamp;
                    talkPageRvEndId = earliestRevision.timestamp;
                }
            }

            const articleEvalResults = getCachedAndUncachedItems(filteredRevisions, req, null);

            // save cached article revisions to finalOutput
            const finalOutput = articleEvalResults.cachedOutput;

            const talkPageRevisionPromise = (talkPageRvEndId !== null) ?
                talkPageRevisionsPromise(req, talkPageRvStartId, talkPageRvEndId)
                : null;

            return BBPromise.props({
                articleDiffAndRevisions: diffAndRevisionPromises(req,
                    articleEvalResults.uncachedRevisions),
                talkPageRevisions: talkPageRevisionPromise,
                nextRvStartId: nextRvStartId,
                needsCacheCleanup: needsCacheCleanup,
                finalOutput: finalOutput
            });
        })
        .then( (response) => {

            // if all articleDiffAndRevisions fail, return error
            if (response.articleDiffAndRevisions !== undefined &&
                response.articleDiffAndRevisions !== null) {
                const articleDiffAndRevisionsNullDiff =
                    response.articleDiffAndRevisions.filter(diffAndRevision => {
                    return diffAndRevision.body === undefined || diffAndRevision.body === null;
                });

                if (articleDiffAndRevisionsNullDiff.length ===
                    response.articleDiffAndRevisions.length &&
                    articleDiffAndRevisionsNullDiff.length > 0 &&
                    response.articleDiffAndRevisions.length > 0) { // all diff calls failed
                    throw new AllArticleDiffCallsFailed();
                }
            }

            // STEP 3: All at once gather diffs for uncached talk page revisions

            const articleDiffAndRevisions = response.articleDiffAndRevisions
                .filter(x => x !== null);
            const nextRvStartId = response.nextRvStartId;
            const needsCacheCleanup = response.needsCacheCleanup;

            if (response.talkPageRevisions !== undefined && response.talkPageRevisions !== null &&
                response.talkPageRevisions.body !== undefined &&
                response.talkPageRevisions.body !== null &&
                response.talkPageRevisions.body.query !== undefined &&
                response.talkPageRevisions.body.query !== null &&
                response.talkPageRevisions.body.query.pages[0] !== undefined &&
                response.talkPageRevisions.body.query.pages[0] !== null &&
                response.talkPageRevisions.body.query.pages[0].revisions !== undefined &&
                response.talkPageRevisions.body.query.pages[0].revisions !== null) {
                const talkPageRevisions = response.talkPageRevisions.body.query.pages[0].revisions;
                const talkPageEvalResults = getCachedAndUncachedItems(talkPageRevisions,
                    req, talkPageTitle(req));

                // save cached talk page revisions to finalOutput
                const finalOutput = response.finalOutput.concat(talkPageEvalResults.cachedOutput);

                // for each uncached talk page revision, gather diffs
                return diffAndRevisionPromises(req, talkPageEvalResults.uncachedRevisions)
                    .then( (response) => {
                        return Object.assign({
                            articleDiffAndRevisions: articleDiffAndRevisions,
                            talkDiffAndRevisions: response,
                            nextRvStartId: nextRvStartId,
                            needsCacheCleanup: needsCacheCleanup,
                            finalOutput: finalOutput
                        });
                    });
            } else {
                return Object.assign({
                    articleDiffAndRevisions: articleDiffAndRevisions,
                    talkDiffAndRevisions: null,
                    nextRvStartId: nextRvStartId,
                    needsCacheCleanup: needsCacheCleanup,
                    finalOutput: response.finalOutput
                });
            }
        })
        .then( (response) => {

            // Determine character size of change for every diff line and aggregate
            // for every revision
            updateDiffAndRevisionsWithCharacterCount(response.articleDiffAndRevisions);
            if (response.talkDiffAndRevisions) {
                updateDiffAndRevisionsWithCharacterCount(response.talkDiffAndRevisions);
            }

            // Flag added template types
            return addStructuredTemplates(response.articleDiffAndRevisions, false)
                .then( (articleDiffAndRevisions) => {
                    response.articleDiffAndRevisions = articleDiffAndRevisions;
                    return response;
                });
        })
        .then( (response) => {

            const threshold = getThreshold(req);

            // segment off into types
            var uncachedOutput = [];

            for (var i = 0; i < response.articleDiffAndRevisions.length; i++) {
                const diffAndRevision = response.articleDiffAndRevisions[i];

                if (diffAndRevision.revision === undefined || diffAndRevision.revision === null) {
                    continue;
                }

                const revision = diffAndRevision.revision;

                // edge case in case one of the diff endpoints fail...fallback to small type
                if (diffAndRevision.body === undefined || diffAndRevision.body === null) {
                    const smallOutputObject = new SmallOutput(revision.revid,
                        revision.timestamp, revision.user, revision.userid);
                    uncachedOutput.push(smallOutputObject);
                    continue;
                }

                if (revision.tags !== undefined && revision.tags !== null &&
                    revision.tags.includes('mw-rollback') &&
                    revision.comment !== undefined || revision.comment !== null &&
                    revision.comment.toLowerCase().includes('revert') &&
                    revision.comment.toLowerCase().includes('vandalism') &&
                    diffAndRevision.body !== null && diffAndRevision.body !== undefined) {
                    const allChangedDiffLines = getAllChangedDiffLines(diffAndRevision.body);
                    const sections = allChangedDiffLines.map(diffLine =>
                        getSectionForDiffLine(diffAndRevision.body,
                        diffLine));
                    const dedupedSections = new Set(sections);
                    const vandalismRevertOutputObject = new VandalismOutput(revision.revid,
                        revision.timestamp, revision.user, revision.userid,
                        Array.from(dedupedSections));
                    uncachedOutput.push(vandalismRevertOutputObject);
                } else {

                    var significantChanges = [];
                    if (diffAndRevision.templatesAndDiffItems !== undefined &&
                        diffAndRevision.templatesAndDiffItems !== null &&
                        diffAndRevision.templatesAndDiffItems.length > 0) {

                        var sections = [];
                        var combinedTemplates = [];

                        for (var t = 0; t < diffAndRevision.templatesAndDiffItems.length; t++) {
                            const templatesAndDiffItem = diffAndRevision.templatesAndDiffItems[t];
                            const templates = templatesAndDiffItem.templates;
                            const diffItem = templatesAndDiffItem.diffItem;
                            const section = getSectionForDiffLine(diffAndRevision.body,
                                diffItem);
                            if (section) {
                                sections.push(section);
                            }
                            if (templates) {
                                combinedTemplates.push(templates);
                            }
                        }

                        const dedupedSections = new Set(sections);
                        const newReferenceOutputObject =
                            new NewReferenceOutput(Array.from(dedupedSections),
                            combinedTemplates);
                        significantChanges.push(newReferenceOutputObject);
                    }

                    if (diffAndRevision.characterChangeWithSections !== undefined &&
                        diffAndRevision.characterChangeWithSections !== null &&
                        diffAndRevision.characterChangeWithSections.counts !== undefined &&
                        diffAndRevision.characterChangeWithSections.counts !== null &&
                        diffAndRevision.characterChangeWithSections.counts.totalCount() >
                        threshold) {

                        if (diffAndRevision.characterChangeWithSections.counts.addedCount > 0) {
                            const largestDiffLine = getLargestDiffLineOfAdded(diffAndRevision.body);
                            if (largestDiffLine !== undefined && largestDiffLine !== null) {
                                const addedTextOutputObject = new AddedTextOutputExpanded(
                                    diffAndRevision.characterChangeWithSections,
                                    largestDiffLine.text,
                                    largestDiffLine.type, largestDiffLine.highlightRanges);
                                significantChanges.push(addedTextOutputObject);
                            }
                        }

                        if (diffAndRevision.characterChangeWithSections.counts.deletedCount > 0) {
                            const deletedTextOutputObject = new DeletedTextOutput(
                                diffAndRevision.characterChangeWithSections);
                            significantChanges.push(deletedTextOutputObject);
                        }
                    }

                    if (significantChanges.length > 0) {
                        const largeOutputObject = new LargeOutputExpanded(revision.revid,
                            revision.timestamp, revision.user, revision.userid, significantChanges);
                        uncachedOutput.push(largeOutputObject);
                    } else {
                        const smallOutputObject = new SmallOutput(revision.revid,
                            revision.timestamp, revision.user, revision.userid);
                        uncachedOutput.push(smallOutputObject);
                    }
                }
            }

            // get new talk page revisions, add to uncachedOutput. it will be sorted later.
            if (response.talkDiffAndRevisions !== undefined &&
                response.talkDiffAndRevisions !== null) {
                const newTopicDiffAndRevisions = getNewTopicDiffAndRevisions(
                    response.talkDiffAndRevisions);
                if (newTopicDiffAndRevisions !== undefined && newTopicDiffAndRevisions !== null) {
                    newTopicDiffAndRevisions.forEach(function (diffAndRevision) {
                        const revision = diffAndRevision.revision;

                        const nullSnippetTalkPageObject = new NewTalkPageTopicExtended(
                            revision.revid,revision.timestamp, revision.user, revision.userid,
                            null,null, null, null, null);
                        if (diffAndRevision.body !== undefined && diffAndRevision.body !== null) {
                            const firstDiffLine = getFirstDiffLineWithContent(diffAndRevision.body);
                            if (firstDiffLine !== undefined && firstDiffLine !== null) {
                                const section = getSectionForDiffLine(diffAndRevision.body,
                                    firstDiffLine);
                                const newTalkPageTopicOutputObject = new NewTalkPageTopicExtended(
                                    revision.revid,revision.timestamp, revision.user,
                                    revision.userid,
                                    firstDiffLine.text,firstDiffLine.type,
                                    firstDiffLine.highlightRanges,
                                    diffAndRevision.characterChangeWithSections.counts, section);
                                uncachedOutput.push(newTalkPageTopicOutputObject);
                            } else {
                                uncachedOutput.push(nullSnippetTalkPageObject);
                            }
                        } else {
                            const newTalkPageTopicOutputObject = new NewTalkPageTopicExtended(
                                revision.revid,revision.timestamp, revision.user, revision.userid,
                                null,null, null, null);
                            uncachedOutput.push(nullSnippetTalkPageObject);
                        }
                    });
                }
            }

            return Object.assign({ nextRvStartId: response.nextRvStartId,
                needsCacheCleanup: response.needsCacheCleanup,
                uncachedOutput: uncachedOutput,
                finalOutput: response.finalOutput } );
        })
        .then( (response) => {

            var preformattedSnippets = [];
            for (var o = 0; o < response.uncachedOutput.length; o++) {
                const item = response.uncachedOutput[o];

                if (item.outputType === undefined || item.outputType === null) {
                    continue;
                }

                if (item.outputType === 'new-talk-page-topic' && item.snippet !== null) {
                    const snippet = new PreformattedSnippet(item.revid, item.outputType,
                        item.snippet,1, null,
                        null);
                    preformattedSnippets.push(snippet);
                } else if (item.outputType === 'large-change') {
                    for (let i = 0; i < item.significantChanges.length; i++) {
                        const significantChange = item.significantChanges[i];

                        if (significantChange.outputType === undefined ||
                            significantChange.outputType === null ||
                            significantChange.snippet === undefined ||
                            significantChange.snippet === null ||
                            significantChange.snippetType === undefined ||
                            significantChange.snippetType === null) {
                            continue;
                        }

                        if (significantChange.outputType === 'added-text') {
                            const snippet = new PreformattedSnippet(item.revid, item.outputType,
                                significantChange.snippet, significantChange.snippetType,
                                significantChange.snippetHighlightRanges, i);
                            preformattedSnippets.push(snippet);
                        }
                    }
                }
            }

            // convert large snippets from wikitext to mobile-html
            return snippetPromises(req, preformattedSnippets)
                .then( (formattedSnippets) => {

                    // reassign formattedSnippets to snippet output
                    for (var fs = 0; fs < formattedSnippets.length; fs++) {
                        const formattedSnippet = formattedSnippets[fs];

                        for (var i = 0; i < response.uncachedOutput.length; i++) {
                            const item = response.uncachedOutput[i];

                            if (item.revid === undefined || item.revid === null ||
                                formattedSnippet.revid === undefined ||
                                formattedSnippet.revid === null ||
                                item.outputType === undefined || item.outputType === null ||
                                formattedSnippet.outputType === undefined ||
                                formattedSnippet.outputType === null) {
                                continue;
                            }

                            if (item.revid === formattedSnippet.revid &&
                                item.outputType === formattedSnippet.outputType) {
                                if (formattedSnippet.outputType === 'new-talk-page-topic') {
                                    item.snippet = formattedSnippet.snippet;
                                } else if (formattedSnippet.outputType === 'large-change') {

                                    if (item.significantChanges === undefined ||
                                        item.significantChanges === null ||
                                        formattedSnippet.indexOfSignificantChanges === undefined ||
                                        formattedSnippet.indexOfSignificantChanges === null) {
                                        continue;
                                    }

                                    if (item.significantChanges.length >
                                        formattedSnippet.indexOfSignificantChanges) {
                                        var significantChange =
                                            item.significantChanges[
                                                formattedSnippet.indexOfSignificantChanges
                                                ];
                                        significantChange.snippet = formattedSnippet.snippet;
                                        if (significantChange.outputType === 'added-text') {
                                            item.significantChanges[
                                                formattedSnippet.indexOfSignificantChanges
                                                ] = new AddedTextOutput(significantChange);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // push to final output and cache
                    // note we are using original response list, not snippet response
                    // (snippet only contains large)
                    response.uncachedOutput.forEach((item) => {
                        response.finalOutput.push(item);
                        var cacheKey;
                        if (item.outputType === 'new-talk-page-topic') {
                            const title = talkPageTitle(req);
                            setSignificantChangesCache(req, title, item);
                        } else {
                            setSignificantChangesCache(req, null, item);
                        }
                    });

                    return Object.assign({ nextRvStartId: response.nextRvStartId,
                        needsCacheCleanup: response.needsCacheCleanup,
                        finalOutput: response.finalOutput } );
                });
        })
        .then( (response) => {

            const sortedOutput = sortOutput((response.finalOutput));
            const cleanedOutput = cleanOutput(sortedOutput);
            const sha = shaFromSortedOutput(req, sortedOutput);

            return editCountsAndGroupsPromise(req, cleanedOutput)
                .then( (editCountsAndGroupsResponse) => {
                    return Object.assign({ nextRvStartId: response.nextRvStartId,
                        needsCacheCleanup: response.needsCacheCleanup,
                        cleanedOutput: editCountsAndGroupsResponse, sha: sha });
                });
        })
        .then( (response) => {

            if (response.needsCacheCleanup) {
                cleanupCache(req);
            }

            const summary = getSummaryText(req);

            const result = Object.assign({ nextRvStartId: response.nextRvStartId,
                sha: response.sha,
                timeline: response.cleanedOutput,
                summary: summary });
            res.send(result).end();
        });
}

router.get('/page/significant-events/:title', (req, res) => {
    // res.status(200);
    return getSignificantEvents(req, res);
    // const result = Object.assign({ result: "What up new endpoint."});
    // mUtil.setContentType(res, mUtil.CONTENT_TYPES.talk);
    // res.json(result).end();
});

module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/',
        api_version: 1,
        router
    };
};
