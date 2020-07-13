const router = require('../../lib/util').router();
const mUtil = require('../../lib/mobile-util');
const mwapi = require('../../lib/mwapi');
const mwrestapi = require('../../lib/mwrestapi');
const BBPromise = require('bluebird');
const api = require('../../lib/api-util');
const express = require('express');
const parsoidApi = require('../../lib/parsoid-access');

let app;

const significantChangesCache = {};

const diffAndRevisionPromise = (req, revision) => {
    return mwrestapi.queryForDiff(req, revision.revid, revision.parentid)
        .then( (response) => {
            return Object.assign({
                revision: revision,
                body: response.body
            });
        });
};

//curl -X POST "https://en.wikipedia.org/api/rest_v1/transform/wikitext/to/html/Dog" -H "accept: text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/2.1.0"" -H "Content-Type: multipart/form-data" -F "wikitext='testing'" -F "body_only=true" -F "stash=true"
//"https://en.wikipedia.org/api/rest_v1/transform/wikitext/to/html/Dog" -H "accept: text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/2.1.0"" -H "Content-Type: multipart/form-data" -F "wikitext='testing'" -F "body_only=true" -F "stash=true"
//wat console write
/*
{ method: 'get',
  uri:
   "https://en.wikipedia.org/w/rest.php/v1/revision/967289946/compare/967285956",
  query: {},
  headers: {},
  body: undefined,
  timeout: 60000 }
 */

//call like req.issueRequest(wat);
//then chain parsoidApi.mobileHTMLPromiseFromHTML
// const snippetAndRevisionPromise = (app, req, res, html, revision) => {
//     return mwrestapi.queryForDiff(req, revision.revid, revision.parentid)
//         .then( (response) => {
//             return Object.assign({
//                 revision: revision,
//                 body: response.body
//             });
//         });
// };

const diffAndRevisionPromises = (req, revisions) => {
    return BBPromise.map(revisions, function(revision) {
        return diffAndRevisionPromise(req, revision);
    });
};

const talkPageTitle = (req) => {
    return `Talk:${req.params.title}`
};

const talkPageRevisionsPromise = (req, rvStart, rvEnd) => {
    return mwapi.queryForRevisions(req, talkPageTitle(req), 100, rvStart, rvEnd );
};

const significantChangesCacheKey = (req, title, revision) => {
    const keyTitle = title || req.params.title;
    return `${req.params.domain}-${title}-${revision.revid}`;
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

class ByteChange {
    constructor(addedCount, deletedCount) {
        this.addedCount = addedCount;
        this.deletedCount = deletedCount;
    }

    totalCount() {
        return this.addedCount + this.deletedCount;
    }
}

class SmallOutput {
    constructor(revid, timestamp, outputType) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = outputType;
    }
}

class LargeOutput {
    constructor(revid, timestamp, outputType, snippet) {
        this.revid = revid;
        this.timestamp = timestamp;
        this.outputType = outputType;
        this.snippet = snippet;
    }
}

function updateDiffAndRevisionsWithByteCount(diffAndRevisions) {
    console.log(diffAndRevisions);

    // Loop through diffs, filter out type 0 (context type) and assign byte change properties to the remaining

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
                case 3: // Change line type (add and deleted ranges in line)
                    //todo: there's something funky with added and deleted types. see United_States revid 966656680, says added 172 bytes (type 0 highlighted range) but UI shows deleted in desktop and app.
                    diff.highlightRanges.forEach(function (range) {
                        switch (range.type) {
                            case 0: // Add range type
                                lineAddedCount += range.length;
                                break;
                            case 1: // Delete range type
                                lineDeletedCount += range.length;
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

            diff.byteChange = new ByteChange(lineAddedCount, lineDeletedCount);
            filteredDiffs.push(diff);
        });

        diffAndRevision.byteChange = new ByteChange(aggregateAddedCount, aggregateDeletedCount)
        diffAndRevision.body.diff = filteredDiffs;
    });

    console.log(diffAndRevisions);
}

function getSignificantChanges2(req, res) {

    const output = [];

    // STEP 1: Gather list of article revisions
    return mwapi.queryForRevisions(req)
        .then( (response) => {

            // STEP 2: All at once gather diffs for each uncached revision and list of talk page revisions
            const revisions = response.body.query.pages[0].revisions;
            // todo: length error checking here, parentid check here
            const nextRvStartId = revisions[revisions.length - 1].parentid;

            const articleEvalResults = getCachedAndUncachedItems(revisions, req, talkPageTitle(req));

            // save cached article revisions to output
            output.concat(articleEvalResults.cachedOutput);

            const rvStart = revisions[0].timestamp;
            // todo: length error checking here
            const rvEnd = revisions[revisions.length - 1].timestamp;

            return BBPromise.props({
                articleDiffAndRevisions: diffAndRevisionPromises(req, articleEvalResults.uncachedRevisions),
                talkPageRevisions: talkPageRevisionsPromise(req, rvStart, rvEnd),
                nextRvStartId: nextRvStartId
            });
        })
        .then( (response) => {

            // STEP 3: All at once gather diffs for uncached talk page revisions

            const talkPageRevisions = response.talkPageRevisions.body.query.pages[0].revisions;
            const articleDiffAndRevisions = response.articleDiffAndRevisions;
            const nextRvStartId = response.nextRvStartId;

            const talkPageEvalResults = getCachedAndUncachedItems(talkPageRevisions, req, null);

            // save cached talk page revisions to output
            output.concat(talkPageEvalResults.cachedOutput);

            // for each uncached talk page revision, gather diffs
            return diffAndRevisionPromises(req, talkPageEvalResults.uncachedRevisions)
                .then( (response) => {
                    return Object.assign({
                        articleDiffAndRevisions: articleDiffAndRevisions,
                        talkDiffAndRevisions: response,
                        nextRvStartId: nextRvStartId
                    });
                });
        })
        .then( (response) => {

            // Determine byte size of change for every diff line and aggregate for every revision
            updateDiffAndRevisionsWithByteCount(response.articleDiffAndRevisions);

            return response;
        })
        .then( (response) => {

            console.log(response);

            const threshold = req.query.threshold === null || req.query.threshold === undefined ?
                100 : req.query.threshold;

            //segment off large changes and small changes
            response.articleDiffAndRevisions.forEach(function (diffAndRevision) {
                if (diffAndRevision.byteChange.totalCount() <= threshold) {
                    const revision = diffAndRevision.revision;
                    const smallOutputObject = new SmallOutput(revision.revid, revision.timestamp, "small-change");
                    output.push(smallOutputObject);
                    const cacheKey = significantChangesCacheKey(req, null, revision.revid);
                    significantChangesCache[cacheKey] = smallOutputObject;
                } else {
                    const revision = diffAndRevision.revision;

                    //get largest diff
                    diffAndRevision.body.diff.sort(function(a, b) {
                        return b.byteChange.totalCount() - a.byteChange.totalCount();
                    });

                    //todo: safety
                    const largestDiffLine = diffAndRevision.body.diff[0];

                    const largeOutputObject = new LargeOutput(revision.revid, revision.timestamp, "large-change", largestDiffLine.text);
                    output.push(largeOutputObject);
                    const cacheKey = significantChangesCacheKey(req, null, revision.revid);
                    significantChangesCache[cacheKey] = largeOutputObject;
                }
            });

            return output;
        })
        .then( (output) => {

            console.log(output);
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
                        diff.byteChange = diff.text.length;
                    } else {
                        var byteChange = 0;
                        diff.highlightRanges.forEach(function (range) {
                           byteChange += range.length;
                        });

                        diff.byteChange = byteChange;
                    }
                });
                changedLines.sort(function(a, b) {
                    return b.byteChange - a.byteChange;
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
