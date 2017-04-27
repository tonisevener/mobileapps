'use strict';

const htmlDebug = require('./html-debug');

// To update the expected test results temporarily set the constant UPDATE_EXPECTED_RESULTS to true.
// After the run consider updating the TestSpec constructors later in this file to paste in the
// revisions and time ids (if any were left out or need to be updated).
// You may want to uncomment the console.log in parsoid-access.getRevisionFromEtag() to get the
// tid values from Parsoid.
const UPDATE_EXPECTED_RESULTS = false;

// For convenience of debugging diffs in the HTML portions you can set this to true and use git diff
// to find out what went wrong.
const ENABLE_HTML_DEBUG = false || UPDATE_EXPECTED_RESULTS;


/**
 * @protected {!string} _domain
 * @protected {!string} _route
 * @protected {?Array<string>} _parameters
 */
class TestSpec {
    /**
     * @param {!string} domain project domain (e.g. 'en.wikipedia.org')
     * @param {!string} route endpoint specifier
     * @param {?Array<string>} parameters parameter values
     */
    constructor(domain, route, parameters) {
        this._domain = domain;
        this._route = route;
        this._parameters = parameters;
    }

    /**
     * @protected
     * @return {!string} shortened project name (e.g. 'enwiki') based on domain
     */
    project() {
        return this._domain
                   .replace('.wikipedia.org', 'wiki')
                   .replace('.wiktionary.org', 'wiktionary');
    }

    /**
     * @protected
     * Translate a name to a file name.
     * @param {!string} input input string
     * @return {!string}
     */
    static fsName(input) {
        return input.replace(/\//g, '_');
    }

    /**
     * @return {!string} name of this test to print to the console
     */
    testName() {
        return `${TestSpec.fsName(this._route)}-${TestSpec.fsName(this.project())}-${this._parameters.join('-')}`; // eslint-disable-line max-len
    }

    /**
     * @return {!string} folder to store expected result in
     */
    dir() {
        return `${__dirname}/results/`;
    }

    /**
     * @return {!string} file name to store expected result in (without file extension)
     */
    fileName() {
        return `${encodeURIComponent(this.testName())}`;
    }

    /**
     * @return {!string} file path to store expected result in
     */
    filePath() {
        return `${this.dir()}${this.fileName()}.json`;
    }

    /**
     * @return {!string} path portion of the request URI
     */
    uriPath() {
        let path = `${this._domain}/v1/${this._route}`;
        if (this._parameters) {
            path += `/${this._parameters.join('/')}`;
        }
        return path;
    }

    postProcessing(rsp) {
        return rsp;
    }

    /**
     * @private
     * @param {!string} array input array
     * @return {!string} a string of JS code to make a array of strings
     */
    static toStringArrayCode(array) {
        return `['${array.join('\', \'')}']`;
    }

    /**
     * Prints the constructor for updating scripts
     * @return {string}
     */
    generator() {
        if (this._parameters) {
            return `    new TestSpec('${this._domain}', '${this._route}', ${TestSpec.toStringArrayCode(this._parameters)}),`; // eslint-disable-line max-len
        } else {
            return `    new TestSpec('${this._domain}', '${this._route}'),`;
        }
    }
}

/**
 * A TestSpec which covers a specific page which has optional revision and time id parameters
 * (powered by Parsoid).
 *
 * @protected {!string} _domain
 * @protected {!string} _route
 * @protected {!string} _title
 * @protected {?string} _revision
 * @protected {?string} _tid
 */
class TestPageSpec extends TestSpec {
    /**
     * @param {!string} domain project domain (e.g. 'en.wikipedia.org')
     * @param {!string} route endpoint specifier
     * @param {!string} title human readable page title (unencoded)
     * @param {?string} revision revision of the page when the expectation was saved
     * @param {?string} tid time id of the page when the expectation was saved
     */
    constructor(domain, route, title, revision, tid) {
        super(domain, route, [title, revision]);
        this._title = title;
        this._revision = revision;
        this._tid = tid;
    }

    /**
     * @override
     * @return {!string} name of this test to print to the console
     */
    testName() {
        return `${TestSpec.fsName(this._route)}-${TestSpec.fsName(this.project())}-${TestSpec.fsName(this._title)}`; // eslint-disable-line max-len
    }

    /**
     * @private
     * @return {!string} percent-encoded version of the title string
     */
    encodedTitle() {
        return encodeURIComponent(this._title);
    }

    /**
     * @override
     * @return {!string} path portion of the request URI
     */
    uriPath() {
        let path = `${this._domain}/v1/${this._route}/${this.encodedTitle()}`;
        if (this._revision) {
            path += `/${this._revision}`; // prefer revisions for more stability
            if (this._tid) {
                path += `/${this._tid}`; // prefer tid for even more stability
            }
        }
        return path;
    }

    postProcessing(rsp) {
        const input = rsp.body;
        if (input.lead) { // for mobile-sections and formatted
            // value does not come from wikitext but from Wikidata links
            delete input.lead.languagecount;

            // values not fixed to the given revision (but the latest revision of the page)
            delete input.lead.lastmodified;
            delete input.lead.lastmodifier;

            // to be able to generate a constructor with the revision
            this._revision = input.lead.revision;
            // It's better to also get the tid but that one is harder to get
            // Experiment: getting tid from mobile-sections / formatted responses:
            // const etag = rsp.headers.etag;
            // const match = etag && etag.match(/\/(\S+)"$/, '');
            // this._tid = match && match[1];

            if (input.remaining) {
                input.remaining.sections.forEach((section) => {
                    // Simplify the numbers in:
                    // usemap=\"#ImageMap_1_922168371\"></a>
                    // <map name=\"ImageMap_1_922168371\" id=\"ImageMap_1_922168371\">
                    section.text = section.text.replace(/ImageMap_\d+_\d+/g, 'ImageMap_');
                });
            }

            if (ENABLE_HTML_DEBUG) {
                htmlDebug.htmlPostProcessing(input, `${this.dir()}/${this.fileName()}/`);
            }
        }

        rsp.body = input;
        return rsp;
    }

    /**
     * @override
     * Prints the constructor for updating scripts
     * @return {string}
     */
    generator() {
        const requiredParams = `'${this._domain}', '${this._route}', '${this._title}'`;
        let optionalParams = '';

        if (this._revision) {
            optionalParams = `, '${this._revision}'`;
            if (this._tid) {
                optionalParams += `, '${this._tid}'`;
            }
        }

        return `    new TestPageSpec(${requiredParams}${optionalParams}),`;
    }
}

/* eslint-disable max-len */
const TEST_SPECS = [
    new TestSpec('en.wikipedia.org', 'page/featured', ['2016', '04', '29']),
    new TestSpec('en.wikipedia.org', 'media/image/featured', ['2016', '04', '29']),
    new TestSpec('en.wikipedia.org', 'page/most-read', ['2016', '01', '01']),

    /* Note: to add a time uuid uncomment a line in parsoid-access.js getRevisionFromEtag() */

    new TestPageSpec('en.wikipedia.org', 'page/mobile-sections', 'User:BSitzmann_(WMF)/MCS/Test/TitleLinkEncoding', '743079682', '45076ace-ec99-11e6-8bd2-d4f45196333f'),
    new TestPageSpec('en.wikipedia.org', 'page/mobile-sections', 'User:BSitzmann_(WMF)/MCS/Test/Frankenstein', '772834600', '7a853a72-2abc-11e7-ac3a-0e79a34b2d67'),

    new TestPageSpec('en.wikipedia.org', 'page/formatted', 'User:BSitzmann_(WMF)/MCS/Test/TitleLinkEncoding', '743079682', '45076ace-ec99-11e6-8bd2-d4f45196333f'),
    new TestPageSpec('en.wikipedia.org', 'page/formatted', 'User:BSitzmann_(WMF)/MCS/Test/Frankenstein', '772834600', '7a853a72-2abc-11e7-ac3a-0e79a34b2d67'),

    // new TestSpec('en.wiktionary.org', 'page/definition', ['cat']),
];
/* eslint-enable max-len */

module.exports = {
    UPDATE_EXPECTED_RESULTS,
    ENABLE_HTML_DEBUG,
    TEST_SPECS
};