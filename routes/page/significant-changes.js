const router = require('../../lib/util').router();
const mUtil = require('../../lib/mobile-util');
const mwapi = require('../../lib/mwapi');
const mwrestapi = require('../../lib/mwrestapi');
const BBPromise = require('bluebird');
const api = require('../../lib/api-util');
const express = require('express');

let app;

const diffPromise = (req, revid, parentid) => {
    return mwrestapi.queryForDiff(req, revid, parentid)
        .then( (response) => {
            return Object.assign({
                revID: revid,
                body: response.body
            });
        });
};

function getSignificantChanges2(req, res) {
    return mwapi.queryForRevisions(req)
        .then( (response) => {
            // eslint-disable-next-line no-console
            console.log(response);

            // hit compare endpoint for each revision
            const revisions = response.body.query.pages[0].revisions;

            // may be able to clean this up with map somehow http://bluebirdjs.com/docs/api/promise.map.html

            return BBPromise.map(revisions, function(revision) {
                return diffPromise(req, revision.revid, revision.parentid);
            });
        })
        .then( (response) => {
            // eslint-disable-next-line no-console
            console.log(response);
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
