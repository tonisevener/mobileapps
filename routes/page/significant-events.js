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
let app;

const significantChangesCache = {};

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
    constructor(revid, timestamp, user, userid, section) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'vandalism-revert';
        this.user = user;
        this.userid = userid;
        this.section = section;
    }
}

class NewReferenceOutput {
    constructor(sections, templates) {
        this.outputType = 'new-reference';
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
    return mwrestapi.queryForDiff(req, revision.parentid, revision.revid)
        .then( (response) => {
            return Object.assign({
                revision: revision,
                body: response.body
            });
        });
};

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
        }).then((response) => {

            // removing script tags here
            // todo: try to remove first section that is inserted too
            const scripts = response.body.getElementsByTagName('script');
            const scriptsList = Array.prototype.slice.call(scripts);
            const references = response.body.getElementsByClassName('mw-references-wrap');
            const referencesList = Array.prototype.slice.call(references);
            const finalListToStrip = scriptsList.concat(referencesList);
            finalListToStrip.forEach( (script) => {
                script.parentNode.removeChild(script);
            });

            // mobile-html endpoint seems to return a wrapper pcs, section and paragraph element.
            // strip these out as well.

            var strippedSnippet = response.body.innerHTML;
            const pcsElement = response.getElementById('pcs');
            if (pcsElement) {
                const sectionWrapper = pcsElement.firstChild;
                if (sectionWrapper.tagName === 'SECTION') {
                    strippedSnippet = sectionWrapper.innerHTML;
                }

                const paragraphWrapper = sectionWrapper.firstChild;
                if (paragraphWrapper && paragraphWrapper.tagName === 'P') {

                    var parent = paragraphWrapper.parentNode;
                    while ( paragraphWrapper.firstChild ) {
                        parent.insertBefore(  paragraphWrapper.firstChild, paragraphWrapper );
                    }
                    parent.removeChild( paragraphWrapper );

                    strippedSnippet = sectionWrapper.innerHTML;
                }

                // todo: remove monte tags from sectionWrapper
            } else {
                // todo: remove monte tags from body
            }

            return strippedSnippet;
        });
};

const snippetPromise = (req, preformattedSnippet) => {

    if (preformattedSnippet.snippetType === 2) {
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
                    .filter(range => range.type === 0);

                // then add added text delimiters
                var addOffset = 0;
                addedHighlightRanges.forEach(function (range) {
                    switch (range.type) {
                        case 0: // Added
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
            var truncatedSnippet = response;
            if (preformattedSnippet.snippetType === 5 || preformattedSnippet.snippetType === 3) {
                // try to trim the areas before the first ioshighlightstart and after the last
                // ioshighlight start so snippet is
                // focused on area that changed
                const firstStart = response.indexOf('ioshighlightstart');
                const lastStart = response.lastIndexOf('ioshighlightend');
                if (firstStart >= 0 && lastStart >= 0) {
                    truncatedSnippet = truncatedSnippet.slice(firstStart);
                    truncatedSnippet = truncatedSnippet.slice(0, lastStart);
                    // UNCOMMENT THIS LINE IF HIGHLIGHTING IS NOT WORTH IT
                    // truncatedSnippet = truncatedSnippet.replace(/ioshighlightstart/g, '')
                    // .replace(/ioshighlightend/g, '');
                    truncatedSnippet = '...'.concat(truncatedSnippet).concat('...');
                }
            }
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

const talkPageTitle = (req) => {
    return `Talk:${req.params.title}`;
};

const talkPageRevisionsPromise = (req, rvStart, rvEnd) => {
    return mwapi.queryForRevisions(req, talkPageTitle(req), 100, rvStart, rvEnd );
};

const significantChangesCacheKey = (req, title, revision) => {
    const threshold = getThreshold(req);
    const keyTitle = title || req.params.title;
    return `${req.params.domain}-${keyTitle}-${revision.revid}-${threshold}`;
};

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

    revisions.forEach(function (revision) {

        const cacheKey = significantChangesCacheKey(req, title, revision);
        const cacheItem = significantChangesCache[cacheKey];
        if (cacheItem) {
            cachedOutput.push(cacheItem);
        } else {
            uncachedRevisions.push(revision);
        }
    });

    return Object.assign({
        uncachedRevisions: uncachedRevisions,
        cachedOutput: cachedOutput
    });
}

function getSectionForDiffLine(diffBody, diffLine) {

    var fromSection = null;
    var toSection = null;

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
        diffLine.offset.from < diffBody.from.sections[0].offset) {
        fromSection = 'Intro';
    }

    if ((diffLine.offset.to || diffLine.offset.to === 0) &&
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
                fromSection = prevSection.heading;
                break;
            }

            prevSection = section;
        }

        if (!fromSection && diffLine.offset.from > 0) {
            fromSection = prevSection.heading;
        }
    }

    if (!toSection && diffLine.offset.to) {
        prevSection = null;
        for (let i = 0; i < diffBody.to.sections.length; i++) {

            const section = diffBody.to.sections[i];
            if (diffLine.offset.to < section.offset && prevSection) {
                toSection = prevSection.heading;
                break;
            }

            prevSection = section;
        }

        if (!toSection && diffLine.offset.to > 0) {
            toSection = prevSection.heading;
        }
    }

    if (diffLine.offset.to) {
        return toSection;
    } else {
        return fromSection;
    }
}

function updateDiffAndRevisionsWithCharacterCount(diffAndRevisions) {

    // Loop through diffs, filter out type 0 (context type) and assign byte change properties
    // to the remaining

    diffAndRevisions.forEach(function (diffAndRevision) {

        var filteredDiffs = [];

        var aggregateAddedCount = 0;
        var aggregateDeletedCount = 0;
        var aggregateAddedSections = new Set();
        var aggregateDeletedSections = new Set();
        diffAndRevision.body.diff.forEach(function (diff) {
            var lineAddedCount = 0;
            var lineDeletedCount = 0;
            switch (diff.type) {
                case 0: // Context line type
                    return;
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
                    diff.highlightRanges.forEach(function (range) {

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
                    });
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
        });

        const aggregateCounts = new CharacterChange(aggregateAddedCount, aggregateDeletedCount);
        diffAndRevision.characterChangeWithSections = new CharacterChangeWithSections(
            aggregateCounts, Array.from(aggregateAddedSections),
            Array.from(aggregateDeletedSections));
        diffAndRevision.body.diff = filteredDiffs;
    });
}

function templateNamesToCallOut() {
    return ['cite'];
}

function needsToParseForAddedTemplates(text, includeOpeningBraces, includeAll) {
    const names = templateNamesToCallOut();

    if (includeAll) {
        if ((text.includes('{{') && includeOpeningBraces) || (!includeOpeningBraces)) {
            return true;
        }
        return false;
    }

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
// We are missing some an added reference from line 722. We also aren't
// catching the <ref> tags in line 579
function structuredTemplatePromise(text, diff, revision, includeAll) {
    return new BBPromise((resolve) => {
        var main = PRFunPromise.async(function*() {
            var pdoc = yield ParsoidJS.parse(text, { pdoc: true });
            const splitTemplates = yield PRFunPromise.map(pdoc.filterTemplates(),
                ParsoidJS.toWikitext);
            var templateObjects = [];

            for (var s = 0; s < splitTemplates.length; s++) {
                const splitTemplateText = splitTemplates[s];

                const innerPdoc = yield ParsoidJS.parse(splitTemplateText, { pdoc: true });
                const individualTemplates = innerPdoc.filterTemplates();
                for (var i = 0; i < individualTemplates.length; i++) {
                    const template = individualTemplates[i];

                    if (!needsToParseForAddedTemplates(template.name, false,
                        includeAll)) {
                        continue;
                    }

                    var dict = {};
                    dict.name = template.name;
                    for (var p = 0; p < template.params.length; p++) {
                        const param = template.params[p].name;
                        const value = yield template.get(param).value.toWikitext();
                        dict[param] = value;
                    }
                    templateObjects.push(dict);
                }
            }
            const result = Object.assign( {
               revision: revision,
                diff: diff,
               templates: templateObjects
            });
            resolve(result);
        });

        main().done();
    });
}

function addStructuredTemplates(diffAndRevisions, includeAll) {
    var promises = [];
    diffAndRevisions.forEach(function (diffAndRevision) {
        diffAndRevision.body.diff.forEach(function (diff) {

            switch (diff.type) {
                case 1: // Add complete line type
                    if (needsToParseForAddedTemplates(diff.text, true,
                        includeAll)) {
                        promises.push(structuredTemplatePromise(diff.text, diff,
                            diffAndRevision.revision));
                    }
                    break;
                case 5:
                case 3:
                    diff.highlightRanges.forEach(function (range) {

                        const binaryText = encoding.strToBin(diff.text);
                        const binaryRangeText = binaryText.substring(range.start,
                            range.start + range.length);
                        const rangeText = encoding.binToStr(binaryRangeText);

                        switch (range.type) {
                            case 0: // Add range type
                                if (needsToParseForAddedTemplates(rangeText, true,
                                    includeAll)) {
                                    promises.push(structuredTemplatePromise(rangeText, diff,
                                        diffAndRevision.revision, includeAll));
                                }
                                break;
                            default:
                                break;
                        }
                    });
                    break;
                default:
                    break;
            }
        });
    });

    return Promise.all(promises)
        .then( (response) => {

           // loop through responses, add to revision.

            response.forEach( (item) => {
               diffAndRevisions.forEach( (diffAndRevision) => {
                  if (item.revision.revid === diffAndRevision.revision.revid) {
                      diffAndRevision.templates = item.templates;
                      diffAndRevision.templateDiffLine = item.diff;
                  }
               });
            });

            return diffAndRevisions;
        });
}

function getNewTopicDiffAndRevisions(talkDiffAndRevisions) {

     const newSectionTalkPageDiffAndRevisions = [];
    // const talkPage = talkPageBody.query.pages;
    // const talkPageObject = talkPage[Object.keys(talkPage)[0]];
    // const talkPageRevisions = talkPageObject.revisions;
    talkDiffAndRevisions.forEach(function (diffAndRevision, index) {
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
     });

    return newSectionTalkPageDiffAndRevisions;
}

function getLargestDiffLine(diffBody) {
    diffBody.diff.sort(function(a, b) {
        return b.characterChange.totalCount() - a.characterChange.totalCount();
    });

    // todo: safety
    const largestDiffLine = diffBody.diff[0];
    return largestDiffLine;
}

function getLargestDiffLineOfAdded(diffBody) {
    diffBody.diff.sort(function(a, b) {
        return b.characterChange.addedCount - a.characterChange.addedCount;
    });

    // todo: safety
    const largestDiffLine = diffBody.diff[0];
    return largestDiffLine;
}

function textContainsEmptyLineOrSection(text) {
    const trimmedText = text.trim();
    return (trimmedText.length === 0 || text.includes('=='));
}

function getFirstDiffLineWithContent(diffBody) {

    for (let i = 0; i < diffBody.diff.length; i++) {
        const diff = diffBody.diff[i];

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

function cleanOutput(output) {

    // collapses small changes, converts large changes only to info needed

    // sort by date first
    output = output.sort(function(a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    const cleanedOutput = [];
    let numSmallChanges = 0;
    output.forEach(function (item) {
        if (item.outputType === 'small-change') {
            numSmallChanges++;
            return;
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
    });

    if (numSmallChanges > 0) {
        const change = new ConsolidatedSmallOutput(numSmallChanges);
        cleanedOutput.push(change);
        numSmallChanges = 0;
    }

    return cleanedOutput;
}

function getSignificantEvents(req, res) {

    // STEP 1: Gather list of article revisions
    return mwapi.queryForRevisions(req)
        .then( (response) => {

            // STEP 2: All at once gather diffs for each uncached revision and list of
            // talk page revisions
            const revisions = response.body.query.pages[0].revisions;
            // todo: length error checking here, parentid check here
            const nextRvStartId = revisions[revisions.length - 1].parentid;

            const articleEvalResults = getCachedAndUncachedItems(revisions, req, null);

            // save cached article revisions to finalOutput
            const finalOutput = articleEvalResults.cachedOutput;

            const rvStart = (req.query.rvstartid !== undefined && req.query.rvstartid !== null) ?
                revisions[0].timestamp : null;
            // if rvstartid is missing from query, they are fetching the first page
            // if they are fetching the first page, we don't want to block of
            // talk page revision fetching at the start, in case talk page topics came in
            // after the latest article revision
            const rvEnd = revisions[revisions.length - 1].timestamp;

            return BBPromise.props({
                articleDiffAndRevisions: diffAndRevisionPromises(req,
                    articleEvalResults.uncachedRevisions),
                talkPageRevisions: talkPageRevisionsPromise(req, rvStart, rvEnd),
                nextRvStartId: nextRvStartId,
                finalOutput: finalOutput
            });
        })
        .then( (response) => {

            // STEP 3: All at once gather diffs for uncached talk page revisions

            const talkPageRevisions = response.talkPageRevisions.body.query.pages[0].revisions;
            const articleDiffAndRevisions = response.articleDiffAndRevisions;
            const nextRvStartId = response.nextRvStartId;

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
                        finalOutput: finalOutput
                    });
                });
        })
        .then( (response) => {

            // Determine character size of change for every diff line and aggregate
            // for every revision
            updateDiffAndRevisionsWithCharacterCount(response.articleDiffAndRevisions);
            updateDiffAndRevisionsWithCharacterCount(response.talkDiffAndRevisions);

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
            response.articleDiffAndRevisions.forEach(function (diffAndRevision) {
                const revision = diffAndRevision.revision;
                if (revision.tags.includes('mw-rollback') &&
                    revision.comment.toLowerCase().includes('revert') &&
                    revision.comment.toLowerCase().includes('vandalism')) {
                    const largestDiffLine = getLargestDiffLine(diffAndRevision.body);
                    const section = getSectionForDiffLine(diffAndRevision.body,
                        largestDiffLine);
                    // todo: vandalism type can have reversions in multiple sections
                    const vandalismRevertOutputObject = new VandalismOutput(revision.revid,
                        revision.timestamp, revision.user, revision.userid, section);
                    uncachedOutput.push(vandalismRevertOutputObject);
                } else {

                    var significantChanges = [];
                    if (diffAndRevision.templates && diffAndRevision.templates.length > 0) {
                        var sections = [];
                        // todo: this section determination seems broken.
                        // multiple templates can occur on multiple lines.
                        if (diffAndRevision.templateDiffLine) {
                            const section = getSectionForDiffLine(diffAndRevision.body,
                                diffAndRevision.templateDiffLine);
                            if (section) {
                                sections.push(section);
                            }
                        }
                        const newReferenceOutputObject = new NewReferenceOutput(sections,
                            diffAndRevision.templates);
                        significantChanges.push(newReferenceOutputObject);
                    }

                    if (diffAndRevision.characterChangeWithSections.counts.totalCount() >
                        threshold) {

                        if (diffAndRevision.characterChangeWithSections.counts.addedCount > 0) {
                            const largestDiffLine = getLargestDiffLineOfAdded(diffAndRevision.body);
                            const addedTextOutputObject = new AddedTextOutputExpanded(
                                diffAndRevision.characterChangeWithSections, largestDiffLine.text,
                                largestDiffLine.type, largestDiffLine.highlightRanges);
                            significantChanges.push(addedTextOutputObject);
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
            });

            // get new talk page revisions, add to uncachedOutput. it will be sorted later.
            const newTopicDiffAndRevisions = getNewTopicDiffAndRevisions(
                response.talkDiffAndRevisions);
            newTopicDiffAndRevisions.forEach(function (diffAndRevision) {
                const revision = diffAndRevision.revision;
                const firstDiffLine = getFirstDiffLineWithContent(diffAndRevision.body);
                const section = getSectionForDiffLine(diffAndRevision.body,
                    firstDiffLine);
                const newTalkPageTopicOutputObject = new NewTalkPageTopicExtended(revision.revid,
                    revision.timestamp, revision.user, revision.userid, firstDiffLine.text,
                    firstDiffLine.type, firstDiffLine.highlightRanges,
                    diffAndRevision.characterChangeWithSections.counts, section);
                uncachedOutput.push(newTalkPageTopicOutputObject);
            });

            return Object.assign({ nextRvStartId: response.nextRvStartId,
                uncachedOutput: uncachedOutput, finalOutput: response.finalOutput } );
        })
        .then( (response) => {

            var preformattedSnippets = [];
            response.uncachedOutput.forEach(function (item) {
                if (item.outputType === 'new-talk-page-topic') {
                    const snippet = new PreformattedSnippet(item.revid, item.outputType,
                        item.snippet,1, null,
                        null);
                    preformattedSnippets.push(snippet);
                } else if (item.outputType === 'large-change') {
                    for (let i = 0; i < item.significantChanges.length; i++) {
                        const significantChange = item.significantChanges[i];
                        if (significantChange.outputType === 'added-text') {
                            const snippet = new PreformattedSnippet(item.revid, item.outputType,
                                significantChange.snippet, significantChange.snippetType,
                                significantChange.snippetHighlightRanges, i);
                            preformattedSnippets.push(snippet);
                        }
                    }
                }
            });

            // convert large snippets from wikitext to mobile-html
            return snippetPromises(req, preformattedSnippets)
                .then( (formattedSnippets) => {

                    // reassign formattedSnippets to snippet output
                    formattedSnippets.forEach((formattedSnippet) => {
                       response.uncachedOutput.forEach((item) => {
                           if (item.revid === formattedSnippet.revid &&
                               item.outputType === formattedSnippet.outputType) {
                               if (formattedSnippet.outputType === 'new-talk-page-topic') {
                                   item.snippet = formattedSnippet.snippet;
                               } else if (formattedSnippet.outputType === 'large-change') {
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
                       });
                    });

                    // push to final output and cache
                    // note we are using original response list, not snippet response
                    // (snippet only contains large)
                    response.uncachedOutput.forEach((item) => {
                        response.finalOutput.push(item);
                        var cacheKey;
                        if (item.outputType === 'new-talk-page-topic') {
                            const title = talkPageTitle(req);
                            cacheKey = significantChangesCacheKey(req, title, item);
                        } else {
                            cacheKey = significantChangesCacheKey(req, null, item);
                        }
                        significantChangesCache[cacheKey] = item;
                    });

                    return Object.assign({ nextRvStartId: response.nextRvStartId,
                        finalOutput: response.finalOutput } );
                });
        })
        .then( (response) => {

            const cleanedOutput = cleanOutput(response.finalOutput);
            const result = Object.assign({ nextRvStartId: response.nextRvStartId,
                timeline: cleanedOutput } );
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
