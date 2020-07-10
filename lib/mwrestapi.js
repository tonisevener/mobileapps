const api = require('./api-util');
const mwrestapi = {};

mwrestapi.queryForDiff = function(req, fromRevID, toRevID) {
    const path = `revision/${fromRevID}/compare/${toRevID}`;

    return api.mwRestApiGet(req, path);
};

module.exports = mwrestapi;
