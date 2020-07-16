const router = require('../../lib/util').router();
const mUtil = require('../../lib/mobile-util');
const mwapi = require('../../lib/mwapi');
const mwrestapi = require('../../lib/mwrestapi');
const BBPromise = require('bluebird');
const api = require('../../lib/api-util');
const express = require('express');
const parsoidApi = require('../../lib/parsoid-access');
const encoding = require('@root/encoding');

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

class Section {
    constructor(fromSection, toSection) {
        this.fromSection = fromSection;
        this.toSection = toSection;
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

    // add highlight delimiters first
    var snippetBinary = encoding.strToBin(largeChange.snippet);

    // todo: it looks like parsoid *sometimes* strips these spans out depending on their placement.
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

    // const addHighlightTokenStart = 'ios-add-token';
    // const deleteHighlightTokenStart = 'ios-delete-token';
    // const highlightTokenEnd = 'ios-end-token';
    //
    // const addHighlightTokenStartBin = encoding.strToBin(addHighlightTokenStart);
    // const deleteHighlightTokenStartBin = encoding.strToBin(deleteHighlightTokenStart);
    // const highlightTokenEndBin = encoding.strToBin(highlightTokenEnd);

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

    const newSnippet = encoding.binToStr(snippetBinary);

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
                if (paragraphWrapper.tagName === 'P') {

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

function getSectionForDiffLine(diffBody, diffLine) {

    var fromSection = null;
    var toSection = null;

    // capture intro
    if (!diffBody.from.sections ||
        diffBody.from.sections.length === 0 ||
        !diffBody.to.sections ||
        diffBody.to.sections.length === 0) {
        return null;
    }

    if (diffLine.offset.from && diffLine.offset.from < diffBody.from.sections[0].offset) {
        fromSection = 'Intro';
    }

    if (diffLine.offset.to && diffLine.offset.to < diffBody.to.sections[0].offset) {
        toSection = 'Intro';
    }

    if (fromSection && toSection) {
        return new Section(fromSection, toSection);
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

    return new Section(fromSection, toSection);
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

function getSignificantChanges2(req, res) {

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

            return response;
        })
        .then( (response) => {

            const threshold = getThreshold(req);

            // segment off large changes and small changes
            var uncachedOutput = [];
            response.articleDiffAndRevisions.forEach(function (diffAndRevision) {
                if (diffAndRevision.characterChange.totalCount() <= threshold) {
                    const revision = diffAndRevision.revision;
                    const smallOutputObject = new SmallOutput(revision.revid, revision.timestamp,
                        revision.user, revision.userid, diffAndRevision.characterChange);
                    uncachedOutput.push(smallOutputObject);
                } else {
                    const revision = diffAndRevision.revision;

                    // get largest diff
                    diffAndRevision.body.diff.sort(function(a, b) {
                        return b.characterChange.totalCount() - a.characterChange.totalCount();
                    });

                    // todo: safety
                    const largestDiffLine = diffAndRevision.body.diff[0];
                    const diffSection = getSectionForDiffLine(diffAndRevision.body,
                        largestDiffLine);
                    const largeOutputObject = new LargeOutputExpanded(revision.revid,
                        revision.timestamp, revision.user, revision.userid, largestDiffLine.text,
                        largestDiffLine.type, largestDiffLine.highlightRanges,
                        diffAndRevision.characterChange, diffSection);
                    uncachedOutput.push(largeOutputObject);
                }
            });

            return Object.assign({ nextRvStartId: response.nextRvStartId,
                uncachedOutput: uncachedOutput, finalOutput: response.finalOutput } );
        })
        .then( (response) => {

            // convert large snippets from wikitext to mobile-html
            const largeOutputs = response.uncachedOutput.filter(item =>
                item.outputType === 'large-change');
            return snippetPromises(req, largeOutputs)
                .then( (snippetResponse) => {

                    // push to final output and cache
                    // note we are using original response list, not snippet response
                    // (snippet only contains large)
                    response.uncachedOutput.forEach((item) => {
                        response.finalOutput.push(item);
                        const cacheKey = significantChangesCacheKey(req, null, item);
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

function getSignificantChanges(req, res) {
    return BBPromise.props({
        mw: mwapi.queryForRevisions(req)
    }).then((response) => {
        return response.mw;
    }).then((response) => {
        res.status(response.status);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.significantChanges);
        // mUtil.setETag(res, mobileHTML.metadata.revision);
        // mUtil.setLanguageHeaders(res, mobileHTML.metadata._headers);
        // mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);

        // BEGIN - Mark byte delta on each revision
        let nextRevision;
        const revisionsWithDelta = [];
        const revisions = response.body.query.pages[0].revisions;
        revisions.forEach(function (revision) {
            if (!(nextRevision === undefined || nextRevision === null)) {
                nextRevision.delta = nextRevision.size - revision.size;
                revisionsWithDelta.push(nextRevision);
            }
            nextRevision = revision;
        });
        const nextRevId = nextRevision.revid;
        const beginningDate = revisions[0].timestamp;
        const endDate = revisions[revisions.length - 1].timestamp;
        // END - Mark byte delta on each revision

        // BEGIN - Gather talk page new discussions
        const talkPageURL = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&titles=Talk:${req.params.title}&rvslots=main&rvprop=ids|timestamp|user|userid|size|parsedcomment|comment|tags|flags&rvdir=older&format=json&rvlimit=51&rvstart=${beginningDate}&rvend=${endDate}`;
        const syncRequest = require('sync-request');
        const talkPageResponse = syncRequest('GET', talkPageURL, {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
        });
        const talkPageBody = JSON.parse(talkPageResponse.getBody('utf8'));

        const newSectionTalkPageRevisions = [];
        const talkPage = talkPageBody.query.pages;
        const talkPageObject = talkPage[Object.keys(talkPage)[0]];
        const talkPageRevisions = talkPageObject.revisions;
        talkPageRevisions.forEach(function (revision, index) {
            if (revision.comment.toLowerCase().includes('new section')
                && revision.userid !== 4936590) { // don't show signbot topics
                // see if this section was reverted in previous iterations
                var wasReverted = false;
                if (index - 1 > 0) {
                    var nextRevision = talkPageRevisions[index - 1];
                    if (nextRevision.userid === 4936590) { // signbot, look for next revision
                        if (index - 2 > 0) {
                            nextRevision = talkPageRevisions[index - 2];
                        }
                    }

                    if (nextRevision.tags.includes('mw-undo') ||
                        nextRevision.tags.includes('mw-rollback')) {
                        wasReverted = true;
                    }
                }

                if (wasReverted === false) {
                    newSectionTalkPageRevisions.push(revision);
                }
            }
        });
        // END - Gather talk page new discussions

        // BEGIN - Break it down into types
        const significantChangeObjects = [];
        revisionsWithDelta.forEach(function (revision, index) {

            // BEGIN - Shuffle in new section talk pages on each iteration
            for (let i = 0; i < newSectionTalkPageRevisions.length; ++i) {
                const sectionTalkPageRevision = newSectionTalkPageRevisions[i];
                const talkPageDate = new Date(sectionTalkPageRevision.timestamp);
                const revisionDate = new Date(revision.timestamp);
                if (talkPageDate > revisionDate) {
                    // todo: why doesn't parsedComment show in response?
                    const newTopic = Object.assign({
                        type: 'new-talk-page-topic',
                        revid: sectionTalkPageRevision.revid,
                        user: sectionTalkPageRevision.user,
                        userid: sectionTalkPageRevision.userid,
                        timestamp: sectionTalkPageRevision.timestamp,
                        comment: sectionTalkPageRevision.comment,
                        parsedComment: sectionTalkPageRevision.parsedComment });
                    significantChangeObjects.push(newTopic);
                    newSectionTalkPageRevisions.splice(i, 1);
                    --i; // Correct the index value
                }
            }
            // END - Shuffle in new section talk pages on each iteration

            const threshold = req.query.threshold === null || req.query.threshold === undefined ?
                100 : req.query.threshold;
            if (revision.tags.includes('mw-rollback') &&
                revision.comment.toLowerCase().includes('revert') &&
                revision.comment.toLowerCase().includes('vandalism') && revision.delta < 0 ) {
                // Add vandalism
                const vandalism = Object.assign({ type: 'vandalism-revert' } );
                significantChangeObjects.push(vandalism);
            } else if (revision.delta >= -threshold && revision.delta <= threshold) {
                // Add small changes
                const smallChange = Object.assign({ type: 'small-change' } );
                significantChangeObjects.push(smallChange);
            } else {
                // BEGIN - Add large changes
                const largeChange = Object.assign({
                    type: 'large-change',
                    delta: revision.delta,
                    timestamp: revision.timestamp,
                    revid: revision.revid,
                    user: revision.user,
                    userid: revision.userid
                });

                // get snippet of change
                // https://en.wikipedia.org/w/rest.php/v1/revision/847170467/compare/851733941
                // const restParams = Object.assign({domain: 'en.wikipedia.org',
                // path: 'w/rest.php/v1/revision/847170467/compare/851733941'} );
                // const restReq = Object.assign({method: 'get', query: null,
                // headers: null, params: restParams} );

                // BBPromise.props({
                //                 //     rest: api.restApiGet(req, restReq)
                //                 // }).then((response) => {
                //                 //     return response.rest;
                //                 // }).then((response) => {
                //                 //     console.log(response);
                //                 //     console.log(revision);
                //                 // });

                // BEGIN: For each large change, hit the diff endpoint and pull a snippet
                const syncRequest = require('sync-request');
                const url = `https://en.wikipedia.org/w/rest.php/v1/revision/${revision.parentid}/compare/${revision.revid}`;
                const diffResponse = syncRequest('GET', url, {
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                });
                const body = JSON.parse(diffResponse.getBody('utf8'));
                const changedLines = body.diff.filter(diffItem => diffItem.type >= 1 &&
                    diffItem.type <= 3);

                changedLines.forEach(function (diff) {
                    if (diff.type === 1 || diff.type === 2) {
                        diff.characterChange = diff.text.length;
                    } else {
                        var characterChange = 0;
                        diff.highlightRanges.forEach(function (range) {
                           characterChange += range.length;
                        });

                        diff.characterChange = characterChange;
                    }
                });
                changedLines.sort(function(a, b) {
                    return b.characterChange - a.characterChange;
                });
                if (changedLines.length > 0) {
                    var changeType;
                    switch (changedLines[0].type) {
                        case 1:
                            changeType = 'added-line';
                            break;
                        case 2:
                            changeType = 'deleted-line';
                            break;
                        case 3:
                            changeType = 'added-and-or-deleted-words-in-line';
                            break;
                        default: break;
                    }
                    if (changedLines[0].highlightRanges !== undefined &&
                        changedLines[0].highlightRanges.length > 0) {
                        changedLines[0].highlightRanges.forEach( function (range) {
                            switch (range.type) {
                                case 0:
                                    range.type = 'added';
                                    break;
                                case 1:
                                    range.type = 'deleted';
                                    break;
                                default:
                                    break;
                            }
                        });
                    }

                    const contentSnippet = Object.assign({
                        changeType: changeType,
                        text: changedLines[0].text,
                        highlightRanges: changedLines[0].highlightRanges
                    });
                    largeChange.contentSnippet = contentSnippet;
                }
                // END: For each large change, hit the diff endpoint and pull a snippet

                significantChangeObjects.push(largeChange);
                // END - Add large changes
            }

            // BEGIN - Shuffle in new section talk pages on each iteration
            // (this catches any straggler new talk pages at the end)
            if (index === revisionsWithDelta.length - 1) {
                for (let i = 0; i < newSectionTalkPageRevisions.length; ++i) {
                    const sectionTalkPageRevision = newSectionTalkPageRevisions[i];
                    const talkPageDate = new Date(sectionTalkPageRevision.timestamp);
                    const revisionDate = new Date(revision.timestamp);
                    if (talkPageDate < revisionDate) {
                        const newTopic = Object.assign({
                            type: 'new-talk-page-topic',
                            revid: sectionTalkPageRevision.revid,
                            user: sectionTalkPageRevision.user,
                            userid: sectionTalkPageRevision.userid,
                            timestamp: sectionTalkPageRevision.timestamp,
                            comment: sectionTalkPageRevision.comment,
                            parsedComment: sectionTalkPageRevision.parsedComment });
                        significantChangeObjects.push(sectionTalkPageRevision);
                        newSectionTalkPageRevisions.splice(i, 1);
                        --i; // Correct the index value
                    }
                }
            }
            // END - Shuffle in new section talk pages on each iteration
        });

        // BEGIN - Collapse small changes
        const collapsedSignificantChanges = [];
        let numSmallChanges = 0;
        significantChangeObjects.forEach(function (revision) {
            if (revision.type === 'small-change') {
                numSmallChanges++;
                return;
            } else if (numSmallChanges > 0) {
                const consolidatedSmallChange = Object.assign({
                    type: 'small-change',
                    count: numSmallChanges } );
                collapsedSignificantChanges.push(consolidatedSmallChange);
                numSmallChanges = 0;
            }

            collapsedSignificantChanges.push(revision);
        });
        if (numSmallChanges > 0) {
            const consolidatedSmallChange = Object.assign({
                type: 'small-change',
                count: numSmallChanges
            });
            collapsedSignificantChanges.push(consolidatedSmallChange);
            numSmallChanges = 0;
        }
        // END - Collapse small changes

        const result = Object.assign({
            nextRvStartId: nextRevId,
            revisions: collapsedSignificantChanges } );
        res.send(result).end();
        // res.send(response.body.query.pages[0].revisions).end();
    });
}

router.get('/page/significant-changes/:title', (req, res) => {
    // res.status(200);
    return getSignificantChanges2(req, res);
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
