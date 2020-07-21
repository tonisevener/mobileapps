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
    constructor(revid, timestamp, user, userid, characterChange) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'small-change';
        this.user = user;
        this.userid = userid;
        this.characterChange = characterChange;
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

class LargeOutput {
    constructor(largeOutputExpanded) {
        this.revid = largeOutputExpanded.revid;
        this.timestamp = largeOutputExpanded.timestamp;
        this.outputType = 'large-change';
        this.snippet = largeOutputExpanded.snippet;
        this.user = largeOutputExpanded.user;
        this.userid = largeOutputExpanded.userid;
        this.characterChange = largeOutputExpanded.characterChange;
        this.section = largeOutputExpanded.section;
    }
}

class LargeOutputExpanded {
    constructor(revid, timestamp, user, userid, snippet, type, highlightRanges, characterChange,
                section) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = 'large-change';
        this.snippet = snippet;
        this.type = type;
        this.highlightRanges = highlightRanges;
        this.user = user;
        this.userid = userid;
        this.characterChange = characterChange;
        this.section = section;
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

const diffAndRevisionPromise = (req, revision) => {
    return mwrestapi.queryForDiff(req, revision.parentid, revision.revid)
        .then( (response) => {
            return Object.assign({
                revision: revision,
                body: response.body
            });
        });
};

const snippetPromise = (req, largeChange) => {
    const headers = Object.assign( {
        accept: 'text/html',
        profile: 'https://www.mediawiki.org/wiki/Specs/Mobile-HTML/1.0.0',
        'content-type': 'multipart/form-data',
        'output-mode': 'editPreview'
    });

    var newSnippet;

    if (largeChange.outputType === 'large-change') {
        // add highlight delimiters first
        var snippetBinary = encoding.strToBin(largeChange.snippet);

        // todo: it looks like parsoid *sometimes* strips these spans out
        //  depending on their placement.
        // we need some token that parsoid won't touch.
        // see results for this revision, it's missing an add-highlight.
        // https://en.wikipedia.org/w/index.php?title=United_States
        // &type=revision&diff=965295364&oldid=965071033
        const addHighlightStart = '<span class="add-highlight">';
        const deleteHighlightStart = '<span class="delete-highlight">';
        const highlightEnd = '</span>';

        const addHighlightStartBin = encoding.strToBin(addHighlightStart);
        const deleteHighlightStartBin = encoding.strToBin(deleteHighlightStart);
        const highlightEndBin = encoding.strToBin(highlightEnd);

        switch (largeChange.type) {
            case 1: // Added complete line

                snippetBinary = insertSubstringInString(snippetBinary, addHighlightStartBin, 0);
                snippetBinary = insertSubstringInString(snippetBinary, highlightEndBin,
                    snippetBinary.length);
                break;
            case 2: // Deleted complete line

                snippetBinary = insertSubstringInString(snippetBinary, deleteHighlightStartBin, 0);
                snippetBinary = insertSubstringInString(snippetBinary, highlightEndBin,
                    snippetBinary.length);
                break;
            case 5:
            case 3: // Added and deleted words in line
                var offset = 0;
                largeChange.highlightRanges.forEach(function (range) {
                    switch (range.type) {
                        case 0: // Added
                            snippetBinary = insertSubstringInString(snippetBinary,
                                addHighlightStartBin, range.start + offset);
                            offset += addHighlightStartBin.length;
                            break;
                        case 1: // Deleted
                            snippetBinary = insertSubstringInString(snippetBinary,
                                deleteHighlightStartBin, range.start + offset);
                            offset += deleteHighlightStartBin.length;
                            break;
                        default:
                            return;
                    }

                    snippetBinary = insertSubstringInString(snippetBinary, highlightEndBin,
                        range.start + offset + range.length);
                    offset += highlightEndBin.length;
                });
                break;
            default:
                break;
        }

        newSnippet = encoding.binToStr(snippetBinary);
    } else { // new talk page topic
        newSnippet = largeChange.snippet;
    }

    // make request to format to mobile-html, reassign result back to snippet

    const formData = Object.assign({
        wikitext: newSnippet
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
            }

            largeChange.snippet = strippedSnippet;
            return largeChange;
        });
};

const snippetPromises = (req, largeChanges) => {
    return BBPromise.map(largeChanges, function(largeChange) {
        return snippetPromise(req, largeChange);
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

function updateDiffAndRevisionsWithCharacterCount(diffAndRevisions) {

    // Loop through diffs, filter out type 0 (context type) and assign byte change properties
    // to the remaining

    diffAndRevisions.forEach(function (diffAndRevision) {

        var filteredDiffs = [];

        var aggregateAddedCount = 0;
        var aggregateDeletedCount = 0;
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

            diff.characterChange = new CharacterChange(lineAddedCount, lineDeletedCount);
            filteredDiffs.push(diff);
        });

        diffAndRevision.characterChange = new CharacterChange(aggregateAddedCount,
            aggregateDeletedCount);
        diffAndRevision.body.diff = filteredDiffs;
    });
}

function structuredParsoidResultPromise(text, revision) {
    return new BBPromise((resolve) => {
        var main = PRFunPromise.async(function*() {
            var pdoc = yield ParsoidJS.parse(text, { pdoc: true });
            const splitTemplates = yield PRFunPromise.map(pdoc.filterTemplates(), ParsoidJS.toWikitext);
            var templateObjects = [];

            for (var s = 0; s < splitTemplates.length; s++) {
                const splitTemplateText = splitTemplates[s];

                const innerPdoc = yield ParsoidJS.parse(splitTemplateText, { pdoc: true });
                const individualTemplates = innerPdoc.filterTemplates();
                for (var i = 0; i < individualTemplates.length; i++) {
                    const template = individualTemplates[i];

                    var dict = {};
                    dict['name'] = template.name;
                    for (var p = 0; p < template.params.length; p++) {
                        const param = template.params[p].name;
                        const value = yield template.get(param).value.toWikitext();
                        dict[param] = value;
                    }
                    templateObjects.push(dict);
                }
            }

            resolve(templateObjects);
        });

        main().done();
    });
}

function needsToParseForAddedTemplates(text) {
    return text.includes('{{');
}

function structuredParsoidResultPromises(diffAndRevisions) {
    // Loop through added sections in diffs and detect template types

    var promises = [];
    diffAndRevisions.forEach(function (diffAndRevision) {
        diffAndRevision.body.diff.forEach(function (diff) {

            switch (diff.type) {
                case 1: // Add complete line type
                    if (needsToParseForAddedTemplates(diff.text)) {
                        //{{cite web |url=http://www.mla.org/map_data |title=United States |publisher=[[Modern Language Association]]|access-date=September 2, 2013}}
                        //{{cite web |url=http://factfinder.census.gov/faces/tableservices/jsf/pages/productview.xhtml?pid=ACS_10_1YR_B16001&prodType=table |title=American FactFinder—Results |first=U.S. Census |last=Bureau |publisher= |access-date=May 29, 2017 |archive-url=https://archive.today/20200212213140/http://factfinder.census.gov/faces/tableservices/jsf/pages/productview.xhtml?pid=ACS_10_1YR_B16001&prodType=table |archive-date=February 12, 2020 |url-status=dead }}
                        //{{efn|Source: 2015 [[American Community Survey]], [[U.S. Census Bureau]]. Most respondents who speak a language other than English at home also report speaking English "well" or "very well". For the language groups listed above, the strongest English-language proficiency is among speakers of German (96% report that they speak English "well" or "very well"), followed by speakers of French (93.5%), Tagalog (92.8%), Spanish (74.1%), Korean (71.5%), Chinese (70.4%), and Vietnamese (66.9%).}}
                        promises.push(structuredParsoidResultPromise(diff.text, diffAndRevision.revision));
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
                                if (needsToParseForAddedTemplates(rangeText)) {
                                    promises.push(structuredParsoidResultPromise(rangeText, diffAndRevision.revision));
                                }
                                break;
                            default:
                                break;
                        }
                    });
                default:
                    break;
            }
        });
    });

    return Promise.all(promises)
        .then( (response) => {

           //assign pdoc to diffAndRevision;
            diffAndRevisions.forEach(function (diffAndRevision) {
                response.forEach(function (parseResponse) {
                    if (diffAndRevision.revision.revid === parseResponse.revision.revid) {
                        diffAndRevision.pdoc = parseResponse.pdoc;
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

    // diffLine.offset.from of = is still valid if it's at the very beginning of the article.
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

function getSectionForLargestDiffLine(diffBody, largestDiffLine) {
    // get largest diff
    const diffSection = getSectionForDiffLine(diffBody,
        largestDiffLine);
    return diffSection;
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

function getSignificantChanges(req, res) {

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
            var finalOutput = [];
            finalOutput = finalOutput.concat(articleEvalResults.cachedOutput);

            // todo: unfortunately this cuts out new talk page topics that appeared after
            //  the latest article revision. rethink this piece.
            const rvStart = revisions[0].timestamp;
            // todo: length error checking here
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

            // save cached talk page revisions to output
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
            return structuredParsoidResultPromises(response.articleDiffAndRevisions)
                .then( (articleDiffAndRevisions) => {
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
                    const section = getSectionForLargestDiffLine(diffAndRevision.body,
                        largestDiffLine);
                    const vandalismRevertOutputObject = new VandalismOutput(revision.revid,
                        revision.timestamp, revision.user, revision.userid, section);
                    uncachedOutput.push(vandalismRevertOutputObject);
                } else if (diffAndRevision.characterChange.totalCount() <= threshold) {
                    const smallOutputObject = new SmallOutput(revision.revid, revision.timestamp,
                        revision.user, revision.userid, diffAndRevision.characterChange);
                    uncachedOutput.push(smallOutputObject);
                } else {
                    const largestDiffLine = getLargestDiffLine(diffAndRevision.body);
                    const section = getSectionForLargestDiffLine(diffAndRevision.body,
                        largestDiffLine);
                    const largeOutputObject = new LargeOutputExpanded(revision.revid,
                        revision.timestamp, revision.user, revision.userid, largestDiffLine.text,
                        largestDiffLine.type, largestDiffLine.highlightRanges,
                        diffAndRevision.characterChange, section);
                    uncachedOutput.push(largeOutputObject);
                }
            });

            // get new talk page revisions, add to uncachedOutput. it will be sorted later.
            const newTopicDiffAndRevisions = getNewTopicDiffAndRevisions(
                response.talkDiffAndRevisions);
            newTopicDiffAndRevisions.forEach(function (diffAndRevision) {
                const revision = diffAndRevision.revision;
                // todo: better check might be something like get first diff line
                //  that doesn't have a section title or empty line.
                const largestDiffLine = getLargestDiffLine(diffAndRevision.body);
                const section = getSectionForLargestDiffLine(diffAndRevision.body, largestDiffLine);
                const newTalkPageTopicOutputObject = new NewTalkPageTopicExtended(revision.revid,
                    revision.timestamp, revision.user, revision.userid, largestDiffLine.text,
                    largestDiffLine.type, largestDiffLine.highlightRanges,
                    diffAndRevision.characterChange, section);
                uncachedOutput.push(newTalkPageTopicOutputObject);
            });

            return Object.assign({ nextRvStartId: response.nextRvStartId,
                uncachedOutput: uncachedOutput, finalOutput: response.finalOutput } );
        })
        .then( (response) => {

            // convert large snippets from wikitext to mobile-html
            const largeOutputs = response.uncachedOutput.filter(item =>
                item.outputType === 'large-change' || item.outputType === 'new-talk-page-topic');
            return snippetPromises(req, largeOutputs)
                .then( (snippetResponse) => {

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
                significantChanges: cleanedOutput } );
            res.send(result).end();

        });
}

router.get('/page/significant-changes/:title', (req, res) => {
    // res.status(200);
    return getSignificantChanges(req, res);
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
