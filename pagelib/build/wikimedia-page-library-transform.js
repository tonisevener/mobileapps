!function(e,t){"object"==typeof exports&&"object"==typeof module?module.exports=t():"function"==typeof define&&define.amd?define([],t):"object"==typeof exports?exports.pcs=t():e.pcs=t()}(this,(()=>(()=>{"use strict";var e={354:(e,t,n)=>{n.d(t,{A:()=>s});var r=n(29),i=n(212),a=/(-?\d*\.?\d*)(\D+)?/,o=function(){function e(t,n){(0,r.A)(this,e),this._value=Number(t),this._unit=n||"px"}return(0,i.A)(e,[{key:"value",get:function(){return this._value}},{key:"unit",get:function(){return this._unit}},{key:"toString",value:function(){return isNaN(this.value)?"":"".concat(this.value).concat(this.unit)}}],[{key:"fromElement",value:function(t,n){return t.style.getPropertyValue(n)&&e.fromStyle(t.style.getPropertyValue(n))||t.hasAttribute(n)&&new e(t.getAttribute(n))||void 0}},{key:"fromStyle",value:function(t){var n=t.match(a)||[];return new e(n[1],n[2])}}])}(),s=function(){function e(t,n){(0,r.A)(this,e),this._width=t,this._height=n}return(0,i.A)(e,[{key:"width",get:function(){return this._width}},{key:"widthValue",get:function(){return this._width&&!isNaN(this._width.value)?this._width.value:NaN}},{key:"widthUnit",get:function(){return this._width&&this._width.unit||"px"}},{key:"height",get:function(){return this._height}},{key:"heightValue",get:function(){return this._height&&!isNaN(this._height.value)?this._height.value:NaN}},{key:"heightUnit",get:function(){return this._height&&this._height.unit||"px"}}],[{key:"from",value:function(t){return new e(o.fromElement(t,"width"),o.fromElement(t,"height"))}}])}()},973:(e,t,n)=>{n.d(t,{A:()=>a});var r=n(730),i=function(e,t){var n;for(n=e.parentElement;n&&!r.A.matchesSelector(n,t);n=n.parentElement);return n};const a={findClosestAncestor:i,isNestedInTable:function(e){return Boolean(i(e,"table"))},closestInlineStyle:function(e,t,n){for(var r=e;r;r=r.parentElement){var i=void 0;try{i=r.style[t]}catch(e){continue}if(i){if(void 0===n)return r;if(n===i)return r}}},isVisible:function(e){return Boolean(e.offsetWidth||e.offsetHeight||e.getClientRects().length)},copyAttributesToDataAttributes:function(e,t,n){n.filter((function(t){return e.hasAttribute(t)})).forEach((function(n){return t.setAttribute("data-".concat(n),e.getAttribute(n))}))},copyDataAttributesToAttributes:function(e,t,n){n.filter((function(t){return e.hasAttribute("data-".concat(t))})).forEach((function(n){return t.setAttribute(n,e.getAttribute("data-".concat(n)))}))}}},730:(e,t,n)=>{n.d(t,{A:()=>r});const r={matchesSelector:function(e,t){return e.matches?e.matches(t):e.matchesSelector?e.matchesSelector(t):!!e.webkitMatchesSelector&&e.webkitMatchesSelector(t)},querySelectorAll:function(e,t){return Array.prototype.slice.call(e.querySelectorAll(t))},CustomEvent:"undefined"!=typeof window&&window.CustomEvent||function(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{bubbles:!1,cancelable:!1,detail:void 0},n=document.createEvent("CustomEvent");return n.initCustomEvent(e,t.bubbles,t.cancelable,t.detail),n}}},29:(e,t,n)=>{function r(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}n.d(t,{A:()=>r})},212:(e,t,n)=>{function r(e){return r="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},r(e)}function i(e){var t=function(e,t){if("object"!=r(e)||!e)return e;var n=e[Symbol.toPrimitive];if(void 0!==n){var i=n.call(e,t||"default");if("object"!=r(i))return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(e)}(e,"string");return"symbol"==r(t)?t:t+""}function a(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(e,i(r.key),r)}}function o(e,t,n){return t&&a(e.prototype,t),n&&a(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}n.d(t,{A:()=>o})}},t={};function n(r){var i=t[r];if(void 0!==i)return i.exports;var a=t[r]={exports:{}};return e[r](a,a.exports,n),a.exports}n.d=(e,t)=>{for(var r in t)n.o(t,r)&&!n.o(e,r)&&Object.defineProperty(e,r,{enumerable:!0,get:t[r]})},n.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t);var r={};return(()=>{n.d(r,{default:()=>Dt});var e="pcs-theme-",t={DEFAULT:"".concat(e,"default"),DARK:"".concat(e,"dark"),SEPIA:"".concat(e,"sepia"),BLACK:"".concat(e,"black")},i=function(e,n){if(e)for(var r in e.classList.add(n),t)Object.prototype.hasOwnProperty.call(t,r)&&t[r]!==n&&e.classList.remove(t[r])};const a={THEME:t,CLASS_PREFIX:e,setTheme:function(e,t){var n=e.body;i(n,t);var r=e.getElementById("pcs");i(r,t)},setBodyFont:function(e,t){e.body.style.fontFamily=t}};const o={setPercentage:function(e,t){if(t){var n=(100*(Number(t.slice(0,-1))/100*.95)).toString()+"%";e.style["font-size"]=n}}};const s={setMargins:function(e,t){void 0!==t.top&&(e.style.marginTop=t.top),void 0!==t.right&&(e.style.marginRight=t.right),void 0!==t.bottom&&(e.style.marginBottom=t.bottom),void 0!==t.left&&(e.style.marginLeft=t.left)},setPadding:function(e,t){void 0!==t.top&&(e.style.paddingTop=t.top),void 0!==t.right&&(e.style.paddingRight=t.right),void 0!==t.bottom&&(e.style.paddingBottom=t.bottom),void 0!==t.left&&(e.style.paddingLeft=t.left)}};var c=n(973),l={ELEMENT_NODE:1,TEXT_NODE:3};const d=function(e){return e.nodeType===l.ELEMENT_NODE||e.nodeType===l.TEXT_NODE},u=function(e){var t=e.getBoundingClientRect();return{top:t.top,right:t.right,bottom:t.bottom,left:t.left,width:t.width,height:t.height,x:t.x,y:t.y}},p=l;var f=n(730),h="aria-label",m="aria-labelledby",E=function(e){switch(e){case"'":return"&#039;";case'"':return"&quot;";case"<":return"&lt;";case">":return"&gt;";case"&":return"&amp;";default:return""}};const v={escape:function(e){return e&&e.replace(/['"<>&]/g,E)}};var g=n(730).A,A=function(e){return!!e&&!("SECTION"!==e.tagName||!e.getAttribute("data-mw-section-id"))},T={BASE:"pcs-section-control",SHOW:"pcs-section-control-show",HIDE:"pcs-section-control-hide"},N={HIDE:"pcs-section-hidden"},y={HIDEABLE:"pcs-section-hideable-header"},L={CONTENT:"pcs-section-content-",CONTROL:"pcs-section-control-"},b="pcs-section-aria-collapse",C="pcs-section-aria-expand",_=function(e){return L.CONTROL+e},I=function(e){return L.CONTENT+e},S=function(e,t){var n=!(arguments.length>2&&void 0!==arguments[2])||arguments[2],r=_(t),i=I(t),a=e.getElementById(r),o=e.getElementById(i);if(a&&o){n?(a.classList.remove(T.HIDE),a.classList.add(T.SHOW),o.classList.add(N.HIDE),a.setAttribute(m,C)):(a.classList.remove(T.SHOW),a.classList.add(T.HIDE),o.classList.remove(N.HIDE),a.setAttribute(m,b));var s=a.parentElement;s&&s.setAttribute("onclick","pcs.c1.Sections.setHidden('".concat(t,"', ").concat(!n,");"))}};const O={createFoldHR:function(e,t){if(t.parentElement){var n=e.createElement("hr");n.classList.add("pcs-fold-hr"),t.parentElement.insertBefore(n,t)}},expandCollapsedSectionIfItContainsElement:function(e,t){var n=function(e){for(var t=e;t=t.parentElement;)if("SECTION"===t.tagName&&t.parentElement&&"pcs"===t.parentElement.id){var n=t.getAttribute("data-mw-section-id");if(n)return n}}(t);n&&S(e,n,!1)},getSectionIDOfElement:function(e){var t=function(e){for(var t=e;t;){if(A(t))return t;t=t.parentElement}return null}(e);return t&&t.getAttribute("data-mw-section-id")},getLeadParagraphText:function(e){var t=e.querySelector("#content-block-0>p");return t&&t.innerText||""},getSectionOffsets:function(e){return{sections:g.querySelectorAll(e,"section").reduce((function(e,t){var n=t.getAttribute("data-mw-section-id"),r=t&&t.firstElementChild&&t.firstElementChild.querySelector(".pcs-edit-section-title");return n&&parseInt(n)>=1&&e.push({heading:r&&r.innerHTML,id:parseInt(n),yOffset:t.offsetTop}),e}),[])}},prepareForHiding:function(e,t,n,r,i,a,o){var s=function(e,t){var n=e.createElement("span");return n.id=_(t),n.classList.add(T.BASE),n.classList.add(T.SHOW),n}(e,t);if(null===e.getElementById(C)){var c=e.createElement("span");c.setAttribute("id",C),c.setAttribute(h,a),s.appendChild(c)}if(null===e.getElementById(b)){var l=e.createElement("span");l.setAttribute("id",b),l.setAttribute(h,o),s.appendChild(l)}s.setAttribute("role","button"),s.setAttribute(m,C),r&&s&&(r.appendChild(s),r.classList.add(y.HIDEABLE),r.setAttribute("onclick","pcs.c1.Sections.setHidden('".concat(t,"', false);")));for(var d=n.firstElementChild,u=e.createElement("div");d;){var p=d;d=d.nextElementSibling,p!==i&&(n.removeChild(p),u.appendChild(p))}u.id=I(t),u.classList.add(N.HIDE),n.appendChild(u)},setHidden:S,getControlIdForSectionId:_,isMediaWikiSectionElement:A};var D=p,R="section-toggled",w={ICON:"pcs-collapse-table-icon",CONTAINER:"pcs-collapse-table-container",CONTENT:"pcs-collapse-table-content",COLLAPSED_CONTAINER:"pcs-collapse-table-collapsed-container",COLLAPSED:"pcs-collapse-table-collapsed",COLLAPSED_BOTTOM:"pcs-collapse-table-collapsed-bottom",COLLAPSE_TEXT:"pcs-collapse-table-collapse-text",EXPANDED:"pcs-collapse-table-expanded",TABLE_INFOBOX:"pcs-table-infobox",TABLE_OTHER:"pcs-table-other",TABLE:"pcs-collapse-table"},P="pcs-collapse-table-aria-collapse",x="pcs-collapse-table-aria-expand",k=/\/math\/render\/svg\//,B=function(e){return f.A.querySelectorAll(e,"a").length<3},H=function(e){return e&&e.replace(/[\s0-9]/g,"").length>0},q=function(e){var t=e.match(/\w+/);if(t)return t[0]},M=function(e,t){var n=q(t),r=q(e.textContent);return!(!n||!r)&&n.toLowerCase()===r.toLowerCase()},F=function(e){return e.trim().replace(/\s/g," ")},U=function(e,t){t.parentNode.replaceChild(e.createTextNode(" "),t)},W=function(e,t,n){if(!B(t))return null;var r=e.createDocumentFragment();r.appendChild(t.cloneNode(!0));var i=r.querySelector("th");f.A.querySelectorAll(i,".geo, .coordinates, sup.mw-ref, ol, ul, style, script").forEach((function(e){return e.remove()}));for(var a,o=i.lastChild;o;)n&&d(o)&&M(o,n)?o.previousSibling?(o=o.previousSibling).nextSibling.remove():(o.remove(),o=void 0):(a=o).nodeType===D.ELEMENT_NODE&&"BR"===a.tagName?(U(e,o),o=o.previousSibling):o=o.previousSibling;var s=i.textContent;return H(s)?F(s):null},K=function(e,t,n){for(var r=[],i=e.createTreeWalker(t),a=i.nextNode();a;)if("TH"===a.tagName){var o=W(e,a,n);if(o&&!r.includes(o)&&(r.push(o),2===r.length))break;a=i.nextNode()}else a=i.nextNode();return r},z=function(e,t,n,r){var i=e.children[0],a=e.children[1],o=e.children[2],s=i.querySelector(".pcs-collapse-table-aria"),c=void 0===r?"none"!==a.style.display:!r;return c?(a.style.display="none",i.classList.remove(w.COLLAPSED),i.classList.remove(w.ICON),i.classList.add(w.EXPANDED),s&&s.setAttribute(m,x),o.style.display="none",t===o&&n&&n(e)):(a.style.display="block",i.classList.remove(w.EXPANDED),i.classList.add(w.COLLAPSED),i.classList.add(w.ICON),s&&s.setAttribute(m,P),o.style.display="block"),c},X=function(e){var t=this.parentNode;return z(t,this,e)},G=function(e){var t,n=["navbox","vertical-navbox","navbox-inner","metadata","mbox-small"].some((function(t){return e.classList.contains(t)}));try{t="none"===e.style.display}catch(e){t=!0}return!t&&!n},j=function(e){return e.classList.contains("infobox")||e.classList.contains("infobox_v3")},V=function(e,t){var n=e.createElement("div");return n.classList.add(w.COLLAPSED_CONTAINER),n.classList.add(w.EXPANDED),n.appendChild(t),n},Y=function(e,t){var n=e.createElement("div");return n.classList.add(w.COLLAPSED_BOTTOM),n.classList.add(w.ICON),n.textContent=t||"",n},J=function(e,t){if(t.match(k)){var n=e.createElement("img");return n.setAttribute("src",t),n}return e.createTextNode(t)},$=function(e,t,n,r,i,a){var o=e.createDocumentFragment(),s=e.createElement("strong");s.textContent=t,s.classList.add(n),o.appendChild(s);var c=e.createElement("span");c.classList.add(w.COLLAPSE_TEXT),r.length>0&&(c.appendChild(e.createTextNode(" ")),c.appendChild(J(e,r[0]))),r.length>1&&(!r[0].match(k)&&r[1].match(k)?c.appendChild(e.createTextNode(" ")):c.appendChild(e.createTextNode(", ")),c.appendChild(J(e,r[1]))),r.length>0&&c.appendChild(e.createTextNode(" ...")),o.appendChild(c);var l=e.createElement("span");if(l.classList.add("pcs-collapse-table-aria"),l.setAttribute(m,x),l.setAttribute("role","button"),l.setAttribute("display","none"),l.appendChild(e.createTextNode("")),null===e.getElementById(x)){var d=e.createElement("span");d.setAttribute("id",x),d.setAttribute(h,a),l.appendChild(d)}if(null===e.getElementById(P)){var u=e.createElement("span");u.setAttribute("id",P),u.setAttribute(h,i),l.appendChild(u)}return o.appendChild(l),o},Q=function(e,t,n,r,i,a,o,s,c){if(!e.parentElement||"BLOCKQUOTE"!==e.parentElement.tagName||!e.parentElement.classList.contains("quotebox-quote")){var l=t.createElement("div");l.className=w.CONTAINER,function(e,t){if(e&&t){var n=e,r=e.parentNode;if(r){for(var i=!1;r;){if(O.isMediaWikiSectionElement(r)){i=!0;break}n=r,r=r.parentNode}if(i||(n=e,r=e.parentNode),e.closest(".mw-references")){var a=e.parentNode;t.appendChild(e),a.appendChild(t)}else"TABLE"===r.tagName?(r.insertBefore(t,n),r.removeChild(n)):r.insertBefore(t,n)}}}(e,l),e.classList.add(w.TABLE);var d={acceptNode:function(e){return e&&e.className&&e.className.includes("NavFrame")?2:1}};if(!e.className.includes("infobox")&&e.className.includes(w.TABLE))for(var u=t.createTreeWalker(e,"-1",d),p=[];u.nextNode();)if(u.currentNode&&u.currentNode.className&&u.currentNode.className.includes("mwe-math-fallback-image-inline")){if(u.currentNode.parentNode&&u.currentNode.parentNode.previousSibling){var f=u.currentNode.parentNode.previousSibling.textContent.trim();p.push(f)}var h=u.currentNode.getAttribute("src");p.push(h),a=p}var m=$(t,r,i,a,s,c),E=V(t,m);E.style.display="block";var v=Y(t,o);v.style.display="none",l.appendChild(E);var g=t.createElement("div");g.className=w.CONTENT,g.appendChild(e),l.appendChild(g),l.appendChild(v),g.style.display="none"}},Z=function(e,t,n,r,i){for(var a=e.querySelectorAll("table, .infobox_v3"),o=0;o<a.length;++o){var s=a[o];if(!c.A.findClosestAncestor(s,".".concat(w.CONTAINER))&&G(s)){var l=j(s),d=K(e,s,t);if(d.length||l)Q(s,e,0,l?n:r,l?w.TABLE_INFOBOX:w.TABLE_OTHER,d,i)}}},ee=function(e){f.A.querySelectorAll(e,".".concat(w.CONTAINER)).forEach((function(e){z(e)}))},te=function(e,t,n,r){var i=function(t){return e.dispatchEvent(new f.A.CustomEvent(R,{collapsed:t}))};f.A.querySelectorAll(t,".".concat(w.COLLAPSED_CONTAINER)).forEach((function(e){e.onclick=function(){var t=X.bind(e)();i(t)}})),f.A.querySelectorAll(t,".".concat(w.COLLAPSED_BOTTOM)).forEach((function(e){e.onclick=function(){var t=X.bind(e,r)();i(t)}})),n||ee(t)},ne=function(e,t,n,r,i,a,o,s,c){r||(Z(t,n,a,o,s),te(e,t,i,c))};const re={CLASS:w,SECTION_TOGGLED_EVENT_TYPE:R,toggleCollapsedForAll:ee,toggleCollapseClickCallback:X,expandOrCollapseTables:function(e,t){f.A.querySelectorAll(e,".".concat(w.CONTAINER)).forEach((function(e){z(e,void 0,void 0,t)}))},collapseTables:function(e,t,n,r,i,a,o,s){ne(e,t,n,r,!0,i,a,o,s)},getTableHeaderTextArray:K,adjustTables:ne,prepareTables:Z,prepareTable:Q,setupEventHandling:te,expandCollapsedTableIfItContainsElement:function(e){if(e){var t='[class*="'.concat(w.CONTAINER,'"]'),n=c.A.findClosestAncestor(e,t);if(n){var r=n.firstElementChild;r&&r.classList.contains(w.EXPANDED)&&r.click()}}},test:{extractEligibleHeaderText:W,firstWordFromString:q,shouldTableBeCollapsed:G,isHeaderEligible:B,isHeaderTextEligible:H,isInfobox:j,newCollapsedHeaderDiv:V,newCollapsedFooterDiv:Y,newCaptionFragment:$,isNodeTextContentSimilarToPageTitle:M,stringWithNormalizedWhitespace:F,replaceNodeWithBreakingSpaceTextNode:U,getTableHeaderTextArray:K}};var ie=function(e){return e?f.A.querySelectorAll(e,".mbox-text-span").map((function(e){return f.A.querySelectorAll(e,".hide-when-compact, .collapsed").forEach((function(e){return e.remove()})),e})):[]},ae=function(e){var t=e.closest("section[data-mw-section-id]"),n=t&&t.querySelector("h1,h2,h3,h4,h5,h6");return{id:t&&parseInt(t.getAttribute("data-mw-section-id"),10),title:n&&n.innerHTML.trim(),anchor:n&&n.getAttribute("id")}};const oe={collectHatnotes:function(e){return e?f.A.querySelectorAll(e,"div.hatnote").map((function(e){var t=f.A.querySelectorAll(e,'div.hatnote a[href]:not([href=""]):not([redlink="1"])').map((function(e){return e.href}));return{html:e.innerHTML.trim(),links:t,section:ae(e)}})):[]},collectPageIssues:function(e){return ie(e).map((function(e){return{html:e.innerHTML.trim(),section:ae(e)}}))},test:{collectPageIssueElements:ie}};var se="pcs-dim-images",ce=function(e,t){e.body.classList[t?"add":"remove"](se)},le=function(e){return e.body.classList.contains(se)};const de={CLASS:se,dim:function(e,t){return ce(e.document,t)},isDim:function(e){return le(e.document)},dimImages:ce,areImagesDimmed:le};var ue={SECTION_HEADER:"pcs-edit-section-header",TITLE:"pcs-edit-section-title",HEADER_INNER_LEFT:"pcs-header-inner-left",HEADER_INNER_RIGHT:"pcs-header-inner-right",LINK_CONTAINER:"pcs-edit-section-link-container",LINK:"pcs-edit-section-link",PROTECTION:{UNPROTECTED:"",PROTECTED:"page-protected",FORBIDDEN:"no-editing"},TITLE_TALK_BUTTON:"pcs-title-icon-talk-page",TITLE_TALK_BUTTON_WRAPPER:"pcs-title-icon-talk-page-container"},pe={TITLE_DESCRIPTION:"pcs-edit-section-title-description",ADD_TITLE_DESCRIPTION:"pcs-edit-section-add-title-description",DIVIDER:"pcs-edit-section-divider",PRONUNCIATION:"pcs-edit-section-title-pronunciation",ARIA_EDIT_PROTECTED:"pcs-edit-section-aria-protected",ARIA_EDIT_NORMAL:"pcs-edit-section-aria-normal"},fe={SECTION_INDEX:"data-id",ACTION:"data-action",PRONUNCIATION_URL:"data-pronunciation-url",DESCRIPTION_SOURCE:"data-description-source",WIKIDATA_ENTITY_ID:"data-wikdata-entity-id"},he=function(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"",r=e.createElement("a");return r.href=n,r.setAttribute(fe.SECTION_INDEX,t),r.setAttribute(fe.ACTION,"edit_section"),r.setAttribute(m,pe.ARIA_EDIT_NORMAL),r.classList.add(ue.LINK),r},me=function(e){var t=e.createElement("div");return t.classList.add(ue.SECTION_HEADER),t.classList.add("v2"),t},Ee=function(e,t){t.classList.add(ue.TITLE),e.appendChild(t)},ve=function(e,t,n,r){var i=me(e),a=e.createElement("h".concat(n));return a.innerHTML=r||"",a.setAttribute(fe.SECTION_INDEX,t),Ee(i,a),i};const ge={appendEditSectionHeader:Ee,CLASS:ue,IDS:pe,DATA_ATTRIBUTE:fe,setEditButtons:function(e){var t=arguments.length>1&&void 0!==arguments[1]&&arguments[1],n=arguments.length>2&&void 0!==arguments[2]&&arguments[2],r=e.documentElement.classList;t?r.remove(ue.PROTECTION.FORBIDDEN):r.add(ue.PROTECTION.FORBIDDEN),n?r.add(ue.PROTECTION.PROTECTED):r.remove(ue.PROTECTION.PROTECTED)},setTalkPageButton:function(e){var t=arguments.length>1&&void 0!==arguments[1]&&arguments[1],n=e.getElementsByTagName("header")[0],r=n.getElementsByClassName(ue.HEADER_INNER_RIGHT)[0],i=n.getElementsByClassName(ue.TITLE_TALK_BUTTON)[0]&&n.getElementsByClassName(ue.TITLE_TALK_BUTTON_WRAPPER)[0];if(t){if(!i){var a=e.createElement("span"),o=e.createElement("a");o.setAttribute("href","/"),o.classList.add(ue.TITLE_TALK_BUTTON),a.classList.add(ue.TITLE_TALK_BUTTON_WRAPPER),r.appendChild(a),a.appendChild(o)}}else i&&n.getElementsByClassName(ue.TITLE_TALK_BUTTON_WRAPPER)[0].remove()},setARIAEditButtons:function(e){e.documentElement.classList.contains(ue.PROTECTION.PROTECTED)&&Array.from(e.getElementsByClassName(ue.LINK)).forEach((function(e){return e.setAttribute(m,pe.ARIA_EDIT_PROTECTED)}))},newEditSectionHeader:ve,newEditSectionButton:function(e,t,n,r,i){var a=e.createElement("span");if(a.classList.add(ue.LINK_CONTAINER),null===e.getElementById(pe.ARIA_EDIT_NORMAL)&&r){var o=e.createElement("span");o.setAttribute("id",pe.ARIA_EDIT_NORMAL),o.setAttribute(h,r),a.appendChild(o)}if(null===e.getElementById(pe.ARIA_EDIT_PROTECTED)&&i){var s=e.createElement("span");s.setAttribute("id",pe.ARIA_EDIT_PROTECTED),s.setAttribute(h,i),a.appendChild(s)}var c=n;return c||(c=he(e,t)),a.appendChild(c),a},newEditSectionWrapper:me,newEditSectionLink:he,newPageHeader:function(e,t,n,r,i,a,o,s,c){var l=e.createDocumentFragment(),d=ve(e,0,1,n);if(c){var u=e.createElement("a");u.setAttribute(fe.ACTION,"title_pronunciation"),u.setAttribute(fe.PRONUNCIATION_URL,c),u.id=pe.PRONUNCIATION,d.querySelector("h1").appendChild(u)}l.appendChild(d);var p=e.createElement("div"),f=e.createElement("div");p.classList.add(ue.HEADER_INNER_LEFT),f.classList.add(ue.HEADER_INNER_RIGHT);var h=d.getElementsByTagName("h1")[0];if(h.parentNode.insertBefore(p,h),p.appendChild(h),d.appendChild(f),0===t){var m=function(e,t,n,r,i,a){if(void 0!==t){var o=e.createElement("p");return o.setAttribute(fe.DESCRIPTION_SOURCE,n),o.setAttribute(fe.WIKIDATA_ENTITY_ID,r),o.id=pe.TITLE_DESCRIPTION,o.textContent=t,o}if(a){var s=e.createElement("a");s.href="#",s.setAttribute(fe.ACTION,"add_title_description");var c=e.createElement("p");return c.id=pe.ADD_TITLE_DESCRIPTION,c.innerHTML=i,s.appendChild(c),s}return null}(e,r,i,a,o,s);m&&p.appendChild(m)}var E=e.createElement("hr");return E.id=pe.DIVIDER,p.appendChild(E),l}};var Ae=n(354),Te=function(e){return e.replace(/\n|\r/g,"").trim()},Ne=function(e){var t=e.querySelector('[id="coordinates"]'),n=function(e){return Array.from(e.querySelectorAll("style")).reduce((function(e,t){return e+Te(t.textContent).length}),0)},r=(t?Te(t.textContent).length:0)+n(e);t&&(r-=n(t));return Te(e.textContent).length-r>=10},ye=function(e){var t=[],n=e;do{t.push(n),n=n.nextSibling}while(n&&(1!==n.nodeType||"P"!==n.tagName));return t},Le=function(e,t){if(t)for(var n=t.firstElementChild;n;){if("P"===n.tagName&&Ne(n))return n;n=n.nextElementSibling}};const be={moveLeadIntroductionUp:function(e,t,n){var r=Le(0,t);if(r){var i=e.createDocumentFragment();ye(r).forEach((function(e){return i.appendChild(e)}));var a=n?n.nextSibling:t.firstChild;t.insertBefore(i,a)}},test:{isParagraphEligible:Ne,extractLeadIntroductionNodes:ye,getEligibleParagraph:Le}};const Ce={containerFragment:function(e){var t=e.createDocumentFragment(),n=e.createElement("section");n.id="pcs-footer-container-menu",n.className="pcs-footer-section",n.innerHTML="<h2 id='pcs-footer-container-menu-heading'></h2>\n   <div id='pcs-footer-container-menu-items'></div>",t.appendChild(n);var r=e.createElement("section");r.id="pcs-footer-container-readmore",r.className="pcs-footer-section",r.style.display="none",r.innerHTML="<h2 id='pcs-footer-container-readmore-heading'></h2>\n   <div id='pcs-footer-container-readmore-pages'></div>",t.appendChild(r);var i=e.createElement("section");return i.id="pcs-footer-container-legal",t.appendChild(i),t},isContainerAttached:function(e){return Boolean(e.querySelector("#pcs-footer-container"))}};const _e={add:function(e,t,n,r,i,a){var o=e.querySelector("#".concat(r));o.innerHTML="<div class='pcs-footer-legal-contents'>\n    <hr class='pcs-footer-legal-divider'>\n    <span class='pcs-footer-legal-license'>\n    ".concat(function(e,t){var n=e.split("$1");return"".concat(v.escape(n[0]),'<a class="external text" rel="mw:ExtLink" href="https://creativecommons.org/licenses/by-sa/4.0/">').concat(v.escape(t),"</a>").concat(v.escape(n[1]))}(t,n),"\n    <br>\n      <div class=\"pcs-footer-browser\">\n        <a class='pcs-footer-browser-link' href='N/A'>\n          ").concat(v.escape(i),"\n        </a>\n      </div>\n    </span>\n  </div>"),o.querySelector(".pcs-footer-browser-link").addEventListener("click",(function(){a()}))}};var Ie=n(29),Se=n(212),Oe={lastEdited:"lastEdited",pageIssues:"pageIssues",disambiguation:"disambiguation",coordinate:"coordinate",talkPage:"talkPage"},De=(0,Se.A)((function e(t,n,r,i){(0,Ie.A)(this,e),this.title=t,this.subtitle=n,this.itemType=r,this.clickHandler=i,this.payload=[]}),[{key:"iconClass",value:function(){switch(this.itemType){case Oe.lastEdited:return"pcs-footer-menu-icon-last-edited";case Oe.talkPage:return"pcs-footer-menu-icon-talk-page";case Oe.pageIssues:return"pcs-footer-menu-icon-page-issues";case Oe.disambiguation:return"pcs-footer-menu-icon-disambiguation";case Oe.coordinate:return"pcs-footer-menu-icon-coordinate";default:return""}}},{key:"payloadExtractor",value:function(){switch(this.itemType){case Oe.pageIssues:return oe.collectPageIssues;case Oe.disambiguation:return oe.collectHatnotes;default:return}}}]);const Re={MenuItemType:Oe,setHeading:function(e,t,n){var r=n.getElementById(t);r.textContent=e,r.title=v.escape(e)},maybeAddItem:function(e,t,n,r,i,a){if(""!==e){var o=new De(e,t,n,i),s=o.payloadExtractor();s&&(o.payload=s(a),0===o.payload.length)||function(e,t,n){n.getElementById(t).appendChild(function(e,t){var n=t.createElement("div");n.className="pcs-footer-menu-item",n.role="menuitem";var r=t.createElement("a");if(r.addEventListener("click",(function(){e.clickHandler(e.payload)})),n.appendChild(r),e.title){var i=t.createElement("div");i.className="pcs-footer-menu-item-title",i.textContent=e.title,r.title=e.title,r.appendChild(i)}if(e.subtitle){var a=t.createElement("div");a.className="pcs-footer-menu-item-subtitle",a.textContent=e.subtitle,r.appendChild(a)}var o=e.iconClass();return o&&n.classList.add(o),t.createDocumentFragment().appendChild(n)}(e,n))}(o,r,a)}}};var we=function(e,t,n){var r=new RegExp("\\s?[".concat(t,"][^").concat(t).concat(n,"]+[").concat(n,"]"),"g"),i=0,a=e,o="";do{o=a,a=a.replace(r,""),i++}while(o!==a&&i<30);return a},Pe=(0,Se.A)((function e(t,n,r,i){(0,Ie.A)(this,e),this.title=t,this.displayTitle=n,this.thumbnail=r,this.description=i})),xe=/^[a-z]+:/,ke=function(e,t,n,r){var i=r.getElementById(t),a=r.getElementById(n);e.forEach((function(e,t){var n=e.pageprops?e.pageprops.displaytitle:e.title,i=function(e,t,n){var r=n.createElement("a");r.id=t,r.className="pcs-footer-readmore-page";var i=!n.pcsSetupSettings||n.pcsSetupSettings.loadImages;if(e.thumbnail&&e.thumbnail.source&&i){var a=n.createElement("div");a.style.backgroundImage="url(".concat(e.thumbnail.source.replace(xe,""),")"),a.classList.add("pcs-footer-readmore-page-image"),r.appendChild(a)}var o,s=n.createElement("div");if(s.classList.add("pcs-footer-readmore-page-container"),r.appendChild(s),r.setAttribute("title",e.title),r.setAttribute("data-pcs-source","read-more"),r.href="./".concat(encodeURI(e.title)),e.displayTitle?o=e.displayTitle:e.title&&(o=e.title),o){var c=n.createElement("div");c.id=t,c.className="pcs-footer-readmore-page-title",c.innerHTML=o.replace(/_/g," "),r.title=e.title.replace(/_/g," "),s.appendChild(c)}if(e.description){var l=n.createElement("div");l.id=t,l.className="pcs-footer-readmore-page-description",l.innerHTML=e.description,s.appendChild(l)}return n.createDocumentFragment().appendChild(r)}(new Pe(e.title,n,e.thumbnail,e.description),t,r);a.appendChild(i)})),i.style.display="block"};const Be={fetchAndAdd:function(e,t,n,r,i,a){var o=new XMLHttpRequest;o.open("GET",function(e,t,n){var r={format:"json",formatversion:2,origin:"*",action:"query",prop:"pageimages|description",piprop:"thumbnail",pithumbsize:160,pilimit:t,generator:"search",gsrsearch:"morelike:".concat(e),gsrnamespace:0,gsrlimit:t,gsrqiprofile:"classic_noboostlinks",uselang:"content",smaxage:86400,maxage:86400};return"".concat(n||"","/w/api.php?").concat(new URLSearchParams(r).toString())}(e,t,i),!0),o.onload=function(){var e;try{e=JSON.parse(o.responseText).query.pages}catch(e){}if(e&&e.length){var i;if(e.length>t){var s=Math.floor(Math.random()*Math.floor(e.length-t));i=e.slice(s,s+t)}else i=e;ke(i,n,r,a)}},o.send()},setHeading:function(e,t,n){var r=n.getElementById(t);r.textContent=e,r.title=v.escape(e)},test:{cleanExtract:function(e){var t=e;return t=we(t,"(",")"),t=we(t,"/","/")},safelyRemoveEnclosures:we,showReadMorePages:ke}};var He=n(354).A,qe=n(973).A,Me=n(730).A,Fe="pcs-lazy-load-placeholder",Ue="pcs-lazy-load-placeholder-pending",We="pcs-lazy-load-placeholder-loading",Ke="pcs-lazy-load-placeholder-error",ze="pcs-lazy-load-image-loading",Xe="pcs-lazy-load-image-loaded",Ge="pcs-no-lazy-load",je=["class","style","src","srcset","width","height","alt","usemap","data-file-width","data-file-height","data-image-gallery","data-file-original-src"],Ve={px:50,ex:10,em:5},Ye=function(e,t){var n=e.createElement("span");t.hasAttribute("class")&&n.setAttribute("class",t.getAttribute("class")||""),n.classList.add(Fe),n.classList.add(Ue);var r=He.from(t);r.width&&n.style.setProperty("width","".concat(r.width)),qe.copyAttributesToDataAttributes(t,n,je);var i=e.createElement("span");if(r.width&&r.height){var a=r.heightValue/r.widthValue;i.style.setProperty("padding-top","".concat(100*a,"%"))}return n.appendChild(i),t.parentNode&&t.parentNode.replaceChild(n,t),n},Je=function(e){var t=He.from(e);if(!t.width||!t.height)return!0;var n=Ve[t.widthUnit]||1/0,r=Ve[t.heightUnit]||1/0;return t.widthValue>=n&&t.heightValue>=r};const $e={CLASSES:{PLACEHOLDER_CLASS:Fe,PLACEHOLDER_PENDING_CLASS:Ue,PLACEHOLDER_LOADING_CLASS:We,PLACEHOLDER_ERROR_CLASS:Ke,IMAGE_LOADING_CLASS:ze,IMAGE_LOADED_CLASS:Xe,NO_LAZY_LOAD:Ge},PLACEHOLDER_CLASS:Fe,isLazyLoadable:Je,queryLazyLoadableImages:function(e){return Me.querySelectorAll(e,"img").filter((function(e){return Je(e)}))},convertImagesToPlaceholders:function(e,t){return t.map((function(t){return Ye(e,t)}))},convertImageToPlaceholder:Ye,loadPlaceholder:function(e,t){t.classList.add(We),t.classList.remove(Ue);var n=e.createElement("img"),r=function(e){n.setAttribute("src",n.getAttribute("src")||""),e.stopPropagation(),e.preventDefault()},i=function(e){return e.hasAttribute("usemap")};return n.addEventListener("load",(function(){t.removeEventListener("click",r),t.parentNode&&t.parentNode.replaceChild(n,t);var a=n.getAttribute("width"),o=e.createElement("div");if(n.className&&n.className.includes("pcs-widen-image-override"))o.classList.add("pcs-widen-image-wrapper");else{if(i(n))return;o.classList.add("pcs-image-wrapper")}var s=n.parentNode;o.appendChild(n),o.setAttribute("style","width: ".concat(a,"px;")),s&&s.appendChild(o);var c=o.querySelector("img");c&&(c.classList.add(Xe),c.classList.remove(ze))}),{once:!0}),n.addEventListener("error",(function(){t.classList.add(Ke),t.classList.remove(We),t.addEventListener("click",r)}),{once:!0}),qe.copyDataAttributesToAttributes(t,n,je),i(n)||n.classList.add(ze),n},addImageNoLazyLoadClass:function(e){Me.querySelectorAll(e,"img").forEach((function(e){e.classList.add(Ge)}))}};var Qe=function(){function e(t,n,r){(0,Ie.A)(this,e),this._window=t,this._period=n,this._function=r,this._context=void 0,this._arguments=void 0,this._result=void 0,this._timeout=0,this._timestamp=0}return(0,Se.A)(e,[{key:"queue",value:function(e,t){var n=this;return this._context=e,this._arguments=t,this.pending()||(this._timeout=this._window.setTimeout((function(){n._timeout=0,n._timestamp=Date.now(),n._result=n._function.apply(n._context,n._arguments)}),this.delay())),this.result}},{key:"result",get:function(){return this._result}},{key:"pending",value:function(){return Boolean(this._timeout)}},{key:"delay",value:function(){return this._timestamp?Math.max(0,this._period-(Date.now()-this._timestamp)):0}},{key:"cancel",value:function(){this._timeout&&this._window.clearTimeout(this._timeout),this._timeout=0}},{key:"reset",value:function(){this.cancel(),this._result=void 0,this._timestamp=0}}],[{key:"wrap",value:function(t,n,r){var i=new e(t,n,r),a=function(){return i.queue(this,arguments)};return a.result=function(){return i.result},a.pending=function(){return i.pending()},a.delay=function(){return i.delay()},a.cancel=function(){return i.cancel()},a.reset=function(){return i.reset()},a}}])}(),Ze=["scroll","resize",re.SECTION_TOGGLED_EVENT_TYPE,"onBodyEnd"],et=(0,Se.A)((function e(t,n){var r=this;(0,Ie.A)(this,e),this._window=t,this._loadDistanceMultiplier=n,this._placeholders=[],this._registered=!1,this._throttledLoadPlaceholders=Qe.wrap(t,100,(function(){return r._loadPlaceholders()}))}),[{key:"convertImagesToPlaceholders",value:function(e){var t=$e.queryLazyLoadableImages(e),n=$e.convertImagesToPlaceholders(this._window.document,t);this._placeholders=this._placeholders.concat(n),this._register()}},{key:"collectExistingPlaceholders",value:function(e){var t=f.A.querySelectorAll(e,".".concat($e.PLACEHOLDER_CLASS));this._placeholders=this._placeholders.concat(t),this._register()}},{key:"loadPlaceholders",value:function(){this._throttledLoadPlaceholders()}},{key:"deregister",value:function(){var e=this;this._registered&&(Ze.forEach((function(t){return e._window.removeEventListener(t,e._throttledLoadPlaceholders)})),this._throttledLoadPlaceholders.reset(),this._placeholders=[],this._registered=!1)}},{key:"_register",value:function(){var e=this;!this._registered&&this._placeholders.length&&(this._registered=!0,Ze.forEach((function(t){return e._window.addEventListener(t,e._throttledLoadPlaceholders)})))}},{key:"_loadPlaceholders",value:function(){var e=this;this._placeholders=this._placeholders.filter((function(t){var n=!0;return e._isPlaceholderEligibleToLoad(t)&&($e.loadPlaceholder(e._window.document,t),n=!1),n})),0===this._placeholders.length&&this.deregister()}},{key:"_isPlaceholderEligibleToLoad",value:function(e){return c.A.isVisible(e)&&this._isPlaceholderWithinLoadDistance(e)}},{key:"_isPlaceholderWithinLoadDistance",value:function(e){var t=e.getBoundingClientRect(),n=this._window.innerHeight*this._loadDistanceMultiplier;return!(t.top>n||t.bottom<-n)}}]),tt="pcs-platform-",nt={ANDROID:"".concat(tt,"android"),IOS:"".concat(tt,"ios")};const rt={CLASS:nt,CLASS_PREFIX:tt,classify:function(e){var t=e.document.documentElement;(function(e){return/android/i.test(e.navigator.userAgent)})(e)&&t.classList.add(nt.ANDROID),function(e){return/ipad|iphone|ipod/i.test(e.navigator.userAgent)}(e)&&t.classList.add(nt.IOS)},setPlatform:function(e,t){e&&e.documentElement&&e.documentElement.classList.add(t)},setVersion:function(e,t){if(e&&e.documentElement)for(var n=t||1,r=1;r<=2&&(e.documentElement.classList.add("pcs-v"+r),r!==n);r++);}};var it=function(e,t){e.innerHTML=t.innerHTML,e.setAttribute("class",t.getAttribute("class"))},at=function(e){return f.A.querySelectorAll(e,"a.new")},ot=function(e){return e.createElement("span")},st=function(e,t){return e.parentNode.replaceChild(t,e)};const ct={hideRedLinks:function(e){var t=ot(e);at(e).forEach((function(e){var n=t.cloneNode(!1);it(n,e),st(e,n)}))},test:{configureRedLinkTemplate:it,redLinkAnchorsInDocument:at,newRedLinkTemplate:ot,replaceAnchorWithSpan:st}};var lt=".reference, .mw-ref",dt="#pcs-ref-back-link-",ut="pcs-back-links",pt=function(e,t,n){var r=decodeURIComponent(e),i=decodeURIComponent(t);if(void 0!==n&&"#"!==e[0]){var a=decodeURIComponent(n),o="./".concat(a);return 0===r.indexOf(o)&&e.indexOf(i)===o.length}return r.includes(i)},ft=function(e,t){return pt(e,"#cite_note-",t)},ht=function(e){return Boolean(e)&&e.nodeType===Node.TEXT_NODE&&Boolean(e.textContent.match(/^\s+$/))},mt=function(e){var t=e.querySelector("a");return t&&ft(t.hash)},Et=function(e,t){var n=t.querySelector("A").getAttribute("href").split("#")[1];return e.getElementById(n)||e.getElementById(decodeURIComponent(n))},vt=function(e,t){var n=Et(e,t);if(!n)return"";var r=n.querySelector("span.mw-reference-text,span.reference-text");return r?r.innerHTML.trim():""},gt=function(e){return f.A.matchesSelector(e,lt)?e:c.A.findClosestAncestor(e,lt)},At=(0,Se.A)((function e(t,n,r,i,a){(0,Ie.A)(this,e),this.id=t,this.rect=n,this.text=r,this.html=i,this.href=a})),Tt=(0,Se.A)((function e(t,n){(0,Ie.A)(this,e),this.href=t,this.text=n})),Nt=(0,Se.A)((function e(t,n){(0,Ie.A)(this,e),this.selectedIndex=t,this.referencesGroup=n})),yt=function(e,t){var n=e;do{n=t(n)}while(ht(n));return n},Lt=function(e,t,n){for(var r=e;(r=yt(r,t))&&r.nodeType===Node.ELEMENT_NODE&&mt(r);)n(r)},bt=function(e){return e.previousSibling},Ct=function(e){return e.nextSibling},_t=function(e){var t=[e];return Lt(e,bt,(function(e){return t.unshift(e)})),Lt(e,Ct,(function(e){return t.push(e)})),t},It=function(e,t){var n=_t(t),r=n.indexOf(t),i=n.map((function(t){return function(e,t){return new At(gt(t).id,u(t),t.textContent,vt(e,t),t.querySelector("A").getAttribute("href"))}(e,t)}));return new Nt(r,i)};var St=function(e){for(var t=[],n=e,r=!1;n.parentElement;){if((n=n.parentElement).hasChildNodes()&&!r)for(var i=0;i<n.children.length;i++)n.children[i].className&&n.children[i].className.includes("randomSlideshow-container")&&(n.classList.add("randomSlideshow-container-wrapper"),r=!0);if("SECTION"===n.tagName)break;t.push(n)}return t},Ot=function(e){St(e).forEach((function(e){e.className.includes("randomSlideshow-container-wrapper")||e.classList.add("pcs-widen-image-ancestor")}))};const Dt={AdjustTextSize:o,BodySpacingTransform:s,CollapseTable:re,CollectionUtilities:oe,DimImagesTransform:de,EditTransform:ge,HTMLUtilities:v,LeadIntroductionTransform:be,FooterContainer:Ce,FooterLegal:_e,FooterMenu:Re,FooterReadMore:Be,LazyLoadTransform:$e,LazyLoadTransformer:et,PlatformTransform:rt,RedLinks:ct,ReferenceCollection:{collectNearbyReferences:function(e,t){var n=t.parentElement;return It(e,n)},collectNearbyReferencesAsText:function(e,t){var n=t.parentElement,r=_t(n),i=r.indexOf(n),a=r.map((function(e){return function(e,t){return new Tt(t.querySelector("A").getAttribute("href"),t.textContent)}(0,e)}));return new Nt(i,a)},collectReferencesForBackLink:function(e,t,n){var r=function(e){var t=e.getAttribute(ut);return t?JSON.parse(t):[]}(t);if(!r||0===r.length)return{};for(var i,a=n.split(dt)[1],o=[],s=r[0],c=0;c<r.length;c++){var l=r[c].split("#")[1],d=e.getElementById(l);d&&(i||(i=d.textContent.trim()),o.push({id:l}))}return{referenceId:a,referenceText:i,backLinks:o,href:s}},isBackLink:function(e,t){return pt(e,dt,t)},isCitation:ft,CLASS:{BACK_LINK_ANCHOR:"pcs-ref-back-link",BACK_LINK_CONTAINER:"pcs-ref-backlink-container",BODY:"pcs-ref-body",BODY_HEADER:"pcs-ref-body-header",BODY_CONTENT:"pcs-ref-body-content",REF:"pcs-ref"},BACK_LINK_FRAGMENT_PREFIX:dt,BACK_LINK_ATTRIBUTE:ut,test:{adjacentNonWhitespaceNode:yt,closestReferenceClassElement:gt,collectAdjacentReferenceNodes:Lt,collectNearbyReferenceNodes:_t,collectRefText:vt,getRefTextContainer:Et,hasCitationLink:mt,isWhitespaceTextNode:ht,nextSiblingGetter:Ct,prevSiblingGetter:bt}},SectionUtilities:O,ThemeTransform:a,WidenImage:{widenImage:function(e){Ot(e),e.classList.add("pcs-widen-image-override")},test:{ancestorsToWiden:St,widenAncestors:Ot}},test:{ElementGeometry:Ae.A,ElementUtilities:c.A,Polyfill:f.A,Throttle:Qe}}})(),r=r.default})()));