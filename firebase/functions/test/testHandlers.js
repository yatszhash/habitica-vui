const rp = require('request-promise-native');
const requestTaskBody = require("./requestCreateTask");
const requestConfirmTaskRegistration = require('./requestConfirmTaskRegistration');
const requestCancelBody = require("./requestCancelBody");
const requestAskPriority = require("./requestAskPriority");

function main() {
    options = {
        method: 'POST',
        uri: "http://localhost:8010/habitica-ja/us-central1/dialogflowFirebaseFulfillment",
        json: true,
        body: requestTaskBody
    };

    rp(options).then((response) => console.log(response))
        .catch(reason => console.log(reason));
}

function main2() {
    options = {
        method: 'POST',
        uri: "http://localhost:8010/habitica-ja/us-central1/dialogflowFirebaseFulfillment",
        json: true,
        body: requestConfirmTaskRegistration
    };

    rp(options).then((response) => console.log(response))
        .catch(reason => console.log(reason));
}

function main3() {
    options = {
        method: 'POST',
        uri: "http://localhost:8010/habitica-ja/us-central1/dialogflowFirebaseFulfillment",
        json: true,
        body: requestCancelBody
    };

    rp(options).then((response) => console.log(response))
        .catch(reason => console.log(reason));
}

function main4() {
    options = {
        method: 'POST',
        uri: "http://localhost:8010/habitica-ja/us-central1/dialogflowFirebaseFulfillment",
        json: true,
        body: requestAskPriority
    };

    rp(options).then((response) => console.log(response))
        .catch(reason => console.log(reason));
}

main4();