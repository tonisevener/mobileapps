/**
 * @module pagelib/src/transform/FooterReadMore
 */

import './FooterReadMore.less';
import HTMLUtil from '../transform/HTMLUtilities';

/**
 * Display fetched read more pages.
 *
 * @typedef {Function} ShowReadMorePagesHandler
 * @param {!Array.<object>} pages
 * @param {!string} heading
 * @param {!string} sectionContainerId
 * @param {!string} pageContainerId
 * @param {!string} langCode
 * @param {!Document} document
 * @return {void}
 */

/**
 * Removes parenthetical enclosures from string.
 *
 * @param {!string} string
 * @param {!string} opener
 * @param {!string} closer
 * @return {!string}
 */
const safelyRemoveEnclosures = ( string, opener, closer ) => {
	const enclosureRegex = new RegExp( `\\s?[${ opener }][^${ opener }${ closer }]+[${ closer }]`, 'g' );
	let counter = 0;
	const safeMaxTries = 30;
	let stringToClean = string;
	let previousString = '';
	do {
		previousString = stringToClean;
		stringToClean = stringToClean.replace( enclosureRegex, '' );
		counter++;
	} while ( previousString !== stringToClean && counter < safeMaxTries );
	return stringToClean;
};

/**
 * Removes '(...)' and '/.../' parenthetical enclosures from string.
 *
 * @param {!string} string
 * @return {!string}
 */
const cleanExtract = ( string ) => {
	let stringToClean = string;
	stringToClean = safelyRemoveEnclosures( stringToClean, '(', ')' );
	stringToClean = safelyRemoveEnclosures( stringToClean, '/', '/' );
	return stringToClean;
};

/**
 * Read more page model.
 */
class ReadMorePage {
	/**
	 * ReadMorePage constructor.
	 *
	 * @param {!string} title
	 * @param {!string} displayTitle
	 * @param {?string} thumbnail
	 * @param {?string} description
	 */
	constructor( title, displayTitle, thumbnail, description ) {
		this.title = title;
		this.displayTitle = displayTitle;
		this.thumbnail = thumbnail;
		this.description = description;
	}
}

const schemeRegex = /^[a-z]+:/;
/**
 * Makes document fragment for a read more page.
 *
 * @param {!ReadMorePage} readMorePage
 * @param {!number} index
 * @param {!Document} document
 * @return {!DocumentFragment}
 */
const documentFragmentForReadMorePage = ( readMorePage, index, document ) => {
	const outerAnchorContainer = document.createElement( 'a' );
	outerAnchorContainer.id = index;
	outerAnchorContainer.className = 'pcs-footer-readmore-page';

	const globalLoadImages = document.pcsSetupSettings ? document.pcsSetupSettings.loadImages : true;
	const hasImage = readMorePage.thumbnail && readMorePage.thumbnail.source;
	if ( hasImage && globalLoadImages ) {
		const image = document.createElement( 'div' );
		image.style.backgroundImage = `url(${ readMorePage.thumbnail.source.replace( schemeRegex, '' ) })`;
		image.classList.add( 'pcs-footer-readmore-page-image' );
		outerAnchorContainer.appendChild( image );
	}

	const innerDivContainer = document.createElement( 'div' );
	innerDivContainer.classList.add( 'pcs-footer-readmore-page-container' );
	outerAnchorContainer.appendChild( innerDivContainer );
	outerAnchorContainer.setAttribute( 'title', readMorePage.title );
	outerAnchorContainer.setAttribute( 'data-pcs-source', 'read-more' );
	outerAnchorContainer.href = `./${ encodeURI( readMorePage.title ) }`;

	let titleToShow;
	if ( readMorePage.displayTitle ) {
		titleToShow = readMorePage.displayTitle;
	} else if ( readMorePage.title ) {
		titleToShow = readMorePage.title;
	}

	if ( titleToShow ) {
		const title = document.createElement( 'div' );
		title.id = index;
		title.className = 'pcs-footer-readmore-page-title';
		/* DOM sink status: safe - content transform with no user interference */
		title.innerHTML = titleToShow.replace( /_/g, ' ' );
		outerAnchorContainer.title = readMorePage.title.replace( /_/g, ' ' );
		innerDivContainer.appendChild( title );
	}

	if ( readMorePage.description ) {
		const descriptionEl = document.createElement( 'div' );
		descriptionEl.id = index;
		descriptionEl.className = 'pcs-footer-readmore-page-description';
		/* DOM sink status: safe - content from read more query endpoint */
		descriptionEl.innerHTML = readMorePage.description;
		innerDivContainer.appendChild( descriptionEl );
	}

	return document.createDocumentFragment().appendChild( outerAnchorContainer );
};

/**
 * @type {ShowReadMorePagesHandler}
 */
const showReadMorePages = ( pages, sectionContainerId, pageContainerId, langCode, document ) => {
	const sectionContainer = document.getElementById( sectionContainerId );
	const pageContainer = document.getElementById( pageContainerId );
	pages.forEach( ( page, index ) => {
		let displayTitle = page.pageprops ? page.pageprops.displaytitle : page.title;
		if (page.varianttitles && langCode) {
            displayTitle = page.varianttitles[langCode] || displayTitle;
		}
		const pageModel = new ReadMorePage( page.title, displayTitle, page.thumbnail,
			page.description );
		const pageFragment = documentFragmentForReadMorePage( pageModel, index, document );
		pageContainer.appendChild( pageFragment );
	} );
	sectionContainer.style.display = 'block';
};

/**
 * URL for retrieving 'Read more' pages for a given title.
 * Leave 'baseURL' null if you don't need to deal with proxying.
 *
 * @param {!string} title
 * @param {!number} count Number of `Read more` items to fetch for this title
 * @param {?string} baseURL
 * @return {!string}
 */
const readMoreQueryURL = ( title, count, baseURL ) => {
	const queryObj = {
		format: 'json',
		formatversion: 2,
		origin: '*',
		action: 'query',
		prop: 'pageimages|description|info',
		inprop: 'varianttitles',
		piprop: 'thumbnail',
		pithumbsize: 160,
		pilimit: count,
		generator: 'search',
		gsrsearch: `morelike:${ title }`,
		gsrnamespace: 0,
		gsrlimit: count,
		gsrqiprofile: 'classic_noboostlinks',
		uselang: 'content',
		smaxage: 86400,
		maxage: 86400
	};
	return `${ baseURL || '' }/w/api.php?${ new URLSearchParams( queryObj ).toString() }`;
};

/**
 * Fetches 'Read more' pages and adds them if found.
 *
 * @param {!string} title
 * @param {!number} count
 * @param {!string} sectionContainerId
 * @param {!string} pageContainerId
 * @param {?string} baseURL
 * @param {!string} langCode
 * @param {!Document} document
 * @return {void}
 */
const fetchAndAdd = ( title, count, sectionContainerId, pageContainerId, baseURL,
	langCode, document ) => {
	const xhr = new XMLHttpRequest();
	xhr.open( 'GET', readMoreQueryURL( title, count, baseURL ), true );
	xhr.onload = () => {
		let pages;
		try {
			pages = JSON.parse( xhr.responseText ).query.pages;
		} catch ( e ) { }
		if ( !( pages && pages.length ) ) {
			return;
		}
		let results;
		if ( pages.length > count ) {
			const rand = Math.floor( Math.random() * Math.floor( pages.length - count ) );
			results = pages.slice( rand, rand + count );
		} else {
			results = pages;
		}
		showReadMorePages(
			results,
			sectionContainerId,
			pageContainerId,
			langCode,
			document
		);
	};
	xhr.send();
};

/**
 * Sets heading element string.
 *
 * @param {!string} headingString
 * @param {!string} headingID
 * @param {!Document} document
 * @return {void}
 */
const setHeading = ( headingString, headingID, document ) => {
	const headingElement = document.getElementById( headingID );
	/* DOM sink status: sanitized - headingString can be changed by clients */
	headingElement.textContent = headingString;
	headingElement.title = HTMLUtil.escape( headingString );
};

export default {
	fetchAndAdd,
	setHeading,
	test: {
		cleanExtract,
		safelyRemoveEnclosures,
		showReadMorePages
	}
};
