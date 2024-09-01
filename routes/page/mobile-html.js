'use strict';

/**
 * @module routes/page/mobile-html
 */

const BBPromise = require('bluebird');
const mwapi = require('../../lib/mwapi');
const mUtil = require('../../lib/mobile-util');
const mRequestUtil = require('../../lib/mobile/mobile-request-util');
const mobileviewHtml = require('../../lib/mobileview-html');
const apiUtilConstants = require('../../lib/api-util-constants');
const parsoidApi = require('../../lib/parsoid-access');
const sUtil = require('../../lib/util');
const caching = require('../../lib/caching');
const { addContentLangFromMeta } = require('../../lib/core-api-compat');

/**
 * The main router object
 */
const router = sUtil.router();

/**
 * The main application object reported when this module is require()d
 */
let app;

/**
 * @param {!Object} req
 * @param {!Object} res
 * @return {Promise}
 */
function getMobileHtmlFromPOST(req, res) {
	const html = req.body && req.body.html || req.body;
	const outputHeader = req.header('output-mode');
	const outputMode = mRequestUtil.getOutputMode(outputHeader);
	const mobileHtmlPromise = parsoidApi.mobileHTMLPromiseFromHTML(app, req, res, html, outputMode);
	return BBPromise.props({
		mobileHTML: mobileHtmlPromise,
		mw: mwapi.getMetadataForMobileHtml(req)
	}).then((response) => {
		response.mobileHTML.addMediaWikiMetadata(response.mw);
		return response.mobileHTML;
	}).then((mobileHTML) => {
		res.status(200);
		mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
		mUtil.setLanguageHeaders(res, mobileHTML.metadata._headers);
		mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
		res.send(mobileHTML.doc.outerHTML).end();
		if (mobileHTML.processingTime) {
			app.metrics.timing('transform_html_to_mobile-html.processing', mobileHTML.processingTime);
		}
	});
}

/**
 * @param {!Object} req
 * @param {!Object} res
 * @return {Promise}
 */
function getMobileHtmlFromParsoid(req, res) {
	return BBPromise.props({
		mobileHTML: parsoidApi.mobileHTMLPromise(app, req),
		mw: mwapi.getMetadataForMobileHtml(req)
	}).then((response) => {
		response.mobileHTML.addMediaWikiMetadata(response.mw);
		return response.mobileHTML;
	}).then((mobileHTML) => {
		res.status(200);
		addContentLangFromMeta(res, mobileHTML.doc);
		mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
		mUtil.setETag(res, mobileHTML.metadata.revision);
		mUtil.setLanguageHeaders(res, mobileHTML.metadata._headers);
		mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
		res.send(mobileHTML.doc.outerHTML).end();
		if (mobileHTML.processingTime) {
			app.metrics.timing('page_mobile-html.processing', mobileHTML.processingTime);
		}
	});
}

/**
 * @param {!Object} req
 * @param {!Object} res
 * @return {Promise}
 */
function getMobileHtmlFromMobileview(req, res) {
	const scripts = [];
	const baseURI = mUtil.getMetaWikiRESTBaseAPIURI(app, req);
	return mobileviewHtml.requestAndProcessPageIntoMobileHTML(req, scripts, baseURI)
		.then((mobileHTML) => {
			res.status(200);
			mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtml);
			mUtil.setETag(res, mobileHTML.metadata.revision);
			mUtil.setLanguageHeaders(res, mobileHTML.metadata._headers);
			mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
			res.send(mobileHTML.doc.outerHTML).end();
			if (mobileHTML.processingTime) {
				app.metrics.timing('page_mobile-html.mobileview_processing', mobileHTML.processingTime);
			}
		});
}

/**
 * GET {domain}/v1/page/mobile-html/{title}{/revision}{/tid}
 * Title redirection status: redirects based on parsoid output
 * Gets page content in HTML. This is a more optimized for direct consumption by reading
 * clients.
 */
router.get('/page/mobile-html/:title/:revision?/:tid?', caching.defaultCacheMiddleware, (req, res) => {
	req.getTitleRedirectLocation = (title) => title;
	req.purgePaths = [
		`/page/mobile-html/${ encodeURIComponent(req.params.title) }`,
		...(req.params.revision ? [`/page/mobile-html/${ encodeURIComponent(req.params.title) }/${ req.params.revision }`] : [])
	];

	const buildMobileHtml = (title) => {
		req.params.title = title;
		if (!mobileviewHtml.shouldUseMobileview(req, app.conf.mobile_view_languages)) {
			return getMobileHtmlFromParsoid(req, res);
		} else {
			return getMobileHtmlFromMobileview(req, res);
		}
	};

	if (app.conf.pcs_handles_redirects) {
		return buildMobileHtml(req.params.title);
	}
	return BBPromise.resolve(mwapi.resolveTitleRedirect(req)).then(buildMobileHtml);
});

/**
 * POST {domain}/v1/transform/html/to/mobile-html/{title}
 * Title redirection status: POST requests should not be redirected
 * Previews page content in HTML. POST body should be Parsoid HTML
 */
router.post('/transform/html/to/mobile-html/:title', (req, res) => getMobileHtmlFromPOST(req, res));

/**
 * GET {domain}/v1/page/mobile-html-offline-resources/{title}/{revision}/{tid}
 * Request params are placeholders, title/revision/tid not used
 * Title redirection status: Doesn't redirect content is static
 * Returns the URLs for offline resources
 */
router.get('/page/mobile-html-offline-resources/:title/:revision?/:tid?', (req, res) => {
	res.status(200);
	mUtil.setContentType(res, mUtil.CONTENT_TYPES.mobileHtmlOfflineResources);

	// Get external API URI
	const externalApiUri = apiUtilConstants.getExternalRestApiUri(req.params.domain);
	const metawikiApiUri = mUtil.getMetaWikiRESTBaseAPIURI(app, req);
	const localApiUri = mUtil.getLocalRESTBaseAPIURI(app, req);

	const offlineResources = [
		`${ metawikiApiUri }data/css/mobile/base`,
		`${ metawikiApiUri }data/css/mobile/pcs`,
		`${ metawikiApiUri }data/javascript/mobile/pcs`,
		`${ externalApiUri }data/css/mobile/site`,
		`${ localApiUri }data/i18n/pcs`
	];

	// Enable caching since this endpoint is heavily requested
	res.setHeader('cache-control', 's-maxage=1209600, max-age=86400');
	res.send(offlineResources).end();
});

module.exports = function(appObj) {
	app = appObj;
	return {
		path: '/',
		api_version: 1,
		router
	};
};
