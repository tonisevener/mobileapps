'use strict';

const BBPromise = require('bluebird');
const sUtil = require('../../lib/util');
const mUtil = require('../../lib/mobile-util');
const parsoid = require('../../lib/parsoid-access');
const StructuredPage = require('../../lib/structured/StructuredPage');
const Facts = require('../../lib/structured/Facts');
const api = require('../../lib/api-util');
const mwapi = require('../../lib/mwapi');
/**
 * The main router object
 */
const router = sUtil.router();

/**
 * The main application object reported when this module is require()d
 */
let app;

function structuredPagePromiseFromHTML(app, req, res, html) {
    const meta = parsoid.getRevAndTidFromEtag(res.headers) || {};
    meta._headers = {
        'Content-Language': res.headers && res.headers['content-language'],
        Vary: res.headers && res.headers.vary
    };
    meta.baseURI = mUtil.getMetaWikiRESTBaseAPIURI(app, req);
    return mUtil.createDocument(html).then((doc) => {
        return new StructuredPage(doc, meta).promise;
    });
}

function factsPromiseFromHTML(app, req, res, html) {
    const meta = parsoid.getRevAndTidFromEtag(res.headers) || {};
    meta._headers = {
        'Content-Language': res.headers && res.headers['content-language'],
        Vary: res.headers && res.headers.vary
    };
    return mUtil.createDocument(html).then((doc) => {
        return new Facts(doc, meta).promise;
    });
}

/**
 * @param {!Object} app the application object
 * @param {!Object} req the request object
 * @return {!promise} Returns a promise to retrieve the page content from Parsoid
 */
function structuredPagePromise(app, req) {
    return parsoid.getParsoidHtml(req)
        .then((res) => {
            return structuredPagePromiseFromHTML(app, req, res, res.body);
        });
}

function factsPromise(app, req) {
    return parsoid.getParsoidHtml(req)
        .then((res) => {
            return factsPromiseFromHTML(app, req, res, res.body);
        });
}

function getPageSummary(req, title) {
    const path = `page/summary/${encodeURIComponent(title)}`;
    const restReq = {
        headers: {
            'accept-language': req.headers['accept-language']
        }
    };
    return api.restApiGet(req, path, restReq);
}

function getWikibaseItem(req, title) {
    const query = {
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        titles: title,
        format: 'json',
        formatversion: 2
    };

    return mwapi.queryForMetadata(req, query, (page) => {
        return {
            body: {
                wikibase_item: page.pageprops && page.pageprops.wikibase_item
            }
        };
    });
}

function getEntitiesForTitles(req, keys, useMediaWiki) {
    const entitiesByTitle = {};
    for (var i = 0; i < keys.length; i++) {
        const title = keys[i];
        if (useMediaWiki) {
            entitiesByTitle[title] = getWikibaseItem(req, title).then(res => {
                return res;
            }, () => {
                return {};
            });
        } else {
            entitiesByTitle[title] = getPageSummary(req, title).then(res => {
                return res;
            }, () => {
                return {};
            });
        }
    }
    // response.mobileHTML.addMediaWikiMetadata(response.mw);
    return BBPromise.props(entitiesByTitle);
}

/**
 * GET {domain}/v1/page/facts/{title}{/revision}{/tid}
 * Gets extended metadata for a given wiki page.
 */
router.get('/facts/:title/:revision?/:tid?', (req, res) => {
    return factsPromise(app, req).then((structuredPage) => {
        const linkedEntities = structuredPage.output.linkedEntities;
        const keys = Object.keys(linkedEntities);
        return getEntitiesForTitles(req, keys, false).then((summariesByTitle) => {
            for (const section of structuredPage.output.sections) {
                for (const paragraph of section.paragraphs) {
                    for (const fact of paragraph.facts) {
                        for (const link of fact.links) {
                            const title = link.title;
                            const summaryResponse = summariesByTitle[title];
                            if (!summaryResponse
                                || !summaryResponse.body
                                || !summaryResponse.body.wikibase_item) {
                                continue;
                            }
                            link.wikidataItem = summaryResponse.body.wikibase_item;
                        }
                    }
                }
            }
            delete structuredPage.output.linkedEntities;
            return structuredPage;
        });
    }).then((structuredPage) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.structuredPage);
        mUtil.setETag(res, structuredPage.metadata.revision);
        mUtil.setLanguageHeaders(res, structuredPage.metadata._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        res.json(structuredPage.output).end();
        if (structuredPage.processingTime) {
            app.metrics.timing('page_structured.processing', structuredPage.processingTime);
        }
    });
});

/**
 * GET {domain}/v1/page/metadata/{title}{/revision}{/tid}
 * Gets extended metadata for a given wiki page.
 */
router.get('/structured/:title/:revision?/:tid?', (req, res) => {
    return structuredPagePromise(app, req).then((structuredPage) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.structuredPage);
        mUtil.setETag(res, structuredPage.metadata.revision);
        mUtil.setLanguageHeaders(res, structuredPage.metadata._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        delete structuredPage.output.linkedEntities;
        res.json(structuredPage.output).end();
        if (structuredPage.processingTime) {
            app.metrics.timing('page_structured.processing', structuredPage.processingTime);
        }
    });
});

function hydratedEntities(req, res, useMediaWiki) {
    return structuredPagePromise(app, req).then((structuredPage) => {
        const linkedEntities = structuredPage.output.linkedEntities;
        const keys = Object.keys(linkedEntities);
        return getEntitiesForTitles(req, keys, useMediaWiki).then((summariesByTitle) => {
            for (const section of structuredPage.output.sections) {
                for (const paragraph of section.paragraphs) {
                    for (const link of paragraph.links) {
                        const title = link.title;
                        const summaryResponse = summariesByTitle[title];
                        if (!summaryResponse
                            || !summaryResponse.body
                            || !summaryResponse.body.wikibase_item) {
                            continue;
                        }
                        link.wikidataItem = summaryResponse.body.wikibase_item;
                    }
                }
            }
            delete structuredPage.output.linkedEntities;
            return structuredPage;
        });
    }).then((structuredPage) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.structuredPage);
        mUtil.setETag(res, structuredPage.metadata.revision);
        mUtil.setLanguageHeaders(res, structuredPage.metadata._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        res.json(structuredPage.output).end();
        if (structuredPage.processingTime) {
            app.metrics.timing('page_structured.processing', structuredPage.processingTime);
        }
    });
}

/**
 * GET {domain}/v1/page/metadata/{title}{/revision}{/tid}
 * Gets extended metadata for a given wiki page.
 */
router.get('/entities/:title/:revision?/:tid?', (req, res) => {
    return hydratedEntities(req, res, false);
});

/**
 * GET {domain}/v1/page/metadata/{title}{/revision}{/tid}
 * Gets extended metadata for a given wiki page.
 */
router.get('/entities-mw/:title/:revision?/:tid?', (req, res) => {
    return hydratedEntities(req, res, true);
});

module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/page',
        api_version: 1,
        router
    };
};
